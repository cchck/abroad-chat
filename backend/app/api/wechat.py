import base64
import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt
from app.core.database import get_db
from app.core.deps import get_current_parent
from app.core.security import create_parent_token
from app.core.storage import save_voice
from app.models.models import Binding, Conversation, Message, Parent, Student, VoiceProfile
from app.schemas.schemas import ChatMessageIn, ChatMessageOut, WxBindRequest, WxChildOut
from app.services.chat_engine import ChatEngine
from app.services.voice_service import VoiceService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/wx", tags=["wechat"])
limiter = Limiter(key_func=get_remote_address)


# ──── WeChat Login ────

@router.post("/dev-login")
async def dev_login(nickname: str, db: AsyncSession = Depends(get_db)):
    """Dev-only: create or get a parent by nickname, return token. No WeChat needed."""
    if settings.WECHAT_APP_ID and settings.WECHAT_APP_SECRET:
        raise HTTPException(status_code=404, detail="Not available")

    fake_openid = f"dev_{nickname}"
    result = await db.execute(select(Parent).where(Parent.wechat_openid == fake_openid))
    parent = result.scalar_one_or_none()
    if not parent:
        parent = Parent(wechat_openid=fake_openid, nickname=nickname)
        db.add(parent)
        await db.commit()
        await db.refresh(parent)

    token = create_parent_token(parent.id)
    return {"access_token": token, "token_type": "bearer", "parent_id": parent.id}


@router.post("/login")
@limiter.limit("10/minute")
async def wx_login(request: Request, code: str, db: AsyncSession = Depends(get_db)):
    """Exchange wx.login() code for a session token."""
    if not settings.WECHAT_APP_ID or not settings.WECHAT_APP_SECRET:
        raise HTTPException(status_code=500, detail="微信配置未设置，请联系管理员")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.weixin.qq.com/sns/jscode2session",
            params={
                "appid": settings.WECHAT_APP_ID,
                "secret": settings.WECHAT_APP_SECRET,
                "js_code": code,
                "grant_type": "authorization_code",
            },
        )
        data = resp.json()

    if "openid" not in data:
        logger.warning("wx login failed: %s", data.get("errmsg", "unknown"))
        raise HTTPException(status_code=400, detail="微信登录失败，请稍后再试")

    openid = data["openid"]

    result = await db.execute(
        select(Parent).where(Parent.wechat_openid == openid)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        parent = Parent(wechat_openid=openid)
        db.add(parent)
        await db.commit()
        await db.refresh(parent)
        logger.info("new parent created: id=%d", parent.id)

    token = create_parent_token(parent.id)
    logger.info("parent login: id=%d", parent.id)
    return {"access_token": token, "token_type": "bearer", "parent_id": parent.id}


# ──── Bind ────

@router.post("/bind", response_model=WxChildOut)
async def bind_by_code(
    data: WxBindRequest,
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Binding).where(Binding.invite_code == data.invite_code)
    )
    binding = result.scalar_one_or_none()
    if not binding:
        raise HTTPException(status_code=404, detail="邀请码无效，请检查后重试")
    if binding.status == "active":
        raise HTTPException(status_code=400, detail="该邀请码已被使用")

    if data.nickname:
        parent.nickname = data.nickname

    binding.parent_id = parent.id
    binding.status = "active"
    await db.commit()

    student = await db.get(Student, binding.student_id)
    logger.info("binding created: parent=%d student=%d binding=%d", parent.id, student.id, binding.id)
    return WxChildOut(
        binding_id=binding.id,
        student_name=student.name,
        relationship_name=binding.relationship_name,
    )


# ──── Children List ────

@router.get("/children")
async def list_children(
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Binding).where(Binding.parent_id == parent.id, Binding.status == "active")
    )
    bindings = list(result.scalars().all())

    children = []
    for b in bindings:
        student = await db.get(Student, b.student_id)
        children.append(WxChildOut(
            binding_id=b.id,
            student_name=student.name,
            relationship_name=b.relationship_name,
        ))
    return children


# ──── Chat ────

@router.post("/chat/send")
@limiter.limit("20/minute")
async def send_message(
    request: Request,
    data: ChatMessageIn,
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
):
    binding = await db.get(Binding, data.binding_id)
    if not binding or binding.status != "active":
        raise HTTPException(status_code=400, detail="绑定关系无效，请重新绑定")
    if binding.parent_id != parent.id:
        logger.warning("parent %d tried to access binding %d owned by parent %d", parent.id, binding.id, binding.parent_id)
        raise HTTPException(status_code=403, detail="无权访问此对话")

    logger.info("chat msg: parent=%d binding=%d len=%d", parent.id, binding.id, len(data.content))

    engine = ChatEngine(db)
    result = await engine.handle_message(data.binding_id, data.content)

    voice_base64 = None
    voice_url = None
    student = await db.get(Student, binding.student_id)
    voice_profile_result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.student_id == binding.student_id)
    )
    voice_profile = voice_profile_result.scalar_one_or_none()
    fish_key = decrypt(student.fish_audio_api_key) if student.fish_audio_api_key else None
    if (
        voice_profile
        and voice_profile.status == "ready"
        and voice_profile.fish_audio_model_id
        and fish_key
    ):
        try:
            tts_text = re.sub(
                r'[\U0001F300-\U0001FAFF\U00002702-\U000027B0\U0000FE00-\U0000FE0F\U0000200D\U00002600-\U000026FF\U0000231A-\U0000231B]+',
                '', result["text"]
            ).strip()
            svc = VoiceService(api_key=fish_key)
            audio_bytes = await svc.text_to_speech(
                tts_text or result["text"],
                voice_profile.fish_audio_model_id,
            )
            voice_base64 = base64.b64encode(audio_bytes).decode("ascii")
            voice_url = save_voice(audio_bytes)

            ai_msg = result.get("_ai_message")
            if ai_msg:
                ai_msg.content_voice_url = voice_url
        except Exception:
            logger.exception("TTS failed: binding=%d", binding.id)

    if result.get("sensitivity", 0) >= 2:
        logger.warning("sensitive topic: binding=%d sensitivity=%d", binding.id, result["sensitivity"])

    await db.commit()

    return {
        "text": result["text"],
        "emotion": result.get("emotion", "neutral"),
        "voice_base64": voice_base64,
    }


@router.get("/chat/history", response_model=list[ChatMessageOut])
async def chat_history(
    binding_id: int,
    parent: Parent = Depends(get_current_parent),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    binding = await db.get(Binding, binding_id)
    if not binding or binding.parent_id != parent.id:
        raise HTTPException(status_code=403, detail="无权访问此对话")

    result = await db.execute(
        select(Conversation)
        .where(Conversation.binding_id == binding_id)
        .order_by(Conversation.created_at.desc())
        .limit(1)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        return []

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = list(result.scalars().all())
    messages.reverse()
    return messages

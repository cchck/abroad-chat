import base64
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import Binding, Conversation, Message, Parent, Student, VoiceProfile
from app.schemas.schemas import ChatMessageIn, ChatMessageOut, WxBindRequest, WxChildOut
from app.services.chat_engine import ChatEngine
from app.services.voice_service import VoiceService

router = APIRouter(prefix="/wx", tags=["wechat"])


@router.post("/bind", response_model=WxChildOut)
async def bind_by_code(data: WxBindRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Binding).where(Binding.invite_code == data.invite_code)
    )
    binding = result.scalar_one_or_none()
    if not binding:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if binding.status == "active":
        raise HTTPException(status_code=400, detail="Code already used")

    result = await db.execute(
        select(Parent).where(Parent.wechat_openid == data.openid)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        parent = Parent(wechat_openid=data.openid, nickname=data.nickname)
        db.add(parent)
        await db.flush()

    binding.parent_id = parent.id
    binding.status = "active"
    await db.commit()

    student = await db.get(Student, binding.student_id)
    return WxChildOut(
        binding_id=binding.id,
        student_name=student.name,
        relationship_name=binding.relationship_name,
    )


@router.get("/children")
async def list_children(openid: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Parent).where(Parent.wechat_openid == openid)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        return []

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


@router.post("/chat/send")
async def send_message(data: ChatMessageIn, db: AsyncSession = Depends(get_db)):
    binding = await db.get(Binding, data.binding_id)
    if not binding or binding.status != "active":
        raise HTTPException(status_code=400, detail="Invalid binding")

    engine = ChatEngine(db)
    result = await engine.handle_message(data.binding_id, data.content)

    voice_base64 = None
    student = await db.get(Student, binding.student_id)
    voice_profile_result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.student_id == binding.student_id)
    )
    voice_profile = voice_profile_result.scalar_one_or_none()
    if (
        voice_profile
        and voice_profile.status == "ready"
        and voice_profile.fish_audio_model_id
        and student.fish_audio_api_key
    ):
        try:
            # Strip emoji so TTS reads clean text
            tts_text = re.sub(
                r'[\U0001F300-\U0001FAFF\U00002702-\U000027B0\U0000FE00-\U0000FE0F\U0000200D\U00002600-\U000026FF\U0000231A-\U0000231B]+',
                '', result["text"]
            ).strip()
            svc = VoiceService(api_key=student.fish_audio_api_key)
            audio_bytes = await svc.text_to_speech(
                tts_text or result["text"],
                voice_profile.fish_audio_model_id,
            )
            voice_base64 = base64.b64encode(audio_bytes).decode("ascii")
        except Exception:
            pass

    await db.commit()

    return {
        "text": result["text"],
        "emotion": result.get("emotion", "neutral"),
        "voice_base64": voice_base64,
    }


@router.get("/chat/history", response_model=list[ChatMessageOut])
async def chat_history(
    binding_id: int,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
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

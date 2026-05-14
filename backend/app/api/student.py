from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.models import (
    Binding,
    ChatSummary,
    ContextMaterial,
    Conversation,
    Message,
    Notification,
    PersonaConfig,
    Student,
    VoiceProfile,
)
from app.schemas.schemas import (
    ApiKeysOut,
    ApiKeysUpdate,
    BindingOut,
    ChatMessageOut,
    ChatSummaryOut,
    InviteCreate,
    InviteOut,
    MaterialCreate,
    MaterialOut,
    NotificationOut,
    SummarySettingsUpdate,
    PersonaConfigOut,
    PersonaConfigUpdate,
    StudentProfileOut,
    StudentProfileUpdate,
    VoiceModelIdUpdate,
    VoiceProfileOut,
)
from app.core.crypto import decrypt, encrypt
from app.services.llm_provider import PROVIDERS, chat_completion
from app.services.voice_service import VoiceService

router = APIRouter(prefix="/student", tags=["student"])


# ──── Profile ────

def _profile_response(student: Student) -> dict:
    return {
        **{c.key: getattr(student, c.key) for c in Student.__table__.columns if c.key not in ("llm_api_key", "fish_audio_api_key", "password_hash")},
        "has_llm_key": bool(student.llm_api_key),
        "has_fish_key": bool(student.fish_audio_api_key),
    }


@router.get("/profile", response_model=StudentProfileOut)
async def get_profile(student: Student = Depends(get_current_student)):
    return _profile_response(student)


@router.put("/profile", response_model=StudentProfileOut)
async def update_profile(
    data: StudentProfileUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(student, field, value)
    await db.commit()
    await db.refresh(student)
    return _profile_response(student)


# ──── API Keys ────

@router.get("/api-keys", response_model=ApiKeysOut)
async def get_api_keys(student: Student = Depends(get_current_student)):
    supported = [
        {"id": pid, "name": pid.capitalize(), "default_model": info["default_model"]}
        for pid, info in PROVIDERS.items()
    ]
    return ApiKeysOut(
        llm_provider=student.llm_provider,
        llm_model=student.llm_model,
        has_llm_key=bool(student.llm_api_key),
        has_fish_key=bool(student.fish_audio_api_key),
        supported_providers=supported,
    )


@router.put("/api-keys", response_model=ApiKeysOut)
async def update_api_keys(
    data: ApiKeysUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    if data.llm_provider is not None:
        if data.llm_provider not in PROVIDERS:
            raise HTTPException(status_code=400, detail=f"不支持该模型提供商，可选：{', '.join(PROVIDERS.keys())}")
        student.llm_provider = data.llm_provider
    if data.llm_model is not None:
        student.llm_model = data.llm_model
    if data.llm_api_key is not None:
        student.llm_api_key = encrypt(data.llm_api_key)
    if data.fish_audio_api_key is not None:
        student.fish_audio_api_key = encrypt(data.fish_audio_api_key)
    await db.commit()
    await db.refresh(student)

    supported = [
        {"id": pid, "name": pid.capitalize(), "default_model": info["default_model"]}
        for pid, info in PROVIDERS.items()
    ]
    return ApiKeysOut(
        llm_provider=student.llm_provider,
        llm_model=student.llm_model,
        has_llm_key=bool(student.llm_api_key),
        has_fish_key=bool(student.fish_audio_api_key),
        supported_providers=supported,
    )


# ──── Voice ────

@router.post("/voice/upload", response_model=VoiceProfileOut)
async def upload_voice(
    file: UploadFile,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    if not student.fish_audio_api_key:
        raise HTTPException(status_code=400, detail="请先在设置中填写 Fish Audio API Key")

    # #5: Stream-read with size limit instead of reading entire file into memory
    max_size = 50 * 1024 * 1024
    chunks = []
    total = 0
    while True:
        chunk = await file.read(1024 * 256)  # 256KB chunks
        if not chunk:
            break
        total += len(chunk)
        if total > max_size:
            raise HTTPException(status_code=400, detail="文件过大，最大支持 50MB")
        chunks.append(chunk)
    audio_data = b"".join(chunks)

    svc = VoiceService(api_key=decrypt(student.fish_audio_api_key))
    model_id = await svc.clone_voice(audio_data, student.name)

    result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.student_id == student.id)
    )
    profile = result.scalar_one_or_none()
    if profile:
        profile.fish_audio_model_id = model_id
        profile.status = "ready"
    else:
        profile = VoiceProfile(
            student_id=student.id,
            fish_audio_model_id=model_id,
            status="ready",
        )
        db.add(profile)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/voice/model-id", response_model=VoiceProfileOut)
async def set_voice_model_id(
    data: VoiceModelIdUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    """直接设置 Fish Audio Model ID（用已有声音模型）"""
    result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.student_id == student.id)
    )
    profile = result.scalar_one_or_none()
    if profile:
        profile.fish_audio_model_id = data.fish_audio_model_id
        profile.status = "ready"
    else:
        profile = VoiceProfile(
            student_id=student.id,
            fish_audio_model_id=data.fish_audio_model_id,
            status="ready",
        )
        db.add(profile)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/voice/status", response_model=VoiceProfileOut | None)
async def voice_status(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.student_id == student.id)
    )
    return result.scalar_one_or_none()


# ──── Persona ────

@router.put("/persona", response_model=PersonaConfigOut)
async def update_persona(
    data: PersonaConfigUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PersonaConfig).where(PersonaConfig.student_id == student.id)
    )
    persona = result.scalar_one_or_none()
    if persona:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(persona, field, value)
    else:
        persona = PersonaConfig(student_id=student.id, **data.model_dump(exclude_unset=True))
        db.add(persona)

    await db.commit()
    await db.refresh(persona)
    return persona


@router.get("/persona", response_model=PersonaConfigOut | None)
async def get_persona(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PersonaConfig).where(PersonaConfig.student_id == student.id)
    )
    return result.scalar_one_or_none()


@router.post("/persona/analyze")
async def analyze_chat_history(
    file: UploadFile,
    student: Student = Depends(get_current_student),
):
    if not student.llm_api_key:
        raise HTTPException(status_code=400, detail="请先在 API 设置中配置 LLM API Key")

    content = await file.read()
    text = content.decode("utf-8", errors="ignore")

    MAX_CHARS = 8000
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    system_prompt = """你是一个聊天风格分析专家。用户会给你一段微信聊天记录，你需要分析其中某个人的说话风格。

请分析聊天记录中"非家长"一方（通常是年轻人/学生）的说话特征，返回 JSON 格式：

{
  "catchphrases": "口头禅和常用表达，用逗号分隔",
  "habits": "说话习惯描述，比如喜欢用省略号、爱发表情包等",
  "tone": "整体语气风格描述",
  "sample_summary": "这个人说话风格的简短总结（1-2句话）"
}

注意：
- 只提取真实出现的特征，不要编造
- 口头禅要具体，比如"哈哈哈"、"好叭"、"绝了"这种
- 只返回 JSON，不要其他内容"""

    response = await chat_completion(
        provider=student.llm_provider or "anthropic",
        api_key=decrypt(student.llm_api_key),
        model=student.llm_model,
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": f"请分析以下聊天记录：\n\n{text}"}],
        max_tokens=800,
    )

    import json
    try:
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(raw)
    except (json.JSONDecodeError, IndexError):
        result = {
            "catchphrases": "",
            "habits": "",
            "tone": "",
            "sample_summary": response.text,
        }

    return result


# ──── Materials ────

@router.post("/materials", response_model=MaterialOut)
async def feed_material(
    data: MaterialCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    material = ContextMaterial(
        student_id=student.id,
        source="student_feed",
        content=data.content,
        proactive=data.proactive,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material


@router.get("/materials", response_model=list[MaterialOut])
async def list_materials(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContextMaterial)
        .where(ContextMaterial.student_id == student.id)
        .order_by(ContextMaterial.created_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())


@router.delete("/materials/{material_id}")
async def delete_material(
    material_id: int,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    material = await db.get(ContextMaterial, material_id)
    if not material or material.student_id != student.id:
        raise HTTPException(status_code=404, detail="素材不存在")
    await db.delete(material)
    await db.commit()
    return {"ok": True}


# ──── Invites ────

@router.post("/invite", response_model=InviteOut)
async def create_invite(
    data: InviteCreate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    binding = Binding(
        student_id=student.id,
        relationship_name=data.relationship_name,
    )
    db.add(binding)
    await db.commit()
    await db.refresh(binding)
    return binding


@router.get("/bindings", response_model=list[BindingOut])
async def list_bindings(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Binding).where(Binding.student_id == student.id)
    )
    bindings = list(result.scalars().all())
    out = []
    for b in bindings:
        parent_nickname = None
        if b.parent_id:
            from app.models.models import Parent
            parent = await db.get(Parent, b.parent_id)
            parent_nickname = parent.nickname if parent else None
        out.append(BindingOut(
            id=b.id,
            invite_code=b.invite_code,
            relationship_name=b.relationship_name,
            status=b.status,
            parent_nickname=parent_nickname,
        ))
    return out


# ──── Notifications ────

@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.student_id == student.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    notif = await db.get(Notification, notification_id)
    if not notif or notif.student_id != student.id:
        raise HTTPException(status_code=404, detail="通知不存在")
    notif.is_read = True
    await db.commit()
    return {"ok": True}


# ──── Summary Settings ────

@router.put("/summary-settings")
async def update_summary_settings(
    data: SummarySettingsUpdate,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    if data.summary_enabled is not None:
        student.summary_enabled = data.summary_enabled
    if data.summary_interval is not None:
        if data.summary_interval not in (10, 20, 50):
            raise HTTPException(status_code=400, detail="摘要间隔只能选 10、20 或 50 条")
        student.summary_interval = data.summary_interval
    await db.commit()
    await db.refresh(student)
    return {
        "summary_enabled": student.summary_enabled,
        "summary_interval": student.summary_interval,
    }


# ──── Summaries ────

@router.get("/summaries", response_model=list[ChatSummaryOut])
async def list_summaries(
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSummary)
        .where(ChatSummary.student_id == student.id)
        .order_by(ChatSummary.created_at.desc())
        .limit(30)
    )
    return list(result.scalars().all())


# ──── Chat History (read-only) ────

@router.get("/chat-history/{binding_id}", response_model=list[ChatMessageOut])
async def get_chat_history(
    binding_id: int,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
):
    binding = await db.get(Binding, binding_id)
    if not binding or binding.student_id != student.id:
        raise HTTPException(status_code=404, detail="绑定关系不存在")

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
        .limit(50)
    )
    messages = list(result.scalars().all())
    messages.reverse()
    return messages

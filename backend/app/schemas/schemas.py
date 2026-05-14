from datetime import datetime

from pydantic import BaseModel, EmailStr


# ──── Auth ────

class StudentRegister(BaseModel):
    email: EmailStr
    password: str
    name: str


class StudentLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ──── Student Profile ────

class StudentProfileUpdate(BaseModel):
    name: str | None = None
    school: str | None = None
    city: str | None = None
    country: str | None = None
    timezone: str | None = None
    major: str | None = None


class SummarySettingsUpdate(BaseModel):
    summary_enabled: bool | None = None
    summary_interval: int | None = None  # 10, 20, or 50


class StudentProfileOut(BaseModel):
    id: int
    email: str
    name: str
    school: str | None
    city: str | None
    country: str | None
    timezone: str | None
    major: str | None
    llm_provider: str | None
    llm_model: str | None
    has_llm_key: bool = False
    has_fish_key: bool = False
    summary_enabled: bool = True
    summary_interval: int = 20

    model_config = {"from_attributes": True}


class ChatSummaryOut(BaseModel):
    id: int
    binding_id: int
    message_count: int
    summary: str
    topics: str | None
    mood: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ──── API Keys ────

class ApiKeysUpdate(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    fish_audio_api_key: str | None = None


class ApiKeysOut(BaseModel):
    llm_provider: str | None
    llm_model: str | None
    has_llm_key: bool
    has_fish_key: bool
    supported_providers: list[dict]

    model_config = {"from_attributes": True}


# ──── Persona ────

class PersonaConfigUpdate(BaseModel):
    speaking_style: dict | None = None
    chat_samples: str | None = None
    parent_specific_styles: dict | None = None


class PersonaConfigOut(BaseModel):
    speaking_style: dict | None
    chat_samples: str | None
    parent_specific_styles: dict | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}


# ──── Voice ────

class VoiceModelIdUpdate(BaseModel):
    fish_audio_model_id: str


class VoiceProfileOut(BaseModel):
    fish_audio_model_id: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ──── Materials ────

class MaterialCreate(BaseModel):
    content: str
    proactive: bool = False


class MaterialOut(BaseModel):
    id: int
    source: str
    content: str
    proactive: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ──── Binding / Invite ────

class InviteCreate(BaseModel):
    relationship_name: str


class InviteOut(BaseModel):
    invite_code: str
    relationship_name: str | None
    status: str

    model_config = {"from_attributes": True}


class BindingOut(BaseModel):
    id: int
    invite_code: str
    relationship_name: str | None
    status: str
    parent_nickname: str | None = None

    model_config = {"from_attributes": True}


# ──── Chat (WeChat side) ────

class ChatMessageIn(BaseModel):
    binding_id: int
    content: str


class ChatMessageOut(BaseModel):
    role: str
    content_text: str
    content_voice_url: str | None
    emotion_tag: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ──── Notifications ────

class NotificationOut(BaseModel):
    id: int
    type: str
    content: str
    is_read: bool
    urgency: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ──── WeChat ────

class WxBindRequest(BaseModel):
    invite_code: str
    openid: str
    nickname: str | None = None


class WxChildOut(BaseModel):
    binding_id: int
    student_name: str
    relationship_name: str | None

    model_config = {"from_attributes": True}

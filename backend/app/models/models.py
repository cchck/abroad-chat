import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    school: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))
    timezone: Mapped[str | None] = mapped_column(String(50))
    major: Mapped[str | None] = mapped_column(String(200))
    llm_provider: Mapped[str | None] = mapped_column(String(20))  # anthropic / openai / gemini / qwen / deepseek
    llm_model: Mapped[str | None] = mapped_column(String(100))
    llm_api_key: Mapped[str | None] = mapped_column(String(500))
    fish_audio_api_key: Mapped[str | None] = mapped_column(String(500))
    summary_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    summary_interval: Mapped[int] = mapped_column(Integer, default=20)  # 10 / 20 / 50
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    voice_profile: Mapped["VoiceProfile | None"] = relationship(back_populates="student", cascade="all, delete-orphan")
    persona_config: Mapped["PersonaConfig | None"] = relationship(back_populates="student", cascade="all, delete-orphan")
    bindings: Mapped[list["Binding"]] = relationship(back_populates="student", cascade="all, delete-orphan")
    materials: Mapped[list["ContextMaterial"]] = relationship(back_populates="student", cascade="all, delete-orphan")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="student", cascade="all, delete-orphan")
    summaries: Mapped[list["ChatSummary"]] = relationship(back_populates="student", cascade="all, delete-orphan")


class Parent(Base):
    __tablename__ = "parents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    wechat_openid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    nickname: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    bindings: Mapped[list["Binding"]] = relationship(back_populates="parent", cascade="all, delete-orphan")


class Binding(Base):
    __tablename__ = "bindings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("parents.id", ondelete="CASCADE"), index=True)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, default=lambda: uuid.uuid4().hex[:8])
    relationship_name: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    student: Mapped["Student"] = relationship(back_populates="bindings")
    parent: Mapped["Parent | None"] = relationship(back_populates="bindings")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="binding", cascade="all, delete-orphan")


class VoiceProfile(Base):
    __tablename__ = "voice_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), unique=True)
    fish_audio_model_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="processing")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    student: Mapped["Student"] = relationship(back_populates="voice_profile")


class PersonaConfig(Base):
    __tablename__ = "persona_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), unique=True)
    speaking_style: Mapped[dict | None] = mapped_column(JSON)
    chat_samples: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str | None] = mapped_column(Text)
    parent_specific_styles: Mapped[dict | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    student: Mapped["Student"] = relationship(back_populates="persona_config")


class ContextMaterial(Base):
    __tablename__ = "context_materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(20))  # student_feed / parent_chat / auto_fetch
    content: Mapped[str] = mapped_column(Text)
    proactive: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    student: Mapped["Student"] = relationship(back_populates="materials")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    binding_id: Mapped[int] = mapped_column(ForeignKey("bindings.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    binding: Mapped["Binding"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", order_by="Message.created_at", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # parent / ai
    content_text: Mapped[str] = mapped_column(Text)
    content_voice_url: Mapped[str | None] = mapped_column(String(500))
    emotion_tag: Mapped[str | None] = mapped_column(String(20))
    sensitivity_level: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_student_unread", "student_id", "is_read"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(30))
    content: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    urgency: Mapped[str] = mapped_column(String(10), default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    student: Mapped["Student"] = relationship(back_populates="notifications")


class ChatSummary(Base):
    __tablename__ = "chat_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    binding_id: Mapped[int] = mapped_column(ForeignKey("bindings.id", ondelete="CASCADE"), index=True)
    message_count: Mapped[int] = mapped_column(Integer)  # how many messages were summarized
    summary: Mapped[str] = mapped_column(Text)
    topics: Mapped[str | None] = mapped_column(Text)  # comma-separated topic tags
    mood: Mapped[str | None] = mapped_column(String(20))  # overall mood
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    student: Mapped["Student"] = relationship(back_populates="summaries")

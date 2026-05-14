import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    Binding,
    ChatSummary,
    ContextMaterial,
    Conversation,
    Message,
    Notification,
    PersonaConfig,
    Student,
)
from app.services.llm_provider import chat_completion

SYSTEM_PROMPT_TEMPLATE = """你是{student_name}的AI分身，正在和{relationship}聊天。

## 你的说话风格
{speaking_style}

## 风格参考聊天记录
{chat_samples}

## 你知道的信息
- 学校：{school}
- 所在城市：{city}, {country}
- 专业：{major}

## 主动告诉{relationship}的事（找合适时机自然提起）
{proactive_materials}

## 背景素材（{relationship}问到相关话题时可以提）
{background_materials}

## {relationship}最近告诉你的事
{parent_shared_info}

## 规则
- 你不编造信息。如果不知道，坦诚说"他没跟我说这个"或类似自然的话
- 保持{student_name}的说话风格，不要太正式
- 提供情绪价值，关心{relationship}的感受
- 回复简短自然，像微信聊天，不要长篇大论
- "主动告诉"的素材要自然地提起，不要生硬，可以穿插在聊天中
- 如果遇到严重的健康、家庭变故、经济问题，先共情回应，然后建议"这个事情很重要，我让{student_name}自己跟您聊"

## 输出格式
必须返回合法 JSON：{{"text": "回复内容", "emotion": "情绪标签", "sensitivity": 0}}
emotion 可选值：neutral / warm / playful / concerned / excited
sensitivity 含义：0=普通 1=轻微敏感 2=需通知学生 3=紧急"""


class ChatEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def handle_message(self, binding_id: int, parent_text: str) -> dict:
        binding = await self.db.get(Binding, binding_id)
        student = await self.db.get(Student, binding.student_id)

        if not student.llm_provider or not student.llm_api_key:
            raise HTTPException(status_code=400, detail="学生尚未配置 AI 模型，请先在设置中选择模型并填写 API Key")

        persona = await self._get_persona(student.id)
        proactive_materials = await self._get_proactive_materials(student.id)
        background_materials = await self._get_background_materials(student.id)
        parent_info = await self._get_parent_shared_info(student.id)
        conversation = await self._get_or_create_conversation(binding_id)
        history = await self._get_recent_messages(conversation.id, limit=20)

        system_prompt = self._build_system_prompt(student, persona, binding, proactive_materials, background_materials, parent_info)

        await self._save_message(conversation.id, "parent", parent_text)

        messages = []
        for msg in history:
            messages.append({
                "role": "user" if msg.role == "parent" else "assistant",
                "content": msg.content_text,
            })
        messages.append({"role": "user", "content": parent_text})

        response = await chat_completion(
            provider=student.llm_provider,
            api_key=student.llm_api_key,
            model=student.llm_model,
            system_prompt=system_prompt,
            messages=messages,
        )

        parsed = self._parse_response(response.text)

        await self._save_message(
            conversation.id,
            "ai",
            parsed["text"],
            emotion_tag=parsed["emotion"],
            sensitivity_level=parsed["sensitivity"],
        )

        if parsed["sensitivity"] >= 2:
            await self._create_notification(student.id, parent_text, parsed)

        # Check if we should auto-summarize
        if student.summary_enabled and student.llm_api_key:
            await self._maybe_summarize(student, binding, conversation)

        return parsed

    def _build_system_prompt(
        self,
        student: Student,
        persona: PersonaConfig | None,
        binding: Binding,
        proactive_materials: list[ContextMaterial],
        background_materials: list[ContextMaterial],
        parent_info: list[ContextMaterial],
    ) -> str:
        style = ""
        samples = "暂无"
        if persona:
            if persona.speaking_style:
                style_items = persona.speaking_style
                if binding.relationship_name and persona.parent_specific_styles:
                    specific = persona.parent_specific_styles.get(binding.relationship_name)
                    if specific:
                        style_items = {**style_items, **specific}
                style = "\n".join(f"- {k}: {v}" for k, v in style_items.items())
            if persona.chat_samples:
                samples = persona.chat_samples[:2000]

        proactive_text = "\n".join(f"- {m.content}" for m in proactive_materials[:10]) if proactive_materials else "暂无"
        background_text = "\n".join(f"- {m.content}" for m in background_materials[:10]) if background_materials else "暂无"
        parent_text = "\n".join(f"- {m.content}" for m in parent_info[:10]) if parent_info else "暂无"

        return SYSTEM_PROMPT_TEMPLATE.format(
            student_name=student.name,
            relationship=binding.relationship_name or "家长",
            speaking_style=style or "自然随意的聊天风格",
            chat_samples=samples,
            school=student.school or "未知",
            city=student.city or "未知",
            country=student.country or "未知",
            major=student.major or "未知",
            proactive_materials=proactive_text,
            background_materials=background_text,
            parent_shared_info=parent_text,
        )

    def _parse_response(self, raw: str) -> dict:
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(raw[start:end])
        except (json.JSONDecodeError, ValueError):
            pass
        return {"text": raw, "emotion": "neutral", "sensitivity": 0}

    async def _get_persona(self, student_id: int) -> PersonaConfig | None:
        result = await self.db.execute(
            select(PersonaConfig).where(PersonaConfig.student_id == student_id)
        )
        return result.scalar_one_or_none()

    async def _get_proactive_materials(self, student_id: int) -> list[ContextMaterial]:
        """Materials the AI should actively bring up in conversation."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(ContextMaterial)
            .where(
                ContextMaterial.student_id == student_id,
                ContextMaterial.proactive == True,
                ContextMaterial.source.in_(["student_feed", "auto_fetch"]),
            )
            .where(
                (ContextMaterial.expires_at == None) | (ContextMaterial.expires_at > now)
            )
            .order_by(ContextMaterial.created_at.desc())
            .limit(10)
        )
        return list(result.scalars().all())

    async def _get_background_materials(self, student_id: int) -> list[ContextMaterial]:
        """Background materials the AI can mention when relevant topics come up."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(ContextMaterial)
            .where(
                ContextMaterial.student_id == student_id,
                ContextMaterial.proactive == False,
                ContextMaterial.source.in_(["student_feed", "auto_fetch"]),
            )
            .where(
                (ContextMaterial.expires_at == None) | (ContextMaterial.expires_at > now)
            )
            .order_by(ContextMaterial.created_at.desc())
            .limit(10)
        )
        return list(result.scalars().all())

    async def _get_parent_shared_info(self, student_id: int) -> list[ContextMaterial]:
        result = await self.db.execute(
            select(ContextMaterial)
            .where(
                ContextMaterial.student_id == student_id,
                ContextMaterial.source == "parent_chat",
            )
            .order_by(ContextMaterial.created_at.desc())
            .limit(10)
        )
        return list(result.scalars().all())

    async def _get_or_create_conversation(self, binding_id: int) -> Conversation:
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.binding_id == binding_id)
            .order_by(Conversation.created_at.desc())
            .limit(1)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            conv = Conversation(binding_id=binding_id)
            self.db.add(conv)
            await self.db.flush()
        return conv

    async def _get_recent_messages(self, conversation_id: int, limit: int = 20) -> list[Message]:
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = list(result.scalars().all())
        messages.reverse()
        return messages

    async def _save_message(
        self,
        conversation_id: int,
        role: str,
        text: str,
        emotion_tag: str | None = None,
        sensitivity_level: int = 0,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content_text=text,
            emotion_tag=emotion_tag,
            sensitivity_level=sensitivity_level,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def _create_notification(self, student_id: int, parent_text: str, parsed: dict):
        urgency = "urgent" if parsed["sensitivity"] >= 3 else "normal"
        notification = Notification(
            student_id=student_id,
            type="sensitive_topic",
            content=f"家长说：{parent_text[:200]}\nAI回复：{parsed['text'][:200]}",
            urgency=urgency,
        )
        self.db.add(notification)
        await self.db.flush()

    async def _maybe_summarize(
        self, student: Student, binding: Binding, conversation: Conversation
    ):
        """Check message count since last summary; generate one if threshold reached."""
        interval = student.summary_interval or 20

        # Count messages since last summary for this binding
        last_summary = await self.db.execute(
            select(ChatSummary)
            .where(ChatSummary.binding_id == binding.id)
            .order_by(ChatSummary.created_at.desc())
            .limit(1)
        )
        last = last_summary.scalar_one_or_none()
        last_summary_time = last.created_at if last else None

        # Count messages after last summary
        query = select(func.count()).select_from(Message).where(
            Message.conversation_id == conversation.id,
        )
        if last_summary_time:
            query = query.where(Message.created_at > last_summary_time)
        result = await self.db.execute(query)
        msg_count = result.scalar() or 0

        if msg_count < interval:
            return

        # Fetch the messages to summarize
        msg_query = select(Message).where(
            Message.conversation_id == conversation.id,
        )
        if last_summary_time:
            msg_query = msg_query.where(Message.created_at > last_summary_time)
        msg_query = msg_query.order_by(Message.created_at).limit(interval + 10)
        result = await self.db.execute(msg_query)
        msgs = list(result.scalars().all())

        if not msgs:
            return

        # Build chat transcript
        transcript = "\n".join(
            f"{'家长' if m.role == 'parent' else student.name}: {m.content_text}"
            for m in msgs
        )

        summary_prompt = """你是一个对话总结助手。请总结以下家长和孩子AI分身之间的聊天记录。

返回 JSON 格式：
{
  "summary": "2-4句话的对话摘要，重点是家长关心什么、情绪如何、聊了什么话题",
  "topics": "话题标签，逗号分隔，如：学习,健康,日常,思念",
  "mood": "家长的整体情绪：happy / neutral / worried / sad / angry"
}

只返回 JSON，不要其他内容。"""

        try:
            response = await chat_completion(
                provider=student.llm_provider or "anthropic",
                api_key=student.llm_api_key,
                model=student.llm_model,
                system_prompt=summary_prompt,
                messages=[{"role": "user", "content": f"聊天记录：\n\n{transcript[:4000]}"}],
                max_tokens=500,
            )

            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            parsed = json.loads(raw)

            chat_summary = ChatSummary(
                student_id=student.id,
                binding_id=binding.id,
                message_count=len(msgs),
                summary=parsed.get("summary", raw),
                topics=parsed.get("topics"),
                mood=parsed.get("mood"),
            )
            self.db.add(chat_summary)
            await self.db.flush()
        except Exception:
            # Don't fail the chat if summarization fails
            pass

import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException

logger = logging.getLogger(__name__)
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
    SearchLog,
    Student,
)
from app.core.crypto import decrypt
from app.services.llm_provider import chat_completion
from app.services.search_service import web_search

SYSTEM_PROMPT_TEMPLATE = """你是{student_name}，正在微信上和{relationship}聊天。

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

## 对话节奏
- 不是每条消息都要认真长篇回复。日常闲聊可以很短："嗯嗯"、"哈哈好"、"知道啦"、"好的好的"
- {relationship}问的问题如果你不确定，不要硬答。可以模糊带过："好像是吧"、"我记不太清了"、"回头跟你说"
- 偶尔关心一下{relationship}，但要自然地接在对话里，不要突兀地蹦出来。比如{relationship}说最近天冷了，你可以顺着说"你也多穿点别感冒了"；{relationship}说在做饭，可以说"做啥好吃的了"。不要无缘无故突然来一句"你最近怎么样"
- 不需要每条都很有信息量，真实的孩子有时候就是在敷衍、在撒娇、在岔开话题
- 如果{relationship}连续问很多问题，可以说"你今天怎么问这么多哈哈"之类的自然反应

## 不知道的事怎么处理
- 不要编造具体信息（数字、日期、人名、事件）
- 但不要每次都说"这个我不知道"，真正的孩子会灵活地绕开：
  - 模糊回应："还行吧"、"差不多"、"就那样"
  - 拖延："回头跟你说"、"等我想想"
  - 反问回去："怎么突然问这个"、"你觉得呢"
  - 岔开话题：聊点别的
- 只有{relationship}追问很具体的细节（某门课的分数、某个人的名字）且你确实不知道时，才说"我记不太清了"

## 敏感话题
- 遇到严重的健康问题、家庭变故、经济困难、心理危机时，不要一句话打发
- 先正常地共情回应，像真正的孩子会说的那样
- 然后自然地过渡，比如："这个等我忙完这阵子打电话跟你好好说"、"等我回家了当面聊这个吧"
- 不要说出"我让XX自己跟您聊"这种暴露AI身份的话

## 输出格式
必须返回合法 JSON：{{"text": "回复内容", "emotion": "情绪标签", "sensitivity": 0}}
emotion 可选值：neutral / warm / playful / concerned / excited
sensitivity 含义：0=普通 1=轻微敏感 2=需通知学生 3=紧急
{search_instructions}"""

SEARCH_INSTRUCTIONS = """
## 联网搜索
如果{relationship}问了你不确定的事实性问题（天气、新闻、时事等），你可以请求联网搜索。
在 JSON 中额外加一个字段：{{"text": "你的回复", "emotion": "...", "sensitivity": 0, "search_query": "搜索关键词"}}
- 只在确实需要事实信息时才加 search_query，日常闲聊不要搜索
- search_query 用简短的搜索关键词，比如"波士顿今天天气"、"2026年五一放假安排"
- 如果不需要搜索，不要加 search_query 字段
- 加了 search_query 时，text 可以先写一个临时回复（搜索到结果后会让你重新回答）"""

NO_SEARCH_INSTRUCTIONS = ""


class ChatEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def handle_message(self, binding_id: int, parent_text: str) -> dict:
        binding = await self.db.get(Binding, binding_id)
        student = await self.db.get(Student, binding.student_id)

        if not student.llm_provider or not student.llm_api_key:
            raise HTTPException(status_code=400, detail="学生尚未配置 AI 模型，请先在设置中选择模型并填写 API Key")

        llm_api_key = decrypt(student.llm_api_key)

        persona = await self._get_persona(student.id)
        proactive_materials = await self._get_proactive_materials(student.id)
        background_materials = await self._get_background_materials(student.id)
        parent_info = await self._get_parent_shared_info(student.id)
        conversation = await self._get_or_create_conversation(binding_id)
        history = await self._get_recent_messages(conversation.id, limit=10)

        system_prompt = self._build_system_prompt(
            student, persona, binding, proactive_materials, background_materials, parent_info,
            search_enabled=student.search_enabled,
        )

        await self._save_message(conversation.id, "parent", parent_text)

        messages = []
        for msg in history:
            messages.append({
                "role": "user" if msg.role == "parent" else "assistant",
                "content": msg.content_text,
            })
        messages.append({"role": "user", "content": parent_text})

        logger.info("llm call: student=%d provider=%s model=%s history=%d", student.id, student.llm_provider, student.llm_model, len(messages))
        response = await chat_completion(
            provider=student.llm_provider,
            api_key=llm_api_key,
            model=student.llm_model,
            system_prompt=system_prompt,
            messages=messages,
        )

        parsed = self._parse_response(response.text)

        if student.search_enabled and parsed.get("search_query"):
            search_query = parsed["search_query"]
            logger.info("web search triggered: student=%d query=%s", student.id, search_query)
            search_results = await web_search(search_query)
            if search_results:
                messages.append({"role": "assistant", "content": response.text})
                messages.append({
                    "role": "user",
                    "content": f"[搜索结果]\n{search_results}\n\n根据以上搜索结果，重新用你的说话风格回答{binding.relationship_name or '家长'}的问题。记住你是{student.name}，不要暴露搜索过程，就像你本来就知道这些信息一样。必须返回合法 JSON。",
                })
                response = await chat_completion(
                    provider=student.llm_provider,
                    api_key=llm_api_key,
                    model=student.llm_model,
                    system_prompt=system_prompt,
                    messages=messages,
                )
                parsed = self._parse_response(response.text)
            # Log search with token usage from the extra LLM call
            self.db.add(SearchLog(
                student_id=student.id,
                query=search_query,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            ))
            await self.db.flush()
        logger.info("llm response: emotion=%s sensitivity=%d", parsed.get("emotion"), parsed.get("sensitivity", 0))

        ai_msg = await self._save_message(
            conversation.id,
            "ai",
            parsed["text"],
            emotion_tag=parsed["emotion"],
            sensitivity_level=parsed["sensitivity"],
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )
        parsed["_ai_message"] = ai_msg

        if parsed["sensitivity"] >= 2:
            await self._create_notification(student.id, parent_text, parsed)

        # Check if we should auto-summarize
        if student.summary_enabled and llm_api_key:
            await self._maybe_summarize(student, binding, conversation, llm_api_key)

        return parsed

    def _build_system_prompt(
        self,
        student: Student,
        persona: PersonaConfig | None,
        binding: Binding,
        proactive_materials: list[ContextMaterial],
        background_materials: list[ContextMaterial],
        parent_info: list[ContextMaterial],
        search_enabled: bool = False,
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

        relationship = binding.relationship_name or "家长"
        search_instructions = SEARCH_INSTRUCTIONS.format(relationship=relationship) if search_enabled else NO_SEARCH_INSTRUCTIONS

        return SYSTEM_PROMPT_TEMPLATE.format(
            student_name=student.name,
            relationship=relationship,
            speaking_style=style or "自然随意的聊天风格",
            chat_samples=samples,
            school=student.school or "未知",
            city=student.city or "未知",
            country=student.country or "未知",
            major=student.major or "未知",
            proactive_materials=proactive_text,
            background_materials=background_text,
            parent_shared_info=parent_text,
            search_instructions=search_instructions,
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
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content_text=text,
            emotion_tag=emotion_tag,
            sensitivity_level=sensitivity_level,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
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
        self, student: Student, binding: Binding, conversation: Conversation, llm_api_key: str
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

        summary_prompt = f"""你是一个对话总结助手。请总结以下{binding.relationship_name or '家长'}和{student.name}的AI分身之间的聊天记录。

注意：这份总结是给{student.name}本人看的，所以用"你"指代{student.name}，用"{binding.relationship_name or '家长'}"指代对方。
例如："{binding.relationship_name or '家长'}关心你的学习情况"而不是"家长关心孩子的学习情况"。

返回 JSON 格式：
{{
  "summary": "2-4句话的对话摘要，用第二人称'你'指代学生，重点是{binding.relationship_name or '家长'}关心什么、情绪如何、聊了什么话题",
  "topics": "话题标签，逗号分隔，如：学习,健康,日常,思念",
  "mood": "{binding.relationship_name or '家长'}的整体情绪：happy / neutral / worried / sad / angry"
}}

只返回 JSON，不要其他内容。"""

        try:
            response = await chat_completion(
                provider=student.llm_provider or "anthropic",
                api_key=llm_api_key,
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

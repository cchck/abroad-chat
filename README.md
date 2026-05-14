# 留学分身

让 AI 替你陪爸妈聊天。

## 为什么做这个

留学生和家里的沟通是个老问题。时差、课业、社交，真正能坐下来好好回消息的时间很少。不是不想聊，是经常顾不上。

但对爸妈来说，孩子不回消息就是一种缺席。他们不一定需要你解决什么问题，就是想知道你吃了没、最近忙不忙、天冷了有没有加衣服。这些小事，恰恰是他们最在意的。

这个项目的出发点很简单：**降低沟通成本，同时照顾到家里的长辈。** 用 AI 生成一个你的"分身"，学你的说话方式，帮你和爸妈保持日常的聊天节奏。你忙的时候它顶上，你有空了随时可以看聊天摘要，真正重要的事它会通知你亲自来聊。

不是要用 AI 替代亲情，而是不让忙碌成为断联的理由。

## 功能

- **AI 分身对话** — 家长通过微信风格的界面和你的 AI 分身聊天，AI 会模仿你的说话习惯、口头禅和语气
- **语音克隆** — 通过 Fish Audio 克隆你的声音，家长能收到听起来像你的语音消息
- **素材投喂** — 告诉 AI 你最近的动态，可以设为"主动提起"（AI 找机会说）或"背景素材"（家长问到才说）
- **敏感话题检测** — AI 遇到健康、家庭变故、经济问题等敏感话题会通知你亲自处理
- **自动对话总结** — 定期生成聊天摘要和情绪分析，让你快速了解爸妈最近在聊什么、心情怎么样
- **多模型支持** — 支持 Anthropic、OpenAI、Gemini、通义千问、DeepSeek，学生自带 API Key

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | FastAPI + SQLAlchemy (async) + PostgreSQL |
| 前端 | Next.js 16 + Tailwind CSS 4 + TypeScript |
| 语音 | Fish Audio TTS + 声音克隆 |
| 认证 | JWT |

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+
- PostgreSQL

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库地址和 JWT 密钥

# 建表
python3 -c "
import asyncio
from app.core.database import engine, Base
from app.models.models import *
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(init())
"

# 启动
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev -- --webpack
```

打开 `http://localhost:3000` — 学生控制台  
打开 `http://localhost:3000/parent` — 家长聊天界面

## 项目结构

```
abroad-chat/
├── backend/
│   ├── app/
│   │   ├── api/          # 路由 (auth, student, wechat)
│   │   ├── core/         # 数据库、认证、依赖注入
│   │   ├── models/       # SQLAlchemy 数据模型
│   │   ├── schemas/      # Pydantic 请求/响应模型
│   │   └── services/     # 业务逻辑 (对话引擎, LLM, 语音, TTS)
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/          # 页面 (控制台, 登录, 家长聊天)
│       ├── components/   # UI 面板
│       └── lib/          # API 客户端
└── README.md
```

## License

MIT

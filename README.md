# 留学分身 (Study Abroad Avatar)

AI-powered chat avatar that communicates with parents on behalf of international students, bridging timezone gaps and reducing communication guilt.

## What it does

International students are busy — classes, exams, timezone differences make it hard to stay in touch with parents back home. This app creates an AI avatar that chats with parents in the student's own speaking style, keeping the family connection warm.

- **AI Avatar Chat** — Parents chat with the student's AI avatar via a WeChat-style interface. The AI mimics the student's texting habits, tone, and catchphrases.
- **Voice Cloning** — Optional TTS with the student's cloned voice via Fish Audio, so parents can hear voice messages that sound like their child.
- **Smart Materials** — Students feed the AI updates about their life. Materials can be set as "proactive" (AI will actively bring them up) or "background" (mentioned only when relevant).
- **Sensitivity Detection** — The AI flags sensitive topics (health issues, family emergencies, financial problems) and notifies the student to handle them personally.
- **Auto Summarization** — Periodic conversation summaries with mood analysis, so students can quickly catch up on what parents are talking about.
- **Multi-provider LLM** — Supports Anthropic, OpenAI, Gemini, Qwen, and DeepSeek. Students bring their own API keys.

## Tech Stack

**Backend:** FastAPI + SQLAlchemy (async) + PostgreSQL  
**Frontend:** Next.js 16 + Tailwind CSS 4 + TypeScript  
**TTS:** Fish Audio API  
**Auth:** JWT  

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set up database
cp .env.example .env
# Edit .env with your database URL and JWT secret

# Create tables
python3 -c "
import asyncio
from app.core.database import engine, Base
from app.models.models import *
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(init())
"

# Run
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- --webpack
```

Open `http://localhost:3000` — student dashboard  
Open `http://localhost:3000/parent` — parent chat interface

## Project Structure

```
abroad-chat/
├── backend/
│   ├── app/
│   │   ├── api/          # Route handlers (auth, student, wechat)
│   │   ├── core/         # Database, auth, dependencies
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # Business logic (chat engine, LLM, voice, TTS)
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/          # Next.js pages (dashboard, login, parent chat)
│       ├── components/   # UI panels (profile, API keys, persona, etc.)
│       └── lib/          # API clients
└── README.md
```

## License

MIT

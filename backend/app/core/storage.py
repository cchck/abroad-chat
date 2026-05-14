import uuid
from pathlib import Path

VOICE_DIR = Path(__file__).resolve().parent.parent.parent / "voice_files"
VOICE_DIR.mkdir(exist_ok=True)


def save_voice(audio_bytes: bytes) -> str:
    """Save audio bytes to local file, return URL path."""
    filename = f"{uuid.uuid4().hex}.mp3"
    (VOICE_DIR / filename).write_bytes(audio_bytes)
    return f"/voices/{filename}"

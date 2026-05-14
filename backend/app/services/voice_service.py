import httpx

FISH_AUDIO_BASE_URL = "https://api.fish.audio"


class VoiceService:
    def __init__(self, api_key: str):
        self.base_url = FISH_AUDIO_BASE_URL
        self.api_key = api_key

    async def clone_voice(self, audio_data: bytes, name: str) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/model",
                headers={"Authorization": f"Bearer {self.api_key}"},
                files={"file": (f"{name}.wav", audio_data, "audio/wav")},
                data={
                    "title": f"abroad-chat-{name}",
                    "visibility": "private",
                },
            )
            response.raise_for_status()
            return response.json()["_id"]

    async def text_to_speech(self, text: str, model_id: str) -> bytes:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/v1/tts",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "reference_id": model_id,
                    "format": "mp3",
                    "latency": "normal",
                },
            )
            response.raise_for_status()
            return response.content

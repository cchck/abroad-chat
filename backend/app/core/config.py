from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "留学分身 Abroad Chat"
    API_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql+asyncpg://kevin@localhost:5432/abroad_chat"
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    ENCRYPTION_KEY: str = ""  # Fernet key for encrypting API keys in DB

    CORS_ORIGINS: str = "http://localhost:3000"  # comma-separated allowed origins

    FISH_AUDIO_BASE_URL: str = "https://api.fish.audio"

    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""
    WECHAT_TOKEN: str = ""

    COS_SECRET_ID: str = ""
    COS_SECRET_KEY: str = ""
    COS_BUCKET: str = ""
    COS_REGION: str = ""

    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

"""Symmetric encryption for API keys stored in the database."""

from cryptography.fernet import Fernet

from app.core.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.ENCRYPTION_KEY
        if not key:
            raise RuntimeError(
                "ENCRYPTION_KEY is not set. "
                "Generate one with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt(plain_text: str) -> str:
    """Encrypt a string, return base64-encoded ciphertext."""
    if not plain_text:
        return plain_text
    return _get_fernet().encrypt(plain_text.encode()).decode()


def decrypt(cipher_text: str) -> str:
    """Decrypt a base64-encoded ciphertext back to plain string."""
    if not cipher_text:
        return cipher_text
    return _get_fernet().decrypt(cipher_text.encode()).decode()

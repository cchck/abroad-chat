import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

logger = logging.getLogger(__name__)
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import Student
from app.schemas.schemas import StudentLogin, StudentRegister, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, data: StudentRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Student).where(Student.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该邮箱已注册，请直接登录")

    student = Student(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)

    logger.info("student registered: id=%d email=%s", student.id, student.email)
    token = create_access_token(student.id)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, data: StudentLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Student).where(Student.email == data.email))
    student = result.scalar_one_or_none()
    if not student or not verify_password(data.password, student.password_hash):
        logger.warning("login failed: email=%s", data.email)
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    logger.info("student login: id=%d email=%s", student.id, student.email)
    token = create_access_token(student.id)
    return TokenResponse(access_token=token)

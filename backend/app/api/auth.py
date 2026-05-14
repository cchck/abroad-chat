from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import Student
from app.schemas.schemas import StudentLogin, StudentRegister, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(data: StudentRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Student).where(Student.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    student = Student(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)

    token = create_access_token(student.id)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(data: StudentLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Student).where(Student.email == data.email))
    student = result.scalar_one_or_none()
    if not student or not verify_password(data.password, student.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(student.id)
    return TokenResponse(access_token=token)

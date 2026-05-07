import asyncio

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import AsyncSessionLocal
from app.models.user import User

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


async def seed_database():
    """Create seed user if it doesn't exist."""
    async with AsyncSessionLocal() as session:
        # Check if seed user already exists
        stmt = select(User).where(User.email == "clinician@demo.test")
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print("✓ Seed user already exists: clinician@demo.test")
            return

        # Create seed user
        password_hash = pwd_context.hash("password")
        seed_user = User(
            email="clinician@demo.test",
            password_hash=password_hash,
            full_name="Demo Clinician",
            is_active=True,
        )

        session.add(seed_user)
        await session.commit()
        print("✓ Created seed user: clinician@demo.test / password")


if __name__ == "__main__":
    asyncio.run(seed_database())

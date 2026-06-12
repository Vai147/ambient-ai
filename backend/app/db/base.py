from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


@asynccontextmanager
async def task_db_session():
    """Fresh DB session for Celery tasks, bound to the current event loop.

    Celery prefork runs each task via asyncio.run() — a new event loop per
    task. asyncpg connections are bound to the loop that created them, so
    reusing the module-level pooled engine across tasks raises
    "another operation is in progress". Build a throwaway NullPool engine
    inside the running loop and dispose it when the task finishes so no
    connection ever crosses event loops.
    """
    task_engine = create_async_engine(
        settings.database_url, echo=False, poolclass=NullPool
    )
    session_factory = async_sessionmaker(
        task_engine, expire_on_commit=False, class_=AsyncSession
    )
    try:
        async with session_factory() as session:
            yield session
    finally:
        await task_engine.dispose()

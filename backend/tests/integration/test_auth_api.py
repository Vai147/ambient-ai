"""Integration tests for auth endpoints."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.db.base import Base, get_db
from app.models.user import User
from app.core.auth import hash_password as get_password_hash

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DB_URL, echo=False)
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


async def _override_get_db():
    async with _TestSession() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.clear()
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def seed_user():
    async with _TestSession() as session:
        user = User(
            email="test@demo.test",
            password_hash=get_password_hash("testpass"),
            full_name="Test Clinician",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.mark.asyncio
async def test_login_success(seed_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/auth/login",
            json={"email": "test@demo.test", "password": "testpass"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(seed_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/auth/login",
            json={"email": "test@demo.test", "password": "wrongpass"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/auth/login",
            json={"email": "nobody@demo.test", "password": "anypass"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_protected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token(seed_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"email": "test@demo.test", "password": "testpass"},
        )
        token = login.json()["access_token"]
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["email"] == "test@demo.test"

"""Integration tests for session CRUD endpoints."""
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
async def auth_client():
    async with _TestSession() as session:
        user = User(
            email="clinician@demo.test",
            password_hash=get_password_hash("password"),
            full_name="Demo Clinician",
        )
        session.add(user)
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"email": "clinician@demo.test", "password": "password"},
        )
        token = login.json()["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client


@pytest.mark.asyncio
async def test_create_session(auth_client):
    resp = await auth_client.post(
        "/api/sessions",
        json={"patient_name": "John Doe"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["status"] == "recording"
    assert data["patient_name"] == "John Doe"


@pytest.mark.asyncio
async def test_get_session(auth_client):
    create = await auth_client.post("/api/sessions", json={"patient_name": "Jane Doe"})
    session_id = create.json()["id"]

    resp = await auth_client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == session_id


@pytest.mark.asyncio
async def test_list_sessions(auth_client):
    await auth_client.post("/api/sessions", json={"patient_name": "Patient A"})
    await auth_client.post("/api/sessions", json={"patient_name": "Patient B"})

    resp = await auth_client.get("/api/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) >= 2


@pytest.mark.asyncio
async def test_get_session_not_found(auth_client):
    resp = await auth_client.get("/api/sessions/nonexistent-id")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_sessions_require_auth():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/sessions")
    assert resp.status_code == 401

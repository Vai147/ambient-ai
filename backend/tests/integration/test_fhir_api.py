"""Integration tests for the FHIR export endpoint and validation persistence."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.db.base import Base, get_db
from app.models.user import User
from app.models.session import Session
from app.models.soap_note import SOAPNote
from app.core.auth import hash_password as get_password_hash
import app.services.fhir_export as fhir_export

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


async def _seed_user() -> str:
    async with _TestSession() as session:
        user = User(
            email="clinician@demo.test",
            password_hash=get_password_hash("password"),
            full_name="Demo Clinician",
        )
        session.add(user)
        await session.commit()
        return user.id


async def _seed_approved_session_with_note(clinician_id: str) -> str:
    async with _TestSession() as session:
        sess = Session(
            clinician_id=clinician_id,
            status="approved",
            patient_name="Jane Doe",
        )
        session.add(sess)
        await session.flush()
        note = SOAPNote(
            session_id=sess.id,
            subjective="Sore throat for three days.",
            objective="Temp 38.1C, pharyngeal erythema.",
            assessment={
                "summary": "Acute pharyngitis.",
                "icd10_codes": [{"code": "J02.9", "description": "Acute pharyngitis"}],
            },
            plan={
                "instructions": "Rest, fluids.",
                "medications": [{"name": "Amoxicillin", "dose": "500mg"}],
            },
            hallucination_flags={},
        )
        session.add(note)
        await session.commit()
        return sess.id


@pytest_asyncio.fixture
async def auth_client():
    await _seed_user()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"email": "clinician@demo.test", "password": "password"},
        )
        token = login.json()["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client


async def _get_user_id() -> str:
    async with _TestSession() as session:
        result = await session.execute(select(User).where(User.email == "clinician@demo.test"))
        return result.scalar_one().id


@pytest.mark.asyncio
async def test_export_valid_bundle_persists_validation(auth_client):
    user_id = await _get_user_id()
    session_id = await _seed_approved_session_with_note(user_id)

    resp = await auth_client.post(f"/api/fhir/{session_id}/export-fhir")

    assert resp.status_code == 200
    body = resp.json()
    assert body["validation"]["valid"] is True
    # No HAPI configured in tests → HAPI not attempted, nothing posted.
    assert body["posted"] is False
    assert body["validation"]["hapi_reachable"] is None
    assert body["validation"]["validated_by"] == ["local"]

    # Validation result is persisted on the note.
    async with _TestSession() as session:
        result = await session.execute(
            select(SOAPNote).where(SOAPNote.session_id == session_id)
        )
        note = result.scalar_one()
        assert note.fhir_validation is not None
        assert note.fhir_validation["valid"] is True


@pytest.mark.asyncio
async def test_export_invalid_bundle_returns_200_not_posted(auth_client, monkeypatch):
    user_id = await _get_user_id()
    session_id = await _seed_approved_session_with_note(user_id)

    # Force the builder to emit a structurally invalid bundle (missing type).
    real_build = fhir_export.build_fhir_bundle

    def _broken_build(*args, **kwargs):
        bundle = real_build(*args, **kwargs)
        del bundle["type"]
        return bundle

    monkeypatch.setattr(fhir_export, "build_fhir_bundle", _broken_build)

    resp = await auth_client.post(f"/api/fhir/{session_id}/export-fhir")

    assert resp.status_code == 200
    body = resp.json()
    assert body["validation"]["valid"] is False
    assert body["posted"] is False
    assert any(i["severity"] == "error" for i in body["validation"]["issues"])


@pytest.mark.asyncio
async def test_export_requires_approved_status(auth_client):
    user_id = await _get_user_id()
    async with _TestSession() as session:
        sess = Session(clinician_id=user_id, status="note_generated", patient_name="Bob")
        session.add(sess)
        await session.commit()
        session_id = sess.id

    resp = await auth_client.post(f"/api/fhir/{session_id}/export-fhir")
    assert resp.status_code == 409

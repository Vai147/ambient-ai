# Ambient Clinical Scribe

AI-powered ambient clinical documentation. A clinician speaks during a patient encounter — the app transcribes the conversation, generates a structured **SOAP note**, verifies every clinical claim against the transcript, and exports a validated **FHIR R4** bundle for the EHR.

Built around one principle: **AI drafts, but nothing reaches the record unverified.**

---

## Architecture

![Architecture](docs/screenshots/architecture.png)

The API never blocks on AI work. The backend persists the upload, drops a job on Redis, and returns immediately. A **Celery worker** does the heavy lifting — Whisper transcription, Claude SOAP generation, and hallucination detection — then writes results to Postgres. The frontend polls for status.

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Tailwind, Zustand, TanStack Query |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Celery |
| Datastore | PostgreSQL 16, Redis 7 (broker) |
| AI | Whisper (local, CPU) · Claude Sonnet 4.6 (SOAP) · all-MiniLM-L6-v2 (grounding) |
| Interop | FHIR R4 + HAPI `$validate` |
| Infra | Docker Compose · Railway |

**Models run on the Celery worker** — Whisper and the embedding model locally on CPU (no PHI leaves the system); Claude over the Anthropic API.

---

## How it works

### 1. Sign in
![Login](docs/screenshots/login.png)

### 2. Sessions dashboard
Each encounter moves through a status lifecycle: `recording → transcribing → transcribed → generating → note_generated → approved`.

![Sessions](docs/screenshots/sessions.png)

### 3. Transcript
Audio is transcribed locally with Whisper, with per-turn timestamps.

![Transcript](docs/screenshots/transcript.png)

### 4. SOAP note + hallucination detection
Claude generates a structured S/O/A/P note. Every **medication** and **diagnosis** is then verified against the transcript by an independent 3-layer check (exact → fuzzy → semantic embeddings). Anything that can't be grounded is **flagged** (highlighted) and the note is risk-scored — the clinician accepts / edits / rejects each section before approval.

![SOAP Note](docs/screenshots/soap-note.png)

### 5. FHIR R4 export + validation
On approval, the note becomes a FHIR R4 **document Bundle** (Composition + Encounter + Condition + MedicationRequest). It's validated **in-codebase** (`fhir.resources`) and, when configured, against a real **HAPI FHIR server's `$validate`**. Only validated codes/meds are included; invalid bundles are never posted.

![FHIR Export](docs/screenshots/fhir-export.png)

---

## Engineering highlights

- **Hallucination defense, layered** — prompt rules → independent deterministic grounding (not an LLM checking an LLM) → human approval. Every drug/diagnosis traces back to the source audio.
- **Real FHIR validity** — local validation alone gave false confidence; a live HAPI server caught 16 errors my code missed (bad UUIDs, `#`-refs vs `urn:uuid:`, missing identifier). Fixed the builder to pass true HL7 R4 validation (16 → 0 errors).
- **Async correctness** — Celery prefork + async SQLAlchemy hit `asyncpg` event-loop binding errors; solved with a per-task NullPool session so each task runs on its own loop.
- **Latency** — Whisper and the embedding model are cached per worker process (loaded once, not per task), cutting per-encounter overhead.
- **PHI-safe by design** — speech-to-text and grounding run locally; HAPI persistence is gated so PHI is never POSTed to an external server.

---

## Quick start

```bash
make up                              # all services via Docker Compose
# or infra only, then run apps manually:
docker compose up postgres redis -d
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

Demo login: `clinician@demo.test` / `password`

### Environment (see `.env.example`)
`POSTGRES_*`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `ENVIRONMENT`, optional `HAPI_FHIR_URL` (e.g. `https://hapi.fhir.org/baseR4` for the deeper validation layer — synthetic data only).

### Tests
```bash
cd backend && pytest --cov=app
```

---

## Pipeline at a glance

```
record ─► POST /audio ─► backend saves to volume ─► POST /transcribe
       ─► Redis queue ─► Celery worker:
                           Whisper (transcribe) ─► pg
                           Claude (SOAP) ─► hallucination grounding ─► ICD-10/RxNorm ─► pg
       ─► clinician reviews + approves ─► FHIR R4 bundle ─► validate (local + HAPI) ─► EHR
```

# Railway Deployment

Task 5.5 targets a public demo deployment with separate web services and managed
data services.

## Services

Create these Railway services from this monorepo:

| Service | Config | Notes |
|---|---|---|
| Backend API | `deploy/railway/backend.toml` | FastAPI web process. |
| Celery worker | `deploy/railway/worker.toml` | Required for transcription and note generation jobs. |
| Frontend | `deploy/railway/frontend.toml` | Next.js app. |
| Postgres | Railway Postgres add-on | Use its internal connection URL. |
| Redis | Railway Redis add-on | Use its internal connection URL. |

HAPI FHIR can stay local for the first public demo. Set `HAPI_FHIR_URL` to a
mock/staging FHIR endpoint if you do not deploy HAPI.

## Backend Environment

Set these on the Backend API and Celery worker:

```bash
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
ANTHROPIC_API_KEY=...
JWT_SECRET=...
ENVIRONMENT=production
AUDIO_STORAGE_PATH=/data/audio
HAPI_FHIR_URL=https://your-fhir-host/fhir
```

Set these only on the Backend API:

```bash
RUN_MIGRATIONS=true
SEED_DEMO_USER=true
CORS_ORIGINS=https://your-frontend.up.railway.app
```

## Frontend Environment

```bash
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXT_PUBLIC_APP_ENV=production
```

## Demo Recording Script

1. Open the deployed frontend and log in with `clinician@demo.test` / `password`.
2. Create a new session.
3. Record a short synthetic encounter.
4. Stop recording and wait for the transcript.
5. Generate the SOAP note.
6. Show hallucination flags and accept/edit/reject controls.
7. Approve the note.
8. Export to FHIR and show the returned Bundle ID.
9. Add the final Loom URL to the README demo badge.

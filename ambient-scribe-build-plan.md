# Ambient Clinical Scribe — Build Plan

## Overview

We're building a full-stack ambient clinical note scribe: a web app that records a
doctor-patient conversation, transcribes it with Whisper, generates a structured SOAP
note via Claude, auto-suggests ICD-10 codes, detects hallucinations, and exports FHIR R4
resources. The plan moves bottom-up — infrastructure first, then the AI pipeline, then
the clinician-facing UI, then FHIR write-back, and finally the eval harness and portfolio
polish. Each phase ends with something demoable. All demo data is Synthea-generated
synthetic patients.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Backend | Python 3.12 + FastAPI | Async-native, ideal for streaming LLM responses and Celery integration |
| Transcription | openai-whisper (OSS) | Free, runs locally, no API cost for dev/eval |
| LLM | Claude claude-sonnet-4-6 via Anthropic SDK | Best structured-output coding model; supports prompt caching |
| FHIR | `fhir.resources` + HAPI FHIR (Docker) | Apache 2.0, free, R4-compliant, local write-back |
| Database | PostgreSQL 16 + SQLAlchemy (async) | Matches prod HIPAA needs; JSONB for ICD-10/medications |
| Queue | Redis + Celery | Async transcription without blocking HTTP |
| Auth | JWT (python-jose + passlib) | Stated requirement; aligns with HIPAA access control |
| Frontend | Next.js 14 App Router + TypeScript | SSR where needed; App Router co-locates server components |
| Styling | Tailwind CSS + shadcn/ui (customized) | Specified; must diverge from defaults |
| State | Zustand + TanStack Query | Per spec; clean server/client state separation |
| Audio | MediaRecorder API + wavesurfer.js | Browser-native recording + waveform visualization |
| Dev ops | Docker Compose | One-command local stack for demo/portfolio |

---

## Phase 1: Foundation (estimated: 3–4 sessions)

**Goal:** One-command `docker compose up` brings up Postgres, Redis, HAPI FHIR, FastAPI,
and Next.js. Auth works end-to-end. The database schema is migrated and seeded with a
Synthea fixture.

---

### Task 1.1: Monorepo scaffold + Docker Compose

- **What:** Create the repo structure (`/backend`, `/frontend`, `/infra`, `/test_data`,
  `docker-compose.yml`). Wire Postgres 16, Redis 7, HAPI FHIR (hapiproject/hapi:latest),
  FastAPI dev server, and Next.js dev server as services. Add a root `Makefile` with
  `make up`, `make down`, `make logs`.
- **Why:** Every subsequent task depends on a running environment. Getting this green
  first means you never block on environment setup again.
- **Acceptance criteria:**
  - `make up` starts all 5 services with no errors
  - `curl localhost:8000/health` returns `{"status": "ok"}`
  - `curl localhost:8080/fhir/metadata` returns FHIR CapabilityStatement JSON
- **Effort:** M

---

### Task 1.2: Database schema + Alembic migrations

- **What:** Translate the schema from the spec (`sessions`, `transcripts`, `soap_notes`,
  `audit_log`, `users`) into SQLAlchemy models and an Alembic migration. Seed with one
  test user (`clinician@demo.test` / `password`).
- **Why:** All API endpoints write to this schema. Getting it right early avoids painful
  migration stacking later.
- **Acceptance criteria:**
  - `alembic upgrade head` runs clean from a fresh DB
  - All 5 tables present with correct columns and FK constraints
  - `SELECT * FROM users` returns the seed user
- **Effort:** M

---

### Task 1.3: JWT auth endpoints

- **What:** `POST /api/auth/register`, `POST /api/auth/login` (returns access token),
  `GET /api/auth/me` (protected). Wire the `audit_log` insert for login events.
- **Why:** Every session endpoint requires a clinician identity. Auth needs to work before
  any session logic is built.
- **Acceptance criteria:**
  - `POST /api/auth/login` returns a valid JWT for the seed user
  - `GET /api/auth/me` with a valid token returns `{"id": "...", "email": "..."}`
  - `GET /api/auth/me` without a token returns 401
  - Login event appears in `audit_log`
- **Effort:** M

---

### Task 1.4: Session CRUD endpoints

- **What:** `POST /api/sessions` (creates session, status=`recording`),
  `GET /api/sessions/{id}`, `GET /api/sessions` (list for clinician). All protected.
  Wire audit log inserts.
- **Why:** The audio upload and transcription endpoints in Phase 2 all reference a
  session ID. The session is the core entity.
- **Acceptance criteria:**
  - `POST /api/sessions` returns session with UUID and `status: "recording"`
  - `GET /api/sessions/{id}` returns the session
  - Session row appears in DB
  - Audit log entry created on session creation and view
- **Effort:** S

---

### Task 1.5: Next.js scaffold + auth screens

- **What:** Bootstrap Next.js 14 App Router with TypeScript, Tailwind, and shadcn/ui
  (customized theme — pick a real style direction, not the shadcn defaults). Build
  `/login` and `/dashboard` pages. Wire login to `POST /api/auth/login`, store JWT in
  httpOnly cookie, redirect to dashboard. Dashboard shows a "Sessions" list (empty state
  for now).
- **Why:** Phase 2 needs a real UI surface for the recording flow. Having auth working
  in the browser also validates the JWT integration end-to-end.
- **Acceptance criteria:**
  - Login page renders at `/login` with email + password fields
  - Successful login redirects to `/dashboard`
  - Failed login shows inline error
  - Dashboard is protected: unauthenticated visit redirects to `/login`
- **Effort:** M

---

## Phase 2: Audio Recording + Transcription Pipeline (estimated: 3 sessions)

**Goal:** A clinician can record a conversation in the browser, upload it, and see a
timestamped transcript within ~60 seconds. The Celery job pipeline is operational.

---

### Task 2.1: Audio recording component

- **What:** Build `AudioRecorder` component using `MediaRecorder API`. Show a live
  waveform with `wavesurfer.js`. Controls: Start, Pause, Stop. On stop, emit the
  recorded `Blob` (WebM/Opus) to the parent. Display elapsed time.
- **Why:** This is the front door of the product. Getting it working early lets you test
  the full pipeline with real audio instead of fixture files.
- **Acceptance criteria:**
  - Start/Pause/Stop controls work without errors
  - Waveform animates during recording
  - Stopping recording surfaces an audio `Blob` (verify in browser console)
  - Works in Chrome and Firefox
- **Effort:** M

---

### Task 2.2: Audio upload endpoint + file storage

- **What:** `POST /api/sessions/{id}/audio` — accepts multipart audio file, stores to
  local `/data/audio/{session_id}.webm`, updates `sessions.audio_file_path`. Wire the
  frontend recorder to POST on stop.
- **Why:** Transcription needs the file on disk. Local filesystem is fine for dev; the
  abstraction makes it easy to swap to S3 later.
- **Acceptance criteria:**
  - Upload returns 200 with `{"path": "..."}`
  - File exists on disk after upload
  - Session row has `audio_file_path` set
  - Frontend uploads on Stop and shows "Upload complete" state
- **Effort:** S

---

### Task 2.3: Celery transcription job (Whisper)

- **What:** `POST /api/sessions/{id}/transcribe` enqueues a Celery task. The task loads
  the audio file, runs `whisper.transcribe()` (medium model for accuracy/speed balance),
  saves result to `transcripts` table (full text + `speaker_turns` JSONB). Updates
  `sessions.status` to `transcribing` → `generated`. `GET /api/sessions/{id}/status`
  polls job progress.
- **Why:** Whisper on CPU takes 20–90 seconds depending on audio length. Async is
  mandatory — you cannot block the HTTP worker for that.
- **Acceptance criteria:**
  - `POST /transcribe` returns `{"task_id": "..."}` immediately (< 200ms)
  - `GET /status` returns `{"status": "transcribing"}` while running
  - After completion, `GET /status` returns `{"status": "generated"}`
  - `transcripts` table has a row with non-empty `content`
- **Effort:** L

---

### Task 2.4: Transcript view UI

- **What:** Session detail page (`/sessions/[id]`) shows the transcript text, speaker
  turns formatted as a conversation view (clinician turns right-aligned, patient turns
  left-aligned), and a status badge. Polling via TanStack Query every 3 seconds while
  status is `transcribing`.
- **Why:** Clinicians need to verify the transcript before accepting the SOAP note. This
  view is also the primary quality-check surface for the hallucination detector.
- **Acceptance criteria:**
  - Transcript renders with speaker turn formatting
  - Page polls and updates status badge without full reload
  - Once transcript appears, polling stops
- **Effort:** M

---

## Phase 3: SOAP Note Generation + Hallucination Detection (estimated: 4 sessions)

**Goal:** A complete SOAP note with ICD-10 suggestions is generated from the transcript.
The hallucination detector flags any medication, dosage, or diagnosis not grounded in
the transcript.

---

### Task 3.1: SOAPNoteService — Claude structured output

- **What:** Implement `SOAPNoteService` using the Anthropic SDK with the system prompt
  from the spec. Use `claude-sonnet-4-6` with `max_tokens=2000`. Enable prompt caching
  on the system prompt (cache_control: ephemeral). Parse the JSON response into a
  `SOAPNote` Pydantic model. Save to `soap_notes` table.
- **Why:** This is the core AI feature. Getting clean structured output from Claude is
  the foundation everything else (hallucination detection, FHIR mapping) is built on.
- **Acceptance criteria:**
  - Service returns a `SOAPNote` object with all four sections populated
  - `assessment.icd10_codes` is a non-empty list with `code` + `description` fields
  - `plan.medications` is populated when medications are mentioned in transcript
  - Row exists in `soap_notes` table after generation
  - Prompt cache hit rate > 0% after first call (verify via SDK usage metadata)
- **Effort:** M

---

### Task 3.2: `POST /api/sessions/{id}/generate-note` endpoint

- **What:** Celery task that fetches the session transcript, calls `SOAPNoteService`,
  runs `HallucinationDetector` (next task), saves the result. `GET /api/sessions/{id}/note`
  returns the full SOAP note JSON including `hallucination_flags`.
- **Why:** Note generation is another long-running operation (5–20 seconds LLM round
  trip) and needs to be async for the same reason as transcription.
- **Acceptance criteria:**
  - `POST /generate-note` returns task ID immediately
  - Session status transitions to `note_generated` on completion
  - `GET /note` returns SOAP note JSON with all sections
- **Effort:** S

---

### Task 3.3: HallucinationDetector

- **What:** Implement `HallucinationDetector`. For each medication name, dosage string,
  and ICD-10 description in the SOAP output: (1) exact substring search in transcript,
  (2) fuzzy match via `rapidfuzz` (threshold ≥ 85), (3) semantic similarity via sentence
  embeddings (all-MiniLM-L6-v2 from sentence-transformers). Items that fail all three
  checks are flagged `UNVERIFIED`. Return `{ verified, unverified, hallucination_risk }`.
  Save flags to `soap_notes.hallucination_flags`.
- **Why:** This is what separates the project from a tutorial. The three-layer approach
  (exact → fuzzy → semantic) mirrors production-grade grounding checks and is defensible
  in a portfolio context.
- **Acceptance criteria:**
  - A medication in the transcript is marked `verified`
  - A medication injected into the prompt (not in transcript) is marked `unverified`
  - `hallucination_risk` is `low` / `medium` / `high` based on unverified count
  - Unit test covers all three verification layers
- **Effort:** L

---

### Task 3.4: ICD-10 + RxNorm enrichment

- **What:** After SOAP generation, enrich ICD-10 suggestions with CMS ICD-10-CM data
  (local JSON lookup — download the CMS file). Validate RxNorm CUIs against the NLM
  RxNorm REST API (`rxnav.nlm.nih.gov` — no key needed). If a CUI doesn't resolve,
  flag the medication.
- **Why:** This demonstrates real standards integration. It also makes the FHIR export
  accurate — invalid codes in Condition resources will cause HAPI validation failures.
- **Acceptance criteria:**
  - ICD-10 codes are validated against the local CMS file; invalid codes are flagged
  - RxNorm CUI lookup returns a drug name for valid CUIs
  - Invalid CUI triggers a `hallucination_flags` entry
- **Effort:** M

---

## Phase 4: Clinician Correction UI (estimated: 3 sessions)

**Goal:** A clinician can review the SOAP note section by section, see hallucination
flags highlighted inline, accept or reject each section, edit free text, and save a
final approved note.

---

### Task 4.1: SOAP note review UI — section-by-section editor

- **What:** Build `SOAPNoteEditor` component. Each of the four SOAP sections renders
  as: (1) generated text in a read-only view, (2) an Accept/Edit/Reject button group
  per section. Editing opens a `<textarea>` pre-filled with the generated text. Rejected
  sections are cleared. Accepted sections are locked with a green indicator.
- **Why:** The correction workflow is the core UX differentiator. It also produces the
  training signal (what clinicians change) stored for future model improvement.
- **Acceptance criteria:**
  - All four sections render with accept/edit/reject controls
  - Editing a section opens textarea with the current content
  - Rejecting a section clears it
  - Accepted sections display a locked/approved indicator
- **Effort:** M

---

### Task 4.2: Hallucination flags rendered inline

- **What:** For each flagged medication or diagnosis, highlight the corresponding text
  in the SOAP section with a yellow warning indicator. Hovering/clicking shows a tooltip:
  `"Not found in transcript — verify before approving"`. Unverified items in an accepted
  section show a confirmation prompt before locking.
- **Why:** The safety value of hallucination detection is only realized if clinicians
  actually see and act on the flags. Hidden flags in a JSON field help no one.
- **Acceptance criteria:**
  - Flagged items are visually highlighted in the SOAP text
  - Tooltip shows the flag reason
  - Accepting a section with unverified items shows a warning modal
- **Effort:** M

---

### Task 4.3: `PATCH /api/sessions/{id}/note` + correction storage

- **What:** `PATCH /note` accepts a payload of per-section clinician edits
  (`{ section, action, edited_text }`). Save to `soap_notes` (update fields + set
  `clinician_approved_at`). Update session status to `approved`. Store diffs between
  original and edited text in a new `corrections` JSONB column (add migration).
- **Why:** The correction data is the training signal. It also gates FHIR export — only
  approved notes can be exported.
- **Acceptance criteria:**
  - `PATCH /note` returns 200 with updated note
  - `clinician_approved_at` is set in DB
  - `corrections` column stores a diff for each edited section
  - Session status is `approved`
- **Effort:** S

---

## Phase 5: FHIR Export + Eval Harness + Portfolio Polish (estimated: 4 sessions)

**Goal:** Approved notes export as valid FHIR R4 bundles written to HAPI FHIR. The eval
harness runs reproducibly against Synthea fixtures. The repo is portfolio-ready.

---

### Task 5.1: FHIRExportService

- **What:** Build `FHIRExportService` using the `fhir.resources` library. From an
  approved SOAP note, construct:
  - `Encounter` resource (session metadata)
  - `Condition` resources (one per ICD-10 code, only verified)
  - `MedicationRequest` resources (one per medication, only verified, with RxNorm coding)
  - `Composition` resource (full SOAP note text, references Encounter + Conditions)
  - `DocumentReference` wrapping the Composition
  POST each resource to HAPI FHIR (running in Docker). Return the FHIR Bundle ID.
- **Why:** FHIR write-back is the most technically differentiating feature. Most demo
  projects stop at read. Writing valid resources that pass HAPI validation is the line
  that separates this from a tutorial.
- **Acceptance criteria:**
  - `POST /api/sessions/{id}/export-fhir` returns `{"bundle_id": "..."}`
  - All resources POST to HAPI with HTTP 201
  - `GET localhost:8080/fhir/Composition/{id}` returns the resource
  - `GET localhost:8080/fhir/Condition?encounter={id}` returns Condition resources
- **Effort:** L

---

### Task 5.2: FHIR export UI

- **What:** "Export to FHIR" button on the approved session page. On click, call
  `POST /export-fhir`, then show success state with the FHIR Bundle ID and a link to
  `GET /api/fhir/Composition/{id}`. Add `GET /api/fhir/Composition/{id}` endpoint that
  proxies to HAPI FHIR and returns the raw resource.
- **Why:** The demo video needs to show the full workflow end-to-end, including the FHIR
  export step. This also validates the integration visually.
- **Acceptance criteria:**
  - Export button only appears on `approved` sessions
  - Success state shows Bundle ID
  - Raw FHIR Composition is accessible via the proxy endpoint
- **Effort:** S

---

### Task 5.3: Synthea test fixtures + eval harness

- **What:** Run Synthea locally to generate 50 synthetic FHIR bundles (`make synthea`).
  Manually create 5–10 simulated encounter transcripts from MedDialog or Synthea
  conditions. Write gold-standard SOAP labels for those transcripts. Implement
  `make eval` that: (1) runs transcription on all fixtures, (2) generates SOAP notes,
  (3) runs hallucination detection, (4) scores against gold standard (medication
  accuracy, ICD-10 top-1/top-3, hallucination rate, false positive rate), (5) prints
  a Markdown table.
- **Why:** The eval harness is the single most portfolio-differentiating element. It
  demonstrates rigor, reproducibility, and clinical thinking. Interviewers at Abridge,
  Nuance, and Epic will run `make eval` first.
- **Acceptance criteria:**
  - `make eval` runs end-to-end without errors against all fixtures
  - Output includes medication accuracy, ICD-10 accuracy, hallucination rate, FP rate
  - Results are reproducible (same fixtures = same scores across runs)
  - Scores meet documented thresholds (≥90% meds, ≤5% hallucinations, ≥85% ICD-10)
- **Effort:** L

---

### Task 5.4: Architecture diagram + README

- **What:** Write the full README per the spec template: clinical context, system
  requirements, local setup (`make up`), eval instructions, architecture diagram
  (Mermaid), standards table, eval metrics table, HIPAA applicability note, Regulatory
  Scope section (Cures Act CDS Hook exemption analysis). Add a Mermaid sequence diagram
  showing the full recording → transcription → SOAP → correction → FHIR flow.
- **Why:** A recruiter who can't run the project in under 5 minutes won't look further.
  The README is the interview before the interview.
- **Acceptance criteria:**
  - `make up && make seed` → running app in one copy-paste
  - Architecture diagram renders in GitHub
  - Eval table populated with real numbers
  - HIPAA note clearly says "demo only, synthetic data, no BAA"
- **Effort:** M

---

### Task 5.5: Loom demo + deployment

- **What:** Deploy to Railway or Fly.io (two services: FastAPI + Next.js; Postgres and
  Redis as managed addons; HAPI FHIR optional for demo — can mock with a fixture).
  Record a 3-minute Loom: (1) record a 60-second encounter audio, (2) show transcript
  appear, (3) show SOAP note with hallucination flags, (4) accept/edit sections, (5)
  export FHIR and show the Composition resource. Link Loom in README header.
- **Why:** The Loom is what gets shared in Slack channels at target companies. It needs
  to exist and be under 3 minutes.
- **Acceptance criteria:**
  - App is accessible at a public URL
  - Loom URL is in README `[![Demo](...)](#)`
  - Full workflow is visible in the recording without cuts that suggest broken steps
- **Effort:** M

---

## Stretch Goals (post-MVP)

- Speaker diarization (pyannote.audio) — separate clinician vs patient turns in transcript
- SMART on FHIR launch integration (Epic Open Sandbox)
- Streaming SOAP generation with SSE (real-time section rendering)
- Fine-tuned Whisper on MedDialog for medical vocabulary accuracy
- PDF export of approved SOAP note
- Clinician dashboard with aggregate hallucination rate analytics over time
- Production HIPAA checklist (encryption at rest, BAA notes, auto-logoff)

---

## Quick Start Checklist

The first 5 tasks to get momentum immediately:

- [ ] **1.1** `docker compose up` — all 5 services green, `/health` returns 200
- [ ] **1.2** `alembic upgrade head` — all 5 tables migrated, seed user exists
- [ ] **1.3** `POST /api/auth/login` returns JWT for seed user
- [ ] **1.4** `POST /api/sessions` returns a session UUID
- [ ] **2.1** `AudioRecorder` component records audio and surfaces a `Blob` on stop

---

*Total estimated sessions: ~17 focused sessions (2–3 hours each)*
*Critical path: 1.1 → 1.2 → 1.3 → 2.3 (Celery/Whisper) → 3.1 (Claude) → 3.3 (hallucination) → 5.3 (eval)*

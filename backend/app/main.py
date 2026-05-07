from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import auth, sessions, audio, notes, fhir

app = FastAPI(
    title="Ambient Clinical Scribe",
    description="AI-powered ambient clinical documentation",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix=f"{settings.api_prefix}/auth", tags=["auth"])
app.include_router(sessions.router, prefix=f"{settings.api_prefix}/sessions", tags=["sessions"])
app.include_router(audio.router, prefix=f"{settings.api_prefix}/sessions", tags=["audio"])
app.include_router(notes.router, prefix=f"{settings.api_prefix}/sessions", tags=["notes"])
app.include_router(fhir.router, prefix=f"{settings.api_prefix}/fhir", tags=["fhir"])

#!/usr/bin/env sh
set -eu

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  alembic upgrade head
fi

if [ "${SEED_DEMO_USER:-false}" = "true" ]; then
  python -m app.db.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

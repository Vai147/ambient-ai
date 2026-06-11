#!/usr/bin/env sh
set -eu

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  alembic upgrade head
fi

if [ "${SEED_DEMO_USER:-false}" = "true" ]; then
  python -m app.db.seed
fi

# Run the Celery worker in-container alongside the API so it shares the
# audio filesystem (Railway volumes can't be shared across services).
# Enable on the deployed service with RUN_WORKER=true.
if [ "${RUN_WORKER:-false}" = "true" ]; then
  celery -A app.tasks.worker worker \
    --loglevel=info \
    --concurrency="${CELERY_CONCURRENCY:-1}" &
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

.PHONY: up down logs build shell-backend shell-frontend migrate seed eval synthea clean help

# ─── Environment ────────────────────────────────────────────────────────────
-include .env
export

# ─── Core services ──────────────────────────────────────────────────────────
up:
	docker compose up -d
	@echo "Waiting for services..."
	@docker compose ps

down:
	docker compose down

restart:
	docker compose down
	docker compose up -d

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend celery-worker

logs-frontend:
	docker compose logs -f frontend

# ─── Database ───────────────────────────────────────────────────────────────
migrate:
	docker compose exec backend alembic upgrade head

migrate-down:
	docker compose exec backend alembic downgrade -1

migrate-create:
	@read -p "Migration name: " name; \
	docker compose exec backend alembic revision --autogenerate -m "$$name"

seed:
	docker compose exec backend python -m app.db.seed

# ─── Development shells ──────────────────────────────────────────────────────
shell-backend:
	docker compose exec backend bash

shell-frontend:
	docker compose exec frontend sh

shell-db:
	docker compose exec postgres psql -U ${POSTGRES_USER:-ambient} -d ${POSTGRES_DB:-ambient_scribe}

# ─── Testing ────────────────────────────────────────────────────────────────
test:
	docker compose exec backend pytest tests/ -v

test-unit:
	docker compose exec backend pytest tests/unit/ -v

test-integration:
	docker compose exec backend pytest tests/integration/ -v --cov=app --cov-report=term-missing

# ─── Eval harness ────────────────────────────────────────────────────────────
eval:
	docker compose exec backend python -m app.eval.run_eval

synthea:
	@echo "Generating Synthea synthetic patients..."
	@mkdir -p test_data/synthea/output
	@docker run --rm \
		-v $(PWD)/test_data/synthea:/output \
		hapiproject/synthea:latest \
		--exporter.fhir.export true \
		--exporter.baseDirectory /output \
		-p 50
	@echo "Generated fixtures at test_data/synthea/output/"

# ─── Cleanup ─────────────────────────────────────────────────────────────────
clean:
	docker compose down -v --remove-orphans
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true

clean-frontend:
	rm -rf frontend/.next frontend/node_modules

# ─── Health checks ───────────────────────────────────────────────────────────
health:
	@echo "=== Backend ===" && curl -sf http://localhost:8000/health | python3 -m json.tool
	@echo "=== HAPI FHIR ===" && curl -sf http://localhost:8080/fhir/metadata | python3 -m json.tool | head -20

# ─── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "Ambient Clinical Scribe — available commands:"
	@echo ""
	@echo "  make up              Start all services (detached)"
	@echo "  make down            Stop all services"
	@echo "  make build           Rebuild Docker images"
	@echo "  make logs            Tail all logs"
	@echo "  make migrate         Run Alembic migrations"
	@echo "  make seed            Seed database with demo data"
	@echo "  make test            Run full test suite"
	@echo "  make eval            Run the eval harness against fixtures"
	@echo "  make synthea         Generate Synthea synthetic patients"
	@echo "  make health          Check /health and FHIR metadata"
	@echo "  make clean           Remove containers and volumes"
	@echo ""

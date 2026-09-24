set shell := ["bash", "-cu"]

# List the available recipes
default:
    @just --list

# Install backend (uv) and frontend (npm) dependencies
install:
    cd backend && uv sync
    cd frontend && npm install

# Run the API on :8000 (auto-reload) and Vite on :5173; Ctrl-C stops both
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT
    (cd backend && uv run uvicorn app.main:app --reload --port 8000) &
    (cd frontend && npx vite --port 5173 --strictPort) &
    wait

# Unit and integration tests: pytest, then vitest
test:
    cd backend && uv run pytest -q
    cd frontend && npx vitest run

# Lint and format checks: ruff, then biome
lint:
    cd backend && uv run ruff check . && uv run ruff format --check .
    cd frontend && npx biome check .

# Apply formatting and safe lint fixes
format:
    cd backend && uv run ruff check --fix . && uv run ruff format .
    cd frontend && npx biome check --write .

# Type checks: mypy (strict), then tsc
typecheck:
    cd backend && uv run mypy app
    cd frontend && npx tsc --noEmit

# Browser tests: Playwright in installed Google Chrome (backend :8100, Vite :5180)
e2e:
    cd frontend && npx playwright test

# Everything: lint, typecheck, test, e2e
check: lint typecheck test e2e

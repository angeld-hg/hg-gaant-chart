"""FastAPI application factory for the Gantt chart manager."""

import os
from pathlib import Path

from fastapi import FastAPI

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "gantt.db"


def resolve_db_path(db_path: str | None = None) -> str:
    """Pick the DB file: explicit argument, then GANTT_DB_PATH, then backend/data/gantt.db."""
    if db_path is not None:
        return db_path
    return os.environ.get("GANTT_DB_PATH") or str(DEFAULT_DB_PATH)


def create_app(db_path: str | None = None) -> FastAPI:
    app = FastAPI(title="Gantt chart manager")
    app.state.db_path = resolve_db_path(db_path)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()

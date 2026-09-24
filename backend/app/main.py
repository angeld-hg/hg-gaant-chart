"""FastAPI application factory for the Gantt chart manager."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app import db
from app.errors import install_error_handlers
from app.routes import ROUTERS

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "gantt.db"


def resolve_db_path(db_path: str | None = None) -> str:
    """Pick the DB file: explicit argument, then GANTT_DB_PATH, then backend/data/gantt.db."""
    if db_path is not None:
        return db_path
    return os.environ.get("GANTT_DB_PATH") or str(DEFAULT_DB_PATH)


def create_app(db_path: str | None = None) -> FastAPI:
    resolved = resolve_db_path(db_path)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        conn = db.connect(resolved)
        try:
            db.init_schema(conn)
        finally:
            conn.close()
        yield

    app = FastAPI(title="Gantt chart manager", lifespan=lifespan)
    app.state.db_path = resolved
    install_error_handlers(app)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    for router in ROUTERS:
        app.include_router(router)

    return app


app = create_app()

"""HTTP routers. `main.create_app` includes every router listed in ROUTERS."""

from fastapi import APIRouter

from app.routes import dependencies, meta, people, projects, tasks, transfer

ROUTERS: tuple[APIRouter, ...] = (
    meta.router,
    projects.router,
    people.router,
    tasks.router,
    dependencies.router,
    transfer.router,
)

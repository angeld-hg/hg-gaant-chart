"""HTTP routers. `main.create_app` includes every router listed in ROUTERS."""

from fastapi import APIRouter

from app.routes import meta, people, projects

ROUTERS: tuple[APIRouter, ...] = (meta.router, projects.router, people.router)

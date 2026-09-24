"""Dependency endpoints (C2). Validation and scheduling live in `app.services.dependencies`."""

from fastapi import APIRouter

from app import db
from app.detail import MutationResult
from app.services import dependencies
from app.services.dependencies import DependencyIn

router = APIRouter(prefix="/api")


@router.post("/projects/{project_id}/dependencies", status_code=201)
def add_dependency(project_id: int, body: DependencyIn, conn: db.Conn) -> MutationResult:
    return dependencies.add_dependency(conn, project_id, body)


@router.delete("/dependencies/{dependency_id}")
def remove_dependency(dependency_id: int, conn: db.Conn) -> MutationResult:
    return dependencies.remove_dependency(conn, dependency_id)

"""Project CRUD (C2). Names are unique across projects, ignoring case (D8, AC34)."""

import sqlite3

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, StrictStr

from app import db
from app.detail import (
    ProjectDetail,
    ProjectSummary,
    list_project_summaries,
    load_project_detail,
    load_project_summary,
)
from app.errors import ApiError, not_found
from app.names import clean_name, name_key

router = APIRouter(prefix="/api/projects")


class ProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr


def _ensure_name_free(conn: sqlite3.Connection, name: str, own_id: int | None) -> None:
    clash = conn.execute(
        "SELECT name FROM projects WHERE name_key = ? AND id IS NOT ?", (name_key(name), own_id)
    ).fetchone()
    if clash is not None:
        raise ApiError(
            409, "name_taken", f'A project named "{clash["name"]}" already exists.', "name"
        )


def _ensure_exists(conn: sqlite3.Connection, project_id: int) -> None:
    if conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone() is None:
        raise not_found("Project", project_id)


@router.get("")
def list_projects(conn: db.Conn) -> list[ProjectSummary]:
    return list_project_summaries(conn)


@router.post("", status_code=201)
def create_project(body: ProjectIn, conn: db.Conn) -> ProjectSummary:
    name = clean_name(body.name, "Project name")
    with db.write_tx(conn):
        _ensure_name_free(conn, name, None)
        cursor = conn.execute(
            "INSERT INTO projects (name, name_key) VALUES (?, ?)", (name, name_key(name))
        )
        assert cursor.lastrowid is not None
        return load_project_summary(conn, cursor.lastrowid)


@router.get("/{project_id}")
def get_project(project_id: int, conn: db.Conn) -> ProjectDetail:
    return load_project_detail(conn, project_id)


@router.patch("/{project_id}")
def rename_project(project_id: int, body: ProjectIn, conn: db.Conn) -> ProjectSummary:
    name = clean_name(body.name, "Project name")
    with db.write_tx(conn):
        _ensure_exists(conn, project_id)
        _ensure_name_free(conn, name, project_id)
        conn.execute(
            "UPDATE projects SET name = ?, name_key = ? WHERE id = ?",
            (name, name_key(name), project_id),
        )
        return load_project_summary(conn, project_id)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, conn: db.Conn) -> Response:
    with db.write_tx(conn):
        _ensure_exists(conn, project_id)
        # People, tasks and dependencies go with it through ON DELETE CASCADE.
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return Response(status_code=204)

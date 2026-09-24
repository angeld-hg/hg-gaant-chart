"""Per-project roster (C2, AC30): unique names within a project, palette colours only."""

import sqlite3

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, StrictStr

from app import db
from app.detail import MutationResult, mutation_result
from app.errors import ApiError, not_found
from app.names import clean_name, name_key
from app.palette import default_colour, is_palette_colour

router = APIRouter(prefix="/api")


class PersonIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr
    colour: StrictStr | None = None


class PersonPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr | None = None
    colour: StrictStr | None = None


def _check_colour(colour: str) -> str:
    if not is_palette_colour(colour):
        raise ApiError(422, "invalid", f'"{colour}" is not a palette colour.', "colour")
    return colour


def _ensure_name_free(
    conn: sqlite3.Connection, project_id: int, name: str, own_id: int | None
) -> None:
    clash = conn.execute(
        "SELECT name FROM people WHERE project_id = ? AND name_key = ? AND id IS NOT ?",
        (project_id, name_key(name), own_id),
    ).fetchone()
    if clash is not None:
        raise ApiError(409, "name_taken", f'"{clash["name"]}" is already in this roster.', "name")


def _project_of_person(conn: sqlite3.Connection, person_id: int) -> int:
    row = conn.execute("SELECT project_id FROM people WHERE id = ?", (person_id,)).fetchone()
    if row is None:
        raise not_found("Person", person_id)
    project_id: int = row["project_id"]
    return project_id


@router.post("/projects/{project_id}/people", status_code=201)
def add_person(project_id: int, body: PersonIn, conn: db.Conn) -> MutationResult:
    name = clean_name(body.name, "Person name")
    if "colour" in body.model_fields_set and body.colour is None:
        raise ApiError(422, "invalid", "Colour must be a palette colour.", "colour")
    colour = None if body.colour is None else _check_colour(body.colour)
    with db.write_tx(conn):
        if conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone() is None:
            raise not_found("Project", project_id)
        _ensure_name_free(conn, project_id, name, None)
        if colour is None:
            used = [
                r["colour"]
                for r in conn.execute(
                    "SELECT colour FROM people WHERE project_id = ?", (project_id,)
                )
            ]
            colour = default_colour(used)
        cursor = conn.execute(
            "INSERT INTO people (project_id, name, name_key, colour) VALUES (?, ?, ?, ?)",
            (project_id, name, name_key(name), colour),
        )
        return mutation_result(conn, project_id, [], cursor.lastrowid)


@router.patch("/people/{person_id}")
def update_person(person_id: int, body: PersonPatch, conn: db.Conn) -> MutationResult:
    sent = body.model_fields_set
    if "name" in sent and body.name is None:
        raise ApiError(422, "invalid", "Person name must be text.", "name")
    if "colour" in sent and body.colour is None:
        raise ApiError(422, "invalid", "Colour must be a palette colour.", "colour")
    name = None if body.name is None else clean_name(body.name, "Person name")
    colour = None if body.colour is None else _check_colour(body.colour)
    with db.write_tx(conn):
        project_id = _project_of_person(conn, person_id)
        if name is not None:
            _ensure_name_free(conn, project_id, name, person_id)
            conn.execute(
                "UPDATE people SET name = ?, name_key = ? WHERE id = ?",
                (name, name_key(name), person_id),
            )
        if colour is not None:
            conn.execute("UPDATE people SET colour = ? WHERE id = ?", (colour, person_id))
        return mutation_result(conn, project_id, [], None)


@router.delete("/people/{person_id}")
def delete_person(person_id: int, conn: db.Conn) -> MutationResult:
    with db.write_tx(conn):
        project_id = _project_of_person(conn, person_id)
        unassigned = [
            r["id"]
            for r in conn.execute(
                "SELECT id FROM tasks WHERE assignee_id = ? ORDER BY id", (person_id,)
            )
        ]
        # Their tasks become unassigned through ON DELETE SET NULL.
        conn.execute("DELETE FROM people WHERE id = ?", (person_id,))
        return mutation_result(conn, project_id, unassigned, None)

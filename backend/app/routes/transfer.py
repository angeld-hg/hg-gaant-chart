"""Export a project to its C5 file, and import a file as a brand-new project (AC21-AC24)."""

import sqlite3

from fastapi import APIRouter, Request, Response
from starlette.concurrency import run_in_threadpool

from app import db
from app.detail import ProjectDetail, load_project_detail
from app.errors import ApiError, not_found
from app.names import name_key
from app.scheduling.dates import format_iso
from app.transfer.export import export_bytes, export_filename
from app.transfer.importer import ImportInvalid, ImportMalformed, ValidDoc, parse_json, validate
from app.transfer.naming import unique_import_name

MAX_IMPORT_BYTES = 5 * 1024 * 1024

router = APIRouter(prefix="/api")


@router.get("/projects/{project_id}/export")
def export_project(project_id: int, conn: db.Conn) -> Response:
    row = conn.execute("SELECT name FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise not_found("Project", project_id)
    return Response(
        content=export_bytes(conn, project_id),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{export_filename(row["name"])}"'},
    )


def _require_json(request: Request) -> None:
    """Refuse bodies not declared as JSON, so a cross-site "simple" POST can't import (CR2)."""
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise ApiError(
            415,
            "unsupported_media_type",
            "The import must be sent as application/json, so it was not imported.",
        )


def _too_large() -> ApiError:
    return ApiError(
        413, "import_too_large", "The file is larger than 5 MB, so it was not imported."
    )


async def _read_limited(request: Request) -> bytes:
    """The request body, refusing anything over 5 MB without reading all of it."""
    length = request.headers.get("content-length")
    if length is not None and length.isdigit() and int(length) > MAX_IMPORT_BYTES:
        raise _too_large()
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_IMPORT_BYTES:
            raise _too_large()
    return bytes(body)


def _insert(conn: sqlite3.Connection, doc: ValidDoc) -> int:
    taken = {row["name_key"] for row in conn.execute("SELECT name_key FROM projects")}
    name = unique_import_name(doc.project_name, taken)
    cursor = conn.execute(
        "INSERT INTO projects (name, name_key) VALUES (?, ?)", (name, name_key(name))
    )
    project_id = cursor.lastrowid
    assert project_id is not None

    person_ids: dict[str, int] = {}
    for person in doc.people:
        cursor = conn.execute(
            "INSERT INTO people (project_id, name, name_key, colour) VALUES (?, ?, ?, ?)",
            (project_id, person.name, name_key(person.name), person.colour),
        )
        assert cursor.lastrowid is not None
        person_ids[person.key] = cursor.lastrowid

    task_ids: dict[str, int] = {}
    for task in doc.tasks:
        cursor = conn.execute(
            "INSERT INTO tasks (project_id, name, start, end_date, duration, is_milestone,"
            " percent_complete, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                project_id,
                task.name,
                format_iso(task.start),
                format_iso(task.end),
                task.duration,
                int(task.milestone),
                task.percent,
                None if task.assignee is None else person_ids[task.assignee],
            ),
        )
        assert cursor.lastrowid is not None
        task_ids[task.key] = cursor.lastrowid

    conn.executemany(
        "INSERT INTO dependencies (project_id, predecessor_id, successor_id) VALUES (?, ?, ?)",
        [
            (project_id, task_ids[pred], task_ids[task.key])
            for task in doc.tasks
            for pred in task.predecessors
        ],
    )
    return project_id


def _store(conn: sqlite3.Connection, doc: ValidDoc) -> ProjectDetail:
    """Write the whole project in one transaction: all of it, or nothing."""
    with db.write_tx(conn):
        return load_project_detail(conn, _insert(conn, doc))


@router.post("/import", status_code=201)
async def import_project(request: Request, conn: db.Conn) -> ProjectDetail:
    _require_json(request)
    body = await _read_limited(request)
    try:
        doc = validate(parse_json(body))
    except ImportMalformed as exc:
        raise ApiError(400, "import_malformed", exc.message) from exc
    except ImportInvalid as exc:
        raise ApiError(422, "import_invalid", exc.message) from exc
    return await run_in_threadpool(_store, conn, doc)

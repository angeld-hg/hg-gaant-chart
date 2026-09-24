"""Finish-to-start links (AC10, AC11, AC13): adding one may push the successor's chain."""

import sqlite3

from pydantic import BaseModel, ConfigDict, StrictInt

from app import db
from app.detail import MutationResult, mutation_result
from app.errors import ApiError, not_found
from app.scheduling.engine import creates_cycle
from app.services.tasks import ensure_project, load_schedule, reschedule_or_reject, write_dates


class DependencyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    predecessor_id: StrictInt
    successor_id: StrictInt


def _task(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
    row: sqlite3.Row | None = conn.execute(
        "SELECT project_id, name FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    if row is None:
        raise not_found("Task", task_id)
    return row


def add_dependency(conn: sqlite3.Connection, project_id: int, body: DependencyIn) -> MutationResult:
    pred_id, succ_id = body.predecessor_id, body.successor_id
    with db.write_tx(conn):
        ensure_project(conn, project_id)
        pred, succ = _task(conn, pred_id), _task(conn, succ_id)
        if pred["project_id"] != project_id or succ["project_id"] != project_id:
            raise ApiError(
                422,
                "dependency_cross_project",
                "Both tasks of a dependency must belong to this project.",
            )
        if pred_id == succ_id:
            raise ApiError(422, "dependency_self", f'"{pred["name"]}" cannot depend on itself.')
        link = f'"{pred["name"]}" -> "{succ["name"]}"'
        duplicate = conn.execute(
            "SELECT 1 FROM dependencies WHERE predecessor_id = ? AND successor_id = ?",
            (pred_id, succ_id),
        ).fetchone()
        if duplicate is not None:
            raise ApiError(409, "dependency_duplicate", f"The dependency {link} already exists.")

        tasks, deps = load_schedule(conn, project_id)
        if creates_cycle(deps, pred_id, succ_id):
            raise ApiError(
                409,
                "dependency_cycle",
                f'{link} would create a loop: "{succ["name"]}" already leads to "{pred["name"]}".',
            )
        result = reschedule_or_reject(conn, tasks, [*deps, (pred_id, succ_id)])

        cursor = conn.execute(
            "INSERT INTO dependencies (project_id, predecessor_id, successor_id) VALUES (?, ?, ?)",
            (project_id, pred_id, succ_id),
        )
        write_dates(conn, result.tasks, result.changed)
        return mutation_result(conn, project_id, result.changed, cursor.lastrowid)


def remove_dependency(conn: sqlite3.Connection, dependency_id: int) -> MutationResult:
    """Drop the link. Push-only scheduling means no task moves (AC13)."""
    with db.write_tx(conn):
        row = conn.execute(
            "SELECT project_id FROM dependencies WHERE id = ?", (dependency_id,)
        ).fetchone()
        if row is None:
            raise not_found("Dependency", dependency_id)
        conn.execute("DELETE FROM dependencies WHERE id = ?", (dependency_id,))
        return mutation_result(conn, row["project_id"], [], None)

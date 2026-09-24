"""Read models: the C2 `ProjectSummary`, `ProjectDetail` and `MutationResult` shapes."""

import sqlite3
from collections.abc import Iterable
from typing import TypedDict

from app.errors import not_found
from app.scheduling.critical import compute_critical
from app.scheduling.dates import format_iso, parse_iso_date
from app.scheduling.engine import STask


class ProjectSummary(TypedDict):
    id: int
    name: str
    task_count: int


class PersonOut(TypedDict):
    id: int
    name: str
    colour: str


class TaskOut(TypedDict):
    id: int
    name: str
    start: str
    end: str
    duration: int
    is_milestone: bool
    percent_complete: int
    assignee_id: int | None


class DependencyOut(TypedDict):
    id: int
    predecessor_id: int
    successor_id: int


class ScheduleSummary(TypedDict):
    project_end: str | None
    critical_task_ids: list[int]
    critical_dependency_ids: list[int]


class ProjectDetail(TypedDict):
    id: int
    name: str
    people: list[PersonOut]
    tasks: list[TaskOut]
    dependencies: list[DependencyOut]
    schedule: ScheduleSummary


class MutationResult(TypedDict):
    project: ProjectDetail
    changed_task_ids: list[int]
    created_id: int | None


_SUMMARY_SQL = """
SELECT p.id, p.name, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
FROM projects p
"""


def _summary(row: sqlite3.Row) -> ProjectSummary:
    return {"id": row["id"], "name": row["name"], "task_count": row["task_count"]}


def list_project_summaries(conn: sqlite3.Connection) -> list[ProjectSummary]:
    return [_summary(row) for row in conn.execute(_SUMMARY_SQL + " ORDER BY p.id")]


def load_project_summary(conn: sqlite3.Connection, project_id: int) -> ProjectSummary:
    row = conn.execute(_SUMMARY_SQL + " WHERE p.id = ?", (project_id,)).fetchone()
    if row is None:
        raise not_found("Project", project_id)
    return _summary(row)


def _schedule(tasks: list[TaskOut], deps: list[DependencyOut]) -> ScheduleSummary:
    stasks = {
        t["id"]: STask(
            id=t["id"],
            start=parse_iso_date(t["start"]),
            end=parse_iso_date(t["end"]),
            milestone=t["is_milestone"],
        )
        for t in tasks
    }
    result = compute_critical(stasks, [(d["predecessor_id"], d["successor_id"]) for d in deps])
    return {
        "project_end": None if result.project_end is None else format_iso(result.project_end),
        "critical_task_ids": sorted(result.task_ids),
        "critical_dependency_ids": [
            d["id"]
            for d in deps
            if (d["predecessor_id"], d["successor_id"]) in result.dependency_pairs
        ],
    }


def load_project_detail(conn: sqlite3.Connection, project_id: int) -> ProjectDetail:
    project = conn.execute("SELECT id, name FROM projects WHERE id = ?", (project_id,)).fetchone()
    if project is None:
        raise not_found("Project", project_id)
    people: list[PersonOut] = [
        {"id": r["id"], "name": r["name"], "colour": r["colour"]}
        for r in conn.execute(
            "SELECT id, name, colour FROM people WHERE project_id = ? ORDER BY id", (project_id,)
        )
    ]
    tasks: list[TaskOut] = [
        {
            "id": r["id"],
            "name": r["name"],
            "start": r["start"],
            "end": r["end_date"],
            "duration": r["duration"],
            "is_milestone": bool(r["is_milestone"]),
            "percent_complete": r["percent_complete"],
            "assignee_id": r["assignee_id"],
        }
        for r in conn.execute(
            "SELECT id, name, start, end_date, duration, is_milestone, percent_complete,"
            " assignee_id FROM tasks WHERE project_id = ? ORDER BY id",
            (project_id,),
        )
    ]
    deps: list[DependencyOut] = [
        {"id": r["id"], "predecessor_id": r["predecessor_id"], "successor_id": r["successor_id"]}
        for r in conn.execute(
            "SELECT id, predecessor_id, successor_id FROM dependencies"
            " WHERE project_id = ? ORDER BY id",
            (project_id,),
        )
    ]
    return {
        "id": project["id"],
        "name": project["name"],
        "people": people,
        "tasks": tasks,
        "dependencies": deps,
        "schedule": _schedule(tasks, deps),
    }


def mutation_result(
    conn: sqlite3.Connection, project_id: int, changed: Iterable[int], created_id: int | None
) -> MutationResult:
    return {
        "project": load_project_detail(conn, project_id),
        "changed_task_ids": list(changed),
        "created_id": created_id,
    }

"""Task writes (C2 "Task POST/PATCH resolution"). The server schedules; clients only propose.

Only the edited task's fields come from the request. Every other date is read from the
database inside the write transaction, so a stale client can never break a dependency (AC36).
"""

import sqlite3
from collections.abc import Mapping, Sequence, Set
from dataclasses import dataclass
from datetime import date

from pydantic import BaseModel, ConfigDict, StrictBool, StrictInt, StrictStr

from app import db
from app.detail import MutationResult, mutation_result
from app.errors import ApiError, not_found
from app.names import clean_name
from app.scheduling.dates import (
    MAX_DATE,
    MAX_DURATION,
    MIN_DATE,
    DateFormatError,
    end_from,
    format_iso,
    inclusive_days,
    parse_iso_date,
)
from app.scheduling.engine import (
    Anchor,
    Dep,
    RescheduleResult,
    ScheduleOutOfRange,
    STask,
    reschedule,
)


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr
    start: StrictStr
    duration: StrictInt | None = None
    end: StrictStr | None = None
    is_milestone: StrictBool | None = None
    percent_complete: StrictInt | None = None
    assignee_id: StrictInt | None = None


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: StrictStr | None = None
    start: StrictStr | None = None
    end: StrictStr | None = None
    duration: StrictInt | None = None
    is_milestone: StrictBool | None = None
    percent_complete: StrictInt | None = None
    assignee_id: StrictInt | None = None


_LABELS = {
    "name": "Task name",
    "start": "Start",
    "end": "End",
    "duration": "Duration",
    "is_milestone": "Milestone",
    "percent_complete": "% complete",
}
_DATE_RANGE = f"{format_iso(MIN_DATE)} to {format_iso(MAX_DATE)}"


@dataclass(frozen=True)
class _Fields:
    """The request's fields after type and limit checks; None means "not sent"."""

    name: str | None
    start: date | None
    end: date | None
    duration: int | None
    is_milestone: bool | None
    percent: int | None
    assignee_sent: bool
    assignee_id: int | None


def _date_field(value: str | None, field: str) -> date | None:
    if value is None:
        return None
    try:
        parsed = parse_iso_date(value)
    except DateFormatError as exc:
        raise ApiError(
            422, "invalid", f"{_LABELS[field]} must be a real date in YYYY-MM-DD form.", field
        ) from exc
    _check_date_range(parsed, field)
    return parsed


def _check_date_range(value: date, field: str) -> None:
    if not MIN_DATE <= value <= MAX_DATE:
        raise ApiError(422, "invalid", f"{_LABELS[field]} must be from {_DATE_RANGE}.", field)


def _check_duration(duration: int, field: str) -> None:
    if not 1 <= duration <= MAX_DURATION:
        raise ApiError(
            422,
            "invalid",
            f"Duration must be a whole number of days from 1 to {MAX_DURATION}.",
            field,
        )


def _validate(
    conn: sqlite3.Connection, project_id: int, body: TaskIn | TaskPatch, sent: Set[str]
) -> _Fields:
    """C2 resolution step 1: each field's type, limits and name, one at a time."""
    for field in type(body).model_fields:
        if field in sent and field != "assignee_id" and getattr(body, field) is None:
            raise ApiError(422, "invalid", f"{_LABELS[field]} must have a value.", field)

    name = None if body.name is None else clean_name(body.name, "Task name")
    start = _date_field(body.start, "start")
    end = _date_field(body.end, "end")
    if body.duration is not None:
        _check_duration(body.duration, "duration")
    percent = body.percent_complete
    if percent is not None and not 0 <= percent <= 100:
        raise ApiError(
            422, "invalid", "% complete must be a whole number from 0 to 100.", "percent_complete"
        )
    assignee_sent = "assignee_id" in sent
    if body.assignee_id is not None:
        in_roster = conn.execute(
            "SELECT 1 FROM people WHERE id = ? AND project_id = ?", (body.assignee_id, project_id)
        ).fetchone()
        if in_roster is None:
            raise ApiError(
                422,
                "invalid",
                "The assignee must be a person in this project's roster.",
                "assignee_id",
            )
    return _Fields(
        name=name,
        start=start,
        end=end,
        duration=body.duration,
        is_milestone=body.is_milestone,
        percent=percent,
        assignee_sent=assignee_sent,
        assignee_id=body.assignee_id,
    )


def _forbid_milestone_fields(fields: _Fields) -> None:
    """A milestone has one date (its start), no duration and no progress (AC33)."""
    for field, value in (("end", fields.end), ("duration", fields.duration)):
        if value is not None:
            raise ApiError(
                422,
                "milestone_field",
                f"A milestone has a single date and no {_LABELS[field].lower()};"
                " change its start instead.",
                field,
            )
    if fields.percent not in (None, 0):
        raise ApiError(
            422, "milestone_field", "A milestone's % complete is always 0.", "percent_complete"
        )


def _resolve_end(fields: _Fields, start: date, default_end: date) -> date:
    """End of a non-milestone: from `duration`, else `end`, else `default_end` (C2 step 3/5)."""
    if fields.end is not None and fields.duration is not None:
        raise ApiError(
            422, "invalid", "Send either an end date or a duration, not both.", "duration"
        )
    if fields.duration is not None:
        end = end_from(start, fields.duration)
    elif fields.end is not None:
        if fields.end < start:
            raise ApiError(422, "invalid", "End must not be before the start.", "end")
        end = fields.end
    else:
        end = default_end
    _check_date_range(end, "end")
    _check_duration(inclusive_days(start, end), "end" if fields.end is not None else "duration")
    return end


def ensure_project(conn: sqlite3.Connection, project_id: int) -> None:
    if conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone() is None:
        raise not_found("Project", project_id)


def load_schedule(conn: sqlite3.Connection, project_id: int) -> tuple[dict[int, STask], list[Dep]]:
    """The project's stored tasks and links, as the engine sees them."""
    tasks = {
        row["id"]: STask(
            id=row["id"],
            start=parse_iso_date(row["start"]),
            end=parse_iso_date(row["end_date"]),
            milestone=bool(row["is_milestone"]),
        )
        for row in conn.execute(
            "SELECT id, start, end_date, is_milestone FROM tasks WHERE project_id = ?",
            (project_id,),
        )
    }
    deps: list[Dep] = [
        (row["predecessor_id"], row["successor_id"])
        for row in conn.execute(
            "SELECT predecessor_id, successor_id FROM dependencies"
            " WHERE project_id = ? ORDER BY id",
            (project_id,),
        )
    ]
    return tasks, deps


def reschedule_or_reject(
    conn: sqlite3.Connection,
    tasks: Mapping[int, STask],
    deps: Sequence[Dep],
    edited: STask | None = None,
    anchor: Anchor = "keep_duration",
) -> RescheduleResult:
    """Run the engine; a cascade past the calendar end rejects the whole change (AC40)."""
    try:
        return reschedule(tasks, deps, edited, anchor)
    except ScheduleOutOfRange as exc:
        row = conn.execute("SELECT name FROM tasks WHERE id = ?", (exc.task_id,)).fetchone()
        raise ApiError(
            422,
            "schedule_out_of_range",
            f'This change would push "{row["name"]}" past {format_iso(MAX_DATE)},'
            " so nothing was changed.",
        ) from exc


def write_dates(conn: sqlite3.Connection, tasks: Mapping[int, STask], ids: Sequence[int]) -> None:
    conn.executemany(
        "UPDATE tasks SET start = ?, end_date = ?, duration = ? WHERE id = ?",
        [(format_iso(tasks[i].start), format_iso(tasks[i].end), tasks[i].duration, i) for i in ids],
    )


def create_task(conn: sqlite3.Connection, project_id: int, body: TaskIn) -> MutationResult:
    with db.write_tx(conn):
        ensure_project(conn, project_id)
        fields = _validate(conn, project_id, body, body.model_fields_set)
        assert fields.name is not None and fields.start is not None
        start = fields.start
        if fields.is_milestone:
            _forbid_milestone_fields(fields)
            end, duration, percent = start, 0, 0
        else:
            end = _resolve_end(fields, start, start)
            duration = inclusive_days(start, end)
            percent = fields.percent or 0
        # A new task has no dependencies yet, so there is nothing to clamp or cascade.
        cursor = conn.execute(
            "INSERT INTO tasks (project_id, name, start, end_date, duration, is_milestone,"
            " percent_complete, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                project_id,
                fields.name,
                format_iso(start),
                format_iso(end),
                duration,
                int(bool(fields.is_milestone)),
                percent,
                fields.assignee_id,
            ),
        )
        task_id = cursor.lastrowid
        assert task_id is not None
        return mutation_result(conn, project_id, [task_id], task_id)


def patch_task(
    conn: sqlite3.Connection, task_id: int, body: TaskPatch, fields_set: Set[str]
) -> MutationResult:
    with db.write_tx(conn):
        row = conn.execute(
            "SELECT project_id, name, start, duration, is_milestone, percent_complete,"
            " assignee_id FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        if row is None:
            raise not_found("Task", task_id)
        project_id: int = row["project_id"]
        fields = _validate(conn, project_id, body, fields_set)

        was_milestone = bool(row["is_milestone"])
        milestone = was_milestone if fields.is_milestone is None else fields.is_milestone
        start = parse_iso_date(row["start"]) if fields.start is None else fields.start
        anchor: Anchor = "keep_duration"
        if milestone:
            _forbid_milestone_fields(fields)
            end, percent = start, 0
        else:
            # Unmarking a milestone starts it over as a 1-day task at 0% (AC33).
            base_duration: int = 1 if was_milestone else row["duration"]
            base_percent: int = 0 if was_milestone else row["percent_complete"]
            end = _resolve_end(fields, start, end_from(start, base_duration))
            percent = base_percent if fields.percent is None else fields.percent
            if fields.start is not None and fields.end is not None:
                anchor = "keep_end"  # a left-edge resize keeps the end where it can

        tasks, deps = load_schedule(conn, project_id)
        edited = STask(id=task_id, start=start, end=end, milestone=milestone)
        result = reschedule_or_reject(conn, tasks, deps, edited, anchor)

        conn.execute(
            "UPDATE tasks SET name = ?, is_milestone = ?, percent_complete = ?, assignee_id = ?"
            " WHERE id = ?",
            (
                row["name"] if fields.name is None else fields.name,
                int(milestone),
                percent,
                fields.assignee_id if fields.assignee_sent else row["assignee_id"],
                task_id,
            ),
        )
        changed = [task_id, *(i for i in result.changed if i != task_id)]
        write_dates(conn, result.tasks, changed)
        return mutation_result(conn, project_id, changed, None)


def delete_task(conn: sqlite3.Connection, task_id: int) -> MutationResult:
    """Remove the task; its links go through ON DELETE CASCADE and no other date moves."""
    with db.write_tx(conn):
        row = conn.execute("SELECT project_id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise not_found("Task", task_id)
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        return mutation_result(conn, row["project_id"], [], None)

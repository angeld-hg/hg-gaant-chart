"""Project export (C5): the same data always gives the same bytes (AC21, AC22).

People and tasks are written in id order (creation order, AC42) and get file-local keys
`p1..pn` and `t1..tn` in that order, so no database id ever reaches the file.
"""

import json
import re
import sqlite3
import unicodedata
from typing import Any

from app.errors import not_found

FORMAT = "hg-gantt"
VERSION = 1


def export_bytes(conn: sqlite3.Connection, project_id: int) -> bytes:
    project = conn.execute("SELECT name FROM projects WHERE id = ?", (project_id,)).fetchone()
    if project is None:
        raise not_found("Project", project_id)

    people = conn.execute(
        "SELECT id, name, colour FROM people WHERE project_id = ? ORDER BY id", (project_id,)
    ).fetchall()
    person_keys = {row["id"]: f"p{i}" for i, row in enumerate(people, start=1)}

    tasks = conn.execute(
        "SELECT id, name, start, end_date, duration, is_milestone, percent_complete, assignee_id"
        " FROM tasks WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()
    position = {row["id"]: i for i, row in enumerate(tasks, start=1)}

    predecessors: dict[int, list[int]] = {}
    for row in conn.execute(
        "SELECT predecessor_id, successor_id FROM dependencies WHERE project_id = ?",
        (project_id,),
    ):
        predecessors.setdefault(row["successor_id"], []).append(position[row["predecessor_id"]])

    doc: dict[str, Any] = {
        "format": FORMAT,
        "version": VERSION,
        "project": {"name": project["name"]},
        "people": [
            {"key": person_keys[row["id"]], "name": row["name"], "colour": row["colour"]}
            for row in people
        ],
        "tasks": [
            {
                "key": f"t{position[row['id']]}",
                "name": row["name"],
                "start": row["start"],
                "end": row["end_date"],
                "duration": row["duration"],
                "milestone": bool(row["is_milestone"]),
                "percent_complete": row["percent_complete"],
                "assignee": None if row["assignee_id"] is None else person_keys[row["assignee_id"]],
                "predecessors": [f"t{p}" for p in sorted(predecessors.get(row["id"], []))],
            }
            for row in tasks
        ],
    }
    return (json.dumps(doc, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def export_filename(project_name: str) -> str:
    """An ASCII-only download name, e.g. "Big Launch: Café" -> "big-launch-cafe.gantt.json"."""
    ascii_name = unicodedata.normalize("NFKD", project_name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return f"{slug or 'project'}.gantt.json"

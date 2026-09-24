"""SQLite access: connections, schema, and write transactions (contract C4)."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    colour TEXT NOT NULL,
    UNIQUE (project_id, name_key)
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start TEXT NOT NULL,
    end_date TEXT NOT NULL,
    duration INTEGER NOT NULL,
    is_milestone INTEGER NOT NULL,
    percent_complete INTEGER NOT NULL,
    assignee_id INTEGER REFERENCES people(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    predecessor_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE (predecessor_id, successor_id)
);
CREATE INDEX IF NOT EXISTS people_project ON people(project_id);
CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS dependencies_project ON dependencies(project_id);
CREATE INDEX IF NOT EXISTS dependencies_successor ON dependencies(successor_id);
"""


def connect(path: str) -> sqlite3.Connection:
    """Open a connection in autocommit mode so `write_tx` owns every transaction."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


@contextmanager
def write_tx(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Run the block as one IMMEDIATE transaction: commit on success, roll back on any error."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def get_conn(request: Request) -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request, closed afterwards."""
    conn = connect(request.app.state.db_path)
    try:
        yield conn
    finally:
        conn.close()


Conn = Annotated[sqlite3.Connection, Depends(get_conn)]

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.palette import PALETTE


def test_projects_and_people_survive_a_restart(tmp_path: Path) -> None:
    db_path = str(tmp_path / "persist.db")
    with TestClient(create_app(db_path)) as first:
        pid = first.post("/api/projects", json={"name": "Launch"}).json()["id"]
        first.post(f"/api/projects/{pid}/people", json={"name": "Ana", "colour": PALETTE[4].fill})
        first.post(f"/api/projects/{pid}/people", json={"name": "Ben"})
        before = first.get(f"/api/projects/{pid}").json()
        listed_before = first.get("/api/projects").json()

    with TestClient(create_app(db_path)) as second:
        assert second.get("/api/projects").json() == listed_before
        after = second.get(f"/api/projects/{pid}").json()

    assert after == before
    assert [(p["name"], p["colour"]) for p in after["people"]] == [
        ("Ana", PALETTE[4].fill),
        ("Ben", PALETTE[0].fill),
    ]


def test_db_path_comes_from_env_when_no_argument(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_path = tmp_path / "nested" / "env.db"
    monkeypatch.setenv("GANTT_DB_PATH", str(db_path))

    with TestClient(create_app()) as client:
        assert client.post("/api/projects", json={"name": "Env"}).status_code == 201

    rows = sqlite3.connect(db_path).execute("SELECT name, name_key FROM projects").fetchall()
    assert rows == [("Env", "env")]


def test_schema_init_is_idempotent_and_enables_foreign_keys(tmp_path: Path) -> None:
    from app import db

    path = str(tmp_path / "s.db")
    conn = db.connect(path)
    db.init_schema(conn)
    db.init_schema(conn)

    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"projects", "people", "tasks", "dependencies"} <= tables
    conn.close()


def test_write_tx_rolls_back_on_error(tmp_path: Path) -> None:
    from app import db

    conn = db.connect(str(tmp_path / "tx.db"))
    db.init_schema(conn)

    with pytest.raises(RuntimeError), db.write_tx(conn):
        conn.execute("INSERT INTO projects (name, name_key) VALUES ('A', 'a')")
        raise RuntimeError("boom")

    assert conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 0

    with db.write_tx(conn):
        conn.execute("INSERT INTO projects (name, name_key) VALUES ('B', 'b')")

    assert conn.execute("SELECT name FROM projects").fetchall()[0][0] == "B"
    conn.close()

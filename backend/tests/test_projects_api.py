import sqlite3
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient


def create_project(client: TestClient, name: str) -> dict[str, Any]:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def assert_error(response: Any, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status, response.text
    error: dict[str, Any] = response.json()["error"]
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert set(error) == {"code", "message", "field"}
    return error


def test_no_projects_lists_empty(client: TestClient) -> None:
    response = client.get("/api/projects")

    assert response.status_code == 200
    assert response.json() == []


def test_create_project_returns_summary_and_lists_it(client: TestClient) -> None:
    created = create_project(client, "Launch")

    assert set(created) == {"id", "name", "task_count"}
    assert created["name"] == "Launch"
    assert created["task_count"] == 0
    assert client.get("/api/projects").json() == [created]


def test_create_project_trims_name(client: TestClient) -> None:
    assert create_project(client, "  Launch  ")["name"] == "Launch"


def test_duplicate_name_in_other_case_is_409_and_nothing_stored(client: TestClient) -> None:
    create_project(client, "Launch")

    error = assert_error(client.post("/api/projects", json={"name": "launch"}), 409, "name_taken")

    assert error["field"] == "name"
    assert len(client.get("/api/projects").json()) == 1


@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_invalid_project_names_are_422_and_nothing_stored(client: TestClient, name: str) -> None:
    assert_error(client.post("/api/projects", json={"name": name}), 422, "invalid")

    assert client.get("/api/projects").json() == []


def test_name_of_100_chars_after_trimming_is_accepted(client: TestClient) -> None:
    assert create_project(client, "  " + "x" * 100 + "  ")["name"] == "x" * 100


@pytest.mark.parametrize(
    "body", [{}, {"name": 3}, {"name": None}, {"name": "A", "colour": "x"}], ids=repr
)
def test_bad_project_bodies_are_422_invalid(client: TestClient, body: dict[str, Any]) -> None:
    assert_error(client.post("/api/projects", json=body), 422, "invalid")

    assert client.get("/api/projects").json() == []


def test_malformed_json_body_is_422_invalid(client: TestClient) -> None:
    response = client.post(
        "/api/projects", content=b"{not json", headers={"content-type": "application/json"}
    )

    assert_error(response, 422, "invalid")


def test_projects_are_listed_in_creation_order(client: TestClient) -> None:
    names = ["Zeta", "Alpha", "Mid"]
    for name in names:
        create_project(client, name)

    listed = client.get("/api/projects").json()

    assert [p["name"] for p in listed] == names
    assert [p["id"] for p in listed] == sorted(p["id"] for p in listed)


def test_get_project_detail_of_empty_project(client: TestClient) -> None:
    project = create_project(client, "Launch")

    response = client.get(f"/api/projects/{project['id']}")

    assert response.status_code == 200
    assert response.json() == {
        "id": project["id"],
        "name": "Launch",
        "people": [],
        "tasks": [],
        "dependencies": [],
        "schedule": {"project_end": None, "critical_task_ids": [], "critical_dependency_ids": []},
    }


def test_rename_to_own_name_in_other_case_is_allowed(client: TestClient) -> None:
    project = create_project(client, "Launch")

    response = client.patch(f"/api/projects/{project['id']}", json={"name": "LAUNCH"})

    assert response.status_code == 200
    assert response.json() == {"id": project["id"], "name": "LAUNCH", "task_count": 0}
    assert client.get(f"/api/projects/{project['id']}").json()["name"] == "LAUNCH"


def test_rename_to_other_projects_name_is_409_and_unchanged(client: TestClient) -> None:
    create_project(client, "Launch")
    other = create_project(client, "Other")

    assert_error(
        client.patch(f"/api/projects/{other['id']}", json={"name": " launch "}), 409, "name_taken"
    )

    assert client.get(f"/api/projects/{other['id']}").json()["name"] == "Other"


@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_rename_to_invalid_name_is_422_and_unchanged(client: TestClient, name: str) -> None:
    project = create_project(client, "Launch")

    assert_error(
        client.patch(f"/api/projects/{project['id']}", json={"name": name}), 422, "invalid"
    )

    assert client.get(f"/api/projects/{project['id']}").json()["name"] == "Launch"


def test_unknown_project_ids_are_404(client: TestClient) -> None:
    assert_error(client.get("/api/projects/999"), 404, "not_found")
    assert_error(client.patch("/api/projects/999", json={"name": "X"}), 404, "not_found")
    assert_error(client.delete("/api/projects/999"), 404, "not_found")


def test_delete_project_removes_it(client: TestClient) -> None:
    project = create_project(client, "Launch")

    response = client.delete(f"/api/projects/{project['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/api/projects").json() == []
    assert_error(client.get(f"/api/projects/{project['id']}"), 404, "not_found")


def test_delete_project_frees_its_name(client: TestClient) -> None:
    project = create_project(client, "Launch")
    client.delete(f"/api/projects/{project['id']}")

    assert create_project(client, "launch")["name"] == "launch"


def test_delete_project_cascades_people_tasks_and_dependencies(
    client: TestClient, tmp_path: Path
) -> None:
    keep = create_project(client, "Keep")
    doomed = create_project(client, "Doomed")
    ana = client.post(f"/api/projects/{doomed['id']}/people", json={"name": "Ana"}).json()
    ana_id = ana["created_id"]
    kept_person = client.post(f"/api/projects/{keep['id']}/people", json={"name": "Kim"}).json()

    db = sqlite3.connect(tmp_path / "t.db")
    db.execute("PRAGMA foreign_keys = ON")
    insert = (
        "INSERT INTO tasks (project_id, name, start, end_date, duration, is_milestone,"
        " percent_complete, assignee_id) VALUES (?, ?, '2026-10-05', '2026-10-07', 3, 0, 0, ?)"
    )
    a = db.execute(insert, (doomed["id"], "A", ana_id)).lastrowid
    b = db.execute(insert, (doomed["id"], "B", None)).lastrowid
    kept_task = db.execute(insert, (keep["id"], "K", None)).lastrowid
    db.execute(
        "INSERT INTO dependencies (project_id, predecessor_id, successor_id) VALUES (?, ?, ?)",
        (doomed["id"], a, b),
    )
    db.commit()
    assert client.get("/api/projects").json()[1]["task_count"] == 2

    assert client.delete(f"/api/projects/{doomed['id']}").status_code == 204

    def count(sql: str, *args: object) -> int:
        return int(db.execute(sql, args).fetchone()[0])

    assert count("SELECT COUNT(*) FROM people WHERE project_id = ?", doomed["id"]) == 0
    assert count("SELECT COUNT(*) FROM tasks WHERE project_id = ?", doomed["id"]) == 0
    assert count("SELECT COUNT(*) FROM dependencies") == 0
    assert count("SELECT COUNT(*) FROM tasks WHERE id = ?", kept_task) == 1
    assert count("SELECT COUNT(*) FROM people WHERE id = ?", kept_person["created_id"]) == 1
    db.close()
    assert [p["name"] for p in client.get("/api/projects").json()] == ["Keep"]


def test_detail_includes_tasks_dependencies_and_critical_path(
    client: TestClient, tmp_path: Path
) -> None:
    project = create_project(client, "Launch")
    pid = project["id"]
    ana_id = client.post(f"/api/projects/{pid}/people", json={"name": "Ana"}).json()["created_id"]
    db = sqlite3.connect(tmp_path / "t.db")
    insert = (
        "INSERT INTO tasks (project_id, name, start, end_date, duration, is_milestone,"
        " percent_complete, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    a = db.execute(insert, (pid, "A", "2026-10-05", "2026-10-07", 3, 0, 40, ana_id)).lastrowid
    b = db.execute(insert, (pid, "B", "2026-10-08", "2026-10-09", 2, 0, 0, None)).lastrowid
    m = db.execute(insert, (pid, "M", "2026-10-09", "2026-10-09", 0, 1, 0, None)).lastrowid
    s = db.execute(insert, (pid, "S", "2026-10-01", "2026-10-02", 2, 0, 0, None)).lastrowid
    dep_ab = db.execute(
        "INSERT INTO dependencies (project_id, predecessor_id, successor_id) VALUES (?, ?, ?)",
        (pid, a, b),
    ).lastrowid
    dep_bm = db.execute(
        "INSERT INTO dependencies (project_id, predecessor_id, successor_id) VALUES (?, ?, ?)",
        (pid, b, m),
    ).lastrowid
    db.commit()
    db.close()

    detail = client.get(f"/api/projects/{pid}").json()

    assert detail["tasks"][0] == {
        "id": a,
        "name": "A",
        "start": "2026-10-05",
        "end": "2026-10-07",
        "duration": 3,
        "is_milestone": False,
        "percent_complete": 40,
        "assignee_id": ana_id,
    }
    assert detail["tasks"][2]["is_milestone"] is True
    assert detail["tasks"][2]["duration"] == 0
    assert [t["id"] for t in detail["tasks"]] == [a, b, m, s]
    assert detail["dependencies"] == [
        {"id": dep_ab, "predecessor_id": a, "successor_id": b},
        {"id": dep_bm, "predecessor_id": b, "successor_id": m},
    ]
    assert detail["schedule"] == {
        "project_end": "2026-10-09",
        "critical_task_ids": [a, b, m],
        "critical_dependency_ids": [dep_ab, dep_bm],
    }
    assert client.get("/api/projects").json()[0]["task_count"] == 4


def test_unknown_route_uses_error_body(client: TestClient) -> None:
    assert_error(client.get("/api/nope"), 404, "not_found")


def test_non_integer_id_is_422_invalid(client: TestClient) -> None:
    assert_error(client.get("/api/projects/abc"), 422, "invalid")

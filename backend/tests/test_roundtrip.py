"""AC22: export, import into an empty database, export again: the bytes are identical."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.test_export import GOLDEN, build_launch, export
from tests.test_tasks_api import Api


def test_export_import_export_is_byte_identical_across_databases(tmp_path: Path) -> None:
    with TestClient(create_app(str(tmp_path / "one.db"))) as first:
        original = export(first, build_launch(Api(first)))

    with TestClient(create_app(str(tmp_path / "two.db"))) as second:
        response = second.post(
            "/api/import", content=original, headers={"content-type": "application/json"}
        )
        assert response.status_code == 201, response.text
        again = export(second, response.json()["id"])

    assert again == original


def test_imported_project_survives_a_restart(tmp_path: Path) -> None:
    db_path = str(tmp_path / "restart.db")
    with TestClient(create_app(db_path)) as first:
        response = first.post(
            "/api/import", content=GOLDEN.read_bytes(), headers={"content-type": "application/json"}
        )
        assert response.status_code == 201, response.text
        project_id = response.json()["id"]

    with TestClient(create_app(db_path)) as second:
        assert export(second, project_id) == GOLDEN.read_bytes()


def test_round_trip_of_a_larger_project_is_byte_identical(tmp_path: Path) -> None:
    with TestClient(create_app(str(tmp_path / "big-one.db"))) as first:
        api = Api(first)
        pid = api.project("Big")
        people = [api.person(pid, f"Person {i}") for i in range(14)]
        ids: list[int] = []
        for i in range(60):
            ids.append(
                api.task(
                    pid,
                    f"Task {i}",
                    "2026-10-05",
                    is_milestone=i % 7 == 3,
                    **({} if i % 7 == 3 else {"duration": 1 + i % 4, "percent_complete": i}),
                    assignee_id=people[i % len(people)] if i % 3 else None,
                )
            )
        for i in range(1, 60):
            # Every link points to a later task, so the graph is acyclic.
            for pred in sorted({(i * 5) // 7, max(i - 2, 0)}, reverse=True):
                api.dep(pid, ids[pred], ids[i])
        original = export(first, pid)

    with TestClient(create_app(str(tmp_path / "big-two.db"))) as second:
        response = second.post(
            "/api/import", content=original, headers={"content-type": "application/json"}
        )
        assert response.status_code == 201, response.text
        assert export(second, response.json()["id"]) == original

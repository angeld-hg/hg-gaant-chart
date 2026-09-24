import sqlite3
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.palette import PALETTE

FILLS = [c.fill for c in PALETTE]


def new_project(client: TestClient, name: str = "Launch") -> int:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201, response.text
    project_id: int = response.json()["id"]
    return project_id


def add_person(client: TestClient, project_id: int, **body: Any) -> dict[str, Any]:
    response = client.post(f"/api/projects/{project_id}/people", json=body)
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


def people(client: TestClient, project_id: int) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = client.get(f"/api/projects/{project_id}").json()["people"]
    return result


def person(client: TestClient, project_id: int, person_id: int) -> dict[str, Any]:
    return next(p for p in people(client, project_id) if p["id"] == person_id)


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    error = response.json()["error"]
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]


def test_add_person_returns_mutation_result(client: TestClient) -> None:
    pid = new_project(client)

    result = add_person(client, pid, name="  Ana ", colour=FILLS[3])

    assert set(result) == {"project", "changed_task_ids", "created_id"}
    assert result["changed_task_ids"] == []
    assert result["project"]["id"] == pid
    assert result["project"]["people"] == [
        {"id": result["created_id"], "name": "Ana", "colour": FILLS[3]}
    ]


def test_default_colour_is_first_unused_and_colours_may_repeat(client: TestClient) -> None:
    pid = new_project(client)
    add_person(client, pid, name="Ana", colour=FILLS[0])
    add_person(client, pid, name="Ben", colour=FILLS[0])
    add_person(client, pid, name="Cat", colour=FILLS[2])

    dan = add_person(client, pid, name="Dan")

    assert [p["colour"] for p in dan["project"]["people"]] == [
        FILLS[0],
        FILLS[0],
        FILLS[2],
        FILLS[1],
    ]


def test_default_colour_counts_only_this_projects_roster(client: TestClient) -> None:
    other = new_project(client, "Other")
    add_person(client, other, name="Ana")
    pid = new_project(client)

    result = add_person(client, pid, name="Ana")

    assert result["project"]["people"][0]["colour"] == FILLS[0]


def test_default_colour_wraps_to_first_when_all_used(client: TestClient) -> None:
    pid = new_project(client)
    for i, fill in enumerate(FILLS):
        add_person(client, pid, name=f"P{i}", colour=fill)

    result = add_person(client, pid, name="Extra")

    assert result["project"]["people"][-1]["colour"] == FILLS[0]


@pytest.mark.parametrize("colour", ["x", "#123456", FILLS[0].upper(), "", 5, None], ids=repr)
def test_bad_colour_is_422_and_nothing_stored(client: TestClient, colour: object) -> None:
    pid = new_project(client)

    response = client.post(f"/api/projects/{pid}/people", json={"name": "Ana", "colour": colour})

    assert_error(response, 422, "invalid")
    assert people(client, pid) == []


def test_duplicate_person_name_is_409_and_nothing_stored(client: TestClient) -> None:
    pid = new_project(client)
    add_person(client, pid, name="Ana")

    assert_error(
        client.post(f"/api/projects/{pid}/people", json={"name": " ana "}), 409, "name_taken"
    )

    assert [p["name"] for p in people(client, pid)] == ["Ana"]


def test_same_person_name_in_another_project_is_fine(client: TestClient) -> None:
    add_person(client, new_project(client, "Other"), name="Ana")
    pid = new_project(client)

    assert add_person(client, pid, name="Ana")["project"]["people"][0]["name"] == "Ana"


@pytest.mark.parametrize("body", [{"name": ""}, {"name": "  "}, {"name": "x" * 101}, {}], ids=repr)
def test_bad_person_name_on_add_is_422(client: TestClient, body: dict[str, Any]) -> None:
    pid = new_project(client)

    assert_error(client.post(f"/api/projects/{pid}/people", json=body), 422, "invalid")

    assert people(client, pid) == []


def test_add_person_to_unknown_project_is_404(client: TestClient) -> None:
    assert_error(client.post("/api/projects/999/people", json={"name": "Ana"}), 404, "not_found")


def test_people_are_listed_in_the_order_added(client: TestClient) -> None:
    pid = new_project(client)
    for name in ["Zed", "Ana", "Mo"]:
        add_person(client, pid, name=name)

    assert [p["name"] for p in people(client, pid)] == ["Zed", "Ana", "Mo"]


def test_rename_person(client: TestClient) -> None:
    pid = new_project(client)
    ana_id = add_person(client, pid, name="Ana")["created_id"]

    response = client.patch(f"/api/people/{ana_id}", json={"name": "Anna"})

    assert response.status_code == 200
    assert response.json()["created_id"] is None
    assert response.json()["changed_task_ids"] == []
    assert person(client, pid, ana_id)["name"] == "Anna"

    response = client.patch(f"/api/people/{ana_id}", json={"name": "ANNA"})

    assert response.status_code == 200
    assert person(client, pid, ana_id)["name"] == "ANNA"


def test_rename_to_another_persons_name_is_409_and_unchanged(client: TestClient) -> None:
    pid = new_project(client)
    add_person(client, pid, name="Anna")
    ben_id = add_person(client, pid, name="Ben")["created_id"]

    assert_error(client.patch(f"/api/people/{ben_id}", json={"name": "anna"}), 409, "name_taken")

    assert person(client, pid, ben_id)["name"] == "Ben"


@pytest.mark.parametrize("name", ["", "   ", "x" * 101, None, 7], ids=repr)
def test_rename_to_invalid_name_is_422_and_unchanged(client: TestClient, name: object) -> None:
    pid = new_project(client)
    ana_id = add_person(client, pid, name="Ana")["created_id"]

    assert_error(client.patch(f"/api/people/{ana_id}", json={"name": name}), 422, "invalid")

    assert person(client, pid, ana_id)["name"] == "Ana"


def test_change_colour_and_reject_bad_colour(client: TestClient) -> None:
    pid = new_project(client)
    ana_id = add_person(client, pid, name="Ana")["created_id"]

    assert client.patch(f"/api/people/{ana_id}", json={"colour": FILLS[5]}).status_code == 200
    assert person(client, pid, ana_id)["colour"] == FILLS[5]

    assert_error(client.patch(f"/api/people/{ana_id}", json={"colour": "#000000"}), 422, "invalid")
    assert person(client, pid, ana_id)["colour"] == FILLS[5]


def test_patch_with_bad_colour_does_not_apply_the_name(client: TestClient) -> None:
    pid = new_project(client)
    ana_id = add_person(client, pid, name="Ana")["created_id"]

    response = client.patch(f"/api/people/{ana_id}", json={"name": "Anna", "colour": "x"})

    assert_error(response, 422, "invalid")
    assert person(client, pid, ana_id) == {"id": ana_id, "name": "Ana", "colour": FILLS[0]}


def test_patch_person_with_unknown_field_is_422(client: TestClient) -> None:
    pid = new_project(client)
    ana_id = add_person(client, pid, name="Ana")["created_id"]

    assert_error(client.patch(f"/api/people/{ana_id}", json={"nickname": "A"}), 422, "invalid")


def test_unknown_person_ids_are_404(client: TestClient) -> None:
    assert_error(client.patch("/api/people/999", json={"name": "X"}), 404, "not_found")
    assert_error(client.delete("/api/people/999"), 404, "not_found")


def test_delete_person_unassigns_their_tasks(client: TestClient, tmp_path: Path) -> None:
    pid = new_project(client)
    ana_id = add_person(client, pid, name="Ana")["created_id"]
    ben_id = add_person(client, pid, name="Ben")["created_id"]
    db = sqlite3.connect(tmp_path / "t.db")
    insert = (
        "INSERT INTO tasks (project_id, name, start, end_date, duration, is_milestone,"
        " percent_complete, assignee_id) VALUES (?, ?, '2026-10-05', '2026-10-05', 1, 0, 0, ?)"
    )
    t1 = db.execute(insert, (pid, "T1", ana_id)).lastrowid
    t2 = db.execute(insert, (pid, "T2", ben_id)).lastrowid
    t3 = db.execute(insert, (pid, "T3", ana_id)).lastrowid
    db.commit()
    db.close()

    response = client.delete(f"/api/people/{ana_id}")

    assert response.status_code == 200
    result = response.json()
    assert result["created_id"] is None
    assert result["changed_task_ids"] == [t1, t3]
    assert [p["id"] for p in result["project"]["people"]] == [ben_id]
    assert [(t["id"], t["assignee_id"]) for t in result["project"]["tasks"]] == [
        (t1, None),
        (t2, ben_id),
        (t3, None),
    ]
    assert client.get(f"/api/projects/{pid}").json() == result["project"]

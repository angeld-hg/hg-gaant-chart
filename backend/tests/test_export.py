"""JSON export (C5, AC21): exact, deterministic bytes keyed locally, never by DB id.

`build_launch` is shared with the import and round-trip tests.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.palette import PALETTE
from tests.test_tasks_api import Api, assert_error

FIXTURES = Path(__file__).parent / "fixtures"
GOLDEN = FIXTURES / "launch.gantt.json"


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)


def build_launch(api: Api) -> int:
    """The project described by `fixtures/launch.gantt.json`, returning its id.

    A decoy project is created first so database ids differ from the file's keys, and the
    Review links are added out of task order so the export has to sort predecessors.
    """
    other = api.project("Other")
    api.person(other, "Zed")
    api.task(other, "Decoy", "2026-01-01")

    pid = api.project("Launch")
    orange = PALETTE[1].fill
    response = api.client.post(
        f"/api/projects/{pid}/people", json={"name": "Ana", "colour": orange}
    )
    ana: int = api.mutation(response, 201)["created_id"]
    ben = api.person(pid, "Ben")  # defaults to the first unused colour, blue
    design = api.task(pid, "Design", "2026-10-05", duration=3, percent_complete=40, assignee_id=ana)
    build = api.task(pid, "Café build", "2026-10-08", duration=2, assignee_id=ben)
    review = api.task(pid, "Review", "2026-10-09", is_milestone=True)
    ship = api.task(pid, "Ship", "2026-10-12", duration=1, percent_complete=100, assignee_id=ana)
    api.dep(pid, design, build)
    api.dep(pid, build, review)
    api.dep(pid, design, review)
    api.dep(pid, review, ship)
    return pid


def export(client: TestClient, project_id: int) -> bytes:
    response = client.get(f"/api/projects/{project_id}/export")
    assert response.status_code == 200, response.text
    return response.content


def test_export_matches_the_golden_file_byte_for_byte(api: Api) -> None:
    pid = build_launch(api)

    assert export(api.client, pid) == GOLDEN.read_bytes()


def test_export_bytes_are_utf8_json_with_keys_in_contract_order(api: Api) -> None:
    pid = build_launch(api)

    body = export(api.client, pid)

    assert body.endswith(b"}\n")
    assert "Café build".encode() in body  # ensure_ascii=False
    doc = json.loads(body)
    assert list(doc) == ["format", "version", "project", "people", "tasks"]
    assert list(doc["people"][0]) == ["key", "name", "colour"]
    assert list(doc["tasks"][0]) == [
        "key",
        "name",
        "start",
        "end",
        "duration",
        "milestone",
        "percent_complete",
        "assignee",
        "predecessors",
    ]


def test_exporting_twice_gives_identical_bytes(api: Api) -> None:
    pid = build_launch(api)

    assert export(api.client, pid) == export(api.client, pid)


def test_export_is_an_attachment_named_after_the_project(api: Api) -> None:
    pid = build_launch(api)
    api.client.patch(f"/api/projects/{pid}", json={"name": "Big Launch: Café 2026!"})

    response = api.client.get(f"/api/projects/{pid}/export")

    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["content-disposition"] == (
        'attachment; filename="big-launch-cafe-2026.gantt.json"'
    )


def test_export_of_a_name_with_no_ascii_letters_falls_back_to_project(api: Api) -> None:
    pid = api.project("東京")

    response = api.client.get(f"/api/projects/{pid}/export")

    assert response.headers["content-disposition"] == 'attachment; filename="project.gantt.json"'


def test_export_of_an_empty_project_has_empty_lists(api: Api) -> None:
    pid = api.project("Empty")

    assert export(api.client, pid) == (
        b'{\n  "format": "hg-gantt",\n  "version": 1,\n  "project": {\n    "name": "Empty"\n  },\n'
        b'  "people": [],\n  "tasks": []\n}\n'
    )


def test_export_of_an_unknown_project_is_404(api: Api) -> None:
    assert_error(api.client.get("/api/projects/999/export"), 404, "not_found")

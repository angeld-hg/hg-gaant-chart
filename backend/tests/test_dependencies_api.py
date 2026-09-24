"""Dependencies over HTTP: AC6, AC10, AC11, AC13, AC32, AC40 (C2 errors)."""

import pytest
from fastapi.testclient import TestClient

from tests.test_tasks_api import Api, Json, assert_error, span


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)


def chain(api: Api) -> tuple[int, int, int, int]:
    """A (10-05..10-07) -> B (10-08..10-09) -> C (10-10..10-10), returning (project, A, B, C)."""
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05", duration=3)
    b = api.task(pid, "B", "2026-10-08", duration=2)
    c = api.task(pid, "C", "2026-10-10", duration=1)
    api.dep(pid, a, b)
    api.dep(pid, b, c)
    return pid, a, b, c


def dep_pairs(api: Api, pid: int) -> list[tuple[int, int]]:
    return [(d["predecessor_id"], d["successor_id"]) for d in api.detail(pid)["dependencies"]]


def test_add_dependency_returns_created_link(api: Api) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05", duration=3)
    b = api.task(pid, "B", "2026-10-08", duration=2)

    result = api.post_dep(pid, a, b).json()

    deps = result["project"]["dependencies"]
    assert deps == [{"id": result["created_id"], "predecessor_id": a, "successor_id": b}]
    assert result["changed_task_ids"] == []
    assert result["project"]["schedule"]["critical_dependency_ids"] == [result["created_id"]]


def test_adding_dependency_pushes_successor_and_its_chain(api: Api) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05", duration=3)
    b = api.task(pid, "B", "2026-10-06", duration=2)
    c = api.task(pid, "C", "2026-10-08", duration=1)
    api.dep(pid, b, c)

    result = api.post_dep(pid, a, b).json()

    assert result["changed_task_ids"] == [b, c]
    tasks = api.tasks(pid)
    assert span(tasks[a]) == ("2026-10-05", "2026-10-07", 3)
    assert span(tasks[b]) == ("2026-10-08", "2026-10-09", 2)
    assert span(tasks[c]) == ("2026-10-10", "2026-10-10", 1)
    assert dep_pairs(api, pid) == [(b, c), (a, b)]


def test_dependency_onto_milestone_allows_the_same_day(api: Api) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05", duration=5)
    m = api.task(pid, "M", "2026-10-01", is_milestone=True)

    result = api.post_dep(pid, a, m).json()

    assert result["changed_task_ids"] == [m]
    assert span(api.get_task(pid, m)) == ("2026-10-09", "2026-10-09", 0)


@pytest.mark.parametrize(
    ("link", "status", "code"),
    [
        ("CA", 409, "dependency_cycle"),
        ("CB", 409, "dependency_cycle"),
        ("AA", 422, "dependency_self"),
        ("AB", 409, "dependency_duplicate"),
    ],
)
def test_invalid_links_are_rejected_and_not_stored(
    api: Api, link: str, status: int, code: str
) -> None:
    pid, a, b, c = chain(api)
    ids = {"A": a, "B": b, "C": c}
    before = api.detail(pid)

    assert_error(api.post_dep(pid, ids[link[0]], ids[link[1]]), status, code)

    assert api.detail(pid) == before


def test_cross_project_dependency_is_422(api: Api) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05")
    other = api.project("Other")
    x = api.task(other, "X", "2026-10-01")
    y = api.task(other, "Y", "2026-10-01")

    assert_error(api.post_dep(pid, a, x), 422, "dependency_cross_project")
    assert_error(api.post_dep(pid, x, a), 422, "dependency_cross_project")
    assert_error(api.post_dep(pid, x, y), 422, "dependency_cross_project")

    assert api.detail(pid)["dependencies"] == []
    assert api.detail(other)["dependencies"] == []


def test_unknown_ids_are_404(api: Api) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05")

    assert_error(api.post_dep(pid, a, 999), 404, "not_found")
    assert_error(api.post_dep(pid, 999, a), 404, "not_found")
    assert_error(api.post_dep(999, a, a), 404, "not_found")
    assert api.detail(pid)["dependencies"] == []


@pytest.mark.parametrize(
    "body",
    [
        {"predecessor_id": "1", "successor_id": 2},
        {"predecessor_id": 1, "successor_id": 2.0},
        {"predecessor_id": 1},
        {"predecessor_id": 1, "successor_id": 2, "lag": 1},
    ],
)
def test_malformed_dependency_body_is_422(api: Api, client: TestClient, body: Json) -> None:
    pid = api.project()
    api.task(pid, "A", "2026-10-05")
    api.task(pid, "B", "2026-10-06")

    response = client.post(f"/api/projects/{pid}/dependencies", json=body)

    assert_error(response, 422, "invalid")
    assert api.detail(pid)["dependencies"] == []


def test_dependency_whose_cascade_leaves_the_calendar_is_rejected(api: Api) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2099-12-20", duration=5)
    b = api.task(pid, "B", "2099-12-20", duration=10)
    before = api.detail(pid)

    assert_error(api.post_dep(pid, a, b), 422, "schedule_out_of_range")

    assert api.detail(pid) == before


def test_removing_a_dependency_keeps_dates(api: Api, client: TestClient) -> None:
    pid, a, b, c = chain(api)
    link = api.detail(pid)["dependencies"][0]["id"]
    before = api.tasks(pid)

    result = api.mutation(client.delete(f"/api/dependencies/{link}"))

    assert result["changed_task_ids"] == []
    assert result["created_id"] is None
    assert dep_pairs(api, pid) == [(b, c)]
    assert api.tasks(pid) == before
    api.patch(a, end="2026-10-20")
    assert span(api.get_task(pid, b)) == ("2026-10-08", "2026-10-09", 2)


def test_removing_unknown_dependency_is_404(client: TestClient) -> None:
    assert_error(client.delete("/api/dependencies/999"), 404, "not_found")

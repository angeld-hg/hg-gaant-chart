"""The server as scheduling authority (AC32): AC12, AC28, AC29, AC33, AC36, AC39, AC40."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.test_tasks_api import Api, Json, assert_error, span, task_in


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)


def ac12(api: Api, b_start: str = "2026-10-08", c_start: str = "2026-10-10") -> tuple[int, ...]:
    """A (10-05..10-07) -> B (2 days) -> C (1 day), returning (project, A, B, C)."""
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05", duration=3)
    b = api.task(pid, "B", b_start, duration=2)
    c = api.task(pid, "C", c_start, duration=1)
    api.dep(pid, a, b)
    api.dep(pid, b, c)
    return pid, a, b, c


A_END_TO_10_09 = [
    pytest.param({"end": "2026-10-09"}, ("2026-10-05", "2026-10-09", 5), id="end-edit"),
    pytest.param({"duration": 5}, ("2026-10-05", "2026-10-09", 5), id="duration-edit"),
    pytest.param({"start": "2026-10-07"}, ("2026-10-07", "2026-10-09", 3), id="start-edit"),
]


@pytest.mark.parametrize(("body", "a_span"), A_END_TO_10_09)
def test_moving_a_end_cascades_through_the_chain(
    api: Api, body: Json, a_span: tuple[str, str, int]
) -> None:
    pid, a, b, c = ac12(api)

    result = api.patch(a, **body).json()

    assert result["changed_task_ids"] == [a, b, c]
    assert span(task_in(result, a)) == a_span
    assert span(task_in(result, b)) == ("2026-10-10", "2026-10-11", 2)
    assert span(task_in(result, c)) == ("2026-10-12", "2026-10-12", 1)
    assert result["project"]["schedule"]["project_end"] == "2026-10-12"
    assert result["project"]["schedule"]["critical_task_ids"] == [a, b, c]
    assert api.tasks(pid) == {t["id"]: t for t in result["project"]["tasks"]}


@pytest.mark.parametrize(("body", "a_span"), A_END_TO_10_09)
def test_successors_with_slack_do_not_move(
    api: Api, body: Json, a_span: tuple[str, str, int]
) -> None:
    pid, a, b, c = ac12(api, b_start="2026-10-12", c_start="2026-10-14")
    before = api.tasks(pid)

    result = api.patch(a, **body).json()

    assert result["changed_task_ids"] == [a]
    tasks = api.tasks(pid)
    assert span(tasks[a]) == a_span
    assert (tasks[b], tasks[c]) == (before[b], before[c])


def test_start_before_earliest_is_clamped_keeping_duration(api: Api) -> None:
    pid, a, b, c = ac12(api)

    result = api.patch(b, start="2026-10-06").json()

    assert result["changed_task_ids"] == [b]
    assert span(task_in(result, b)) == ("2026-10-08", "2026-10-09", 2)
    assert span(api.get_task(pid, b)) == ("2026-10-08", "2026-10-09", 2)


def test_left_edge_resize_before_earliest_is_clamped_keeping_end(api: Api) -> None:
    pid, a, b, c = ac12(api)
    api.patch(b, end="2026-10-11")  # B 10-08..10-11 (C is pushed to 10-12)

    result = api.patch(b, start="2026-10-06", end="2026-10-11").json()

    assert result["changed_task_ids"] == [b]
    assert span(api.get_task(pid, b)) == ("2026-10-08", "2026-10-11", 4)


def test_left_edge_resize_on_the_fixture_settles_on_earliest(api: Api) -> None:
    pid, a, b, c = ac12(api)

    api.patch(b, start="2026-10-06", end="2026-10-09")

    assert span(api.get_task(pid, b)) == ("2026-10-08", "2026-10-09", 2)


@pytest.mark.parametrize("body", [{"end": "2026-10-05"}, {"duration": 1}, {"start": "2026-10-01"}])
def test_moving_predecessor_earlier_leaves_successor_alone(api: Api, body: Json) -> None:
    pid, a, b, c = ac12(api)
    before = api.tasks(pid)

    result = api.patch(a, **body).json()

    assert result["changed_task_ids"] == [a]
    tasks = api.tasks(pid)
    assert (tasks[b], tasks[c]) == (before[b], before[c])
    assert result["project"]["schedule"]["critical_task_ids"] == [b, c]


def test_server_uses_its_own_dates_not_the_clients(api: Api) -> None:
    pid, a, b, c = ac12(api)
    api.patch(a, end="2026-10-09")  # tab 1

    result = api.patch(b, start="2026-10-08").json()  # tab 2, still showing B at 10-08

    assert result["changed_task_ids"] == [b]
    assert span(task_in(result, b)) == ("2026-10-10", "2026-10-11", 2)
    assert span(api.get_task(pid, b)) == ("2026-10-10", "2026-10-11", 2)
    assert span(api.get_task(pid, c)) == ("2026-10-12", "2026-10-12", 1)


def ac39(api: Api) -> tuple[int, int, int, int]:
    """A (10-05..Fri 10-09) -> milestone M (10-09) -> C (10-10..10-11)."""
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05", end="2026-10-09")
    m = api.task(pid, "M", "2026-10-09", is_milestone=True)
    c = api.task(pid, "C", "2026-10-10", duration=2)
    api.dep(pid, a, m)
    api.dep(pid, m, c)
    return pid, a, m, c


def test_milestone_settles_on_its_predecessors_end(api: Api) -> None:
    pid, a, m, c = ac39(api)

    result = api.patch(m, start="2026-10-08").json()

    assert result["changed_task_ids"] == [m]
    assert span(api.get_task(pid, m)) == ("2026-10-09", "2026-10-09", 0)


def test_predecessor_growth_moves_milestone_and_its_successor(api: Api) -> None:
    pid, a, m, c = ac39(api)

    result = api.patch(a, end="2026-10-12").json()

    assert result["changed_task_ids"] == [a, m, c]
    tasks = api.tasks(pid)
    assert span(tasks[m]) == ("2026-10-12", "2026-10-12", 0)
    assert span(tasks[c]) == ("2026-10-13", "2026-10-14", 2)


def test_unmarking_milestone_is_clamped_and_pushes_successors(api: Api) -> None:
    pid, a, m, c = ac39(api)

    result = api.patch(m, is_milestone=False).json()

    assert result["changed_task_ids"] == [m, c]
    tasks = api.tasks(pid)
    assert span(tasks[m]) == ("2026-10-10", "2026-10-10", 1)
    assert (tasks[m]["is_milestone"], tasks[m]["percent_complete"]) == (False, 0)
    assert span(tasks[c]) == ("2026-10-11", "2026-10-12", 2)


def test_marking_milestone_is_clamped_to_the_predecessors_end(api: Api) -> None:
    pid, a, m, c = ac39(api)
    api.patch(m, is_milestone=False)  # M 10-10, C 10-11..10-12

    api.patch(m, is_milestone=True, start="2026-10-01")

    tasks = api.tasks(pid)
    assert span(tasks[m]) == ("2026-10-09", "2026-10-09", 0)
    assert span(tasks[c]) == ("2026-10-11", "2026-10-12", 2)


@pytest.mark.parametrize("body", [{"duration": 5}, {"end": "2099-12-24"}, {"start": "2099-12-22"}])
def test_cascade_past_the_calendar_is_rejected_whole(api: Api, body: Json) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2099-12-20", duration=3)
    b = api.task(pid, "B", "2099-12-23", duration=8)
    api.dep(pid, a, b)
    before = api.detail(pid)

    error = assert_error(api.patch(a, **body), 422, "schedule_out_of_range")

    assert "2099-12-31" in error["message"]
    assert api.detail(pid) == before


def test_rows_keep_creation_order_through_cascades(api: Api) -> None:
    pid, a, b, c = ac12(api)

    api.patch(a, end="2026-11-30")
    api.patch(c, start="2027-01-01")

    assert [t["id"] for t in api.detail(pid)["tasks"]] == [a, b, c]


def test_cascaded_dates_survive_a_restart(tmp_path: Path) -> None:
    path = str(tmp_path / "g.db")
    with TestClient(create_app(path)) as first:
        pid, a, b, c = ac12(Api(first))
        Api(first).patch(a, end="2026-10-09")

    with TestClient(create_app(path)) as second:
        tasks = Api(second).tasks(pid)

    assert span(tasks[a]) == ("2026-10-05", "2026-10-09", 5)
    assert span(tasks[b]) == ("2026-10-10", "2026-10-11", 2)
    assert span(tasks[c]) == ("2026-10-12", "2026-10-12", 1)

"""Task CRUD over HTTP (C2 task POST/PATCH resolution): AC3-AC9, AC20, AC32, AC33, AC40, AC42.

`Api` and `assert_schedule_valid` are shared with the dependency and scheduling API tests.
"""

from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.main import create_app
from app.palette import PALETTE

Json = dict[str, Any]


def assert_schedule_valid(project: Json) -> None:
    """Every stored task is self-consistent and no dependency is broken (AC12 invariant)."""
    tasks = {t["id"]: t for t in project["tasks"]}
    for t in tasks.values():
        start, end = date.fromisoformat(t["start"]), date.fromisoformat(t["end"])
        if t["is_milestone"]:
            assert (t["duration"], t["percent_complete"], start) == (0, 0, end), t
        else:
            assert t["duration"] == (end - start).days + 1, t
            assert 1 <= t["duration"] <= 3650, t
    for d in project["dependencies"]:
        pred, succ = tasks[d["predecessor_id"]], tasks[d["successor_id"]]
        allowed = date.fromisoformat(pred["end"])
        if not succ["is_milestone"]:
            allowed += timedelta(days=1)
        assert date.fromisoformat(succ["start"]) >= allowed, (pred, succ)


def assert_error(response: Response, status: int, code: str) -> Json:
    assert response.status_code == status, response.text
    body: Json = response.json()
    assert set(body) == {"error"}
    error: Json = body["error"]
    assert set(error) == {"code", "message", "field"}
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    return error


class Api:
    """Thin test client: every successful mutation is checked against the invariant."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    def mutation(self, response: Response, status: int = 200) -> Json:
        assert response.status_code == status, response.text
        result: Json = response.json()
        assert set(result) == {"project", "changed_task_ids", "created_id"}
        assert_schedule_valid(result["project"])
        return result

    def project(self, name: str = "Launch") -> int:
        response = self.client.post("/api/projects", json={"name": name})
        assert response.status_code == 201, response.text
        project_id: int = response.json()["id"]
        return project_id

    def person(self, project_id: int, name: str) -> int:
        response = self.client.post(f"/api/projects/{project_id}/people", json={"name": name})
        created: int = self.mutation(response, 201)["created_id"]
        return created

    def post_task(self, project_id: int, **body: Any) -> Response:
        response = self.client.post(f"/api/projects/{project_id}/tasks", json=body)
        if response.status_code < 300:
            self.mutation(response, 201)
        return response

    def task(self, project_id: int, name: str, start: str, **body: Any) -> int:
        response = self.post_task(project_id, name=name, start=start, **body)
        assert response.status_code == 201, response.text
        created: int = response.json()["created_id"]
        return created

    def patch(self, task_id: int, **body: Any) -> Response:
        response = self.client.patch(f"/api/tasks/{task_id}", json=body)
        if response.status_code < 300:
            self.mutation(response)
        return response

    def post_dep(self, project_id: int, pred: int, succ: int) -> Response:
        response = self.client.post(
            f"/api/projects/{project_id}/dependencies",
            json={"predecessor_id": pred, "successor_id": succ},
        )
        if response.status_code < 300:
            self.mutation(response, 201)
        return response

    def dep(self, project_id: int, pred: int, succ: int) -> int:
        response = self.post_dep(project_id, pred, succ)
        assert response.status_code == 201, response.text
        created: int = response.json()["created_id"]
        return created

    def detail(self, project_id: int) -> Json:
        response = self.client.get(f"/api/projects/{project_id}")
        assert response.status_code == 200, response.text
        detail: Json = response.json()
        assert_schedule_valid(detail)
        return detail

    def tasks(self, project_id: int) -> dict[int, Json]:
        return {t["id"]: t for t in self.detail(project_id)["tasks"]}

    def get_task(self, project_id: int, task_id: int) -> Json:
        return self.tasks(project_id)[task_id]


def span(task: Json) -> tuple[str, str, int]:
    return task["start"], task["end"], task["duration"]


def task_in(result: Json, task_id: int) -> Json:
    return next(t for t in result["project"]["tasks"] if t["id"] == task_id)


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)


# --- create (C2 task POST resolution) -------------------------------------------------------


def test_create_task_computes_end_and_defaults(api: Api) -> None:
    pid = api.project()

    response = api.post_task(pid, name="  Design ", start="2026-10-05", duration=3)

    result = response.json()
    tid = result["created_id"]
    assert result["changed_task_ids"] == [tid]
    assert result["project"]["tasks"] == [
        {
            "id": tid,
            "name": "Design",
            "start": "2026-10-05",
            "end": "2026-10-07",
            "duration": 3,
            "is_milestone": False,
            "percent_complete": 0,
            "assignee_id": None,
        }
    ]
    assert result["project"]["schedule"]["project_end"] == "2026-10-07"


def test_create_task_over_a_weekend_counts_every_day(api: Api) -> None:
    pid = api.project()

    tid = api.task(pid, "Friday", "2026-10-09", duration=3)

    assert span(api.get_task(pid, tid)) == ("2026-10-09", "2026-10-11", 3)


def test_create_task_without_duration_or_end_lasts_one_day(api: Api) -> None:
    pid = api.project()

    tid = api.task(pid, "Quick", "2026-10-05")

    assert span(api.get_task(pid, tid)) == ("2026-10-05", "2026-10-05", 1)


def test_create_task_from_end_derives_duration(api: Api) -> None:
    pid = api.project()

    tid = api.task(pid, "Build", "2026-10-05", end="2026-10-07")

    assert span(api.get_task(pid, tid)) == ("2026-10-05", "2026-10-07", 3)


def test_create_task_with_progress_and_assignee(api: Api) -> None:
    pid = api.project()
    ana = api.person(pid, "Ana")

    tid = api.task(pid, "Build", "2026-10-05", percent_complete=40, assignee_id=ana)

    task = api.get_task(pid, tid)
    assert (task["percent_complete"], task["assignee_id"]) == (40, ana)


def test_create_milestone_has_zero_duration_on_its_start(api: Api) -> None:
    pid = api.project()

    tid = api.task(pid, "Go live", "2026-10-09", is_milestone=True, percent_complete=0)

    task = api.get_task(pid, tid)
    assert span(task) == ("2026-10-09", "2026-10-09", 0)
    assert (task["is_milestone"], task["percent_complete"]) == (True, 0)


@pytest.mark.parametrize(
    "extra", [{"duration": 3}, {"end": "2026-10-09"}, {"percent_complete": 10}]
)
def test_create_milestone_rejects_duration_end_and_progress(api: Api, extra: Json) -> None:
    pid = api.project()

    response = api.post_task(pid, name="M", start="2026-10-09", is_milestone=True, **extra)

    assert_error(response, 422, "milestone_field")
    assert api.tasks(pid) == {}


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"end": "2026-10-07", "duration": 3}, "duration"),
        ({"duration": 0}, "duration"),
        ({"duration": -2}, "duration"),
        ({"duration": 3.5}, "duration"),
        ({"duration": 3.0}, "duration"),
        ({"duration": "3"}, "duration"),
        ({"duration": True}, "duration"),
        ({"duration": 3651}, "duration"),
        ({"duration": None}, "duration"),
        ({"start": "2026-02-30"}, "start"),
        ({"start": "2026-2-5"}, "start"),
        ({"start": "2026-10-05T00:00"}, "start"),
        ({"start": 20261005}, "start"),
        ({"start": "1999-12-31"}, "start"),
        ({"end": "2026-2-5"}, "end"),
        ({"end": "2026-10-04"}, "end"),
        ({"start": "2099-12-30", "duration": 3}, "end"),
        ({"percent_complete": 101}, "percent_complete"),
        ({"percent_complete": -1}, "percent_complete"),
        ({"percent_complete": 40.5}, "percent_complete"),
        ({"name": ""}, "name"),
        ({"name": "   "}, "name"),
        ({"name": "x" * 101}, "name"),
        ({"is_milestone": "yes"}, "is_milestone"),
        ({"colour": "x"}, "colour"),
    ],
)
def test_create_task_rejects_invalid_input(api: Api, body: Json, field: str) -> None:
    pid = api.project()

    response = api.post_task(pid, **({"name": "T", "start": "2026-10-05"} | body))

    error = assert_error(response, 422, "invalid")
    assert error["field"] == field
    assert api.tasks(pid) == {}


def test_create_task_in_unknown_project_is_404(api: Api) -> None:
    assert_error(api.post_task(999, name="T", start="2026-10-05"), 404, "not_found")


def test_create_task_requires_name_and_start(api: Api) -> None:
    pid = api.project()

    assert_error(api.post_task(pid, name="T"), 422, "invalid")
    assert_error(api.post_task(pid, start="2026-10-05"), 422, "invalid")
    assert api.tasks(pid) == {}


# --- edit (C2 task PATCH resolution) --------------------------------------------------------


@pytest.fixture
def design(api: Api) -> tuple[int, int]:
    pid = api.project()
    return pid, api.task(pid, "Design", "2026-10-05", duration=3, percent_complete=40)


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"duration": 5}, ("2026-10-05", "2026-10-09", 5)),
        ({"start": "2026-10-07"}, ("2026-10-07", "2026-10-09", 3)),
        ({"end": "2026-10-10"}, ("2026-10-05", "2026-10-10", 6)),
        ({"start": "2026-10-06", "end": "2026-10-07"}, ("2026-10-06", "2026-10-07", 2)),
        ({"start": "2026-10-01", "duration": 2}, ("2026-10-01", "2026-10-02", 2)),
    ],
)
def test_edit_dates(api: Api, design: tuple[int, int], body: Json, expected: tuple) -> None:
    pid, tid = design

    result = api.patch(tid, **body).json()

    assert result["changed_task_ids"] == [tid]
    assert result["created_id"] is None
    assert span(task_in(result, tid)) == expected
    assert span(api.get_task(pid, tid)) == expected


def test_edit_name_and_progress_keeps_dates(api: Api, design: tuple[int, int]) -> None:
    pid, tid = design

    result = api.patch(tid, name=" Draft ", percent_complete=100).json()

    assert result["changed_task_ids"] == [tid]
    task = api.get_task(pid, tid)
    assert (task["name"], task["percent_complete"]) == ("Draft", 100)
    assert span(task) == ("2026-10-05", "2026-10-07", 3)


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"end": "2026-10-04"}, "end"),
        ({"start": "2026-10-09", "end": "2026-10-08"}, "end"),
        ({"duration": 3.5}, "duration"),
        ({"duration": "3"}, "duration"),
        ({"duration": 0}, "duration"),
        ({"duration": 3651}, "duration"),
        ({"end": "2026-10-05", "duration": 1}, "duration"),
        ({"start": "2026-02-30"}, "start"),
        ({"start": "2026-2-5"}, "start"),
        ({"end": "2026-2-5"}, "end"),
        ({"start": "1999-12-31"}, "start"),
        ({"end": "2100-01-01"}, "end"),
        ({"start": "2099-12-30"}, "end"),
        ({"start": None}, "start"),
        ({"name": ""}, "name"),
        ({"name": "  "}, "name"),
        ({"name": "x" * 101}, "name"),
        ({"percent_complete": 101}, "percent_complete"),
        ({"percent_complete": -1}, "percent_complete"),
        ({"percent_complete": 40.5}, "percent_complete"),
        ({"percent_complete": "40"}, "percent_complete"),
        ({"colour": "x"}, "colour"),
    ],
)
def test_edit_rejects_invalid_input_and_keeps_task(
    api: Api, design: tuple[int, int], body: Json, field: str
) -> None:
    pid, tid = design
    before = api.tasks(pid)

    error = assert_error(api.patch(tid, **body), 422, "invalid")

    assert error["field"] == field
    assert api.tasks(pid) == before


def test_edit_unknown_task_is_404(api: Api) -> None:
    assert_error(api.patch(999, name="X"), 404, "not_found")


def test_empty_patch_changes_nothing(api: Api, design: tuple[int, int]) -> None:
    pid, tid = design
    before = api.tasks(pid)

    assert api.patch(tid).json()["changed_task_ids"] == [tid]

    assert api.tasks(pid) == before


# --- milestones (AC7, AC33) -----------------------------------------------------------------


def test_marking_milestone_keeps_start_and_zeroes_duration_and_progress(
    api: Api, design: tuple[int, int]
) -> None:
    pid, tid = design

    result = api.patch(tid, is_milestone=True).json()

    task = task_in(result, tid)
    assert span(task) == ("2026-10-05", "2026-10-05", 0)
    assert (task["is_milestone"], task["percent_complete"]) == (True, 0)
    assert api.get_task(pid, tid) == task


def test_marking_milestone_with_a_new_start_uses_it(api: Api, design: tuple[int, int]) -> None:
    pid, tid = design

    api.patch(tid, is_milestone=True, start="2026-10-08", percent_complete=0)

    assert span(api.get_task(pid, tid)) == ("2026-10-08", "2026-10-08", 0)


@pytest.mark.parametrize(
    "body",
    [
        {"is_milestone": True, "end": "2026-10-07"},
        {"is_milestone": True, "duration": 3},
        {"is_milestone": True, "percent_complete": 10},
    ],
)
def test_marking_milestone_rejects_end_duration_and_progress(
    api: Api, design: tuple[int, int], body: Json
) -> None:
    pid, tid = design
    before = api.tasks(pid)

    assert_error(api.patch(tid, **body), 422, "milestone_field")

    assert api.tasks(pid) == before


@pytest.fixture
def milestone(api: Api) -> tuple[int, int]:
    pid = api.project()
    return pid, api.task(pid, "Go live", "2026-10-09", is_milestone=True)


@pytest.mark.parametrize(
    "body",
    [
        {"end": "2026-10-10"},
        {"duration": 2},
        {"percent_complete": 10},
        {"start": "2026-10-10", "end": "2026-10-10"},
        {"is_milestone": True, "duration": 1},
    ],
)
def test_milestone_rejects_end_duration_and_progress(
    api: Api, milestone: tuple[int, int], body: Json
) -> None:
    pid, tid = milestone
    before = api.tasks(pid)

    assert_error(api.patch(tid, **body), 422, "milestone_field")

    assert api.tasks(pid) == before


def test_milestone_start_moves_its_date(api: Api, milestone: tuple[int, int]) -> None:
    pid, tid = milestone

    result = api.patch(tid, start="2026-10-12", percent_complete=0).json()

    assert result["changed_task_ids"] == [tid]
    assert span(api.get_task(pid, tid)) == ("2026-10-12", "2026-10-12", 0)


def test_unmarking_milestone_gives_one_day_and_zero_progress(
    api: Api, milestone: tuple[int, int]
) -> None:
    pid, tid = milestone

    api.patch(tid, is_milestone=False)

    task = api.get_task(pid, tid)
    assert span(task) == ("2026-10-09", "2026-10-09", 1)
    assert (task["is_milestone"], task["percent_complete"]) == (False, 0)


def test_unmarking_milestone_can_set_duration_and_progress(
    api: Api, milestone: tuple[int, int]
) -> None:
    pid, tid = milestone

    api.patch(tid, is_milestone=False, duration=3, percent_complete=20)

    task = api.get_task(pid, tid)
    assert span(task) == ("2026-10-09", "2026-10-11", 3)
    assert task["percent_complete"] == 20


# --- progress and assignment (AC8, AC9) -----------------------------------------------------


def test_progress_forty_is_stored(api: Api, design: tuple[int, int]) -> None:
    pid, tid = design

    api.patch(tid, percent_complete=0)
    api.patch(tid, percent_complete=40)

    assert api.get_task(pid, tid)["percent_complete"] == 40


def test_assign_and_unassign(api: Api, design: tuple[int, int]) -> None:
    pid, tid = design
    ana = api.person(pid, "Ana")

    api.patch(tid, assignee_id=ana)
    assert api.get_task(pid, tid)["assignee_id"] == ana

    api.patch(tid, name="Design v2")
    assert api.get_task(pid, tid)["assignee_id"] == ana

    api.patch(tid, assignee_id=None)
    assert api.get_task(pid, tid)["assignee_id"] is None


def test_assign_to_person_of_another_project_is_422(api: Api, design: tuple[int, int]) -> None:
    pid, tid = design
    outsider = api.person(api.project("Other"), "Ana")
    before = api.tasks(pid)

    error = assert_error(api.patch(tid, assignee_id=outsider), 422, "invalid")
    assert error["field"] == "assignee_id"
    assert_error(api.patch(tid, assignee_id=9999), 422, "invalid")
    assert_error(api.patch(tid, assignee_id="1"), 422, "invalid")
    assert_error(
        api.post_task(pid, name="T", start="2026-10-05", assignee_id=outsider), 422, "invalid"
    )

    assert api.tasks(pid) == before


def test_removing_a_person_unassigns_their_tasks(
    api: Api, client: TestClient, design: tuple[int, int]
) -> None:
    pid, tid = design
    ana = api.person(pid, "Ana")
    api.patch(tid, assignee_id=ana)

    result = api.mutation(client.delete(f"/api/people/{ana}"))

    assert result["changed_task_ids"] == [tid]
    assert api.get_task(pid, tid)["assignee_id"] is None


# --- delete (AC6) ---------------------------------------------------------------------------


def test_delete_task_removes_it_and_its_dependencies(api: Api, client: TestClient) -> None:
    pid = api.project()
    a = api.task(pid, "A", "2026-10-05", duration=3)
    b = api.task(pid, "B", "2026-10-08", duration=2)
    c = api.task(pid, "C", "2026-10-10")
    api.dep(pid, a, b)
    api.dep(pid, b, c)
    api.dep(pid, a, c)
    before = api.tasks(pid)

    result = api.mutation(client.delete(f"/api/tasks/{b}"))

    assert result["changed_task_ids"] == []
    assert result["created_id"] is None
    after = api.detail(pid)
    assert [t["id"] for t in after["tasks"]] == [a, c]
    assert [(d["predecessor_id"], d["successor_id"]) for d in after["dependencies"]] == [(a, c)]
    assert api.tasks(pid) == {a: before[a], c: before[c]}


def test_delete_unknown_task_is_404(client: TestClient) -> None:
    assert_error(client.delete("/api/tasks/999"), 404, "not_found")


def test_deleting_a_project_removes_its_tasks(api: Api, client: TestClient) -> None:
    pid = api.project()
    tid = api.task(pid, "A", "2026-10-05")

    assert client.delete(f"/api/projects/{pid}").status_code == 204

    assert_error(api.patch(tid, name="B"), 404, "not_found")


# --- order and persistence (AC42, AC20) -----------------------------------------------------


def test_tasks_stay_in_creation_order_after_date_edits(api: Api) -> None:
    pid = api.project()
    ids = [api.task(pid, name, start) for name, start in [("C", "2026-10-20"), ("A", "2026-10-01")]]
    ids.append(api.task(pid, "B", "2026-10-10"))

    api.patch(ids[0], start="2026-09-01")
    api.patch(ids[2], start="2026-12-01")

    assert [t["id"] for t in api.detail(pid)["tasks"]] == ids
    assert ids == sorted(ids)


def test_everything_survives_a_restart(tmp_path: Path) -> None:
    path = str(tmp_path / "g.db")
    with TestClient(create_app(path)) as first:
        api = Api(first)
        pid = api.project()
        ana = api.person(pid, "Ana")
        a = api.task(pid, "A", "2026-10-05", duration=3, percent_complete=40, assignee_id=ana)
        m = api.task(pid, "M", "2026-10-07", is_milestone=True)
        b = api.task(pid, "B", "2026-10-06", duration=2)
        api.dep(pid, a, m)
        api.dep(pid, m, b)
        before = api.detail(pid)

    with TestClient(create_app(path)) as second:
        after = Api(second).detail(pid)

    assert after == before
    assert after["people"] == [{"id": ana, "name": "Ana", "colour": PALETTE[0].fill}]
    tasks = {t["id"]: t for t in after["tasks"]}
    assert span(tasks[b]) == ("2026-10-08", "2026-10-09", 2)
    assert tasks[a]["assignee_id"] == ana
    assert tasks[m]["is_milestone"] is True

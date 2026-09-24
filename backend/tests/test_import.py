"""JSON import (AC23, AC24, AC40): validate everything, adjust nothing, always a new project."""

import copy
import json
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.transfer.naming import unique_import_name
from tests.test_export import GOLDEN, build_launch, export
from tests.test_tasks_api import Api, Json, assert_error, assert_schedule_valid

MAX_BYTES = 5 * 1024 * 1024


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)


def golden_doc() -> Json:
    doc: Json = json.loads(GOLDEN.read_bytes())
    return doc


def encode(doc: Any) -> bytes:
    return json.dumps(doc, indent=2, ensure_ascii=False).encode()


def post_import(client: TestClient, body: bytes) -> Response:
    return client.post("/api/import", content=body, headers={"content-type": "application/json"})


def import_ok(client: TestClient, doc: Any) -> Json:
    response = post_import(client, encode(doc))
    assert response.status_code == 201, response.text
    detail: Json = response.json()
    assert set(detail) == {"id", "name", "people", "tasks", "dependencies", "schedule"}
    assert_schedule_valid(detail)
    return detail


def project_names(client: TestClient) -> list[str]:
    return [p["name"] for p in client.get("/api/projects").json()]


# --- successful imports -------------------------------------------------------------------


def test_import_creates_the_project_described_by_the_file(api: Api) -> None:
    detail = import_ok(api.client, golden_doc())

    assert detail["name"] == "Launch"
    people = {p["id"]: p for p in detail["people"]}
    assert [(p["name"], p["colour"]) for p in detail["people"]] == [
        ("Ana", "#ea580c"),
        ("Ben", "#2563eb"),
    ]
    tasks = detail["tasks"]
    assert [
        (
            t["name"],
            t["start"],
            t["end"],
            t["duration"],
            t["is_milestone"],
            t["percent_complete"],
            None if t["assignee_id"] is None else people[t["assignee_id"]]["name"],
        )
        for t in tasks
    ] == [
        ("Design", "2026-10-05", "2026-10-07", 3, False, 40, "Ana"),
        ("Café build", "2026-10-08", "2026-10-09", 2, False, 0, "Ben"),
        ("Review", "2026-10-09", "2026-10-09", 0, True, 0, None),
        ("Ship", "2026-10-12", "2026-10-12", 1, False, 100, "Ana"),
    ]
    names = {t["id"]: t["name"] for t in tasks}
    assert sorted(
        (names[d["predecessor_id"]], names[d["successor_id"]]) for d in detail["dependencies"]
    ) == sorted(
        [
            ("Design", "Café build"),
            ("Design", "Review"),
            ("Café build", "Review"),
            ("Review", "Ship"),
        ]
    )
    assert detail["schedule"]["project_end"] == "2026-10-12"
    assert api.detail(detail["id"]) == detail


def test_import_accepts_any_unique_keys_and_keeps_file_order(api: Api) -> None:
    doc = {
        "format": "hg-gantt",
        "version": 1,
        "project": {"name": "  Keys  "},
        "people": [{"key": "ana", "name": " Ana ", "colour": "#16a34a"}],
        "tasks": [
            {
                "key": "late",
                "name": "Late",
                "start": "2026-12-01",
                "end": "2026-12-01",
                "duration": 1,
                "milestone": False,
                "percent_complete": 0,
                "assignee": "ana",
                "predecessors": ["early"],
            },
            {
                "key": "early",
                "name": "Early",
                "start": "2026-10-01",
                "end": "2026-10-02",
                "duration": 2,
                "milestone": False,
                "percent_complete": 0,
                "assignee": None,
                "predecessors": [],
            },
        ],
    }

    detail = import_ok(api.client, doc)

    assert detail["name"] == "Keys"
    assert [p["name"] for p in detail["people"]] == ["Ana"]
    assert [t["name"] for t in detail["tasks"]] == ["Late", "Early"]
    late, early = detail["tasks"]
    assert late["assignee_id"] == detail["people"][0]["id"]
    assert [(d["predecessor_id"], d["successor_id"]) for d in detail["dependencies"]] == [
        (early["id"], late["id"])
    ]


def test_import_of_a_file_of_exactly_5_mb_is_accepted(api: Api) -> None:
    body = GOLDEN.read_bytes()
    body += b" " * (MAX_BYTES - len(body))

    response = post_import(api.client, body)

    assert response.status_code == 201, response.text


# --- AC23: every rejected file writes nothing ---------------------------------------------

Mutate = Callable[[Json], Any]


def _set(path: str, value: Any) -> Mutate:
    """A mutator that sets a dotted path such as "tasks.1.start" (list indices are ints)."""

    def mutate(doc: Json) -> Json:
        *parents, last = path.split(".")
        node: Any = doc
        for part in parents:
            node = node[int(part)] if isinstance(node, list) else node[part]
        if isinstance(node, list):
            node[int(last)] = value
        else:
            node[last] = value
        return doc

    return mutate


def _drop(path: str) -> Mutate:
    def mutate(doc: Json) -> Json:
        *parents, last = path.split(".")
        node: Any = doc
        for part in parents:
            node = node[int(part)] if isinstance(node, list) else node[part]
        del node[last]
        return doc

    return mutate


def _both(*mutators: Mutate) -> Mutate:
    def mutate(doc: Json) -> Any:
        for m in mutators:
            doc = m(doc)
        return doc

    return mutate


def _duplicate_task_key(doc: Json) -> Json:
    doc["tasks"][1]["key"] = "t1"
    return doc


def _duplicate_person_key(doc: Json) -> Json:
    doc["people"][1]["key"] = "p1"
    return doc


def _long_duration(doc: Json) -> Json:
    start = date(2000, 1, 1)
    doc["tasks"][0].update(
        start=start.isoformat(), end=(start + timedelta(days=3650)).isoformat(), duration=3651
    )
    return doc


INVALID: list[Any] = [
    pytest.param(lambda d: [d], "must be a JSON object", id="not-an-object"),
    pytest.param(_set("format", "other"), 'format "hg-gantt"', id="wrong-format"),
    pytest.param(_set("version", 2), "unknown format version 2", id="version-2"),
    pytest.param(_set("version", True), "unknown format version", id="version-bool"),
    pytest.param(_drop("tasks"), 'missing "tasks"', id="missing-tasks"),
    pytest.param(_set("extra", 1), 'unknown field "extra"', id="unknown-top-field"),
    pytest.param(_set("people", {}), '"people" must be a list', id="people-not-list"),
    pytest.param(_drop("tasks.0.assignee"), 'missing "assignee"', id="task-missing-field"),
    pytest.param(_set("tasks.0.colour", "x"), 'unknown field "colour"', id="task-unknown-field"),
    pytest.param(_set("tasks.1.predecessors", ["t9"]), 'unknown task "t9"', id="missing-task-ref"),
    pytest.param(_set("tasks.0.assignee", "p9"), 'unknown person "p9"', id="missing-person-ref"),
    pytest.param(_set("tasks.0.predecessors", ["t4"]), "cycle", id="cycle"),
    pytest.param(_set("tasks.1.predecessors", ["t1", "t2"]), "depend on itself", id="self"),
    pytest.param(
        _set("tasks.1.predecessors", ["t1", "t1"]), 'lists predecessor "t1" twice', id="dup-dep"
    ),
    pytest.param(
        _both(_set("tasks.1.start", "2026-10-07"), _set("tasks.1.end", "2026-10-08")),
        'Task "t2" ("Café build") starts 2026-10-07, before its earliest allowed start 2026-10-08',
        id="early-start",
    ),
    pytest.param(
        _set("tasks.0.end", "2026-10-08"),
        "end 2026-10-08 is not start + duration - 1",
        id="end-mismatch",
    ),
    pytest.param(
        _set("tasks.2.end", "2026-10-10"), "milestone must end on its start", id="milestone-span"
    ),
    pytest.param(
        _set("tasks.2.duration", 1), "milestone must have duration 0", id="milestone-duration"
    ),
    pytest.param(
        _set("tasks.2.percent_complete", 10),
        "milestone must have % complete 0",
        id="milestone-percent",
    ),
    pytest.param(_set("people.0.colour", "#123456"), "not in the palette", id="bad-colour"),
    pytest.param(_set("project.name", "   "), "Project name must not be empty", id="empty-project"),
    pytest.param(
        _set("project.name", "x" * 101), "Project name must be at most 100", id="long-project"
    ),
    pytest.param(_set("project", "Launch"), '"project" must be an object', id="project-not-obj"),
    pytest.param(_duplicate_task_key, 'duplicate task key "t1"', id="dup-task-key"),
    pytest.param(_duplicate_person_key, 'duplicate person key "p1"', id="dup-person-key"),
    pytest.param(_set("tasks.0.key", ""), "key must be non-empty text", id="empty-task-key"),
    pytest.param(_set("tasks.0.duration", True), "duration must be a whole number", id="dur-bool"),
    pytest.param(_set("tasks.0.milestone", 0), "milestone must be true or false", id="ms-int"),
    pytest.param(_set("tasks.0.start", "2026-02-30"), "start must be a real date", id="bad-date"),
    pytest.param(_set("tasks.0.start", "2026-2-5"), "start must be a real date", id="malformed"),
    pytest.param(_set("tasks.0.end", 20261007), "end must be a real date", id="date-not-text"),
    pytest.param(
        _set("tasks.0.start", "1999-12-31"),
        "start must be from 2000-01-01 to 2099-12-31",
        id="before-2000",
    ),
    pytest.param(
        _set("tasks.0.end", "2100-01-01"),
        "end must be from 2000-01-01 to 2099-12-31",
        id="after-2099",
    ),
    pytest.param(_long_duration, "duration must be from 1 to 3650", id="duration-3651"),
    pytest.param(_set("tasks.0.duration", 0), "duration must be from 1 to 3650", id="duration-0"),
    pytest.param(_set("tasks.0.duration", 3.5), "duration must be a whole number", id="dur-3.5"),
    pytest.param(
        _set("tasks.0.end", "2026-10-04"), "end 2026-10-04 is before its start", id="end-lt-start"
    ),
    pytest.param(_set("tasks.0.percent_complete", 101), "from 0 to 100", id="percent-101"),
    pytest.param(_set("tasks.0.percent_complete", 40.5), "from 0 to 100", id="percent-40.5"),
    pytest.param(_set("tasks.0.name", ""), "Task name must not be empty", id="empty-task-name"),
    pytest.param(_set("tasks.0.name", "x" * 101), "Task name must be at most 100", id="long-task"),
    pytest.param(_set("people.0.name", " "), "Person name must not be empty", id="empty-person"),
    pytest.param(
        _set("people.1.name", "ana"), 'name "ana" matches another person', id="dup-person-name"
    ),
]


@pytest.mark.parametrize(("mutate", "problem"), INVALID)
def test_invalid_file_is_rejected_naming_the_problem(
    api: Api, mutate: Mutate, problem: str
) -> None:
    existing = build_launch(api)
    before_names = project_names(api.client)
    before_export = export(api.client, existing)

    response = post_import(api.client, encode(mutate(copy.deepcopy(golden_doc()))))

    error = assert_error(response, 422, "import_invalid")
    assert problem in error["message"]
    assert project_names(api.client) == before_names
    assert export(api.client, existing) == before_export


@pytest.mark.parametrize(
    "body",
    [
        pytest.param(b'{"format": "hg-gantt",', id="truncated"),
        pytest.param(b"", id="empty"),
        pytest.param(b"\xff\xfe{}", id="not-utf8"),
        pytest.param(b'{"version": NaN}', id="nan"),
        pytest.param(b'{"version": 1, "version": 1}', id="duplicate-json-key"),
        pytest.param(b"[" * 100_000 + b"]" * 100_000, id="too-deep"),
    ],
)
def test_malformed_file_is_rejected(api: Api, body: bytes) -> None:
    before = project_names(api.client)

    error = assert_error(post_import(api.client, body), 400, "import_malformed")

    assert "not valid JSON" in error["message"]
    assert project_names(api.client) == before


def test_file_over_5_mb_is_rejected(api: Api) -> None:
    body = GOLDEN.read_bytes()
    body += b" " * (MAX_BYTES + 1 - len(body))
    before = project_names(api.client)

    error = assert_error(post_import(api.client, body), 413, "import_too_large")

    assert "5 MB" in error["message"]
    assert project_names(api.client) == before


def test_file_over_5_mb_is_rejected_when_streamed_without_a_length(api: Api) -> None:
    def chunks() -> Any:
        for _ in range(6):
            yield b" " * (1024 * 1024)

    response = api.client.post(
        "/api/import", content=chunks(), headers={"content-type": "application/json"}
    )

    assert_error(response, 413, "import_too_large")
    assert project_names(api.client) == []


@pytest.mark.parametrize(
    "content_type",
    [
        pytest.param("text/plain", id="text-plain"),
        pytest.param("application/x-www-form-urlencoded", id="form"),
        pytest.param("multipart/form-data; boundary=x", id="multipart"),
        pytest.param("application/jsonx", id="json-lookalike"),
        pytest.param(None, id="missing"),
    ],
)
def test_import_refuses_a_body_that_is_not_declared_as_json(
    api: Api, content_type: str | None
) -> None:
    """A cross-site "simple" POST (text/plain, form) must not create a project (CR2)."""
    headers = {} if content_type is None else {"content-type": content_type}
    before = project_names(api.client)

    response = api.client.post("/api/import", content=GOLDEN.read_bytes(), headers=headers)

    error = assert_error(response, 415, "unsupported_media_type")
    assert "application/json" in error["message"]
    assert project_names(api.client) == before


@pytest.mark.parametrize(
    "content_type",
    ["application/json", "application/json; charset=utf-8", "Application/JSON ; charset=UTF-8"],
)
def test_import_accepts_json_with_or_without_a_charset(api: Api, content_type: str) -> None:
    response = api.client.post(
        "/api/import", content=GOLDEN.read_bytes(), headers={"content-type": content_type}
    )

    assert response.status_code == 201, response.text
    assert project_names(api.client) == ["Launch"]


def test_importer_never_adjusts_dates_even_when_a_push_would_fix_them(api: Api) -> None:
    doc = golden_doc()
    doc["tasks"][3].update(start="2026-10-09", end="2026-10-09")  # Ship before Review allows

    error = assert_error(post_import(api.client, encode(doc)), 422, "import_invalid")

    assert "before its earliest allowed start 2026-10-10" in error["message"]
    assert project_names(api.client) == []


# --- AC24: always a new project with a free name ------------------------------------------


def test_clashing_names_get_the_first_free_suffix(api: Api) -> None:
    names = [import_ok(api.client, golden_doc())["name"] for _ in range(3)]

    assert names == ["Launch", "Launch (2)", "Launch (3)"]


def test_suffix_ignores_case_and_fills_the_first_gap(api: Api) -> None:
    api.project("launch")
    api.project("Launch (3)")

    assert import_ok(api.client, golden_doc())["name"] == "Launch (2)"


def test_suffix_is_added_to_the_name_as_written(api: Api) -> None:
    api.project("Launch (2)")
    doc = golden_doc()
    doc["project"]["name"] = "Launch (2)"

    assert import_ok(api.client, doc)["name"] == "Launch (2) (2)"


def test_long_names_are_shortened_to_fit_the_suffix(api: Api) -> None:
    long_name = "L" * 100
    api.project(long_name)
    doc = golden_doc()
    doc["project"]["name"] = long_name

    name = import_ok(api.client, doc)["name"]

    assert name == "L" * 96 + " (2)"
    assert len(name) == 100


def test_shortening_removes_spaces_left_at_the_cut_before_the_suffix(api: Api) -> None:
    """D16: cut just enough for the suffix, then trim the trailing spaces the cut exposed."""
    long_name = "x" * 93 + "   " + "tail"  # 100 chars; keeping 96 leaves "x" * 93 + "   "
    api.project(long_name)
    doc = golden_doc()
    doc["project"]["name"] = long_name

    name = import_ok(api.client, doc)["name"]

    assert name == "x" * 93 + " (2)"


def test_existing_projects_are_never_modified(api: Api) -> None:
    existing = build_launch(api)
    before = export(api.client, existing)

    imported = import_ok(api.client, golden_doc())

    assert imported["id"] != existing
    assert export(api.client, existing) == before
    assert project_names(api.client) == ["Other", "Launch", "Launch (2)"]


@pytest.mark.parametrize(
    ("name", "existing", "expected"),
    [
        ("Launch", set(), "Launch"),
        ("Launch", {"launch"}, "Launch (2)"),
        ("Launch", {"launch", "launch (2)"}, "Launch (3)"),
        ("Launch (2)", {"launch (2)"}, "Launch (2) (2)"),
        ("A" * 100, {"a" * 100}, "A" * 96 + " (2)"),
        ("A" * 95 + " " + "B" * 4, {("a" * 95 + " " + "b" * 4)}, "A" * 95 + " (2)"),
        ("A" * 99, {"a" * 99, "a" * 96 + " (2)"}, "A" * 96 + " (3)"),
        ("x" * 100, {"x" * 100} | {"x" * 96 + f" ({n})" for n in range(2, 10)}, "x" * 95 + " (10)"),
    ],
)
def test_unique_import_name(name: str, existing: set[str], expected: str) -> None:
    result = unique_import_name(name, existing)

    assert result == expected
    assert len(result) <= 100

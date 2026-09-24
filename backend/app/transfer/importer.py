"""Import validation (C5, AC23, AC40): accept a file exactly as written, or name its first problem.

The importer never adjusts anything to make a file valid. A task that starts before its
predecessors allow is an error here, not something to push later.
"""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any, NoReturn

from app.errors import ApiError
from app.names import clean_name, name_key
from app.palette import is_palette_colour
from app.scheduling.dates import (
    MAX_DATE,
    MAX_DURATION,
    MIN_DATE,
    DateFormatError,
    end_from,
    format_iso,
    parse_iso_date,
)
from app.scheduling.engine import STask, allowed_from
from app.transfer.export import FORMAT, VERSION

_TOP_FIELDS = ("format", "version", "project", "people", "tasks")
_PROJECT_FIELDS = ("name",)
_PERSON_FIELDS = ("key", "name", "colour")
_TASK_FIELDS = (
    "key",
    "name",
    "start",
    "end",
    "duration",
    "milestone",
    "percent_complete",
    "assignee",
    "predecessors",
)
_DATE_RANGE = f"{format_iso(MIN_DATE)} to {format_iso(MAX_DATE)}"


class ImportMalformed(Exception):
    """The bytes are not a JSON document at all."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ImportInvalid(Exception):
    """The JSON is readable but breaks a rule; `message` names the first problem."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class ValidPerson:
    key: str
    name: str
    colour: str


@dataclass(frozen=True)
class ValidTask:
    key: str
    name: str
    start: date
    end: date
    duration: int
    milestone: bool
    percent: int
    assignee: str | None
    predecessors: tuple[str, ...]


@dataclass(frozen=True)
class ValidDoc:
    project_name: str
    people: tuple[ValidPerson, ...]
    tasks: tuple[ValidTask, ...]


def parse_json(body: bytes) -> object:
    """Decode UTF-8 JSON strictly: no NaN/Infinity and no repeated keys in an object."""
    try:
        text = body.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportMalformed("The file is not valid JSON: it is not UTF-8 text.") from exc
    try:
        return json.loads(text, object_pairs_hook=_unique_pairs, parse_constant=_no_constants)
    except json.JSONDecodeError as exc:
        raise ImportMalformed(
            f"The file is not valid JSON: {exc.msg} (line {exc.lineno}, column {exc.colno})."
        ) from exc
    except RecursionError as exc:
        raise ImportMalformed("The file is not valid JSON: it is nested too deeply.") from exc
    except ValueError as exc:
        raise ImportMalformed(f"The file is not valid JSON: {exc}.") from exc


def _unique_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'the key "{key}" appears twice in one object')
        result[key] = value
    return result


def _no_constants(name: str) -> NoReturn:
    raise ValueError(f"{name} is not allowed")


def validate(doc: object) -> ValidDoc:
    """Check the whole file in a fixed order and raise `ImportInvalid` for the first problem."""
    if not isinstance(doc, dict):
        _fail("The file must be a JSON object.")
    if doc.get("format") != FORMAT:
        _fail(f'This is not a Gantt export: expected format "{FORMAT}".')
    version = doc.get("version")
    if type(version) is not int or version != VERSION:
        _fail(
            f"The file has an unknown format version {json.dumps(version)};"
            f" only version {VERSION} can be imported."
        )
    _check_fields(doc, _TOP_FIELDS, "The file")

    project_name = _project_name(doc["project"])
    people = _people(doc["people"])
    tasks = _tasks(doc["tasks"], {p.key for p in people})
    _check_acyclic(tasks)
    _check_earliest_starts(tasks)
    return ValidDoc(project_name=project_name, people=people, tasks=tasks)


def _fail(message: str) -> NoReturn:
    raise ImportInvalid(message)


def _check_fields(obj: Mapping[str, Any], fields: Sequence[str], where: str) -> None:
    for field in fields:
        if field not in obj:
            _fail(f'{where} is missing "{field}".')
    for field in obj:
        if field not in fields:
            _fail(f'{where} has an unknown field "{field}".')


def _name(raw: object, what: str, where: str | None = None) -> str:
    """`names.clean_name`, with its message re-raised as an import problem."""
    try:
        return clean_name(raw, what)
    except ApiError as exc:
        _fail(exc.message if where is None else f"{where}: {exc.message}")


def _list(value: object, what: str) -> list[Any]:
    if not isinstance(value, list):
        _fail(f"{what} must be a list.")
    return value


def _key(entry: object, what: str, position: int) -> str:
    if not isinstance(entry, dict):
        _fail(f"{what} {position} must be an object.")
    key = entry.get("key")
    if not isinstance(key, str) or not key:
        _fail(f"{what} {position}: key must be non-empty text.")
    return key


def _project_name(project: object) -> str:
    if not isinstance(project, dict):
        _fail('"project" must be an object.')
    _check_fields(project, _PROJECT_FIELDS, "The project")
    return _name(project["name"], "Project name")


def _people(raw: object) -> tuple[ValidPerson, ...]:
    people: list[ValidPerson] = []
    keys: set[str] = set()
    names: dict[str, str] = {}
    for position, entry in enumerate(_list(raw, '"people"'), start=1):
        key = _key(entry, "Person", position)
        if key in keys:
            _fail(f'The file has a duplicate person key "{key}".')
        keys.add(key)
        where = f'Person "{key}"'
        _check_fields(entry, _PERSON_FIELDS, where)
        name = _name(entry["name"], "Person name", where)
        other = names.get(name_key(name))
        if other is not None:
            _fail(f'{where}: name "{name}" matches another person ("{other}").')
        names[name_key(name)] = name
        colour = entry["colour"]
        if not is_palette_colour(colour):
            _fail(f"{where}: colour {json.dumps(colour)} is not in the palette.")
        people.append(ValidPerson(key=key, name=name, colour=colour))
    return tuple(people)


def _tasks(raw: object, person_keys: set[str]) -> tuple[ValidTask, ...]:
    entries = _list(raw, '"tasks"')
    keys: set[str] = set()
    for position, entry in enumerate(entries, start=1):
        key = _key(entry, "Task", position)
        if key in keys:
            _fail(f'The file has a duplicate task key "{key}".')
        keys.add(key)
    return tuple(_task(entry, keys, person_keys) for entry in entries)


def _date(value: object, field: str, label: str) -> date:
    try:
        parsed = parse_iso_date(value)
    except DateFormatError:
        _fail(f"{label}: {field} must be a real date in YYYY-MM-DD form, got {json.dumps(value)}.")
    if not MIN_DATE <= parsed <= MAX_DATE:
        _fail(f"{label}: {field} must be from {_DATE_RANGE}, got {format_iso(parsed)}.")
    return parsed


def _task(entry: dict[str, Any], task_keys: set[str], person_keys: set[str]) -> ValidTask:
    key: str = entry["key"]
    _check_fields(entry, _TASK_FIELDS, f'Task "{key}"')
    name = _name(entry["name"], "Task name", f'Task "{key}"')
    label = f'Task "{key}" ("{name}")'

    milestone = entry["milestone"]
    if type(milestone) is not bool:
        _fail(f"{label}: milestone must be true or false, got {json.dumps(milestone)}.")
    start = _date(entry["start"], "start", label)
    end = _date(entry["end"], "end", label)
    duration = entry["duration"]
    if type(duration) is not int:
        _fail(f"{label}: duration must be a whole number, got {json.dumps(duration)}.")
    percent = entry["percent_complete"]
    if type(percent) is not int or not 0 <= percent <= 100:
        _fail(
            f"{label}: % complete must be a whole number from 0 to 100, got {json.dumps(percent)}."
        )

    if milestone:
        if end != start:
            _fail(f"{label}: a milestone must end on its start date.")
        if duration != 0:
            _fail(f"{label}: a milestone must have duration 0, got {duration}.")
        if percent != 0:
            _fail(f"{label}: a milestone must have % complete 0, got {percent}.")
    else:
        if end < start:
            _fail(f"{label}: end {format_iso(end)} is before its start {format_iso(start)}.")
        if not 1 <= duration <= MAX_DURATION:
            _fail(f"{label}: duration must be from 1 to {MAX_DURATION} days, got {duration}.")
        expected = end_from(start, duration)
        if end != expected:
            _fail(
                f"{label}: end {format_iso(end)} is not start + duration - 1"
                f" ({format_iso(expected)})."
            )

    assignee = entry["assignee"]
    if assignee is not None:
        if not isinstance(assignee, str):
            _fail(f"{label}: assignee must be a person key or null.")
        if assignee not in person_keys:
            _fail(f'{label}: assignee refers to unknown person "{assignee}".')

    predecessors: list[str] = []
    for pred in _list(entry["predecessors"], f"{label}: predecessors"):
        if not isinstance(pred, str):
            _fail(f"{label}: predecessors must be task keys.")
        if pred == key:
            _fail(f"{label} cannot depend on itself.")
        if pred not in task_keys:
            _fail(f'{label} lists unknown task "{pred}" as a predecessor.')
        if pred in predecessors:
            _fail(f'{label} lists predecessor "{pred}" twice.')
        predecessors.append(pred)

    return ValidTask(
        key=key,
        name=name,
        start=start,
        end=end,
        duration=duration,
        milestone=milestone,
        percent=percent,
        assignee=assignee,
        predecessors=tuple(predecessors),
    )


def _check_acyclic(tasks: Sequence[ValidTask]) -> None:
    """Depth-first search in file order; the first link back into the current path is reported."""
    successors: dict[str, list[str]] = {t.key: [] for t in tasks}
    for task in tasks:
        for pred in task.predecessors:
            successors[pred].append(task.key)
    on_path: set[str] = set()
    done: set[str] = set()
    for root in successors:
        if root in done:
            continue
        stack = [(root, iter(successors[root]))]
        on_path.add(root)
        while stack:
            node, pending = stack[-1]
            nxt = next(pending, None)
            if nxt is None:
                stack.pop()
                on_path.discard(node)
                done.add(node)
            elif nxt in on_path:
                _fail(f'The dependency "{node}" -> "{nxt}" creates a cycle.')
            elif nxt not in done:
                on_path.add(nxt)
                stack.append((nxt, iter(successors[nxt])))


def _check_earliest_starts(tasks: Sequence[ValidTask]) -> None:
    by_key = {
        t.key: STask(id=i, start=t.start, end=t.end, milestone=t.milestone)
        for i, t in enumerate(tasks, start=1)
    }
    for task in tasks:
        if not task.predecessors:
            continue
        earliest = max(allowed_from(by_key[p], task.milestone) for p in task.predecessors)
        if task.start < earliest:
            _fail(
                f'Task "{task.key}" ("{task.name}") starts {format_iso(task.start)},'
                f" before its earliest allowed start {format_iso(earliest)}."
            )

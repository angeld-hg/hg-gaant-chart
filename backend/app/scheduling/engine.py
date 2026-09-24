"""Finish-to-start scheduling: clamp, push-only cascade and the milestone rule."""

import heapq
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta
from typing import Literal

from app.scheduling.dates import MAX_DATE, inclusive_days

Dep = tuple[int, int]  # (predecessor_id, successor_id)
Anchor = Literal["keep_duration", "keep_end"]

_ONE_DAY = timedelta(days=1)


@dataclass(frozen=True)
class STask:
    id: int
    start: date
    end: date
    milestone: bool

    @property
    def duration(self) -> int:
        return 0 if self.milestone else inclusive_days(self.start, self.end)


class ScheduleOutOfRange(Exception):
    """The cascade would push a task's end past MAX_DATE (AC40)."""

    def __init__(self, task_id: int) -> None:
        super().__init__(f"task {task_id} would end after {MAX_DATE.isoformat()}")
        self.task_id = task_id


@dataclass(frozen=True)
class RescheduleResult:
    tasks: dict[int, STask]
    changed: list[int]  # ids (ascending) whose start or end differ from the input map


def allowed_from(pred: STask, succ_is_milestone: bool) -> date:
    """Earliest start the predecessor alone allows: its end day for a milestone (AC39)."""
    return pred.end if succ_is_milestone else pred.end + _ONE_DAY


def earliest_allowed(task_id: int, tasks: Mapping[int, STask], deps: Sequence[Dep]) -> date | None:
    is_milestone = tasks[task_id].milestone
    candidates = [allowed_from(tasks[pred], is_milestone) for pred, succ in deps if succ == task_id]
    return max(candidates, default=None)


def creates_cycle(deps: Sequence[Dep], pred: int, succ: int) -> bool:
    """True if adding pred -> succ would close a loop (including pred == succ)."""
    if pred == succ:
        return True
    successors = _successor_lists(deps)
    seen = {succ}
    stack = [succ]
    while stack:
        current = stack.pop()
        for nxt in successors.get(current, ()):
            if nxt == pred:
                return True
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return False


def reschedule(
    tasks: Mapping[int, STask],
    deps: Sequence[Dep],
    edited: STask | None = None,
    anchor: Anchor = "keep_duration",
) -> RescheduleResult:
    """Apply `edited`, then push every task that starts too early, in topological order.

    Tasks are never moved earlier. A pushed task keeps its duration, except the edited
    task under `keep_end` (a left-edge resize), which keeps its end where possible.
    """
    result = dict(tasks)
    if edited is not None:
        if edited.id not in result:
            raise KeyError(f"edited task {edited.id} is not in the schedule")
        result[edited.id] = edited

    predecessors: dict[int, list[int]] = {}
    for pred, succ in deps:
        predecessors.setdefault(succ, []).append(pred)

    for task_id in topological_order(result.keys(), deps):
        current = result[task_id]
        preds = predecessors.get(task_id)
        if not preds:
            continue
        earliest = max(allowed_from(result[p], current.milestone) for p in preds)
        if current.start >= earliest:
            continue
        is_left_edge_resize = (
            edited is not None
            and task_id == edited.id
            and anchor == "keep_end"
            and not current.milestone
        )
        if is_left_edge_resize:
            result[task_id] = replace(current, start=earliest, end=max(current.end, earliest))
            continue
        shift = earliest - current.start
        result[task_id] = replace(current, start=earliest, end=current.end + shift)

    for task_id in sorted(result):
        if result[task_id].end > MAX_DATE:
            raise ScheduleOutOfRange(task_id)

    changed = [
        task_id
        for task_id in sorted(result)
        if (result[task_id].start, result[task_id].end)
        != (tasks[task_id].start, tasks[task_id].end)
    ]
    return RescheduleResult(tasks=result, changed=changed)


def topological_order(task_ids: Iterable[int], deps: Sequence[Dep]) -> list[int]:
    """Kahn's algorithm; among ready tasks the smallest id goes first, so it is deterministic.

    Raises ValueError if the dependencies contain a cycle.
    """
    ids = sorted(task_ids)
    in_degree = dict.fromkeys(ids, 0)
    for _, succ in deps:
        in_degree[succ] += 1
    successors = _successor_lists(deps)

    ready = [task_id for task_id, degree in in_degree.items() if degree == 0]
    heapq.heapify(ready)
    order: list[int] = []
    while ready:
        current = heapq.heappop(ready)
        order.append(current)
        for nxt in successors.get(current, ()):
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                heapq.heappush(ready, nxt)

    if len(order) != len(ids):
        raise ValueError("dependencies contain a cycle")
    return order


def _successor_lists(deps: Sequence[Dep]) -> dict[int, list[int]]:
    successors: dict[int, list[int]] = {}
    for pred, succ in deps:
        successors.setdefault(pred, []).append(succ)
    return successors

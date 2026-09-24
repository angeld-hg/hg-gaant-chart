from collections.abc import Mapping, Sequence
from datetime import date

import pytest

from app.scheduling.dates import MAX_DATE
from app.scheduling.engine import (
    Dep,
    ScheduleOutOfRange,
    STask,
    allowed_from,
    creates_cycle,
    earliest_allowed,
    reschedule,
    topological_order,
)

A, B, C, M = 1, 2, 3, 4


def d(month: int, day: int, year: int = 2026) -> date:
    return date(year, month, day)


def task(task_id: int, start: date, end: date, milestone: bool = False) -> STask:
    return STask(id=task_id, start=start, end=end, milestone=milestone)


def as_map(*tasks: STask) -> dict[int, STask]:
    return {t.id: t for t in tasks}


def span(t: STask) -> tuple[date, date]:
    return (t.start, t.end)


def assert_no_broken_dependency(tasks: Mapping[int, STask], deps: Sequence[Dep]) -> None:
    for pred, succ in deps:
        successor = tasks[succ]
        assert successor.start >= allowed_from(tasks[pred], successor.milestone)


# AC12 fixture: A (10-05..10-07) -> B (10-08..10-09) -> C (10-10..10-10)
AC12_TASKS = as_map(
    task(A, d(10, 5), d(10, 7)),
    task(B, d(10, 8), d(10, 9)),
    task(C, d(10, 10), d(10, 10)),
)
CHAIN: list[Dep] = [(A, B), (B, C)]


def test_duration_is_inclusive_days_and_zero_for_milestones() -> None:
    assert task(A, d(10, 5), d(10, 7)).duration == 3
    assert task(A, d(10, 5), d(10, 5)).duration == 1
    assert task(M, d(10, 9), d(10, 9), milestone=True).duration == 0


def test_allowed_from_is_next_day_for_tasks_and_same_day_for_milestones() -> None:
    pred = task(A, d(10, 5), d(10, 9))

    assert allowed_from(pred, succ_is_milestone=False) == d(10, 10)
    assert allowed_from(pred, succ_is_milestone=True) == d(10, 9)


def test_earliest_allowed_is_max_over_predecessors_or_none() -> None:
    tasks = as_map(
        task(A, d(10, 5), d(10, 7)),
        task(B, d(10, 1), d(10, 9)),
        task(C, d(10, 12), d(10, 12)),
    )
    deps: list[Dep] = [(A, C), (B, C)]

    assert earliest_allowed(C, tasks, deps) == d(10, 10)
    assert earliest_allowed(A, tasks, deps) is None


@pytest.mark.parametrize(
    ("edited", "anchor"),
    [
        # A's end moves to 10-09 by a duration/end edit (start kept)...
        (task(A, d(10, 5), d(10, 9)), "keep_duration"),
        # ...or by a right-edge resize
        (task(A, d(10, 5), d(10, 9)), "keep_end"),
        # ...or by a start edit / drag that keeps the duration
        (task(A, d(10, 7), d(10, 9)), "keep_duration"),
    ],
)
def test_ac12_cascade_pushes_successors_only_as_far_as_needed(edited: STask, anchor: str) -> None:
    result = reschedule(AC12_TASKS, CHAIN, edited=edited, anchor=anchor)  # type: ignore[arg-type]

    assert span(result.tasks[A]) == span(edited)
    assert span(result.tasks[B]) == (d(10, 10), d(10, 11))
    assert span(result.tasks[C]) == (d(10, 12), d(10, 12))
    assert result.tasks[B].duration == 2
    assert result.tasks[C].duration == 1
    assert result.changed == [A, B, C]
    assert_no_broken_dependency(result.tasks, CHAIN)


def test_ac12_successors_with_slack_do_not_move() -> None:
    tasks = as_map(
        task(A, d(10, 5), d(10, 7)),
        task(B, d(10, 12), d(10, 13)),
        task(C, d(10, 14), d(10, 14)),
    )

    result = reschedule(tasks, CHAIN, edited=task(A, d(10, 5), d(10, 9)))

    assert span(result.tasks[B]) == (d(10, 12), d(10, 13))
    assert span(result.tasks[C]) == (d(10, 14), d(10, 14))
    assert result.changed == [A]


AC28_TASKS = as_map(task(A, d(10, 5), d(10, 7)), task(B, d(10, 8), d(10, 9)))


def test_ac28_drag_or_start_edit_clamps_and_keeps_duration() -> None:
    result = reschedule(AC28_TASKS, [(A, B)], edited=task(B, d(10, 6), d(10, 7)))

    assert span(result.tasks[B]) == (d(10, 8), d(10, 9))
    assert result.changed == []


def test_ac28_left_edge_resize_clamps_and_keeps_end() -> None:
    result = reschedule(AC28_TASKS, [(A, B)], edited=task(B, d(10, 6), d(10, 9)), anchor="keep_end")

    assert span(result.tasks[B]) == (d(10, 8), d(10, 9))
    assert result.changed == []


def test_keep_end_clamp_never_leaves_end_before_start() -> None:
    tasks = as_map(task(A, d(10, 5), d(10, 12)), task(B, d(10, 13), d(10, 14)))

    result = reschedule(tasks, [(A, B)], edited=task(B, d(10, 6), d(10, 9)), anchor="keep_end")

    assert span(result.tasks[B]) == (d(10, 13), d(10, 13))


def test_keep_end_applies_only_to_the_edited_task() -> None:
    tasks = as_map(
        task(A, d(10, 1), d(10, 3)),
        task(B, d(10, 4), d(10, 5)),
        task(C, d(10, 6), d(10, 8)),
    )

    result = reschedule(tasks, CHAIN, edited=task(B, d(10, 4), d(10, 7)), anchor="keep_end")

    assert span(result.tasks[B]) == (d(10, 4), d(10, 7))
    assert span(result.tasks[C]) == (d(10, 8), d(10, 10))
    assert result.changed == [B, C]


def test_ac29_push_only_shrinking_predecessor_leaves_successor() -> None:
    result = reschedule(AC28_TASKS, [(A, B)], edited=task(A, d(10, 5), d(10, 5)))

    assert span(result.tasks[A]) == (d(10, 5), d(10, 5))
    assert span(result.tasks[B]) == (d(10, 8), d(10, 9))
    assert result.changed == [A]


# AC39 fixture: A (10-05..Fri 10-09) -> M (milestone) -> C (10-10..10-11)
AC39_TASKS = as_map(
    task(A, d(10, 5), d(10, 9)),
    task(M, d(10, 9), d(10, 9), milestone=True),
    task(C, d(10, 10), d(10, 11)),
)
AC39_DEPS: list[Dep] = [(A, M), (M, C)]


def test_ac39_milestone_earliest_is_predecessor_end_and_successor_next_day() -> None:
    assert earliest_allowed(M, AC39_TASKS, AC39_DEPS) == d(10, 9)
    assert earliest_allowed(C, AC39_TASKS, AC39_DEPS) == d(10, 10)


@pytest.mark.parametrize("anchor", ["keep_duration", "keep_end"])
def test_ac39_milestone_dragged_early_settles_on_predecessor_end(anchor: str) -> None:
    result = reschedule(
        AC39_TASKS,
        AC39_DEPS,
        edited=task(M, d(10, 8), d(10, 8), milestone=True),
        anchor=anchor,  # type: ignore[arg-type]
    )

    assert span(result.tasks[M]) == (d(10, 9), d(10, 9))
    assert span(result.tasks[C]) == (d(10, 10), d(10, 11))
    assert result.changed == []


def test_ac39_predecessor_end_moves_milestone_and_its_successor() -> None:
    result = reschedule(AC39_TASKS, AC39_DEPS, edited=task(A, d(10, 5), d(10, 12)))

    assert span(result.tasks[M]) == (d(10, 12), d(10, 12))
    assert result.tasks[M].milestone
    assert span(result.tasks[C]) == (d(10, 13), d(10, 14))
    assert result.changed == [A, C, M]


def test_ac33_unmarking_milestone_clamps_and_pushes_successors() -> None:
    tasks = as_map(
        task(A, d(10, 5), d(10, 9)),
        task(M, d(10, 9), d(10, 9), milestone=True),
        task(C, d(10, 10), d(10, 11)),
    )
    unmarked = task(M, d(10, 9), d(10, 9), milestone=False)

    result = reschedule(tasks, AC39_DEPS, edited=unmarked)

    assert span(result.tasks[M]) == (d(10, 10), d(10, 10))
    assert not result.tasks[M].milestone
    assert result.tasks[M].duration == 1
    assert span(result.tasks[C]) == (d(10, 11), d(10, 12))
    assert result.changed == [C, M]


def test_ac10_adding_dependency_pushes_early_successor_and_chain() -> None:
    tasks = as_map(
        task(A, d(10, 5), d(10, 9)),
        task(B, d(10, 6), d(10, 7)),
        task(C, d(10, 8), d(10, 8)),
    )
    deps: list[Dep] = [(B, C)]

    result = reschedule(tasks, [*deps, (A, B)])

    assert span(result.tasks[B]) == (d(10, 10), d(10, 11))
    assert span(result.tasks[C]) == (d(10, 12), d(10, 12))
    assert result.changed == [B, C]


def test_reschedule_without_edit_on_valid_schedule_changes_nothing() -> None:
    result = reschedule(AC12_TASKS, CHAIN)

    assert result.tasks == AC12_TASKS
    assert result.changed == []


def test_reschedule_does_not_mutate_input() -> None:
    before = dict(AC12_TASKS)

    reschedule(AC12_TASKS, CHAIN, edited=task(A, d(10, 5), d(10, 9)))

    assert before == AC12_TASKS


def test_multiple_predecessors_push_to_the_latest() -> None:
    tasks = as_map(
        task(A, d(10, 1), d(10, 3)),
        task(B, d(10, 1), d(10, 5)),
        task(C, d(10, 4), d(10, 6)),
    )
    deps: list[Dep] = [(A, C), (B, C)]

    result = reschedule(tasks, deps)

    assert span(result.tasks[C]) == (d(10, 6), d(10, 8))
    assert_no_broken_dependency(result.tasks, deps)


def test_diamond_graph_order_is_topological_not_by_id() -> None:
    # 3 -> 1 -> 2: task ids are not in topological order.
    tasks = as_map(
        task(1, d(10, 1), d(10, 1)),
        task(2, d(10, 1), d(10, 1)),
        task(3, d(10, 1), d(10, 4)),
    )
    deps: list[Dep] = [(3, 1), (1, 2)]

    result = reschedule(tasks, deps)

    assert span(result.tasks[1]) == (d(10, 5), d(10, 5))
    assert span(result.tasks[2]) == (d(10, 6), d(10, 6))
    assert result.changed == [1, 2]
    assert_no_broken_dependency(result.tasks, deps)


def test_cascade_past_max_date_raises_out_of_range() -> None:
    tasks = as_map(
        task(A, d(12, 1, 2099), d(12, 20, 2099)),
        task(B, d(12, 21, 2099), d(12, 30, 2099)),
    )

    with pytest.raises(ScheduleOutOfRange) as excinfo:
        reschedule(tasks, [(A, B)], edited=task(A, d(12, 1, 2099), d(12, 25, 2099)))

    assert excinfo.value.task_id == B


def test_cascade_ending_exactly_on_max_date_is_allowed() -> None:
    tasks = as_map(
        task(A, d(12, 1, 2099), d(12, 20, 2099)),
        task(B, d(12, 21, 2099), d(12, 25, 2099)),
    )

    result = reschedule(tasks, [(A, B)], edited=task(A, d(12, 1, 2099), d(12, 26, 2099)))

    assert result.tasks[B].end == MAX_DATE


def test_reschedule_rejects_cyclic_graph() -> None:
    with pytest.raises(ValueError):
        reschedule(AC12_TASKS, [(A, B), (B, C), (C, A)])


@pytest.mark.parametrize(
    ("pred", "succ", "expected"),
    [
        (C, A, True),  # AC11: closes the loop A -> B -> C -> A
        (C, B, True),
        (A, A, True),  # AC11: self dependency
        (A, C, False),  # a shortcut is not a cycle
        (M, A, False),
        (C, M, False),
    ],
)
def test_creates_cycle(pred: int, succ: int, expected: bool) -> None:
    assert creates_cycle(CHAIN, pred, succ) is expected


def test_creates_cycle_on_empty_graph_only_for_self() -> None:
    assert creates_cycle([], A, B) is False
    assert creates_cycle([], A, A) is True


INVARIANT_CASES: list[tuple[dict[int, STask], list[Dep], STask | None, str]] = [
    (AC12_TASKS, CHAIN, task(A, d(10, 5), d(10, 20)), "keep_duration"),
    (AC12_TASKS, CHAIN, task(B, d(10, 1), d(10, 30)), "keep_end"),
    (AC12_TASKS, [*CHAIN, (A, C)], task(A, d(10, 9), d(10, 11)), "keep_duration"),
    (AC39_TASKS, AC39_DEPS, task(A, d(10, 20), d(10, 25)), "keep_duration"),
    (AC39_TASKS, AC39_DEPS, task(M, d(10, 1), d(10, 1), milestone=True), "keep_end"),
    (AC39_TASKS, AC39_DEPS, task(C, d(10, 1), d(10, 1)), "keep_end"),
]


@pytest.mark.parametrize(("tasks", "deps", "edited", "anchor"), INVARIANT_CASES)
def test_invariant_no_dependency_is_broken_after_reschedule(
    tasks: dict[int, STask], deps: list[Dep], edited: STask | None, anchor: str
) -> None:
    result = reschedule(tasks, deps, edited=edited, anchor=anchor)  # type: ignore[arg-type]

    assert_no_broken_dependency(result.tasks, deps)
    for t in result.tasks.values():
        assert t.start <= t.end
        if t.milestone:
            assert t.start == t.end
    for task_id, original in tasks.items():
        if task_id != (edited.id if edited else None):
            assert result.tasks[task_id].start >= original.start  # push-only
            assert result.tasks[task_id].duration == original.duration


@pytest.mark.parametrize(
    ("ids", "deps", "expected"),
    [
        ([3, 1, 2], [], [1, 2, 3]),
        ([1, 2, 3], [(3, 1)], [2, 3, 1]),
        ([1, 2, 3, 4], [(4, 1), (3, 2)], [3, 2, 4, 1]),
    ],
)
def test_topological_order_breaks_ties_by_smallest_id(
    ids: list[int], deps: list[Dep], expected: list[int]
) -> None:
    assert topological_order(ids, deps) == expected

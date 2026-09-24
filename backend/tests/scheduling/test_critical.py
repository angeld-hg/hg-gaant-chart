from datetime import date

from app.scheduling.critical import CriticalResult, compute_critical, link_slack
from app.scheduling.engine import Dep, STask

A, B, C, D, E, M = 1, 2, 3, 4, 5, 6


def day(n: int) -> date:
    """Day n of the fixture month (day 1 = 2026-10-01)."""
    return date(2026, 10, n)


def task(task_id: int, start: int, end: int, milestone: bool = False) -> STask:
    return STask(id=task_id, start=day(start), end=day(end), milestone=milestone)


def as_map(*tasks: STask) -> dict[int, STask]:
    return {t.id: t for t in tasks}


def test_link_slack() -> None:
    assert link_slack(task(A, 1, 3), task(C, 4, 6)) == 0
    assert link_slack(task(B, 1, 2), task(C, 4, 6)) == 1
    assert link_slack(task(A, 1, 3), task(M, 3, 3, milestone=True)) == 0
    assert link_slack(task(A, 1, 3), task(M, 5, 5, milestone=True)) == 2


def test_empty_project_has_no_end_and_no_critical_items() -> None:
    assert compute_critical({}, []) == CriticalResult(
        project_end=None, task_ids=frozenset(), dependency_pairs=frozenset()
    )


def test_ac15_task_with_slack_is_not_critical() -> None:
    tasks = as_map(task(A, 1, 3), task(B, 1, 2), task(C, 4, 6))
    deps: list[Dep] = [(A, C), (B, C)]

    result = compute_critical(tasks, deps)

    assert result.project_end == day(6)
    assert result.task_ids == {A, C}
    assert result.dependency_pairs == {(A, C)}


def test_ac15_two_parallel_chains_ending_on_project_end_are_both_critical() -> None:
    tasks = as_map(task(A, 1, 3), task(B, 4, 6), task(C, 1, 4), task(D, 5, 6))
    deps: list[Dep] = [(A, B), (C, D)]

    result = compute_critical(tasks, deps)

    assert result.project_end == day(6)
    assert result.task_ids == {A, B, C, D}
    assert result.dependency_pairs == {(A, B), (C, D)}


def test_milestone_at_the_end_is_critical() -> None:
    tasks = as_map(task(A, 1, 3), task(M, 3, 3, milestone=True), task(B, 1, 2))
    deps: list[Dep] = [(A, M)]

    result = compute_critical(tasks, deps)

    assert result.project_end == day(3)
    assert result.task_ids == {A, M}
    assert result.dependency_pairs == {(A, M)}


def test_slack_link_between_critical_tasks_is_not_highlighted() -> None:
    # A (1-3) -> C (4-6) has zero slack, so A is critical through C. B (5-6) is critical
    # because it ends on the project end, but A -> B has 1 day of slack (D12).
    tasks = as_map(task(A, 1, 3), task(B, 5, 6), task(C, 4, 6))
    deps: list[Dep] = [(A, C), (A, B)]

    result = compute_critical(tasks, deps)

    assert result.task_ids == {A, B, C}
    assert result.dependency_pairs == {(A, C)}
    assert (A, B) not in result.dependency_pairs


def test_zero_slack_link_to_non_critical_task_is_not_highlighted() -> None:
    # A (1-2) -> B (3-4) is zero slack, but neither ends on the project end (C 1-9).
    tasks = as_map(task(A, 1, 2), task(B, 3, 4), task(C, 1, 9))
    deps: list[Dep] = [(A, B)]

    result = compute_critical(tasks, deps)

    assert result.task_ids == {C}
    assert result.dependency_pairs == frozenset()


def test_critical_reaches_back_through_long_zero_slack_chains_only() -> None:
    # A (1-2) -> B (3-4) -> C (5-6) all zero slack; D (1-1) -> B has slack; E (1-3) alone.
    tasks = as_map(task(A, 1, 2), task(B, 3, 4), task(C, 5, 6), task(D, 1, 1), task(E, 1, 3))
    deps: list[Dep] = [(A, B), (B, C), (D, B)]

    result = compute_critical(tasks, deps)

    assert result.task_ids == {A, B, C}
    assert result.dependency_pairs == {(A, B), (B, C)}


def test_single_task_is_critical() -> None:
    result = compute_critical(as_map(task(A, 2, 4)), [])

    assert result.project_end == day(4)
    assert result.task_ids == {A}

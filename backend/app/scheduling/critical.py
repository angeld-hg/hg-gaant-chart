"""Critical path under push-only rules (AC14, D12)."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

from app.scheduling.engine import Dep, STask, allowed_from


@dataclass(frozen=True)
class CriticalResult:
    project_end: date | None
    task_ids: frozenset[int]
    dependency_pairs: frozenset[Dep]


def link_slack(pred: STask, succ: STask) -> int:
    """Days the successor could slip earlier before the link pred -> succ would bind."""
    return (succ.start - allowed_from(pred, succ.milestone)).days


def compute_critical(tasks: Mapping[int, STask], deps: Sequence[Dep]) -> CriticalResult:
    """A task is critical iff delaying it one day would delay the project end.

    With push-only scheduling that means: it ends on the project end, or it reaches such a
    task backwards through links with zero slack. Only zero-slack links between two critical
    tasks are critical links.
    """
    if not tasks:
        return CriticalResult(project_end=None, task_ids=frozenset(), dependency_pairs=frozenset())

    project_end = max(t.end for t in tasks.values())
    driving = [(p, s) for p, s in deps if link_slack(tasks[p], tasks[s]) == 0]
    driving_preds: dict[int, list[int]] = {}
    for pred, succ in driving:
        driving_preds.setdefault(succ, []).append(pred)

    critical = {task_id for task_id, t in tasks.items() if t.end == project_end}
    stack = list(critical)
    while stack:
        current = stack.pop()
        for pred in driving_preds.get(current, ()):
            if pred not in critical:
                critical.add(pred)
                stack.append(pred)

    pairs = frozenset((p, s) for p, s in driving if p in critical and s in critical)
    return CriticalResult(
        project_end=project_end, task_ids=frozenset(critical), dependency_pairs=pairs
    )

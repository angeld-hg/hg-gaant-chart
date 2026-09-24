"""Verifier throwaway: AC14's literal definition vs compute_critical on random valid schedules.

For every task X: delay X's end (a milestone's date) by one day, keeping its duration, let the
engine push successors only as far as forced, and check whether the project end moved.
"""
import random
from datetime import date, timedelta

from app.scheduling.critical import compute_critical
from app.scheduling.engine import STask, reschedule

rng = random.Random(20260924)
D = timedelta(days=1)
graphs = checked = mismatches = 0
for trial in range(3000):
    n = rng.randint(1, 9)
    ids = list(range(1, n + 1))
    order = ids[:]
    rng.shuffle(order)
    deps = [(order[i], order[j]) for i in range(n) for j in range(i + 1, n) if rng.random() < 0.3]
    base = date(2026, 10, 1)
    raw = {}
    for t in ids:
        ms = rng.random() < 0.2
        s = base + timedelta(days=rng.randint(0, 12))
        e = s if ms else s + timedelta(days=rng.randint(0, 5))
        raw[t] = STask(id=t, start=s, end=e, milestone=ms)
    tasks = reschedule(raw, deps).tasks  # make the random schedule valid (push-only)
    res = compute_critical(tasks, deps)
    graphs += 1
    for x, t in tasks.items():
        delayed = STask(id=x, start=t.start + D, end=t.end + D, milestone=t.milestone)
        after = reschedule(tasks, deps, edited=delayed, anchor="keep_duration").tasks
        literal = max(v.end for v in after.values()) > res.project_end
        checked += 1
        if literal != (x in res.task_ids):
            mismatches += 1
            if mismatches <= 3:
                print("MISMATCH", trial, x, tasks, deps, res)
print(f"graphs={graphs} tasks_checked={checked} mismatches={mismatches}")

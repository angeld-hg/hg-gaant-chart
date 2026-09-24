"""Verifier throwaway (run 2): prove critical_bruteforce.py can fail. Monkeypatches compute_critical
so every task is reported critical, then runs the brute force unchanged. Expect mismatches > 0."""
import dataclasses
import runpy

import app.scheduling.critical as crit

real = crit.compute_critical


def sabotaged(tasks, deps):  # type: ignore[no-untyped-def]
    res = real(tasks, deps)
    return dataclasses.replace(res, task_ids=frozenset(tasks))


crit.compute_critical = sabotaged
runpy.run_path(__file__.replace("_sabotage", ""), run_name="__main__")

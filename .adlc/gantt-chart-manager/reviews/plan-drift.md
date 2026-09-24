## Drift report (plan): gantt-chart-manager

Checker: angel:drift-checker, mode plan. Read spec.md, plan.md, decisions.md (D1-D12), state.md, reviews/spec-review-2.md, ../verification.md, ../probe.md.

Every AC is covered by at least one slice. Nothing contradicts a non-goal or constraint. Most findings are slices whose planned tests are thinner than their AC.

| Severity | Kind | Where | Finding | Suggested fix |
|---|---|---|---|---|
| medium | Weakened | AC23 / S6 tests | The parametrised import tests check only some rules. Missing: impossible or malformed date, date outside 2000-2099, duration 3651, duration 0 or 3.5 on a non-milestone, end < start, percent 101 or 40.5, empty or 101-char task name, empty person name, duplicate person name. | One parametrised case per missing rule in test_import.py. |
| medium | Weakened | AC12 / S5, S9, S11 | AC12 says A's end moves "by any means". Tests cover only the duration edit (S9) and right-edge resize (S11). S5's PATCH body is unspecified; no start edit on A, no move-drag cascade. | S5: run the AC12 fixture with each of {end}, {duration}, {start}. S11: add a move-drag of A that pushes B and C. |
| medium | Weakened | AC30 / S4, S10 | No test for renaming a person, or for a rename that clashes (409 + visible message). | Add rename and rename-clash tests in test_people_api.py, and a UI rename test in roster.spec.ts. |
| low | Weakened | AC9, AC38 / S8 | Milestone diamond and its pill aren't stated to use colourFor; only bars are tested. | State it in S8; add a test on a milestone assigned to Ana. |
| low | Weakened | AC40 / S9 | No UI test for the message when a cascade would pass 2099-12-31 (API path only). | Add a UI case to tasks.spec.ts. |
| low | Weakened | AC5 / S9, S5 | A malformed date (e.g. 2026-2-5) is tested only in S2. | Add a malformed-date case to S5 and S9. |
| low | Contradicted (minor) | AC32 / C2 PATCH step 5, extra="forbid" | 422 for end+duration together and for unknown fields isn't recorded in Spec interpretations. | Add both cases to the AC32 bullet in Spec interpretations. |
| low | Gap | C2 / S5 create_task | POST with is_milestone plus duration, end or non-zero percent is undefined. | Add create-time milestone rules: 422 milestone_field; otherwise duration 0, end = start. |
| low | Weakened | AC24 / S6 naming | .rstrip() after shortening may trim more than needed. Already recorded. | None needed. |
| low | Stale | spec AC14 vs D12 | AC14 still says "the arrows between them"; D12 chose zero-slack only. | Change AC14's wording to match D12. |
| low | Stale | plan.md Decisions needed | Still lists D10-D12 as open. | Replace with "None." and point to D10-D12. |
| low | Fragile test | AC25 / S13 step 2 | The MutationObserver on .critical hangs if the drag doesn't change the critical set. | Have bigProject.ts pick a drag known to change the critical set. |
| low | Added | S8 step 2 | A today line in the chart isn't required by any AC. Small, fits AC43. | Keep or drop. |

Parallel safety: S2/S3, S6/S7, S8/S12 and S9/S10/S11 don't overlap files. S11 modifies S8's Bars.tsx and chart.css (declared). No undeclared dependencies.
Constraints: TS 7 with 5.x fallback (S1), single just entry point (S1), channel "chrome" with no CI, pure scheduling core with a grep test (S2). No non-goals contradicted.
Coverage: 43/43 ACs (AC12, AC23, AC30 have test gaps).

## Decisions needed
None.

VERDICT: PROCEED

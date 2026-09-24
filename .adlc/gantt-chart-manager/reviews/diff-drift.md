## Drift report (diff): gantt-chart-manager

Checker: angel:drift-checker, mode diff. Scope: `git diff main...HEAD` (18 commits, 128 files). Read spec.md, plan.md, decisions.md, state.md and reviews/verification.md. Spot-read code and tests for the riskier contracts.

| # | Severity | Kind | Where | Finding | Suggested fix |
|---|---|---|---|---|---|
| DD1 | medium | Missing test | AC16 / S9 | No committed test fails if the project end or critical path stops updating without a reload after adding or removing a dependency. The tasks.spec.ts dependency test (around line 331, "AC10, AC11, AC13") checks only the arrows and B's dates. The only proof is the one-off `evidence/ac16_deps_ui.mjs`. | Add `project-end` and `critical`-class checks after both the add and the remove to the tasks.spec dependency test, or add a new test. |
| DD2 | low | Weakened (plan conflicts with itself) | AC11 / S9 | The S9 test list says A->A shows an error, but step 3 and `fields.ts:111` `predecessorOptions` exclude the task itself. So A->A can't be attempted in the UI, and the API returns 422 `dependency_self`. | Correct the S9 test line in plan.md to "A->A is not offered; the API rejects it". |
| DD3 | low | Unplanned file | commit 793b026 | No slice owns `frontend/e2e/chart-scroll.spec.ts` or the `Chart.tsx` scrollLeft compensation. Logged in state.md. | Optional: record the file under S8 in plan.md. |
| DD4 | low | Built differently (reason noted) | S13b / C6 | The task editor and roster drawers are mutually exclusive, in the reducer. This is within S13's fix lane and logged. | None. |
| DD5 | low | Unplanned file | `.adlc/*` | Process files, committed by user choice. | None. |
| DD6 | info | Built as decided | AC25, AC26 | D14 warm-up and D13 console filter, as decided. | None. |

No drift found in:
- File ownership: every commit touched only its slice's files. The two exceptions, D13 and the C1 amendment, have logged reasons.
- The C2 contract: `extra="forbid"` and strict types throughout.
- PATCH resolution and the `changed_task_ids` order.
- AC24 naming.
- TypeScript 7 (no 5.x pin), the 5 MB client-side import check, raw-byte export, import input reset, and the 3 px click threshold.

Coverage: 43/43 ACs have implementing code. 42/43 have a committed test that fails without it; AC16's dependency part is only partly covered (DD1).

## Decisions needed
None.

VERDICT: PROCEED

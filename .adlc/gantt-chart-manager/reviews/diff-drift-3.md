## Drift report (diff): gantt-chart-manager (round 3, pre-push)

Checker: angel:drift-checker, mode diff. Scope: `git diff main...HEAD` (137 files). Read in detail everything changed since round 2, which is 4cf26a9 (store.tsx, store.test.ts). Checked against spec AC2 and AC34, plan S7 amendment, decisions D18 and code-review-2 CR7.

| Severity | Kind | Where | Finding | Suggested fix |
|---|---|---|---|---|
| info | Built as decided | D18 / CR7 / AC2 | `createWriteQueue` returns `{ mutate, renameProject }`, which share one promise chain. Two store tests cover it: one fails without the fix and checks the send order `["drag","rename"]`; the other checks a write issued after a rename waits for it, including when the rename fails. | None. |
| low | Stale plan amendment | plan.md S7 amendment | Didn't mention that renames also use the queue. | **Done by elephant:** the amendment now says "Project renames also go through the same queue (CR7, D18); project delete does not need to." |
| info | Not in scope | store.tsx `deleteProject` | Delete bypasses the queue. There is no stale-name race, because the reducer drops the project. Not drift. | None. |

No leftover references to `createMutator`. No client scheduling (D9/D11). No unplanned files.
Coverage: 43/43 ACs have implementing code, and 43/43 have a committed test.

## Decisions needed
None.

VERDICT: PROCEED

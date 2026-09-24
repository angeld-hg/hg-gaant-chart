## Drift report (diff): gantt-chart-manager (round 2)

Checker: angel:drift-checker, mode diff. Scope: `git diff main...HEAD` (131 files). Re-read in detail everything changed since round 1 (de6b1bd, 4ed661c, 332b5bc) against spec.md, plan.md, decisions.md (D15, D16), state.md, reviews/code-review.md and the round-1 reviews/diff-drift.md. Nothing else changed, so the round-1 findings on the rest of the diff still hold.

| Severity | Kind | Where | Finding | Suggested fix |
|---|---|---|---|---|
| closed | was DD1 | AC16 / S9 | tasks.spec.ts has a new AC16 test: after adding and removing a dependency, project-end and the critical set update, and a window marker proves no reload. | None. |
| closed | was DD2 | AC11 / S9 | plan.md S9 test line corrected. | None. |
| low | Unplanned behaviour | CR2 / S6 | The 415 `unsupported_media_type` on import isn't in the plan. Every caller sends JSON, and the tests cover it. | Add it to plan S6/C2. **Done by elephant (plan.md amendment after the S6 Files line).** |
| low | Built differently | CR1 / C6 | Project-scoped writes are serialised through `createMutator`. Tested in store.test.ts. | Record it under C6/S7. **Done by elephant (plan.md amendment after the S7 Files line).** |
| low | Unplanned file | `frontend/src/state/store.test.ts` | Not listed in S7. | **Done (same S7 amendment).** |
| low | Unplanned file (carried over from DD3) | `frontend/e2e/chart-scroll.spec.ts` | Not recorded under S8. | **Done by elephant (plan.md amendment after the S8 Files line).** |
| info | Built as decided | D15 / CR4 | Comment only. | None. |
| info | Built as decided | D16 / AC24 | The trim is clarified in spec.md and pinned by a test. | None. |
| info | Built as reviewed | CR3 | The editor opens `created_id` only while the draft is still open. | None. |
| info | Built as reviewed | CR6 | `unassignPhrase` rename; the text is unchanged. | None. |

No drift found in: fix-commit file ownership (the widened test_roundtrip.py lane is logged); AC25 and D9/D11 (no client scheduling was added); and the contracts checked in round 1.

Coverage: 43/43 ACs have implementing code, and 43/43 have a committed test that would fail without it.

Note: CR1 changes runtime behaviour on every write path, so the re-verify must run on current HEAD.

## Decisions needed
None.

VERDICT: PROCEED

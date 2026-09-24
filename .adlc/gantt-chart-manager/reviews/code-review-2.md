## Code review: angel/gantt-chart-manager (round 2)

Reviewer: angel:code-reviewer. Read the fix commits de6b1bd, 4ed661c and 332b5bc line by line, checked every `/api/import` caller, and traced each round-1 scenario through the new code.

Round-1 findings, all fixed:
- **CR1:** `store.tsx:115-135` has a single queue (mutate is created once in useMemo). A failure doesn't block later writes. `store.test.ts` has a newest-first network test that would fail without the queue.
- **CR2:** `transfer.py:34-42,120` returns 415 unless the type is application/json. There's no CORS setup, so a cross-site JSON POST needs a preflight, which fails. Every caller sends JSON, and the tests cover the other types.
- **CR3:** `reducer.ts:61-70,142-144` opens `created_id` only for a task create while the draft is still open. Tests cover a drag landing mid-create, a person create_id, and the user having moved away.
- **CR4/D15:** the comment is accurate.
- **CR5/D16:** the trim test is pinned and its arithmetic checked. AC24 is clarified.
- **CR6:** renamed.
- **DD1:** the AC16 test at `tasks.spec.ts:399` was verified by hand.

### Critical
None.

### Major
None.

### Minor
- **CR7:** `store.tsx:236-244` (`renameProject`) bypasses the write queue, and `reducer.ts:54-58` (`withSummaryOf`) plus `:139-141` copy `project.name` from every write response. If a task write is in flight and the user renames the project, and the rename response arrives first, the task write's older response restores the old name in the list and toolbar until the next write. Same class as CR1, narrower window. -> Widen `createMutator` to queue any async write, route `renameProject` through it, and add a store test with the rename and a task write resolving out of order.

## Decisions needed
### Revisit D15 now that AC25's timing margin looks thin?
- Context: `perf.spec.ts:213`. Release-to-cascade this round: 266 ms (FAIL) on a heavily loaded full run (3.1 min), 146 ms on a second full run, 85 ms for the spec alone. The CR1 queue adds negligible delay when idle, so this is most likely machine load.
- Options:
  - A) Keep D15 and treat it as load noise. No work; occasional failures on a busy machine.
  - B) Take D15 option B (reuse unchanged ChartItems so memo skips). Real headroom; more code and a small stale-render risk.
  - C) Measure the median of several drags after a warm-up. Less noisy; the test measures differently from now.
- Recommendation: A, then rerun on a quiet machine before merge.

Tests: pytest 379, vitest 163, lint and typecheck clean. E2E: first run 75/77 (AC37 hit the 30 s timeout and AC25 took 266 ms, both on the loaded run); rerun of those two specs 4/4; second full run 77/77.

VERDICT: APPROVE

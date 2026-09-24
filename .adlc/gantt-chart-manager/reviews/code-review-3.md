## Code review: angel/gantt-chart-manager (round 3, pre-push, HEAD 4cf26a9)

Reviewer: angel:code-reviewer. The only source change since round 2 is 4cf26a9 (store.tsx, store.test.ts).

**CR7 is fixed**
- `createWriteQueue` (store.tsx:125-149) sends `mutate` and `renameProject` through one shared `enqueue<T>`, so rename and task writes go strictly in the order they were issued.
- Each write still resolves to an `ActionResult` through `fail`, so a rejected write doesn't stop the queue.
- `AppProvider` sends rename through the queue (store.tsx:256). `createProject`, `deleteProject` and `importProject` don't use it; their responses never overwrite `current` with an older name or task list.
- Traced by hand: a drag followed by a rename ends with the new name, because `project-renamed` (reducer.ts:89-98) lands last. Renaming a project that isn't open is safe, because `withSummaryOf` matches by id.

**Tests would fail if the fix were reverted**
- Both new store tests fail without the queue.
- The CR1 test now uses the shared `answerInOrder` helper and keeps the same meaning.

**Final pass over the branch:** no new issues. The CR1-CR6 fixes and the D16 behaviour are unchanged.

### Critical
None.

### Major
None.

### Minor
None.

## Decisions needed
None. The reviewer mentioned the AC25 timing as open; the user already settled it as D17 (keep D15, treat it as load noise). AC25 passed in this round's full e2e run.

Tests: pytest 379, vitest 165, lint and typecheck clean. E2E (8351/5351): 77/77 in 2.2 min, including AC25 and AC37.

VERDICT: APPROVE

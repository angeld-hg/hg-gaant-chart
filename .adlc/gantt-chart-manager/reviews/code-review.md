## Code review: angel/gantt-chart-manager (round 1)

Reviewer: angel:code-reviewer, base main. Read the whole backend and the core frontend files. Traced the AC12, AC28, AC36 and AC39 fixtures through `reschedule()` and `compute_critical()`, and they give the specified dates and critical sets. The server is authoritative: every write runs in one `BEGIN IMMEDIATE` transaction and reads other tasks' dates from the DB. The tests assert real behaviour.

### Critical
None.

### Major
- **CR1**: `frontend/src/state/store.tsx:151-159` (`mutate`) and `frontend/src/state/reducer.ts:119-133` (`mutation-applied`). Every response replaces `state.current` with a full ProjectDetail, and nothing orders the responses. The only guard is the per-bar `saving` flag at `useBarDrag.ts:59`. Drag bar X, then bar Y quickly (or commit an editor field during a drag save): the two PATCHes run concurrently. If X's response arrives after Y's, the screen shows X's older snapshot, without Y's edit and cascade, until the next write. That breaks D9/D11/AC36. -> Serialise project mutations in the store by chaining each `mutate()` onto a single in-store promise, so only one write is in flight. Add a unit test where overlapping mutations resolve out of order and the later request's result wins.

### Minor
- **CR2**: `backend/app/routes/transfer.py:108-109`. `/api/import` reads the raw body whatever the Content-Type: a `text/plain` POST of a valid file returns 201, while the other JSON endpoints return 422. Any web page the user visits while the backend runs could send a cross-site "simple" POST that creates projects. -> Return 415 unless the Content-Type is `application/json` (the client already sends it, `api/client.ts:171`). Add a test.
- **CR3**: `frontend/src/components/tasks/TaskEditor.tsx:348` and `:361`. After a create, the editor opens `lastChangedTaskIds[0]`. If another mutation lands during the create (a drag save, for example), it opens the wrong task. -> Use the `created_id` from the MutationResult.
- **CR4**: `frontend/src/components/chart/Bars.tsx:2` claims "a change to one task re-renders only its row". But `Chart.tsx:182-199` rebuilds every ChartItem on every mutation, so `memo` never skips. AC25 passes anyway. -> Correct the comment, or reuse unchanged item objects.
- **CR5**: `backend/app/transfer/naming.py:19`. `.rstrip()` after truncating can remove more than AC24's "just enough for the suffix to fit" when the cut lands next to a space. -> Drop `rstrip()`, or pin the behaviour with a test and record it as a deliberate deviation.
- **CR6**: `frontend/src/components/roster/RosterPanel.tsx:11` and `frontend/src/components/shell/ProjectList.tsx:15`. Two different functions are both named `tasksPhrase`. -> Rename the roster one, e.g. `unassignPhrase`.

## Decisions needed
None.

Tests: pytest 370, vitest 156, lint, typecheck and e2e 76 all pass. Antipattern script: n/a.

VERDICT: CHANGES_REQUESTED

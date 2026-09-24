# Verification: gantt-chart-manager

Verifier: angel:verifier, fresh context, on HEAD dcace52 (branch angel/gantt-chart-manager). No source or test edits.
The elephant recorded this from the verifier's hand-back, condensed to one line per AC. Key outputs are quoted as given. The verifier's own scripts are in `../evidence/` (live_api.sh, live_roundtrip.sh, critical_bruteforce.py, ac16_deps_ui.mjs, ac16_after_add.png).

Commands:
- **E2E**: `cd frontend && GANTT_E2E_API_PORT=8291 GANTT_E2E_WEB_PORT=5291 npx playwright test --timeout 60000 --global-timeout 900000` -> 76 passed (installed Chrome).
- **PYTEST**: `cd backend && uv run pytest -v` -> 370 passed.
- **LIVE**: `bash .adlc/gantt-chart-manager/evidence/live_api.sh` runs a real uvicorn on :8290 with a temp DB, restarts it on the same DB, then starts it on a fresh DB.
- **LIVE2**: `bash .adlc/gantt-chart-manager/evidence/live_roundtrip.sh`.
- **UI16**: `node .adlc/gantt-chart-manager/evidence/ac16_deps_ui.mjs` (headless Chrome at 1280x800).

The verifier read the assertions of every e2e test cited, not just the titles.

## Evidence

| AC | Method | Evidence (key output) | Status |
|---|---|---|---|
| AC1 | e2e + live | projects.spec:41 (create, reload, API); LIVE `{"id":1,"name":"Launch","task_count":0} [201]` | VERIFIED |
| AC2 | e2e + integration | projects.spec:125, :179 (after delete, project GET and task PATCH both 404); test_delete_project_cascades_people_tasks_and_dependencies | VERIFIED |
| AC34 | e2e + live | LIVE 409 name_taken, 422 empty, 422 >100, rename to LAUNCH 200; projects.spec:85, :104, :125 | VERIFIED |
| AC3 | e2e + live | tasks.spec:101; chart.spec:62 (width 96px, edges within 1px of the 10-05 and 10-07 columns); LIVE end 2026-10-07 | VERIFIED |
| AC27 | e2e + live | chart.spec:87 (end 10-11, shades only on 10-10 and 10-11, full height, none in week zoom); LIVE; screenshot | VERIFIED |
| AC4 | e2e + integration | tasks.spec:130, all three edits through the UI, API `["2026-10-07","2026-10-12",6]`; test_edit_dates[*] | VERIFIED |
| AC5 | e2e + live | tasks.spec:160 (12 cases: message shown, field reverts, API deep-equal); LIVE rejection loop "tasks unchanged after all rejections: YES" | VERIFIED |
| AC40 | e2e + live | LIVE 3651 / 1999-12-31 rejected; schedule_out_of_range 422 with tasks unchanged; tasks.spec:195 (UI, clock set to 2099-12-01) | VERIFIED |
| AC6 | e2e + integration | tasks.spec:491 (0 arrows, API tasks [A,C], deps []); test_delete_task_removes_it_and_its_dependencies | VERIFIED |
| AC42 | e2e + integration | chart.spec:402, tasks.spec:526, roster.spec:88; three pytest order tests | VERIFIED |
| AC41 | e2e | dialog texts checked for project, task and person; dependency removal has no dialog (tasks.spec:331); API delete tests | VERIFIED |
| AC7 | e2e | chart.spec:112 (diamond centred on 10-09), tasks.spec:216 (API [true,0,0]), drag.spec:189 (no handles; drag persists) | VERIFIED |
| AC33 | e2e + live | tasks.spec:216 (inputs hidden), :239 (unmark gives 10-10, duration 1); LIVE 422 milestone_field; pytest | VERIFIED |
| AC8 | e2e + live | chart.spec:137 (0.4 ± 0.01); tasks.spec:261; LIVE 101 and 40.5 rejected | VERIFIED |
| AC30 | e2e + integration | roster.spec:88, :142, :171; bad-colour and default-wrap pytest. The UI offers only palette swatches; the API rejects off-palette colours with 422 | VERIFIED |
| AC38 | unit + e2e | 12/12 palette contrast cases, the neutral case and the WCAG reference cases; chart.spec:154 (computed colours match the palette pair) | VERIFIED |
| AC9 | e2e + live | tasks.spec:281 (colour and tag survive a reload; unassign returns neutral); chart.spec:154; LIVE 422 for a person from another project | VERIFIED |
| AC31 | e2e | roster.spec:218 (a window marker proves no reload; recolour is instant; removal gives neutral, dates unchanged, API null) | VERIFIED |
| AC10 | e2e + integration | tasks.spec:331 (B pushed to 10-08..10-09); chart.spec:200 (arrow endpoints within 1px); pytest | VERIFIED |
| AC11 | live + e2e | LIVE 409 cycle, 422 self, 409 duplicate, dep_count stays 2; UI shows the error for C->A and the duplicate. A->A is not offered in the UI | VERIFIED |
| AC12 | live + e2e + integration | LIVE changed [3,4,5]: A 10-05..10-09, B 10-10..10-11, C 10-12; tasks.spec:399; drag.spec:302 x2 (resize, move); pytest end/duration/start and slack variants | VERIFIED |
| AC28 | e2e + live | drag.spec:222, :237; tasks.spec:437; LIVE B settles at 10-08..10-09 | VERIFIED |
| AC39 | e2e + live | drag.spec:255; LIVE M dragged to 10-08 settles on 10-09; moving A's end to 10-12 gives M 10-12 and C 10-13..10-14 | VERIFIED |
| AC29 | live + integration | LIVE A back to 10-07, B and C stay pushed; pytest push-only x3 | VERIFIED |
| AC13 | e2e + UI16 | tasks.spec:331; UI16 after removal: arrows [] and dates unchanged | VERIFIED |
| AC32 | live + integration | LIVE clamp returns 200; `changed` lists the edited task plus the cascaded ones; 13 rejections leave tasks byte-equal; rollback pytest | VERIFIED |
| AC36 | live + e2e | LIVE stale PATCH gives B 10-10; tasks.spec:456 with two real pages | VERIFIED |
| AC14 | brute force + e2e | critical_bruteforce.py: graphs=3000, tasks=15035, mismatches=0 (a sabotaged copy gives 2450 mismatches); chart.spec:259 (ring on 13 colours); D12 pytest | VERIFIED |
| AC15 | unit + e2e | two AC15 pytest cases; chart.spec:200 | VERIFIED |
| AC16 | e2e + UI16 | tasks.spec:399; drag.spec:302 x2; UI16 dependency add and remove update project end and critical with no reload, console [] | VERIFIED |
| AC17 | e2e | drag.spec:97 (PATCH {start:10-07}, survives reload), :125 (+47px gives +1 day) | VERIFIED |
| AC18 | e2e | drag.spec:141, :156, :168 | VERIFIED |
| AC19 | e2e | chart.spec:289 (within 1px in every zoom); drag.spec:320 x2 (week and month snap) | VERIFIED |
| AC43 | e2e | chart.spec:347 (every zoom: range minimums, today included, earliest start within 0-7 days of the left edge), :381 (empty project) | VERIFIED |
| AC35 | e2e | projects.spec:24, chart.spec:381, tasks.spec:315, roster.spec:69, all with the console fixture | VERIFIED |
| AC20 | live restart | LIVE: kill, port free, restart, `cmp` gives "all project details identical after restart (2247 bytes, 4 projects)" | VERIFIED |
| AC21 | e2e + live | transfer.spec:52 (UI bytes equal server bytes, key order, file-local keys, no timestamps, repeat export identical); LIVE2 | VERIFIED |
| AC22 | live + e2e | LIVE/LIVE2 fresh-DB round trip "byte-identical (671 bytes)"; transfer.spec:146 | VERIFIED |
| AC23 | integration + live + e2e | 45 invalid-file pytest cases, >5 MB, never adjusts dates; LIVE 422/400; project count unchanged; transfer.spec:204, :230, :264 | VERIFIED |
| AC24 | live + e2e + unit | "Launch (2)" then "(3)"; "Launch (2) (2)"; shortening; existing projects unmodified | VERIFIED |
| AC25 | e2e (installed Chrome) | perf.spec:109: load + drag 533 ms (<2000); release to cascade and critical 76 ms (<200); D14 warm-up | VERIFIED |
| AC37 | e2e + browser | layout.spec:155, :205 (intersection and ellipsis checks); projects.spec:246; chart.spec:434; UI16 scrollWidth 1280/1280 | VERIFIED |
| AC26 | e2e | flow.spec:77, every listed action with the console fixture (D13); UI16 unfiltered console [] | VERIFIED |

## Regression check
`just lint`, `just typecheck`, `just test` and `just e2e` (isolated ports):
- lint and typecheck: clean.
- pytest: 370 passed.
- vitest: 156 passed.
- e2e: 76 passed, 0 failed, 0 flaky.

## Summary
43/43 ACs verified. Failures: none. Unverifiable: none.

Notes:
1. AC11: A->A is not offered in the UI picker, so it can't be attempted there; the API returns 422.
2. AC30: the UI offers only palette colours; the API returns 422 for any other colour.
3. AC16: no committed e2e test covers the no-reload update after adding or removing a dependency. It was verified with the throwaway UI16 script, and a regression test is worth adding.
4. AC25 timing uses the dev-server warm-up (D14).
5. The AC26 console check ignores Chrome's own 4xx network lines (D13).

## Decisions needed
None.

VERDICT: VERIFIED

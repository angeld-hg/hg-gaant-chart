# Verification: gantt-chart-manager (run 3)

Verifier: angel:verifier, fresh context, on HEAD 4cf26a9. No source or test edits: `git status -- backend frontend` is empty. Since run 2 (reviews/verification-2.md, on 332b5bc), only `frontend/src/state/store.tsx` and `store.test.ts` have changed, so the backend is byte-identical to run 2.

The elephant recorded this from the verifier's hand-back, condensed to one line per AC. Key outputs are quoted as given. New evidence files in `../evidence/`: `cr7_sabotage.sh`, `cr7_rename_race_ui.mjs`, `drawer_settled_shot.mjs`, `ac16_after_add_r3.png` and `ac16_drawer_settled_r3.png`.

Commands:
- E2E: `cd frontend && GANTT_E2E_API_PORT=8341 GANTT_E2E_WEB_PORT=5341 GANTT_E2E_DB_PATH=/tmp/gver3/e2e.db GANTT_E2E_OUTPUT_DIR=/tmp/gver3/test-results npx playwright test --timeout 60000 --global-timeout 900000` -> 77 passed (2.4m), 0 flaky, 0 retries.
- LIVE / LIVE2 / LIVE3: `live_api.sh`, `live_roundtrip.sh` and `live_import_ct.sh`, with GV_PORT=8340.
- UI16: `ac16_deps_ui.mjs`. CR7UI: `cr7_rename_race_ui.mjs`. BF/BFX: brute-force critical-path check, and a sabotaged copy.
- UNIT: `npx vitest run src/state/store.test.ts src/state/reducer.test.ts` -> 35 passed.

## CR7 (the change since run 2; touches AC2, AC34, AC16, AC36)
- UNIT: both named CR7 tests pass, and the CR1 queue tests and CR3 test still pass.
- Can fail: `cr7_sabotage.sh` makes rename skip the queue. Both CR7 tests then fail: `expected [ { id: 1, name: 'Launch', …(1) } ] to deeply equal [ { id: 1, name: 'Launch v2', …(1) } ]` and `expected [ 'rename', 'drag' ] to deeply equal [ 'rename' ]`.
- CR7UI (real browser): the task PATCH response, which still carries the old name, is held for 1500 ms while the user renames. The rename is sent only after the held response arrives (1687 ms RECV, then 1688 ms SEND). The final UI shows the new name with the edited dates kept. The server agrees. `console errors: []`.

## Evidence

| AC | Method | Evidence (key output) | Status |
|---|---|---|---|
| AC1 | e2e + live | projects.spec:41; LIVE `{"id":1,"name":"Launch","task_count":0} [201]` | VERIFIED |
| AC2 | e2e + integration | projects.spec:125 (queued rename path), :179; pytest cascade delete | VERIFIED |
| AC34 | live + e2e | 409, 422 empty, 422 >100, LAUNCH 200; projects.spec:85, :104; the rename clash still shows its message through the queue | VERIFIED |
| AC3 | e2e + live | `{"start":"2026-10-05","end":"2026-10-07","duration":3}`; chart.spec:62; tasks.spec:101 | VERIFIED |
| AC27 | e2e + live | `{"start":"2026-10-09","end":"2026-10-11","duration":3}`; chart.spec:87 | VERIFIED |
| AC4 | e2e | tasks.spec:130 (API-checked) | VERIFIED |
| AC5 | live + e2e | 13 rejections, then "tasks unchanged after all rejections: YES"; tasks.spec:160 | VERIFIED |
| AC40 | live + e2e | 3651 and 1999-12-31 invalid; schedule_out_of_range 422 with ZA and ZB unchanged; tasks.spec:195 | VERIFIED |
| AC6 | e2e | tasks.spec:543 | VERIFIED |
| AC42 | e2e + integration | tasks.spec:578, chart.spec:402, roster.spec:88; import file order pytest | VERIFIED |
| AC41 | e2e | projects.spec:155, :179, :216; tasks.spec:543; roster.spec:218 | VERIFIED |
| AC7 | e2e | chart.spec:112, tasks.spec:216, drag.spec:189 | VERIFIED |
| AC33 | e2e + live | 422 milestone_field; tasks.spec:239 | VERIFIED |
| AC8 | e2e + live | chart.spec:137, tasks.spec:261; 101 and 40.5 rejected | VERIFIED |
| AC30 | e2e | roster.spec:88, :142, :171 | VERIFIED |
| AC38 | unit + e2e | 12 contrast cases, the neutral case; chart.spec:154 | VERIFIED |
| AC9 | e2e + live | tasks.spec:281; 422 for a person from another project | VERIFIED |
| AC31 | e2e | roster.spec:218 | VERIFIED |
| AC10 | e2e + UI16 | after add: B 10-08/10-09 critical, arrow critical; tasks.spec:331 | VERIFIED |
| AC11 | live + e2e | 409 cycle, 422 self, 409 duplicate, dep_count 2; tasks.spec:331 | VERIFIED |
| AC12 | live + e2e + integration | changed [3,4,5]: A 10-05..10-09, B 10-10..10-11, C 10-12, end 10-12; tasks.spec:451; drag.spec:302 x2; slack pytest | VERIFIED |
| AC28 | e2e + live | B stored 10-08..10-09 from a requested start of 10-06; drag.spec:222, :237; tasks.spec:489 | VERIFIED |
| AC39 | e2e + live | A end 10-12 gives M 10-12 and C 10-13..10-14; drag.spec:255 | VERIFIED |
| AC29 | live | A back to 10-07; B and C unchanged | VERIFIED |
| AC13 | e2e + UI16 | arrows [] after removal, B dates unchanged | VERIFIED |
| AC32 | live + integration | clamp returns 200; changed [3,4,5]; 13 rejections leave data unchanged | VERIFIED |
| AC36 | live + e2e + unit | stale PATCH gives B 10-10..10-11; tasks.spec:508 with two pages; CR1 and CR7 unit tests | VERIFIED |
| AC14 | brute force + e2e | mismatches=0 over 3000 graphs and 15035 tasks; sabotaged copy gives 8145; chart.spec:259 | VERIFIED |
| AC15 | unit + e2e | AC15 pytest x2; chart.spec:200 | VERIFIED |
| AC16 | e2e + UI16 | end 10-07 to 10-09 after the add, with the critical set updated; noReload true; tasks.spec:399, :451; drag.spec:302 x2. The mid-transition screenshot is the drawer animating in; the settled shot is clean | VERIFIED |
| AC17 | e2e | drag.spec:97, :125 | VERIFIED |
| AC18 | e2e | drag.spec:141, :156, :168 | VERIFIED |
| AC19 | e2e | chart.spec:289; drag.spec:320 x2 | VERIFIED |
| AC43 | e2e | chart.spec:347, :381 | VERIFIED |
| AC35 | e2e | projects.spec:24, chart.spec:381, tasks.spec:121, :315, roster.spec:69 | VERIFIED |
| AC20 | live restart | port freed, restart, "all project details identical after restart (2247 bytes, 4 projects)" | VERIFIED |
| AC21 | e2e + live | transfer.spec:52; content-disposition chain.gantt.json | VERIFIED |
| AC22 | live + e2e | "byte-identical (671 bytes)"; Chain and Ms byte-identical; transfer.spec:146 | VERIFIED |
| AC23 | integration + live + e2e | 43 invalid-file cases, >5 MB and malformed; LIVE and LIVE2 rejections with count unchanged; LIVE3 415 x4; transfer.spec:204, :230, :264 | VERIFIED |
| AC24 | live + integration | Launch (2), Launch (3); D16 99-char name ends "xxxx (2)" | VERIFIED |
| AC25 | e2e (installed Chrome) | full run 987 / 160 ms; x3 511/74, 559/76, 645/27 ms; all pass | VERIFIED (load-sensitive, per D17) |
| AC37 | e2e + UI16 | layout.spec:155, :205; projects.spec:246; scrollWidth 1280/1280 | VERIFIED |
| AC26 | e2e | flow.spec:77 with the D13 fixture; UI16 and CR7UI console [] | VERIFIED |

## Regression check
- lint and typecheck: exit 0.
- pytest: 379 passed.
- vitest: 165 passed.
- e2e: 77 passed, 0 flaky.

## Summary
43/43 ACs verified. Failures: none. Unverifiable: none.

## Decisions needed
None.

VERDICT: VERIFIED

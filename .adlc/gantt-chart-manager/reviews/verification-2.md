# Verification: gantt-chart-manager (run 2)

Verifier: angel:verifier, fresh context, on HEAD 332b5bc, after review-fix commits de6b1bd, 4ed661c and 332b5bc. It edited no source or tests: `git status -- backend frontend` is clean. Previous run: reviews/verification-1.md, on aa5356b.

The elephant recorded this from the verifier's hand-back, condensed to one line per AC. Key outputs are quoted as given. Evidence scripts are in `../evidence/`. `live_api.sh`, `live_roundtrip.sh` and `ac16_deps_ui.mjs` now take GV_PORT, GV_WEB_PORT and GV_DIR. New in this run: `live_import_ct.sh`, `critical_bruteforce_sabotage.py` and `ac16_after_add_r2.png`.

Commands:
- E2E: `cd frontend && GANTT_E2E_API_PORT=8321 GANTT_E2E_WEB_PORT=5321 npx playwright test --timeout 60000 --global-timeout 900000` -> 77 passed (2.1m), 0 flaky, 0 retries, installed Chrome.
- LIVE: `GV_PORT=8320 GV_DIR=/tmp/gver2/live bash .adlc/gantt-chart-manager/evidence/live_api.sh` (real uvicorn, restart on the same DB, then a fresh DB).
- LIVE2: `live_roundtrip.sh`.
- LIVE3: `live_import_ct.sh` (CR2 content-type gate and D16 trim).
- UI16: `ac16_deps_ui.mjs` against API :8320 and Vite :5320.
- BF / BFX: `critical_bruteforce.py` and a sabotaged copy.
- UNIT: `npx vitest run src/state/store.test.ts src/state/reducer.test.ts` -> 33 passed.

## Evidence

| AC | Method | Evidence (key output) | Status |
|---|---|---|---|
| AC1 | e2e + live | projects.spec:41; LIVE `{"id":1,"name":"Launch","task_count":0} [201]` | VERIFIED |
| AC2 | e2e + integration | projects.spec:125, :179; pytest cascade delete | VERIFIED |
| AC34 | live + e2e | 409 name_taken, 422 empty, 422 >100 chars, rename to LAUNCH 200; projects.spec:85, :104 | VERIFIED |
| AC3 | e2e + live | `{"start":"2026-10-05","end":"2026-10-07","duration":3}`; tasks.spec:101; chart.spec:62 | VERIFIED |
| AC27 | e2e + live | `{"start":"2026-10-09","end":"2026-10-11","duration":3}`; chart.spec:87 | VERIFIED |
| AC4 | e2e + integration | tasks.spec:130; test_edit_dates[*] | VERIFIED |
| AC5 | live + e2e | 13 rejections, then "tasks unchanged after all rejections: YES"; tasks.spec:160 | VERIFIED |
| AC40 | live + e2e | 3651 and 1999-12-31 rejected; schedule_out_of_range 422 with ZA and ZB unchanged; tasks.spec:195 | VERIFIED |
| AC6 | e2e + integration | tasks.spec:543; pytest | VERIFIED |
| AC42 | e2e + integration | tasks.spec:578, chart.spec:402, roster.spec:88; pytest order tests | VERIFIED |
| AC41 | e2e | tasks.spec:543, roster.spec:218, projects.spec delete tests | VERIFIED |
| AC7 | e2e | chart.spec:112, tasks.spec:216, drag.spec:189 | VERIFIED |
| AC33 | e2e + live | 422 milestone_field; unmark test | VERIFIED |
| AC8 | e2e + live | chart.spec:137; 101 and 40.5 rejected | VERIFIED |
| AC30 | e2e + integration | roster.spec:88, :142, :171; pytest colour tests | VERIFIED |
| AC38 | unit + e2e | palette contrast cases; chart.spec:154 | VERIFIED |
| AC9 | e2e + live | assignee e2e; 422 for a person from another project | VERIFIED |
| AC31 | e2e | roster.spec:218 | VERIFIED |
| AC10 | e2e + integration + UI16 | UI16 after add: B 10-08/10-09 critical, arrow 1->2 critical | VERIFIED |
| AC11 | live + e2e | 409 cycle, 422 self, 409 duplicate, dep_count 2; A->A not offered in the UI | VERIFIED |
| AC12 | live + e2e + integration | changed [3,4,5]: A 10-05..10-09, B 10-10..10-11, C 10-12, end 10-12; tasks.spec:451; drag.spec:302 x2 | VERIFIED |
| AC28 | e2e + live | B settles at 10-08..10-09 from a requested start of 10-06; drag.spec:222, :237; tasks.spec:489 | VERIFIED |
| AC39 | e2e + live | M dragged to 10-08 settles on 10-09; A end 10-12 gives M 10-12 and C 10-13..10-14 | VERIFIED |
| AC29 | live + integration | A back to 10-07; B and C unchanged | VERIFIED |
| AC13 | e2e + UI16 | after removal, arrows [] and dates unchanged | VERIFIED |
| AC32 | live + integration | clamp returns 200; `changed` lists the edited task plus the cascaded ones; 13 rejections leave data unchanged | VERIFIED |
| AC36 | live + e2e + unit | stale PATCH gives B 10-10..10-11; tasks.spec:508 with two pages; CR1 out-of-order unit test | VERIFIED |
| AC14 | brute force + e2e | graphs=3000, tasks=15035, mismatches=0; sabotaged copy gives mismatches=8145; ring e2e | VERIFIED |
| AC15 | unit + e2e | AC15 pytest; chart.spec:200 | VERIFIED |
| AC16 | e2e + UI16 | new tasks.spec:399 (DD1 closed); tasks.spec:451; drag.spec:302 x2; UI16 noReload true, console [] | VERIFIED |
| AC17 | e2e | drag.spec:97, :125 | VERIFIED |
| AC18 | e2e | drag.spec:141, :156, :168 | VERIFIED |
| AC19 | e2e | chart.spec:289; drag.spec:320 x2 | VERIFIED |
| AC43 | e2e | chart.spec:347, :381 | VERIFIED |
| AC35 | e2e | projects.spec:24, chart.spec:381, tasks.spec:121, :315, roster.spec:69 | VERIFIED |
| AC20 | live restart | port freed, restart, "all project details identical after restart (2247 bytes, 4 projects)" | VERIFIED |
| AC21 | e2e + live | transfer.spec:52; content-disposition chain.gantt.json | VERIFIED |
| AC22 | live + e2e | fresh DB "byte-identical (671 bytes)"; LIVE2 Chain and Ms byte-identical; transfer.spec:146 | VERIFIED |
| AC23 | integration + live + e2e | 422 and 400 rejections with project count unchanged; LIVE3: text/plain, form, multipart and missing type all 415; UI import still passes (transfer.spec:146) | VERIFIED |
| AC24 | live + integration | Launch (2), Launch (3); D16 trim: a 99-char name ends "xxxx (2)" | VERIFIED |
| AC25 | e2e (installed Chrome) | full run: 978 ms load+drag, 168 ms settle; x5: 1154-1221 / 155-173 ms; HEAD passed 12/12 runs | VERIFIED (sensitive to load, see note 1) |
| AC37 | e2e + UI16 | layout.spec:155, :205; projects.spec:246; scrollWidth 1280/1280 | VERIFIED |
| AC26 | e2e | flow.spec:77 with the D13 fixture; UI16 unfiltered console [] | VERIFIED |

## Regression check
- lint and typecheck: exit 0.
- pytest: 379 passed.
- vitest: 163 passed.
- e2e: 77 passed, 0 flaky.

## Summary
43/43 ACs verified. Failures: none. Unverifiable: none.

Notes:
1. AC25 is sensitive to machine load (load average ~26-45 from Defender, OneDrive and concurrent reviewer e2e runs). An interleaved A/B against aa5356b under the same load gave the old commit 144-201 ms (1 run failed at 201) and HEAD 158-160 ms (6/6 passed). So the narrower margin is the environment, not the CR1 serialisation.
2. CR1 and CR3 are proven by named vitest cases plus the e2e editor and create flows. There is no dedicated browser test that races two drags.

## Decisions needed
None.

VERDICT: VERIFIED

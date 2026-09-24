## Why
We need a polished, demo-worthy web app for planning projects on a Gantt chart. It also exercises the ADLC end to end: pure scheduling logic, an HTTP API, persistence and a rich interactive UI. The repo was empty, so this PR builds the whole app, modest in scope but professional in look and correct in behaviour.

## What changed
- **S1 Scaffold:** a FastAPI + uv backend and a Vite + React 19 + TypeScript 7 frontend, with one `justfile` (install, dev, test, lint, typecheck, e2e, check) and smoke tests. Playwright uses the installed Chrome.
- **S2 Scheduling engine:** a pure Python package for calendar-day maths, clamping, the push-only cascade, the milestone rule, cycle detection and the critical path (zero-slack links only). It has no DB or HTTP imports.
- **S3 Timeline maths:** pure TypeScript for date to x, the zoom header tiers, the timeline range and drag snapping.
- **S4 Persistence and projects/roster API:** SQLite through stdlib `sqlite3`, projects, people and a 12-colour palette with at least 4.5:1 label contrast, and a full ProjectDetail with the critical path in every response.
- **S5 Tasks and dependencies API:** the server is authoritative. Every write runs the engine inside one `BEGIN IMMEDIATE` transaction, clamps and cascades, and returns every changed task.
- **S6 JSON export/import:** byte-stable export with file-local keys. Import validates everything, never adjusts dates, always creates a new project with a " (n)" suffix on name clashes, and requires `application/json`.
- **S7 Frontend shell:** API client, reducer store with a serialised write queue, project list, toolbar, dialogs and toasts.
- **S8 Chart:** bars and milestone diamonds in assignee colours, day/week/month zoom, weekend shading, dependency arrows, a critical-path ring and marker that don't rely on colour, a today line, and the project end.
- **S9 Task panel and editor:** create and edit dates, duration, milestone, % complete, assignee and dependencies, and delete with confirmation.
- **S10 Roster panel:** add, rename, recolour and remove people from the palette.
- **S11 Drag and resize:** move a bar, drag either edge, snap to whole days in every zoom. The server cascade shows about 25–170 ms after release.
- **S12 Export/import UI.**
- **S13 Quality gates:** a 200-task performance spec, the 1280x800 layout spec (the task editor and roster drawers no longer overlap), and a full console-clean demo flow.
- **Review fixes:** writes are applied in the order they were issued (CR1, CR7). Import rejects any request that isn't `application/json`, which blocks cross-site simple POSTs (CR2). The editor opens a new task by `created_id` (CR3). The timeline no longer slides under a bar when the earliest task moves. Plus an AC16 regression test.

## Acceptance criteria
All 43 are met. Each has a committed test that fails without it (checked by the drift checker, round 3).
- [x] Projects: AC1 create/persist, AC2 rename/delete cascade, AC34 name rules, AC35 empty states, AC41 delete confirmations, AC42 creation order
- [x] Tasks: AC3 duration → end, AC4 edit anchors, AC5 invalid input rejected, AC6 delete with dependencies, AC7 milestones, AC8 % complete, AC27 calendar days and weekend shading, AC33 milestone rules, AC40 limits
- [x] Roster: AC9 assignee colours, AC30 roster CRUD and validation, AC31 recolour/remove, AC38 contrast
- [x] Scheduling: AC10 dependency push, AC11 cycle/self/duplicate rejected, AC12 cascade, AC13 removal keeps dates, AC28 clamp, AC29 push-only, AC32 atomic API rules, AC36 server authority with stale tabs, AC39 milestone rule
- [x] Critical path: AC14 definition and highlight, AC15 examples, AC16 live update without reload
- [x] Interaction: AC17 drag, AC18 resize, AC19 zoom, AC43 initial scroll and range
- [x] Persistence and transfer: AC20 restart, AC21 export format, AC22 byte-identical round trip, AC23 invalid files rejected, AC24 import naming
- [x] Quality: AC25 performance (200 tasks / 250 deps), AC26 console-clean flow, AC37 1280x800 layout

## Evidence it works
Verification run 3 on 4cf26a9 (`.adlc/gantt-chart-manager/reviews/verification.md`): **43/43 VERIFIED, no regressions.** The verifier worked in a fresh context and edited no source.
- **e2e:** 77 Playwright tests in the installed Chrome, 0 flaky. The verifier read each cited test's assertions, not just its title.
- **Integration and unit:** pytest 379, vitest 165.
- **Live API** (`evidence/live_api.sh`, `live_roundtrip.sh`, `live_import_ct.sh`): a real uvicorn restart with identical data (AC20); export, import into a fresh DB, then export again, byte-identical (AC22); every rejection returns 4xx with nothing written.
- **Critical path (AC14):** a brute-force check of the spec's literal definition over 3000 random DAGs (15,035 tasks) found 0 mismatches. A sabotaged copy found 8145, so the check can fail.
- **Write ordering (CR1/CR7):** unit tests, a sabotaged copy that makes them fail, and a real-browser race (`evidence/cr7_rename_race_ui.mjs`).
- **Performance (AC25):** 200 tasks load and accept a drag in about 0.5–1.0 s against a 2 s budget. The cascade shows 27–170 ms after release against a 200 ms budget. It is load-sensitive; see D17.
- **Waived:** none.

## Decisions made
All of these were decided by the user, and are recorded in `.adlc/gantt-chart-manager/decisions.md`:
- **D1** Calendar days or working days? Calendar days, with weekends shaded.
- **D2** Conflict on reschedule? Auto-push successors in a cascade.
- **D3** Assignees? A per-project roster with colours.
- **D4** Import semantics? Always create a new project.
- **D5** Pull successors back when a predecessor moves earlier? No, push only.
- **D6** Milestone after a task? It sits on the predecessor's end day.
- **D7** Colours? A curated 12-colour palette.
- **D8** Project name uniqueness? Unique everywhere, ignoring case.
- **D9** API writes that break a dependency? The server cascades and clamps atomically.
- **D10** UI framework? React 19 + Vite.
- **D11** Predict the cascade in the client? No, one engine on the server.
- **D12** Which arrows are critical? Zero-slack links only.
- **D13** Chrome's 4xx network log lines in the console check? Ignored; app errors and 5xx still fail.
- **D14** AC25 dev-server first compile? Warm up Vite before measuring.
- **D15** Make memo actually skip rows? No; the comment was corrected.
- **D16** Trim spaces after shortening an imported name? Yes, pinned by a test.
- **D17** AC25 margin under load? Keep as is and treat it as load noise.
- **D18** Fix the rename race (CR7)? Fixed.
- **D19** console.log timing prints in the perf spec? Waived as test output.

## How it was reviewed
- **Code review:** APPROVE after 3 rounds. 7 findings (1 major, 6 minor) were fixed, and none were waived.
- **Drift check:** PROCEED after 3 rounds. 43/43 ACs are implemented and covered by tests.
- **Plan audit:** PROCEED. **Spec review:** READY after 2 rounds.
- **Process trail:** spec, plan, decisions, reviews and evidence are all in `.adlc/gantt-chart-manager/`.

## How to test
```bash
just install
just check          # lint, typecheck, pytest, vitest, Playwright e2e (installed Chrome)
just dev            # API + Vite; open the printed URL
```
Manual demo: create a project, add three chained tasks, open People and add two people, assign them, then drag the first bar right. The successors cascade and the critical ring moves. Switch between Day, Week and Month, then Export and Import the file (it arrives as "Name (2)").

🤖 Generated with [Claude Code](https://claude.com/claude-code)

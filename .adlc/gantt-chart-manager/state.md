---
feature: gantt-chart-manager
phase: review
updated: 2026-09-24
next: dispatch code-reviewer + drift-checker (diff) in parallel
verification: required
---

# Gantt chart manager

Idea: I need to make a - **Gantt chart manager** (web app, chosen over swim-lane board)
    - Features: project/task CRUD, start/end/duration, finish-to-start dependencies, critical path, drag to reschedule, drag edges to resize, zoom, milestones, % complete, task assignment, persistence, JSON export/import
    - Stack: free choice (suggested: Python backend + TypeScript frontend)
    - Goal is to exercise and stress-test the ADLC, not to ship a perfect product
    - Create a GitHub repo for both the ADLC plugin and the project

This is a fresh repo so we can interate on ideas together to come up with something worth demoing. It doesnt have to be super complicated, but I want to do it right and for it to look great.

## Decision log
- 2026-09-24: started from idea
- 2026-09-24: GitHub repos already exist: angeld-hg/angel-adlc (plugin) and angeld-hg/hg-gaant-chart (project, origin)
- 2026-09-24: discover done; user triaged gaps: scaffold+smoke tests in slice 1, no CI, SQLite, try TS 7 (pin 5.x if broken), npm
- 2026-09-24: D1 decided: calendar days (user)
- 2026-09-24: D2 decided: auto-push cascade (user)
- 2026-09-24: D3 decided: per-project roster with colours (user)
- 2026-09-24: D4 decided: import always creates new project (user)
- 2026-09-24: D5 decided: push only, no pull-back (user)
- 2026-09-24: spec-review round 1: REVISE (reviews/spec-review.md)
- 2026-09-24: D6 decided: milestone same day as predecessor end (user)
- 2026-09-24: D7 decided: curated colour palette (user)
- 2026-09-24: D8 decided: project names unique everywhere (user)
- 2026-09-24: D9 decided: server cascades/clamps atomically (user)
- 2026-09-24: spec-review round 2: READY (reviews/spec-review-2.md)
- 2026-09-24: user approved spec as-is (43 ACs); round-2 should-fixes (AC32 error contract, AC43 wording) left for planner to handle
- 2026-09-24: first planner dispatch lost (session restarted, no plan.md after ~10 min); re-dispatched planner at user's request
- 2026-09-24: correction: first planner was still running and finished (plan.md, 13 slices, ~17 min); duplicate planner stopped before writing
- 2026-09-24: D10 decided: React 19 + Vite (user)
- 2026-09-24: D11 decided: server round trip only, no TS engine (user)
- 2026-09-24: D12 decided: critical arrows = zero-slack links only (user)
- 2026-09-24: plan drift check: PROCEED, 43/43 ACs, 3 medium test-gap findings (reviews/plan-drift.md)
- 2026-09-24: user approved plan with a planner fix pass (drift findings) + AC14 reworded to D12; then implement
- 2026-09-24: AC14 reworded to match D12 (spec-writer); spec still has 43 ACs
- 2026-09-24: planner fix pass applied all drift findings; branch angel/gantt-chart-manager created; implement started
- 2026-09-24: S1 DONE (pytest 1, vitest 1, e2e 2; lint/typecheck clean; TS 7 works, no 5.x pin); verified by elephant; committed
- 2026-09-24: user chose to commit .adlc/ artifacts (remove .adlc ignore line) and refresh discover in parallel with W2
- 2026-09-24: chore: .adlc un-ignored in .gitignore (verified: check-ignore exit 1)
- 2026-09-24: S3 DONE (80 timeline tests; vitest 81 total verified by elephant; minor C6 addition HeaderUnit.title)
- 2026-09-24: discover refreshed (verification.md vs HEAD 4fbe50e); gaps: e2e ports/DB hard-coded (parallel e2e collide), vitest ignores *.test.tsx
- 2026-09-24: S2 DONE (83 scheduling tests, pytest 84 total, mypy strict clean) verified by elephant; W2 committed with .adlc artifacts; chore (parallel-safe e2e ports) running
- 2026-09-24: chore DONE: e2e ports/DB/output env-overridable (two concurrent runs shown passing), vitest collects .test.tsx; plan C1 + verification Gaps amended by elephant
- 2026-09-24: S4 DONE (pytest 166, mypy/ruff clean, live restart-persistence evidence) verified by elephant; committed
- 2026-09-24: S5 DONE (126 new tests, pytest 292, live AC12 cascade + AC36 clamp + restart evidence) verified by elephant; committed
- 2026-09-24: S6 DONE (78 tests, pytest 370, live cross-server byte-identical round trip) verified by elephant; committed backend only (S7 still running)
- 2026-09-24: S7 implementer stalled (600s watchdog) mid-slice; partial files intact, no servers left; resumed same agent with its context
- 2026-09-24: S7 BLOCKED on console-4xx fixture issue; D13 decided: ignore browser 4xx network logs (user); routed to S7 implementer with fixtures.ts ownership
- 2026-09-24: S7 DONE (vitest 116, e2e 14/14 with D13 fixture filter, lint/typecheck clean) verified by elephant; W5 committed
- 2026-09-24: S12 DONE (transfer.spec 6/6 re-run by elephant on isolated ports; byte-identical UI round trip) committed; S8 still running
- 2026-09-24: S8 DONE (chart.spec 12, full e2e 32/32, vitest 124, lint/typecheck) verified by elephant; screenshot reviewed; W6 committed
- 2026-09-24: S10 DONE (roster.spec 5; elephant re-run: first run 2/5 in 23s under concurrent S9/S11 load, then 5/5 and 15/15 with --repeat-each=3 -> possible load flakiness, watch in verify). Note: roster drawer and task editor drawer may overlap (S13/review). Committed
- 2026-09-24: S11 DONE (drag.spec 15 + chart.spec 12 = 27/27 re-run by elephant) committed; found timeline-shift glitch when earliest task moves (Chart.tsx scrollLeft compensation) -> fix routed to implementer
- 2026-09-24: S9 DONE (tasks.spec 17 re-run by elephant, vitest 153); A->A not offered in UI (API rejects; plan test list contradiction noted) committed; W7 complete; Chart.tsx scroll fix still running
- 2026-09-24: scroll-shift fix DONE (chart-scroll.spec 2, failed first). Integrated gate by elephant: lint/typecheck OK, pytest 370, vitest 153, e2e 71/71. Committed; S13 dispatched
- 2026-09-24: S13 implementer stalled (600s watchdog) with no files written; resumed same agent
- 2026-09-24: S13 stalled again on resume (nothing written); split into S13a perf (AC25), S13b layout+drawer overlap (AC37), S13c flow+flakiness (AC26), fresh agents in parallel with disjoint fix lanes
- 2026-09-24: S13b DONE (layout.spec 3/3 re-run by elephant; drawers now mutually exclusive via reducer; AC37 already met by CSS) committed
- 2026-09-24: S13a DONE (perf.spec re-run by elephant: 579 ms load+drag, 24 ms cascade; no src changes); D14 raised (dev-server warm-up in AC25 measurement) - pending
- 2026-09-24: D14 decided: keep dev-server warm-up (user). S13c DONE (flow.spec AC26; full suite x3: 228/228 on settled tree; one mid-edit failure attributed to concurrent change)
- 2026-09-24: all 13 slices DONE; elephant ran just check on 34eefbf: lint/typecheck clean, pytest 370, vitest 156, e2e 76/76
- 2026-09-24: user approved implement gate; verify started
- 2026-09-24: verification VERIFIED 43/43, no regressions (reviews/verification.md); note: AC16 dep add/remove lacks a committed e2e test
- 2026-09-24: user approved verify gate; review started
- 2026-09-24: review round 1: code-review CHANGES_REQUESTED (1 major CR1 out-of-order responses, 5 minor), diff-drift PROCEED (DD1 AC16 test gap)
- 2026-09-24: D15 decided: correct Bars.tsx comment only (user); D16 decided: keep trim after shortening, pin with test, AC24 clarified (user)
- 2026-09-24: elephant amended spec AC24 (D16) and plan S9 test list (DD2); fixes CR1+CR3, CR2+D16 test, CR4+CR6+DD1 routed to 3 implementers
- 2026-09-24: CR2 fix BLOCKED on 2 test_roundtrip.py imports lacking Content-Type (now correctly 415); lane widened to that file
- 2026-09-24: CR2+D16 DONE (pytest 379 verified by elephant) committed
- 2026-09-24: CR1+CR3 DONE (write queue in store; created_id opens editor; vitest 163 verified by elephant) committed

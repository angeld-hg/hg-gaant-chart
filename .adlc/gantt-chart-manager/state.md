---
feature: gantt-chart-manager
phase: implement
updated: 2026-09-24
next: waves: W1 S1 | W2 S2+S3 | W3 S4 | W4 S5 | W5 S6+S7 | W6 S8+S12 | W7 S9+S10+S11 | W8 S13 (now: W5)
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

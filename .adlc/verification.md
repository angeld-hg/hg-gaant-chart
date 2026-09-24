# Verification profile: hg-gaant-chart

Generated 2026-09-24 by angel:repo-scout (refresh after the S1 scaffold, commit `4fbe50e` on `angel/gantt-chart-manager`). Refresh with /angel:discover when tooling changes.

Every command below was run in this session against a clean export of `HEAD` (`git archive HEAD` into a temp dir). I did that so the baseline would not race the two implementers working in `backend/` and `frontend/`. At the time of the run, the live tree matched HEAD for `backend/` and `frontend/`; the only difference was `.gitignore` (the `.adlc` ignore line had been removed).

## What this repo is
A **Gantt chart manager** web app, built mainly to stress-test the ADLC. The user is a single person managing projects in a browser: project/task CRUD, finish-to-start dependencies, critical path, drag to reschedule/resize, zoom, milestones, % complete, assignees, SQLite persistence, and JSON export/import (43 ACs in `.adlc/gantt-chart-manager/spec.md`). It is a two-part monorepo. `backend/` is FastAPI plus stdlib `sqlite3`, and all scheduling logic is planned for the pure package `backend/app/scheduling/`. `frontend/` is Vite, React 19 and TypeScript 7. It is a thin client that renders whatever `ProjectDetail` the server returns (contract C2 in `plan.md`). The root `justfile` is the single entry point.

Entry points:
- Backend: `backend/app/main.py`, which exposes `create_app(db_path=None)` and a module-level `app`. The DB path comes from the arg, then `GANTT_DB_PATH`, then `backend/data/gantt.db`.
- Frontend: `frontend/src/main.tsx` renders `App.tsx`.
- State at HEAD: the only route is `GET /health`. The UI is just an `<h1>Gantt</h1>`. No DB file or schema is created yet; that arrives in W2 (S2/S3).

## Stack
- Python **3.12** (`backend/.python-version`), managed by uv 0.12.11. `package = false` in pyproject. Resolved versions: fastapi (with starlette 1.6.0, pydantic 2.13.5), uvicorn 0.53.0. Dev tools: pytest 9.1.1, httpx, ruff 0.16.8, mypy (strict, `files = ["app"]`).
- SQLite through the stdlib: Python's `sqlite3` reports 3.53.1, and the `sqlite3` CLI is 3.54.0.
- Node v26.8.1 and npm 11.19.0 (npm only; pnpm and yarn are not installed). React ^19.3, Vite ^8.3, @vitejs/plugin-react ^6.1, **TypeScript 7.0.2** (native compiler, works, not pinned), vitest 5.0.1, @playwright/test ^1.63, Biome ^2.5.14.
- There is no jsdom/happy-dom and no @testing-library, so vitest runs in node only.

## Environment conventions (observed; these affect every recipe)
- **Hooks block:**
  - bare `python3` (use `uv run python ...`, or `uv run --no-project python ...` outside backend/)
  - any command containing `auth`, which is why `gh auth status` can't be run
  - **any command containing `..`**, which is new this session. Use absolute paths, for example `cd "$ROOT/backend"` rather than `cd ../backend`.
- GNU `timeout` is not available (macOS), so poll in a loop.
- `lsof` prints noisy "can't stat() hfs" warnings. Use `lsof -nP -tiTCP:<port> -sTCP:LISTEN 2>/dev/null`.
- `npm install` prints a harmless safe-chain `install-scripts` warning about `fsevents`.
- The repo is under OneDrive. No sync-related slowness was observed (the whole install took 5s).
- **Ports in use by the repo:**
  - dev: API :8000, Vite :5173
  - e2e: API :8100, Vite :5180, `reuseExistingServer: false`
  - Use **:8765 / :5199** for ad-hoc verification servers so you don't collide with `just dev` or `just e2e`.

## Tooling access
| Tool | Status | Notes |
|---|---|---|
| just | 1.58.0, works | `just --list` shows check, default, dev, e2e, format, install, lint, test, typecheck |
| uv | 0.12.11, works | `uv sync` resolved from `uv.lock` |
| npm/npx | 11.19.0, works | `npm install` leaves `package-lock.json` unchanged |
| Playwright | works through the repo dep, `channel: "chrome"` | uses the installed Google Chrome; no browser download |
| gh | 2.100.0, works | `gh repo view angeld-hg/hg-gaant-chart` returns PUBLIC, default branch `main` (the auth-status check itself is hook-blocked) |
| docker | installed, daemon NOT running | not needed (SQLite by decision) |
| CI | none (`.github/` absent) | accepted by the user; see Gap triage |
| claude-in-chrome (orchestrator) | available | navigate, screenshot, click, read page, console, JS, GIF. Not callable by the scout, so it was not exercised here |
| sqlite3 CLI | 3.54.0 | for inspecting DB files |

## Commands (tried)
Wall times include uv/npx start-up.

| Purpose | Command | Result |
|---|---|---|
| Install | `just install` | works: uv sync plus `npm install` (54 packages) in 5s, exit 0 |
| Test (all) | `just test` | works, exit 0, 6s: pytest `1 passed, 2 warnings in 0.01s`, then vitest `Test Files 1 passed / Tests 1 passed` |
| Test (one, backend) | `cd backend && uv run pytest -q tests/test_health.py::test_health_returns_ok` (or `-k health`) | works: 1 passed |
| Test (one, frontend) | `cd frontend && npx vitest run src/smoke.test.ts` (or `-t "names the app"`) | works: Tests 1 passed |
| Lint | `just lint` | works, exit 0, 1s: ruff "All checks passed!", "5 files already formatted"; biome "Checked 11 files ... No fixes applied." |
| Typecheck | `just typecheck` | works, exit 0, 5s: mypy "Success: no issues found in 2 source files"; `tsc --noEmit` silent (TS 7.0.2) |
| Build | `cd frontend && npm run build` (runs `tsc --noEmit && vite build`) | works, exit 0, under 1s: `dist/index.html`, JS bundle 219.7 kB (68.6 kB gzip) |
| E2E | `npx playwright test -c <copy of playwright.config.ts with ports 8766/5198>`, run in the temp export | works, exit 0, 5s: **2 passed** (app shell with no console errors; `/health` proxied through Vite). `just e2e` itself was not run, to avoid the implementers' :8100/:5180, but it is the same config apart from the ports |
| Run (API) | `GANTT_DB_PATH=/tmp/x/live.db uv run uvicorn app.main:app --port 8765` | works: `/health` returns `{"status":"ok"}` [200] in under 1s; `openapi.json` paths are `["/health"]`; `/api/projects` returns 404 (not built yet) |
| Run (UI) | `GANTT_API_URL=http://localhost:8765 npx vite --port 5199 --strictPort` | works: `/` serves `<title>Gantt</title>`; `/health` through the proxy returns `{"status":"ok"}` [200] |
| Headless screenshot | `node shot.mjs http://localhost:5199/ out.png` (script below) | works in 1s: `h1: Gantt`, `console errors: []`, PNG written |
| Dev (both) | `just dev` | not run (it would take :8000/:5173 from the implementers); its two halves were proven separately above |

All servers I started were killed, and ports 8765, 5199, 8766 and 5198 were confirmed free.

## Evidence recipes
Strongest proof first. The planner and verifier pick from this list. `ROOT=/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart`.

**Full gate:** `just lint && just typecheck && just test && just e2e` (that is, `just check`). A pass is exit 0 at every stage. pytest and vitest print `N passed` with no `failed`/`error`, and Playwright prints `N passed`. The baseline is: pytest 1, vitest 1, e2e 2.

1. **Pure logic (backend `app/scheduling/`: dates, clamp, cascade, cycles, critical path, slack):**
   - Command: `cd $ROOT/backend && uv run pytest -q tests/<file>.py`. Pass means `N passed`, with N equal to the number of new table cases plus the existing ones.
   - Also run `uv run mypy app`; strict mode must stay clean.
   - The tests should be table-driven over small DAGs whose CP and slack you can check by hand.
2. **Pure logic (frontend `src/timeline/`: date to x, zoom headers, snapping):**
   - Command: `cd $ROOT/frontend && npx vitest run src/timeline/<file>.test.ts`.
   - **Only `src/**/*.test.ts` is collected** (see `vite.config.ts`). A `*.test.tsx` file is silently ignored, so check that the "Test Files" count went up.
3. **API/HTTP, in process (strongest for C2 contract shapes, 4xx error bodies, and atomic rollback):**
   - Use the pytest `client` fixture in `backend/tests/conftest.py`. It gives a `TestClient(create_app(tmp_path/"t.db"))`, so each test has its own fresh DB.
   - Assert the status code, the full JSON shape (`MutationResult`, `ApiErrorBody`), and that nothing was written after an error by re-reading with GET.
4. **API/HTTP, live (end-to-end proof over a real socket):**
   ```bash
   cd $ROOT/backend && mkdir -p /tmp/gv && GANTT_DB_PATH=/tmp/gv/v.db nohup uv run uvicorn app.main:app --port 8765 >/tmp/gv/api.log 2>&1 & echo $! >/tmp/gv/api.pid
   for i in $(seq 1 60); do curl -sf localhost:8765/health >/dev/null && break; sleep 0.25; done   # ready in under 1s
   curl -s localhost:8765/health                      # expect {"status":"ok"}
   curl -s localhost:8765/openapi.json | jq '.paths|keys'   # lists the routes that actually exist
   curl -s -X POST localhost:8765/api/projects -H 'content-type: application/json' -d '{"name":"P"}' -w ' [%{http_code}]\n'   # once S2 lands, expect 201 ProjectSummary
   kill $(cat /tmp/gv/api.pid); lsof -nP -tiTCP:8765 -sTCP:LISTEN 2>/dev/null || echo free
   ```
   - **Persistence proof:** create data, kill the server, restart it with the same `GANTT_DB_PATH`, then GET again; the data must still be there.
   - **Export/import round trip:** GET `/api/projects/{id}/export > a.json`, POST it to `/api/import`, export the new project to `b.json`, then `diff <(jq -S 'del(..|.id?)' a.json) <(jq -S 'del(..|.id?)' b.json)`. Adjust the key filter to the C5 format.
5. **UI, automated (strongest for the UI):**
   - Add a spec in `frontend/e2e/` that imports `test`/`expect` from `./fixtures.ts`. Its auto fixture fails the test on any `console.error` or `pageerror`.
   - Run `cd $ROOT/frontend && npx playwright test e2e/<spec>.ts` (or `just e2e` for all specs). It starts its own API on :8100 with a fresh `frontend/.e2e-data/e2e.db`, plus Vite on :5180.
   - Seed data over HTTP with the `request` fixture. Fix "today" with `page.clock.setFixedTime`.
   - For drag and resize, assert the bar's `boundingBox()` or `data-testid` attributes before and after `page.mouse.down/move/up`, then confirm the result through `request.get('/api/projects/{id}')`.
   - Traces are kept on failure in `frontend/test-results/`.
6. **UI, interactive or demo evidence (claude-in-chrome):**
   - Start the API as in recipe 4 on :8765. Then run `cd $ROOT/frontend && GANTT_API_URL=http://localhost:8765 nohup npx vite --port 5199 --strictPort >/tmp/gv/vite.log 2>&1 &` and poll `curl -sf localhost:5199/`.
   - Then navigate to `http://localhost:5199`, screenshot, interact, read the console (expect no errors), and record a GIF of drag-to-reschedule.
   - Headless fallback, verified here. Run it from inside `frontend/` so `@playwright/test` resolves, putting the script in `frontend/` temporarily or in a temp copy:
     ```js
     import { chromium } from "@playwright/test";
     const b = await chromium.launch({ channel: "chrome", headless: true });
     const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
     const errs = []; p.on("console", m => m.type()==="error" && errs.push(m.text())); p.on("pageerror", e => errs.push(e.message));
     await p.goto(process.argv[2]); await p.screenshot({ path: process.argv[3], fullPage: true });
     console.log("console errors:", JSON.stringify(errs)); await b.close();
     ```
7. **CLI:** none exists or is planned.
8. **Data/DB:** `sqlite3 /tmp/gv/v.db '.tables'` and `sqlite3 -header /tmp/gv/v.db 'select * from tasks'`. At HEAD no DB file is created (no schema yet). The dev DB is `backend/data/gantt.db` and the e2e DB is `frontend/.e2e-data/e2e.db`; both are git-ignored along with `*.db`. Never point verification at the dev DB. Use a temp `GANTT_DB_PATH`.
9. **Background jobs:** none.

## Gaps
- **Parallel `just e2e` runs collide.** The ports (8100/5180) and the e2e DB path are hard-coded, and `reuseExistingServer: false` makes a second concurrent run fail on the busy port. This matters now, with two implementers in the same working tree. **Closed 2026-09-24 (chore):** `playwright.config.ts` now reads `GANTT_E2E_API_PORT`/`GANTT_E2E_WEB_PORT`/`GANTT_E2E_DB_PATH`/`GANTT_E2E_OUTPUT_DIR` (defaults unchanged). Two concurrent runs with distinct ports were shown to pass. Parallel implementers must use distinct ports. vitest now also collects `*.test.tsx`.
- **No React component unit tests.** vitest has no DOM environment, and its include pattern ignores `*.test.tsx`. Components are provable only through Playwright or claude-in-chrome. This is acceptable under D11 (thin client). If component tests are wanted: `npm i -D jsdom @testing-library/react`, and add `src/**/*.test.tsx` and `environment: "jsdom"` to the vitest config.
- **Deprecation warnings in pytest.** starlette's TestClient warns that httpx is deprecated in favour of `httpx2`, and there is an anyio `BlockingPortal` alias warning. These are harmless now, but they would fail if anyone adds `-W error`. Fix when convenient: swap the dev dep to `httpx2` (after checking it exists and that TestClient accepts it), or filter the warnings in `[tool.pytest.ini_options]`.
- **No CI.** Accepted (see triage). Verification is local only, and check-pr will find no CI checks.
- **`just dev` was not exercised as a unit.** It was not run to avoid the implementers' ports; its two halves were proven separately. Low risk.
- The claude-in-chrome channel was not exercised by the scout (it is orchestrator-only). The headless Playwright screenshot fallback is proven.
- Closed since the last profile: scaffold/tests, commands, TS 7 (works with `tsc --noEmit` and `vite build`, not pinned), frontend typecheck on a real project.

### Gap triage (user, 2026-09-24)
- No scaffold/tests: **close now**. Slice 1 scaffolds backend + frontend with smoke tests and a justfile; re-run /angel:discover afterwards.
- No CI: **accepted**. No GitHub Actions; verification is local only. check-pr PR mode will have no CI checks to read.
- Docker not running: **closed by choice**. Use SQLite.
- Playwright in CI: **n/a** (no CI). Locally use `channel: "chrome"`.
- TypeScript 7.0.2: **close in slice 1**. Try TS 7 with a real `tsc --noEmit` + Vite build, and pin 5.x if the tooling breaks.
- pnpm/yarn: **accepted**. Use npm.

## Baseline
- Pre-existing failures at HEAD `4fbe50e` (`angel/gantt-chart-manager`), before W2: **none**.
  - lint: clean
  - typecheck: clean
  - pytest: 1 passed, with 2 deprecation warnings
  - vitest: 1 passed
  - e2e: 2 passed
  - build: OK

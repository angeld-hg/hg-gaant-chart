# hg-gaant-chart

A Gantt chart manager web app: a FastAPI + SQLite backend (`backend/`) and a Vite + React 19 +
TypeScript frontend (`frontend/`). A root `justfile` is the single entry point.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (it installs and manages Python 3.12 for the backend)
- Node.js and npm (pnpm and yarn are not used)
- [just](https://github.com/casey/just)
- Google Chrome. Playwright runs the e2e tests in the installed Chrome (`channel: "chrome"`), so
  you don't need to download a browser.

## Commands

| Command | What it does |
|---|---|
| `just install` | `uv sync` in `backend/` and `npm install` in `frontend/` |
| `just dev` | API on http://localhost:8000 (auto-reload) and Vite on http://localhost:5173. Ctrl-C stops both |
| `just test` | pytest (backend), then vitest (frontend unit tests in `src/**/*.test.ts` and `src/**/*.test.tsx`, node environment, no DOM) |
| `just lint` | `ruff check` + `ruff format --check`, then `biome check` |
| `just format` | apply ruff and biome formatting and safe fixes |
| `just typecheck` | `mypy` (strict) on `backend/app`, then `tsc --noEmit` |
| `just e2e` | Playwright specs in `frontend/e2e/` against a backend on :8100 and Vite on :5180 |
| `just check` | lint, typecheck, test, then e2e |

## Configuration

- `GANTT_DB_PATH` sets the SQLite file. The default is `backend/data/gantt.db` (git-ignored).
- In dev, Vite proxies `/api` and `/health` to `GANTT_API_URL` (default `http://localhost:8000`).
- The e2e run starts its own backend with a fresh throwaway DB at `frontend/.e2e-data/e2e.db`.
  To run several e2e runs at once in one tree, give each its own ports:
  `GANTT_E2E_API_PORT=8110 GANTT_E2E_WEB_PORT=5190 just e2e`. A non-default port also gets its own
  DB (`.e2e-data/e2e-<api port>.db`) and output dir (`.e2e-data/test-results-<web port>`); override
  those with `GANTT_E2E_DB_PATH` and `GANTT_E2E_OUTPUT_DIR`. A busy port fails the run rather than
  reusing another run's servers.

## Notes

- TypeScript 7 (the native compiler) is in use. `tsc --noEmit` and `vite build` both work with it,
  so it isn't pinned to 5.x.
- Every e2e spec imports `test` and `expect` from `frontend/e2e/fixtures.ts`. Its automatic
  fixture fails any test that logs a `console.error` or throws an uncaught page error.
- Don't name any source directory `lib`, `build` or `dist`: the root `.gitignore` ignores them.

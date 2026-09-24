# Plan: Gantt chart manager

## Approach
The repo is empty, so the plan builds a two-part monorepo: `backend/` (FastAPI + stdlib `sqlite3`, a uv project) and `frontend/` (Vite + React + TypeScript, npm), with one root `justfile` as the entry point. All scheduling (date maths, clamp, push-only cascade, milestone rule, cycle detection) and critical-path logic lives in one pure Python package, `backend/app/scheduling/`. It has no DB or HTTP imports and is table-tested in isolation. Every write goes through that engine inside one `BEGIN IMMEDIATE` SQLite transaction. The response to every project-scoped write is the full `ProjectDetail`, including the recomputed critical path and project end, plus the list of changed task ids. So the client never schedules. It shows what the server returns, which keeps a single engine (D9) and satisfies AC16, AC32 and AC36 without a second engine in TypeScript. The frontend's own pure code is limited to calendar and pixel maths (`frontend/src/timeline/`): date to x, zoom headers, timeline range, and drag snapping. Bars are HTML elements, so ellipsis and pointer events are easy, and arrows are an SVG overlay. There is one scroll container with a sticky-left task panel and a sticky-top header. Stdlib `sqlite3` is used instead of an ORM because the schema is four tables and it adds no dependency.

### Spec interpretations (round-2 review items the user left to the planner)
- AC32 error contract: clamp and cascade apply to every write except import, which only validates (AC23). The server returns 4xx for the listed ACs, for an unknown id (404), and for a dependency between tasks of different projects (422). A task POST or PATCH that sends both `end` and `duration` gets 422 `invalid`, and any request body with an unknown field gets 422 `invalid` (request models use `extra="forbid"`); both are treated as AC5/AC40-class invalid input. In every error case nothing is written.
- AC43 "near its left edge" is tested as: the earliest task start is visible and no more than 7 days (in the current zoom's px/day) from the timeline's visible left edge.
- "Today" is the browser's local date. E2E tests fix the clock with `page.clock.setFixedTime`.
- Deleting a task leaves its former successors' dates unchanged (push-only).
- Import also rejects duplicate task or person keys within the file.
- Project list order is creation order (id ascending).
- New task defaults: `percent_complete` 0, `assignee_id` null, `duration` 1 when neither `duration` nor `end` is given. Creating a task as a milestone follows the C2 "Task POST resolution" rules.
- AC24: after shortening, trailing spaces are trimmed before the suffix is added. "First free" is checked against the final shortened, suffixed name.

## Reuse
The repo contains no code yet, so there is nothing in-repo to reuse. What exists and must be respected:
- `/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart/.gitignore` - a Python template. It ignores `lib/`, `build/`, `dist/`, `var/` and `.cache`, so **no source directory may be named `lib`** (use `src/timeline`, `src/api`, and so on). It does not ignore `node_modules/` or DB files, which S1 adds.
- `.adlc/verification.md` - the scratchpad-proven commands: `uv run pytest`, `uv run ruff`, `npx vitest run`, `npx tsc`, and Playwright with `channel: "chrome"` (no browser download). Bare `python3` is blocked by a hook, so always use `uv run`. GNU `timeout` is missing, so poll instead.
- Libraries: FastAPI's `TestClient` (httpx) for in-process API tests. Playwright's `request` fixture for seeding over HTTP, `page.clock` for a fixed today, and `page.waitForEvent('download')` and `setInputFiles` for export/import.

## Contracts
Implementers: read the Contract sections your slice names. They are the agreed shapes, so build against them even if the other side isn't written yet.

### C1: Layout and commands
```
justfile                      # install, dev, test, lint, typecheck, e2e, check
backend/pyproject.toml        # uv project; deps fastapi, uvicorn; dev: pytest, httpx, ruff, mypy
backend/app/main.py           # create_app(db_path: str | None = None) -> FastAPI; module-level `app = create_app()`
backend/app/scheduling/       # PURE: dates.py, engine.py, critical.py (no sqlite/fastapi imports)
backend/app/...               # db.py, errors.py, palette.py, names.py, routes/, services/, transfer/
backend/tests/                # pytest; use tmp_path DB per test
frontend/src/timeline/        # PURE TS: dates.ts, scale.ts, drag.ts (+ *.test.ts, vitest)
frontend/src/api/             # types.ts, client.ts
frontend/src/state/           # store.tsx (context + hooks), reducer.ts
frontend/src/components/{shell,chart,tasks,roster,io}/
frontend/e2e/                 # Playwright specs; fixtures.ts; helpers/api.ts
```
- DB path comes from env `GANTT_DB_PATH` (default `backend/data/gantt.db`, git-ignored). `create_app(db_path)` overrides it.
- Dev ports: backend 8000, Vite 5173 (Vite proxies `/api` and `/health` to `process.env.GANTT_API_URL ?? "http://localhost:8000"`).
- E2E ports: backend 8100 with `GANTT_DB_PATH=frontend/.e2e-data/e2e.db` (the file is deleted before start), Vite 5180. Playwright runs `workers: 1`, `channel: "chrome"`, `headless: true`, viewport 1280x800, and `reuseExistingServer: false`.
- (Amended by chore, 2026-09-24) The e2e ports, DB and output dir can be overridden with `GANTT_E2E_API_PORT`, `GANTT_E2E_WEB_PORT`, `GANTT_E2E_DB_PATH` and `GANTT_E2E_OUTPUT_DIR`; the defaults are the values above. A non-default API port gets its own DB (`.e2e-data/e2e-<port>.db`), and a non-default web port gets its own output dir. **Implementers running in parallel must each use distinct ports**, e.g. `GANTT_E2E_API_PORT=81<n>0 GANTT_E2E_WEB_PORT=51<n>0 just e2e` for slice n. vitest also collects `src/**/*.test.tsx` (node environment, no DOM).
- `just test` = `cd backend && uv run pytest -q` + `cd frontend && npx vitest run`. `just lint` = `uv run ruff check . && uv run ruff format --check .` + `npx biome check .`. `just typecheck` = `uv run mypy app` + `npx tsc --noEmit`. `just e2e` = `cd frontend && npx playwright test`. `just dev` runs both servers and kills both on Ctrl-C. `just check` = lint, typecheck, test, e2e.

### C2: HTTP API (all JSON; dates are `"YYYY-MM-DD"` strings)
Types (the TypeScript mirror lives in `frontend/src/api/types.ts`):
```ts
type ISODate = string;
interface PaletteColour { name: string; fill: string /* "#rrggbb" lowercase */; label: string }
interface Palette { colours: PaletteColour[] /* exactly 12, fixed order */; neutral: { fill: string; label: string } }
interface ProjectSummary { id: number; name: string; task_count: number }
interface Person { id: number; name: string; colour: string /* a palette fill */ }
interface Task { id: number; name: string; start: ISODate; end: ISODate; duration: number /* 0 for milestones */;
                 is_milestone: boolean; percent_complete: number; assignee_id: number | null }
interface Dependency { id: number; predecessor_id: number; successor_id: number }
interface ScheduleSummary { project_end: ISODate | null; critical_task_ids: number[]; critical_dependency_ids: number[] }
interface ProjectDetail { id: number; name: string; people: Person[] /* id asc */; tasks: Task[] /* id asc */;
                          dependencies: Dependency[] /* id asc */; schedule: ScheduleSummary }
interface MutationResult { project: ProjectDetail; changed_task_ids: number[]; created_id: number | null }
interface ApiErrorBody { error: { code: string; message: string /* human readable, shown in UI */; field: string | null } }
```
Endpoints:
| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/health` | - | 200 `{"status":"ok"}` |
| GET | `/api/palette` | - | 200 `Palette` |
| GET | `/api/projects` | - | 200 `ProjectSummary[]` (id asc) |
| POST | `/api/projects` | `{name}` | 201 `ProjectSummary` |
| GET | `/api/projects/{id}` | - | 200 `ProjectDetail` |
| PATCH | `/api/projects/{id}` | `{name}` | 200 `ProjectSummary` |
| DELETE | `/api/projects/{id}` | - | 204 |
| POST | `/api/projects/{id}/people` | `{name, colour?}` | 201 `MutationResult` (created_id = person id) |
| PATCH | `/api/people/{id}` | `{name?, colour?}` | 200 `MutationResult` |
| DELETE | `/api/people/{id}` | - | 200 `MutationResult` (their tasks become unassigned) |
| POST | `/api/projects/{id}/tasks` | `{name, start, duration?, end?, is_milestone?, percent_complete?, assignee_id?}` | 201 `MutationResult` |
| PATCH | `/api/tasks/{id}` | any of `{name, start, end, duration, is_milestone, percent_complete, assignee_id}` | 200 `MutationResult` |
| DELETE | `/api/tasks/{id}` | - | 200 `MutationResult` |
| POST | `/api/projects/{id}/dependencies` | `{predecessor_id, successor_id}` | 201 `MutationResult` (created_id = dependency id) |
| DELETE | `/api/dependencies/{id}` | - | 200 `MutationResult` |
| GET | `/api/projects/{id}/export` | - | 200 export bytes (C5), `Content-Disposition: attachment; filename="<slug>.gantt.json"` |
| POST | `/api/import` | raw export JSON bytes | 201 `ProjectDetail` |

Errors always use `ApiErrorBody`. A FastAPI `RequestValidationError` handler converts pydantic errors to this shape too. Statuses: 404 `not_found`. 409 `name_taken`, `dependency_duplicate`, `dependency_cycle`. 422 `invalid` (bad name, date, duration, percent, colour, assignee from another project, unknown field, `end` together with `duration`), `dependency_self`, `dependency_cross_project`, `milestone_field`, `schedule_out_of_range`, `import_invalid`. 400 `import_malformed`. 413 `import_too_large` (more than 5 * 1024 * 1024 bytes). Request models use `extra="forbid"` and **strict** types (`StrictInt`, `StrictBool`, `StrictStr`), so `"3"`, `3.0`, `3.5` and `true` are not accepted as durations or percents. Dates are parsed by `scheduling.dates.parse_iso_date` and never by pydantic's `date` type. Names are trimmed. "Matches" means `trimmed.casefold()` is equal.

Task POST resolution, in this order:
1. 404 if the project is unknown. Validate each field's type, limits and name. An `assignee_id` must be a person in the same project (422 `invalid`).
2. `is_milestone` true: the request may not include `duration`, `end`, or a non-zero `percent_complete` (422 `milestone_field`). Otherwise end = start, duration 0, percent 0.
3. Non-milestone: `end` together with `duration` gives 422 `invalid`. If `duration` is given: end = start + duration - 1. Else if `end` is given: end < start gives 422 `invalid`, otherwise duration = inclusive days. Else duration 1, end = start. `percent_complete` defaults to 0.
4. Check the dates against 2000-01-01..2099-12-31 and the duration against 1..3650 (422 `invalid`). A new task has no dependencies, so no clamp applies.
5. Insert the row. `changed_task_ids` = [new id], `created_id` = new id.

Task PATCH resolution, in this order:
1. 404 if the task is unknown. Validate each field's type, limits and name.
2. `is_milestone` true (was false): end = start (the requested start if given, otherwise current), duration 0, percent 0. The same request may not include `end`, `duration`, or a non-zero `percent_complete` (422 `milestone_field`).
3. `is_milestone` false (was true): duration 1, end = start, percent 0.
4. On a milestone (after step 2), `end` or `duration` gives 422 `milestone_field`, and so does `percent_complete` other than 0. `start` moves the date.
5. On a non-milestone: `end` together with `duration` gives 422 `invalid`. start' = `start` ?? current start. If `duration` is given: end' = start' + duration - 1. Else if `end` is given: end' = end, and end' < start' gives 422. Else if `start` is given: end' = start' + current duration - 1. Anchor = `keep_end` when both `start` and `end` are given (the left-edge resize), otherwise `keep_duration`.
6. Check the proposed dates against 2000-01-01..2099-12-31 and the derived duration against 1..3650 (422 `invalid`).
7. `engine.reschedule(...)`. `ScheduleOutOfRange` gives 422 `schedule_out_of_range`, and nothing is written.
8. Write the changed rows. `changed_task_ids` = [edited id] + the other ids whose start or end changed, in task order.

UI mapping: bar drag or start field sends `{start}`. Right-edge resize or end field sends `{end}`. Left-edge resize sends `{start, end}` (end unchanged). The duration field sends `{duration}`.

### C3: Pure scheduling engine (`backend/app/scheduling/`)
```python
# dates.py
MIN_DATE = date(2000, 1, 1); MAX_DATE = date(2099, 12, 31); MAX_DURATION = 3650
class DateFormatError(ValueError): ...
def parse_iso_date(value: object) -> date      # only str matching ^\d{4}-\d{2}-\d{2}$ that is a real date
def format_iso(d: date) -> str
def end_from(start: date, duration: int) -> date   # start + duration - 1 (duration >= 1)
def inclusive_days(start: date, end: date) -> int  # (end - start).days + 1

# engine.py
@dataclass(frozen=True)
class STask:
    id: int; start: date; end: date; milestone: bool
    @property
    def duration(self) -> int: ...   # 0 if milestone else inclusive_days
Dep = tuple[int, int]                 # (predecessor_id, successor_id)
Anchor = Literal["keep_duration", "keep_end"]
class ScheduleOutOfRange(Exception): task_id: int
@dataclass(frozen=True)
class RescheduleResult: tasks: dict[int, STask]; changed: list[int]   # changed = ids whose start/end differ from input
def allowed_from(pred: STask, succ_is_milestone: bool) -> date     # pred.end if succ milestone else pred.end + 1 day
def earliest_allowed(task_id: int, tasks: Mapping[int, STask], deps: Sequence[Dep]) -> date | None  # max over preds
def creates_cycle(deps: Sequence[Dep], pred: int, succ: int) -> bool   # True also when pred == succ
def reschedule(tasks: Mapping[int, STask], deps: Sequence[Dep],
               edited: STask | None = None, anchor: Anchor = "keep_duration") -> RescheduleResult
```
`reschedule`: replace `edited` in the map, then walk all tasks in topological order (Kahn's algorithm, with ties broken by id). For each task with `start < earliest`: if it is the edited task and `anchor == "keep_end"` (and it is not a milestone), start = earliest and end = max(end, earliest). Otherwise shift start and end by the same amount, which keeps the duration (a milestone keeps start == end). Tasks are never moved earlier (push-only). After the walk, if any end > MAX_DATE, raise `ScheduleOutOfRange`. Adding a dependency = `reschedule(tasks, deps + [(p, s)])`.
```python
# critical.py
@dataclass(frozen=True)
class CriticalResult: project_end: date | None; task_ids: frozenset[int]; dependency_pairs: frozenset[Dep]
def link_slack(pred: STask, succ: STask) -> int      # (succ.start - allowed_from(pred, succ.milestone)).days
def compute_critical(tasks: Mapping[int, STask], deps: Sequence[Dep]) -> CriticalResult
```
Critical tasks are those with end == project_end, plus every task that reaches one of them backwards through links with `link_slack == 0`. This is exactly the AC14 "delay by one day" test under push-only rules. Critical dependency pairs are links with slack 0 whose two ends are both critical (decided in D12, `decisions.md`). If there are no tasks, the result is `(None, ∅, ∅)`.

### C4: DB schema (`backend/app/db.py`, created by S4)
`PRAGMA foreign_keys = ON` is set on every connection. Tables use `INTEGER PRIMARY KEY AUTOINCREMENT`, so ids grow monotonically and order by id = creation order (AC42).
```sql
projects(id, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE)
people(id, project_id REFERENCES projects ON DELETE CASCADE, name, name_key, colour TEXT NOT NULL, UNIQUE(project_id, name_key))
tasks(id, project_id REFERENCES projects ON DELETE CASCADE, name, start TEXT, end_date TEXT, duration INTEGER,
      is_milestone INTEGER, percent_complete INTEGER, assignee_id REFERENCES people ON DELETE SET NULL)
dependencies(id, project_id REFERENCES projects ON DELETE CASCADE, predecessor_id REFERENCES tasks ON DELETE CASCADE,
             successor_id REFERENCES tasks ON DELETE CASCADE, UNIQUE(predecessor_id, successor_id))
```
`db.connect(path) -> sqlite3.Connection`, `db.init_schema(conn)` (idempotent, `CREATE TABLE IF NOT EXISTS`), and `db.write_tx(conn)`, a context manager that runs `BEGIN IMMEDIATE ... COMMIT`/`ROLLBACK`.

### C5: Export file format (version 1)
UTF-8 bytes of `json.dumps(doc, indent=2, ensure_ascii=False) + "\n"`, with keys in exactly this order:
```json
{
  "format": "hg-gantt",
  "version": 1,
  "project": { "name": "Launch" },
  "people": [ { "key": "p1", "name": "Ana", "colour": "#rrggbb" } ],
  "tasks": [ { "key": "t1", "name": "Design", "start": "2026-10-05", "end": "2026-10-07", "duration": 3,
               "milestone": false, "percent_complete": 40, "assignee": "p1", "predecessors": [] } ]
}
```
People and tasks are in id order, with keys `p1..pn` and `t1..tn` assigned in that order. `assignee` is a person key or `null`. `predecessors` holds predecessor task keys sorted by their file position. On import, keys may be any unique non-empty strings. Clients must save the response bytes unchanged (never re-serialise them).

### C6: Frontend contracts
Pure timeline API (S3), in `frontend/src/timeline/`:
```ts
// dates.ts: day index = whole days since 1970-01-01, computed in UTC (no DST drift)
export function toDayIndex(iso: string): number; export function fromDayIndex(n: number): string;
export function addDays(iso: string, n: number): string; export function daysBetween(a: string, b: string): number;
export function weekdayMon0(iso: string): number /* 0=Mon..6=Sun */; export function isWeekend(iso: string): boolean;
export function todayLocal(now?: Date): string /* browser-local calendar date */
// scale.ts
export type Zoom = "day" | "week" | "month";
export const PX_PER_DAY: Record<Zoom, number> = { day: 32, week: 12, month: 4 };
export interface TimelineRange { start: string; end: string /* inclusive */ }
export function computeRange(tasks: { start: string; end: string }[], today: string, zoom: Zoom): TimelineRange;
  // start <= min(earliestStart - 30, today); end >= max(projectEnd + 60, today); no tasks: today-30 .. today+60;
  // then widened to whole zoom units (Mon-start weeks, 1st-of-month months)
export function dateToX(iso: string, range: TimelineRange, zoom: Zoom): number;    // left edge of that day
export function barGeometry(t: { start: string; end: string; is_milestone: boolean }, range: TimelineRange, zoom: Zoom):
  { x: number; width: number };   // non-milestone width = duration * PX_PER_DAY; milestone: x = centre of its day, width 0
export interface HeaderUnit { key: string; label: string; x: number; width: number }
export function headerTiers(range: TimelineRange, zoom: Zoom): { top: HeaderUnit[]; bottom: HeaderUnit[] };
  // day: top = months, bottom = days ("5", weekday letter in title); week: top = months, bottom = ISO weeks ("W41 5 Oct");
  // month: top = years, bottom = months ("Oct")
export function initialScrollLeft(tasks: { start: string }[], range: TimelineRange, zoom: Zoom, today: string): number;
  // earliest start (or today if no tasks) placed 2 days' width from the left edge, clamped >= 0
// drag.ts
export type DragMode = "move" | "resize-start" | "resize-end";
export function daysFromPixels(dx: number, zoom: Zoom): number;   // Math.round(dx / PX_PER_DAY[zoom]); never -0
export function proposeDrag(t: { start: string; end: string; is_milestone: boolean }, mode: DragMode, deltaDays: number):
  { start: string; end: string };   // resize keeps duration >= 1; milestones only "move"
export function patchForDrag(t: { start: string; end: string }, mode: DragMode, p: { start: string; end: string }):
  { start?: string; end?: string } | null;  // move -> {start}; resize-end -> {end}; resize-start -> {start, end}; null if unchanged
```
Layout constants (S7), in `frontend/src/layout.ts`: `ROW_HEIGHT = 36`, `HEADER_HEIGHT = 56`, `TASK_PANEL_WIDTH = 420`, `SIDEBAR_WIDTH = 220`. `ProjectView` owns one scroll container (`data-testid="timeline-scroller"`, overflow auto on both axes). Inside it are `<TaskPanel>` (sticky left, width TASK_PANEL_WIDTH) and `<Chart>` side by side. Each draws a HEADER_HEIGHT sticky-top header and then one ROW_HEIGHT row per task in `project.tasks` order. So chart x = `scroller.scrollLeft` is the visible left edge of the timeline.

Store (S7), in `frontend/src/state/store.tsx`, exports `AppProvider`, `useAppState()`, `useActions()`:
```ts
interface AppState { projects: ProjectSummary[]; current: ProjectDetail | null; palette: Palette | null; zoom: Zoom;
  error: string | null; editor: { taskId: number | "new" } | null; rosterOpen: boolean;
  confirm: { title: string; message: string; confirmLabel: string } | null; lastChangedTaskIds: number[] }
type ActionResult = { ok: true } | { ok: false; message: string };  // on failure the store also sets state.error
interface Actions {
  loadProjects(): Promise<void>; openProject(id: number | null): Promise<void>;       // syncs location.hash "#/projects/<id>"
  createProject(name: string): Promise<ActionResult>; renameProject(id: number, name: string): Promise<ActionResult>;
  deleteProject(id: number): Promise<ActionResult>;                                   // caller confirms first
  createTask(input: TaskCreate): Promise<ActionResult>; updateTask(id: number, patch: TaskPatch): Promise<ActionResult>;
  deleteTask(id: number): Promise<ActionResult>; addDependency(pred: number, succ: number): Promise<ActionResult>;
  removeDependency(id: number): Promise<ActionResult>; createPerson(input: { name: string; colour?: string }): Promise<ActionResult>;
  updatePerson(id: number, patch: { name?: string; colour?: string }): Promise<ActionResult>; deletePerson(id: number): Promise<ActionResult>;
  exportProject(id: number): Promise<ActionResult>;   // downloads the raw response bytes as <slug>.gantt.json
  importFile(file: File): Promise<ActionResult>;      // rejects > 5 MB client-side with a message, else POST /api/import, opens new project
  setZoom(z: Zoom): void; openTaskEditor(taskId: number | "new" | null): void; setRosterOpen(open: boolean): void;
  confirm(opts: { title: string; message: string; confirmLabel: string }): Promise<boolean>; clearError(): void;
}
```
Every `MutationResult` replaces `state.current` wholesale with `result.project` (and refreshes `projects` task counts), so AC16, AC31 and AC36 need no client scheduling.

Component props (S7 creates stubs with these exact signatures, and later slices own the files):
- `components/chart/Chart.tsx`: `export function Chart(p: { project: ProjectDetail; zoom: Zoom; scrollerRef: React.RefObject<HTMLDivElement | null> }): JSX.Element` (S8, then S11)
- `components/tasks/TaskPanel.tsx`: `export function TaskPanel(p: { project: ProjectDetail }): JSX.Element`, and `components/tasks/TaskEditor.tsx`: `export function TaskEditor(): JSX.Element | null` (reads `state.editor`) (S9)
- `components/roster/RosterPanel.tsx`: `export function RosterPanel(): JSX.Element | null` (reads `state.rosterOpen`) (S10)
- `components/io/TransferControls.tsx`: `export function TransferControls(): JSX.Element` (S12)

`data-testid` contract (e2e specs in every slice rely on it):
- shell (S7): `project-list`, `project-item` (attr `data-project-id`), `new-project-button`, `project-name-input`, `project-submit`, `project-rename-button`, `project-delete-button`, `empty-projects`, `error-message` (role=alert), `confirm-dialog`, `confirm-ok`, `confirm-cancel`, `zoom-day`, `zoom-week`, `zoom-month`, `roster-button`, `timeline-scroller`
- chart (S8): `chart`, `bar` (attrs `data-task-id`, `data-start`, `data-end`, class `critical` when critical), `milestone` (same attrs), `bar-progress`, `bar-label`, `assignee-tag`, `arrow` (attrs `data-from`, `data-to`, class `critical`), `weekend-shade` (attr `data-date`), `header-unit` (attr `data-tier` top|bottom), `project-end`, `empty-tasks-prompt`, `bar-handle-start`, `bar-handle-end` (the handles are added in S11)
- tasks (S9): `add-task-button`, `task-row` (attr `data-task-id`), `task-editor`, `task-name`, `task-start`, `task-end`, `task-duration`, `task-percent`, `task-milestone`, `task-assignee`, `task-delete`, `task-editor-close`, `predecessor-select`, `add-predecessor`, `dependency-item` (attr `data-dependency-id`), `remove-dependency`, `assignee-add-person`
- roster (S10): `roster-panel`, `person-row` (attr `data-person-id`), `person-name-input`, `person-add`, `colour-swatch` (attr `data-colour`, `aria-pressed`), `person-rename`, `person-delete`
- io (S12): `export-button`, `import-input` (file input)

E2E helpers (S7), in `frontend/e2e/helpers/api.ts`, take the Playwright `APIRequestContext` pointed at `http://localhost:8100`: `resetDb(req)` (deletes every project through the API), `createProject(req, name) -> ProjectSummary`, `createPerson(req, projectId, name, colour?) -> number`, `createTask(req, projectId, body) -> number`, `addDependency(req, projectId, pred, succ)`, `seedProject(req, fixture: { name: string; people?: {name: string; colour?: string}[]; tasks: {name: string; start: string; duration?: number; is_milestone?: boolean; percent_complete?: number; assignee?: string}[]; deps?: [string, string][] }) -> { projectId: number; taskIds: Record<string, number>; personIds: Record<string, number> }`. `frontend/e2e/fixtures.ts` (S1) exports `test` and `expect` with an automatic fixture that fails the test on any `console.error` or `pageerror`.

## Slices

### S1: Scaffold, tooling and smoke tests
- Covers: Constraint "Slice 1 must scaffold backend and frontend with passing smoke tests and a single entry point"; AC26 (the harness: the console-error fixture that every later e2e spec uses)
- Files: `justfile` (new), `.gitignore` (change), `README.md` (change), `backend/pyproject.toml` (new), `backend/uv.lock` (new), `backend/.python-version` (new, 3.12), `backend/app/__init__.py` (new), `backend/app/main.py` (new), `backend/tests/__init__.py` (new), `backend/tests/conftest.py` (new), `backend/tests/test_health.py` (new), `frontend/package.json` (new), `frontend/package-lock.json` (new), `frontend/tsconfig.json` (new), `frontend/vite.config.ts` (new), `frontend/biome.json` (new), `frontend/index.html` (new), `frontend/src/main.tsx` (new), `frontend/src/App.tsx` (new), `frontend/src/smoke.test.ts` (new), `frontend/playwright.config.ts` (new), `frontend/e2e/fixtures.ts` (new), `frontend/e2e/smoke.spec.ts` (new)
- Depends on: none
- Parallel: no (everything depends on it)
- Steps:
  1. Backend: `uv init`-style project, `requires-python >=3.12`. Deps: `fastapi`, `uvicorn`. Dev group: `pytest`, `httpx`, `ruff`, `mypy`. `app/main.py` has `create_app(db_path=None)` with `GET /health -> {"status":"ok"}` and module-level `app = create_app()`. `conftest.py` provides a `client` fixture built with `create_app(str(tmp_path / "t.db"))`. Configure ruff (line length 100) and mypy (`strict = true` for `app`) in `pyproject.toml`.
  2. Frontend: Vite + React 19 + TS. Deps `react`, `react-dom`. Dev deps `vite`, `@vitejs/plugin-react`, `typescript` (try 7.x first), `@types/react`, `@types/react-dom`, `vitest`, `@playwright/test`, `@biomejs/biome`. `tsconfig` is strict with `noEmit`. Vite proxies `/api` and `/health` to `process.env.GANTT_API_URL ?? "http://localhost:8000"`. Vitest `include: ["src/**/*.test.ts"]` so e2e specs are excluded. `App.tsx` renders `<h1>Gantt</h1>`.
  3. If `npx tsc --noEmit` or `vite build` fails under TS 7, pin `typescript@~5.9` and write down why in README.
  4. Playwright config per C1: two `webServer` entries. Backend: `cd ../backend && rm -f ../frontend/.e2e-data/e2e.db && mkdir -p ../frontend/.e2e-data && GANTT_DB_PATH=../frontend/.e2e-data/e2e.db uv run uvicorn app.main:app --port 8100`, url `http://localhost:8100/health`. Frontend: `GANTT_API_URL=http://localhost:8100 npx vite --port 5180 --strictPort`. `use: { channel: "chrome", headless: true, baseURL: "http://localhost:5180", viewport: { width: 1280, height: 800 } }`, `workers: 1`.
  5. `e2e/fixtures.ts`: extend `test` with an `{ auto: true }` fixture that collects `console` messages of type `error` and `pageerror` events, then asserts the list is empty after each test.
  6. `justfile` recipes per C1 (`set shell := ["bash", "-cu"]`). `dev` starts uvicorn `--reload` on 8000 and vite on 5173, with `trap 'kill 0' EXIT`.
  7. `.gitignore`: add `node_modules/`, `frontend/.e2e-data/`, `frontend/test-results/`, `frontend/playwright-report/`, `backend/data/`, `*.db`. Do not create any directory named `lib`.
  8. README: prerequisites (uv, node, npm, just, Google Chrome) and the `just` commands.
- Tests: `test_health.py` asserts that `GET /health` gives 200 `{"status":"ok"}`. `smoke.test.ts` checks a trivial pure function. `smoke.spec.ts` loads `/`, sees the "Gantt" heading, and passes the console fixture.
- Evidence: Recipe 1 and 3. `just install && just lint && just typecheck && just test && just e2e` all exit 0 (pytest "1 passed", vitest "Tests 1 passed", Playwright "1 passed" using channel chrome with no browser download). Live API recipe: `cd backend && uv run uvicorn app.main:app --port 8000 &`, poll `curl -s localhost:8000/health` until `{"status":"ok"}`, then kill it and confirm the port is free. Note for the orchestrator: re-run /angel:discover after this slice (verification.md says a refresh is required once manifests land).

### S2: Pure scheduling and critical-path engine (Python)
- Covers: AC3, AC4, AC5 (date/duration rules), AC10, AC11 (cycle/self detection), AC12, AC14, AC15, AC27 (calendar-day maths), AC28, AC29, AC33 (unmark then clamp), AC39, AC40 (date/duration limits, out-of-range cascade)
- Files: `backend/app/scheduling/__init__.py` (new), `backend/app/scheduling/dates.py` (new), `backend/app/scheduling/engine.py` (new), `backend/app/scheduling/critical.py` (new), `backend/tests/scheduling/__init__.py` (new), `backend/tests/scheduling/test_dates.py` (new), `backend/tests/scheduling/test_engine.py` (new), `backend/tests/scheduling/test_critical.py` (new)
- Depends on: S1
- Parallel: yes (with S3)
- Steps: implement C3 exactly. No imports of `sqlite3`, `fastapi` or `app.db` anywhere under `app/scheduling/` (add a test that greps the package's source text for those imports). Use Kahn's algorithm with ties broken by task id, so results are deterministic. `parse_iso_date` rejects non-strings, `"2026-2-5"`, `"2026-02-30"`, and `"2026-10-05T00:00"`.
- Tests (table-driven, written failing first):
  - dates: `end_from(2026-10-05, 3) == 2026-10-07` (AC3). `end_from(Fri 2026-10-09, 3) == Sun 2026-10-11` (AC27). Invalid strings raise.
  - engine: the AC12 fixture with A's end moved to 10-09 gives B = 10-10..10-11 and C = 10-12..10-12, changed = [A, B, C]. The slack variant (B 10-12..10-13, C 10-14) moves nothing. AC28 with keep_duration: B start 10-06 gives 10-08..10-09. AC28 with keep_end: (10-06, 10-09) gives 10-08..10-09. AC29: A end moved to 10-05 leaves B unchanged. AC39: M dragged to 10-08 gives 10-09. A end to 10-12 gives M 10-12 and C 10-13..10-14. AC33: unmarked M (10-09..10-09) with A ending 10-09 gives 10-10..10-10, and successors are pushed. AC10: adding a dep where B starts too early pushes B and its chain. `creates_cycle`: C -> A on A -> B -> C is True, A -> A is True. A cascade pushing a task past 2099-12-31 raises `ScheduleOutOfRange`. The invariant holds after any reschedule: for every dep, succ.start >= allowed_from(pred).
  - critical: AC15 (A 1-3 -> C 4-6, B 1-2 -> C) gives {A, C}, and B is not critical. Two parallel chains ending on the project end are both critical. A milestone at the end is critical. An empty project gives (None, ∅, ∅). A zero-slack link between critical tasks is in `dependency_pairs`, and a slack link is not.
- Evidence: Recipe 1. `cd backend && uv run pytest -q tests/scheduling` shows `N passed` with 0 failed, and `uv run mypy app` is clean.

### S3: Pure timeline maths (TypeScript)
- Covers: AC18 (resize min duration, pure part), AC19 (scale per zoom, whole-day snapping), AC27 (weekend detection), AC43 (range and initial scroll)
- Files: `frontend/src/timeline/dates.ts` (new), `frontend/src/timeline/scale.ts` (new), `frontend/src/timeline/drag.ts` (new), `frontend/src/timeline/dates.test.ts` (new), `frontend/src/timeline/scale.test.ts` (new), `frontend/src/timeline/drag.test.ts` (new)
- Depends on: S1
- Parallel: yes (with S2)
- Steps: implement the C6 pure timeline API exactly. Do all day arithmetic in UTC day indices (`Date.UTC`), and use local time only in `todayLocal`. No React or DOM imports.
- Tests: `isWeekend("2026-10-10")` and `isWeekend("2026-10-11")` are true, and a Friday is false. `barGeometry` for 2026-10-05, 3 days in day zoom has width 96 and x = 32 * daysBetween(range.start, "2026-10-05"). `computeRange` with tasks 2026-10-05..2026-12-01 and today 2026-01-01 covers 2026-01-01 and 2027-01-30 or later. `computeRange` with no tasks covers today-30..today+60. Week ranges start on a Monday, month ranges on the 1st. `headerTiers` gives unit kinds per zoom, and bottom-unit widths sum to the range width. `daysFromPixels(47, "day") === 1`, `daysFromPixels(-17, "day") === -1`, `daysFromPixels(5, "month") === 1`. `proposeDrag` resize-start by +5 on a 3-day task keeps duration 1 (start = end), resize-end by -5 keeps duration 1, and move keeps the duration. `patchForDrag` modes match C6. `initialScrollLeft` puts the earliest start within 7 days of the left edge.
- Evidence: Recipe 1. `cd frontend && npx vitest run src/timeline` shows `Tests N passed`, and `npx tsc --noEmit` is clean.

### S4: Backend persistence, projects, roster and palette API
- Covers: AC1 (API and persistence), AC2 (API cascade delete), AC20 (projects, people), AC30 (API), AC34 (API), AC38 (palette contrast), AC40 (name limits), AC42 (people and project order)
- Files: `backend/app/db.py` (new), `backend/app/errors.py` (new), `backend/app/names.py` (new), `backend/app/palette.py` (new), `backend/app/detail.py` (new), `backend/app/routes/__init__.py` (new), `backend/app/routes/projects.py` (new), `backend/app/routes/people.py` (new), `backend/app/routes/meta.py` (new, `/api/palette`), `backend/app/main.py` (change), `backend/tests/test_palette.py` (new), `backend/tests/test_projects_api.py` (new), `backend/tests/test_people_api.py` (new), `backend/tests/test_persistence.py` (new)
- Depends on: S2 (`detail.py` calls `compute_critical`)
- Parallel: no
- Steps:
  1. `db.py` per C4: connect, `init_schema` on app start, `write_tx` with `BEGIN IMMEDIATE`. Use one connection per request through a FastAPI dependency (`check_same_thread=False`, and set `isolation_level=None` so `write_tx` controls transactions).
  2. `errors.py`: `ApiError(status, code, message, field=None)` plus exception handlers for `ApiError` and `RequestValidationError`, both producing the C2 `ApiErrorBody`.
  3. `names.py`: `clean_name(raw: object, what: str) -> str` (must be a str, trimmed, 1..100 chars, else `ApiError(422, "invalid")`) and `name_key(name) = name.casefold()`.
  4. `palette.py`: `PALETTE: tuple[PaletteColour, ...]` (12 entries of name, fill, label), `NEUTRAL`, `contrast_ratio(a, b)` (the WCAG 2.x relative-luminance formula), `is_palette_colour(hex)`, `default_colour(used: Iterable[str]) -> str` (the first unused colour, else the first colour). Pick distinct, pleasant fills. Label colours are near-black or white, whichever passes 4.5:1. The neutral colour is a mid grey that is not in the palette.
  5. `detail.py`: `load_project_detail(conn, project_id) -> dict` (the C2 `ProjectDetail`, with people, tasks and deps ordered by id, and `schedule` from `compute_critical`) and `mutation_result(conn, project_id, changed, created_id)`.
  6. Routes for projects, people and palette per C2. Project create and rename check the name against other projects' `name_key`, excluding itself on rename (409 `name_taken`). A person's colour must be in the palette (422) and their name unique within the project (409 `name_taken`), excluding themself on rename. DELETE project relies on the FK cascade.
- Tests: create "Launch", then POST "launch" gives 409 and the count stays 1. Rename "Launch" to "LAUNCH" gives 200. `""`, `"   "` and a 101-char name give 422. The palette has 12 colours, each with ≥4.5:1 contrast against its label, the neutral pair passes too, and the neutral is not in the palette. A person's default colour is the first unused one, and colours may be shared. A bad colour gives 422, a duplicate person name 409. `test_people_api.py` rename cases (AC30): PATCH Ana `{name: "Anna"}` gives 200 and a re-GET shows "Anna". PATCH Anna `{name: "ANNA"}` (own name, different case) gives 200. With Ben also in the roster, PATCH Ben `{name: "anna"}` gives 409 `name_taken` with a non-empty message, and Ben's stored name is unchanged. PATCH with `""` or a 101-char name gives 422 and the name is unchanged. Deleting a project removes its people (and, via FK, its tasks and deps: insert rows directly with SQL to prove it). `test_persistence.py`: write through `create_app(path)`, build a second `create_app(path)` on the same file, and read the same data back. Unknown ids give 404.
- Evidence: Recipe 2 in-process: `cd backend && uv run pytest -q` passes. Live recipe 2 + 5: start uvicorn with `GANTT_DB_PATH=$(mktemp -d)/g.db` on 8000 and `curl -s -X POST localhost:8000/api/projects -H 'content-type: application/json' -d '{"name":"Launch"}' | jq` (expect 201, id). The same POST with "launch" gives 409 `name_taken`. Restart the server, `curl -s localhost:8000/api/projects | jq` still lists Launch, and `sqlite3 "$GANTT_DB_PATH" 'select * from projects'` shows the row.

### S5: Backend tasks and dependencies API with authoritative scheduling
- Covers: AC3, AC4, AC5, AC6, AC7, AC8, AC9 (API), AC10, AC11, AC12, AC13, AC20 (tasks, deps, milestones, progress, assignments), AC28, AC29, AC32, AC33, AC36, AC39, AC40, AC42
- Files: `backend/app/services/__init__.py` (new), `backend/app/services/tasks.py` (new), `backend/app/services/dependencies.py` (new), `backend/app/routes/tasks.py` (new), `backend/app/routes/dependencies.py` (new), `backend/app/routes/__init__.py` (change), `backend/app/main.py` (change, only if routers are not auto-registered), `backend/tests/test_tasks_api.py` (new), `backend/tests/test_dependencies_api.py` (new), `backend/tests/test_scheduling_api.py` (new)
- Depends on: S2, S4
- Parallel: no
- Steps:
  1. `services/tasks.py`: `create_task(conn, project_id, body) -> MutationResult`, following the C2 "Task POST resolution" steps exactly, and `patch_task(conn, task_id, body, fields_set) -> MutationResult`, following the C2 "Task PATCH resolution" steps exactly. Use pydantic `model_fields_set` to tell "absent" from `assignee_id: null`. An assignee must be a person in the same project (422). Everything runs inside `db.write_tx`: load the project's tasks and deps into `STask`, call `engine.reschedule`, write only the changed rows, and return `detail.mutation_result`.
  2. `delete_task`: FK removes the deps, and other tasks are unchanged.
  3. `services/dependencies.py`: `add_dependency` returns 404 for unknown ids, 422 `dependency_cross_project`, 422 `dependency_self`, 409 `dependency_duplicate`, 409 `dependency_cycle` (via `creates_cycle`), then `reschedule(tasks, deps + [(p, s)])`, and `ScheduleOutOfRange` gives 422. `remove_dependency` changes no dates.
  4. Never trust dates of other tasks sent by clients. The request only carries the edited task's fields (AC36).
- Tests: AC3 create gives end 10-07 and duration 3, with defaults percent 0 and assignee null. Create-time milestone rules (C2 POST step 2): POST `{is_milestone: true}` gives duration 0, end = start, percent 0. POST `{is_milestone: true}` with `duration: 3`, with `end`, or with `percent_complete: 10` each gives 422 `milestone_field` and no task is created. POST with both `end` and `duration` gives 422 `invalid`. AC4: the three edit kinds. AC5: end<start, `3.5`, `"3"`, `0`, `"2026-02-30"`, the malformed `"2026-2-5"` (as `start` and as `end`), and an empty name each give 422, with the stored task unchanged (re-GET and compare). AC32: PATCH with both `end` and `duration` gives 422 `invalid`, and PATCH `{"colour": "x"}` (an unknown field) gives 422 `invalid`, each with the task unchanged. AC40: 3651, 1999-12-31, and a cascade past 2099-12-31 each give 422, and nothing changed in any task. AC7/AC33: marking gives duration 0 and percent 0. `end`, `duration`, or `percent_complete: 10` on a milestone give 422. Unmarking uses the AC33 fixture and pushes successors. AC8: 40 is ok, 101, -1 and 40.5 give 422. AC9: assign to a person in another project gives 422, unassign with null works. AC10: exact fixture. AC12, parametrised over the three ways A's end can reach 10-09 through the API, each on a fresh copy of the fixture (A 10-05..10-07 -> B 10-08..10-09 -> C 10-10): PATCH A `{end: "2026-10-09"}`, PATCH A `{duration: 5}`, and PATCH A `{start: "2026-10-07"}` (A becomes 10-07..10-09). Each gives B 10-10..10-11 and C 10-12..10-12, `changed_task_ids == [A, B, C]`, and a reload via GET matches. The slack variant (B 10-12..10-13, C 10-14) moves neither B nor C for each of the three. AC11: C->A 409, A->A 422, duplicate A->B 409, and in each case the dep count is unchanged. AC13: removal leaves dates unchanged. AC28 and AC32: PATCH B `{start: "2026-10-06"}` gives 200 with B 10-08..10-09. Left-edge `{start: 10-06, end: 10-09}` gives 10-08..10-09. AC29: shrinking A leaves B unchanged. AC36: PATCH A end 10-09, then PATCH B start 10-08, gives stored B 10-10..10-11, and B is in the response. AC39 fixture. AC42: task order in `ProjectDetail` stays creation order after date edits. AC20: restart with a second `create_app` on the same file and all fields match. Property check: after every test write, the invariant holds for all deps (a helper asserts it on every `MutationResult`).
- Evidence: Recipe 2 in-process: `cd backend && uv run pytest -q` passes. Live recipe 2: seed the AC12 fixture with curl, `curl -s -X PATCH localhost:8000/api/tasks/$A -H 'content-type: application/json' -d '{"end":"2026-10-09"}' | jq '.changed_task_ids, (.project.tasks[] | {id,start,end})'` shows B 10-10..10-11 and C 10-12. Then PATCH B `{"start":"2026-10-08"}` returns B 10-10 (AC36). Restart the server and GET the same dates (Recipe 5).

### S6: Backend JSON export and import
- Covers: AC21, AC22, AC23, AC24 (API), AC40 (import limits)
- Files: `backend/app/transfer/__init__.py` (new), `backend/app/transfer/export.py` (new), `backend/app/transfer/importer.py` (new), `backend/app/transfer/naming.py` (new), `backend/app/routes/transfer.py` (new), `backend/app/routes/__init__.py` (change), `backend/tests/test_export.py` (new), `backend/tests/test_import.py` (new), `backend/tests/test_roundtrip.py` (new), `backend/tests/fixtures/` (new, sample files)
- (Amended after review, CR2) `POST /api/import` returns 415 `unsupported_media_type` unless the Content-Type is `application/json` (a charset parameter is allowed); nothing is read or written.
- Depends on: S5
- Parallel: yes (with S7)
- Steps:
  1. `export.py`: `export_bytes(conn, project_id) -> bytes` per C5 (key order, `p1..`/`t1..` keys, predecessors sorted by file position, `indent=2`, trailing newline, no timestamps). Include a `Content-Disposition` filename slug.
  2. `importer.py`: `validate(doc) -> ValidDoc` collects the **first** problem as a message that names it, for example `Task "t3" ("Design") starts 2026-10-06, before its earliest allowed start 2026-10-08`. It checks, in order: object shape, `format == "hg-gantt"`, `version == 1` (otherwise "unknown format version"), project name (trim, 1..100), people (unique non-empty keys, names valid and unique, colours in palette), tasks (unique keys, names, strict int and bool types, with `bool` rejected where an int is expected, dates in range, duration rules, `end == start + duration - 1`, milestone start == end with duration 0 and percent 0, percent 0..100, assignee key exists or null, predecessor keys exist, no self, no duplicates), then no cycles (`creates_cycle`), then every task start >= `earliest_allowed` (never adjust). Reuse `scheduling.dates`, `scheduling.engine`, `names.clean_name` and `palette.is_palette_colour`.
  3. `naming.py`: `unique_import_name(name: str, existing_keys: set[str]) -> str`. If the name is free, return it. Otherwise, for n = 2, 3, ...: `suffix = f" ({n})"`, candidate = `name[:100 - len(suffix)].rstrip() + suffix`, and return the first candidate whose casefold is free.
  4. `routes/transfer.py`: `GET /api/projects/{id}/export`. `POST /api/import` reads `await request.body()`. If Content-Length or the actual length is over 5 MiB, return 413. Bad JSON or non-UTF-8 returns 400. Validation failure returns 422 `import_invalid`. Otherwise insert the project, then people in file order, then tasks in file order, then deps, all in one `write_tx`. Return 201 `ProjectDetail`.
- Tests: an export has exactly the C5 bytes for a hand-built fixture (a golden string). Exporting twice gives identical bytes. AC22 round trip: build a project with people, milestones, percent values and deps in DB1, export, import into a fresh `create_app(DB2)`, export again, and assert the bytes are equal. AC23: one parametrised case per listed failure, each asserting 4xx, a message containing the problem, and the project count unchanged. The cases are: malformed JSON, > 5 MB, version 2, missing task ref, missing person ref, cycle, self, duplicate dependency, early start, end mismatch, milestone start≠end, milestone duration 1, milestone percent 10, bad colour, empty project name, 101-char project name, duplicate key, `duration: true`, and the AC5/AC8/AC30/AC40 rules: an impossible date (`"2026-02-30"`), a malformed date (`"2026-2-5"`), a date outside 2000-2099 (`"1999-12-31"` and `"2100-01-01"`), duration 3651 (with a matching end), duration 0 on a non-milestone, duration 3.5 on a non-milestone, end < start, percent 101, percent 40.5, an empty task name, a 101-char task name, an empty person name, and a duplicate person name (case-insensitive, for example "Ana" and "ana"). AC24: "Launch" twice gives "Launch (2)", then "Launch (3)". "Launch (2)" when "Launch (2)" exists gives "Launch (2) (2)". A 100-char name gives a shortened name + " (2)" of length ≤ 100. Existing projects are unchanged (compare their exports before and after).
- Evidence: Recipe 2 round trip, live: `curl -s localhost:8000/api/projects/$P/export -o a.json`, start a second server on 8001 with a fresh `GANTT_DB_PATH`, `curl -s -X POST localhost:8001/api/import --data-binary @a.json -H 'content-type: application/json' | jq .id`, `curl -s localhost:8001/api/projects/$NEW/export -o b.json`, then `diff a.json b.json` is empty (`cmp` exit 0). Also `cd backend && uv run pytest -q` passes.

### S7: Frontend shell: API client, store, projects UI, dialogs, layout
- Covers: AC1, AC2, AC34, AC35 (no-projects state), AC37 (layout skeleton), AC41 (project delete confirmation)
- Files: `frontend/src/api/types.ts` (new), `frontend/src/api/client.ts` (new), `frontend/src/api/client.test.ts` (new), `frontend/src/state/reducer.ts` (new), `frontend/src/state/reducer.test.ts` (new), `frontend/src/state/store.tsx` (new), `frontend/src/layout.ts` (new), `frontend/src/App.tsx` (change), `frontend/src/main.tsx` (change), `frontend/src/styles/app.css` (new), `frontend/src/components/shell/AppShell.tsx` (new), `frontend/src/components/shell/ProjectList.tsx` (new), `frontend/src/components/shell/Toolbar.tsx` (new), `frontend/src/components/shell/ProjectView.tsx` (new), `frontend/src/components/shell/ConfirmDialog.tsx` (new), `frontend/src/components/shell/ErrorToast.tsx` (new), stubs `frontend/src/components/chart/Chart.tsx`, `frontend/src/components/tasks/TaskPanel.tsx`, `frontend/src/components/tasks/TaskEditor.tsx`, `frontend/src/components/roster/RosterPanel.tsx`, `frontend/src/components/io/TransferControls.tsx` (new, stubs only, later owned by S8/S9/S10/S12), `frontend/e2e/helpers/api.ts` (new), `frontend/e2e/projects.spec.ts` (new)
- (Amended after review, CR1/CR3) `frontend/src/state/store.test.ts` (new). Project-scoped writes (task, dependency, person) run one at a time through a single promise chain in the store, so responses are applied in the order the writes were issued. A task create opens its editor on `created_id`. Project renames also go through the same queue (CR7, D18); project delete does not need to.
- Depends on: S4, S5 (e2e helpers seed tasks and deps). Built against C2/C6.
- Parallel: yes (with S6)
- Steps:
  1. `types.ts` mirrors C2. `client.ts` has one typed function per endpoint. Non-2xx responses throw `ApiError { status, code, message }`, parsed from `ApiErrorBody`, falling back to the status text.
  2. `reducer.ts` is a pure reducer over `AppState` (C6). `store.tsx` has the provider, the actions per C6, hash routing (`#/projects/<id>`, restored on load), and palette loading on start. Every mutation replaces `current` with `result.project`. On failure it sets `error` to the server message and returns `{ok:false, message}`.
  3. UI: a 1280x800-first CSS grid, with `html, body { overflow: hidden }` and the app at `100vh`. Left sidebar (`SIDEBAR_WIDTH`): project list in creation order, "New project" with an inline name input, and rename/delete per item. Delete calls `confirm({title, message: 'Delete "Launch" and its N tasks? This cannot be undone.'})` using `task_count`. Toolbar: project name, zoom buttons (`zoom-day|week|month`, `aria-pressed`), a `roster-button`, and a `<TransferControls/>` slot. `ProjectView`: `timeline-scroller` containing `<TaskPanel>` (sticky left) and `<Chart>` per C6, plus `<TaskEditor/>` and `<RosterPanel/>` mounted. No projects: `empty-projects` message with a create button. `ErrorToast` renders `state.error` as `role="alert"` `data-testid="error-message"`. Long names use `text-overflow: ellipsis` and a `title` attribute.
  4. Stubs return minimal elements with the C6 props, for example Chart renders `<div data-testid="chart"/>`.
  5. `e2e/helpers/api.ts` per C6.
- Tests: vitest covers the reducer (replacing current on a mutation, error set and clear, the editor and roster flags) and client error parsing (fetch mocked). `projects.spec.ts`, with `resetDb` in `beforeEach`: the empty state shows `empty-projects` (AC35). Create "Launch", reload, and it is still listed (AC1). Creating "launch" shows `error-message`, and the list count stays 1 (AC34). An empty name and 101 chars are rejected. Rename to "LAUNCH" works. Delete, then cancel: nothing happens. Delete, then ok: the dialog text includes the task count (seed 2 tasks via the helper), the project disappears from the list, and `GET /api/projects/{id}` returns 404 (AC2, AC41).
- Evidence: Recipe 3. `cd frontend && npx vitest run && npx playwright test e2e/projects.spec.ts` pass (console fixture clean). Interactive: claude-in-chrome at `http://localhost:5173` under `just dev`: create a project, screenshot, reload, and read the console with no errors.

### S8: Chart rendering: bars, milestones, headers, zoom, weekends, arrows, critical path, project end
- Covers: AC3 (bar spans 3 columns), AC7 (diamond), AC8 (progress fill), AC9 (colour and name on bar and diamond), AC10 (arrows), AC14, AC15 (visual), AC16 (renders from server state), AC19, AC27, AC35 (empty timeline, no project end, no critical), AC38 (bar and diamond labels use the pair), AC42 (row order), AC43
- Files: `frontend/src/components/chart/Chart.tsx` (change, replaces the stub), `frontend/src/components/chart/TimelineHeader.tsx` (new), `frontend/src/components/chart/Bars.tsx` (new), `frontend/src/components/chart/Arrows.tsx` (new), `frontend/src/components/chart/WeekendShading.tsx` (new), `frontend/src/components/chart/colours.ts` (new), `frontend/src/components/chart/colours.test.ts` (new), `frontend/src/styles/chart.css` (new), `frontend/e2e/chart.spec.ts` (new)
- (Amended after review, DD3) `frontend/e2e/chart-scroll.spec.ts` (new) and a `Chart.tsx` scrollLeft compensation: when `range.start` changes without a zoom change, the visible dates stay put.
- Depends on: S3, S7 (and S5 for seeding)
- Parallel: yes (with S12)
- Steps:
  1. `colours.ts`: `colourFor(task, people, palette) -> {fill, label}` returns the person's palette pair, or `palette.neutral` if unassigned or unknown. It is the only source of fill and label colours for bars, milestone diamonds and their pills.
  2. `Chart`: compute `range = computeRange(tasks, todayLocal(), zoom)`. Width = days * PX_PER_DAY. Sticky header draws `headerTiers` (`header-unit`). In day zoom, `WeekendShading` draws a full-height `weekend-shade` for each Sat and Sun. There is a today line (a thin vertical line at `dateToX(todayLocal(), range, zoom)`). No AC requires it; it is kept as a small orientation aid that fits AC43's "range always includes today". Rows follow `project.tasks` order at `HEADER_HEIGHT + i * ROW_HEIGHT`.
  3. `Bars` (memoised per task): a non-milestone is an absolutely positioned `div[data-testid=bar]` at `barGeometry`, with fill and label colours from `colourFor`, a `bar-progress` child at `percent_complete%` width, and a `bar-label` (task name, ellipsis, `title` = full name). Next to it is an `assignee-tag` pill (person name, same `colourFor` pair, max-width 160px, ellipsis, `title`). A milestone is a `div[data-testid=milestone]` rotated square centred on its date, filled with the `colourFor` fill, with its name and an `assignee-tag` pill beside it that uses the same `colourFor` fill and label pair (AC9, AC38). Critical items get class `critical`: a 2px outline in a dark "critical" colour with a 2px offset gap, plus a small "critical" marker, so it never depends on the fill colour. Clicking a bar calls `openTaskEditor(id)`.
  4. `Arrows`: an SVG overlay with one `path[data-testid=arrow][data-from][data-to]` per dependency. It goes from the predecessor's right edge (a milestone's centre) to the successor's left edge, as an elbow path with an arrowhead marker. Arrows in `critical_dependency_ids` get class `critical` (thicker and dark-critical coloured; zero-slack links only, per D12).
  5. `project-end` text in the chart corner: "Project end: 2026-10-12", or hidden when null. No tasks: `empty-tasks-prompt` over the empty timeline, with an "Add a task" button calling `openTaskEditor("new")`.
  6. Initial scroll: on project open and zoom change, set `scrollerRef.current.scrollLeft = initialScrollLeft(...)`.
- Tests: vitest `colours.test.ts` covers the person pair and the neutral fallback, for both a non-milestone and a milestone task. `chart.spec.ts` (fixed clock 2026-10-01, seeded via helpers): AC3: a bar with data-start 2026-10-05 has width equal to 3 * 32 in day zoom, and its left edge lines up with the day column for 10-05. AC27: 10-10 and 10-11 have `weekend-shade`, and the task Fri 10-09 with duration 3 shows data-end 2026-10-11. AC7: a milestone renders a `milestone` element and no `bar`. AC8: `bar-progress` width / bar width ≈ 0.4. AC9 and AC38: Ana's bar background equals her palette fill, the label colour equals the palette label, and `assignee-tag` has text "Ana". A milestone assigned to Ana has a diamond background equal to Ana's fill, and its `assignee-tag` pill has text "Ana", background equal to Ana's fill and text colour equal to her palette label. An unassigned bar and an unassigned milestone use the neutral fill. AC10: an arrow exists for each dep. AC14 and AC15: seed the AC15 fixture, A and C have class `critical` and B does not, and the A->C arrow is critical. On 13 critical tasks covering all palette colours plus neutral, each has a non-`none` computed outline. AC19: after clicking `zoom-week` then `zoom-month`, the `header-unit` labels change kind, and each bar's x/width equals `(daysBetween(range.start, start)) * PX_PER_DAY[zoom]` within 1px. AC43: the earliest start is within [0, 7 * pxPerDay] of `scrollLeft`, the range includes today, and in an empty project the prompt is visible, `project-end` is absent and there is no `.critical`. AC42: `bar` order in the DOM follows creation order.
- Evidence: Recipe 3. `cd frontend && npx playwright test e2e/chart.spec.ts` passes. Interactive: claude-in-chrome screenshots of day, week and month zoom on a seeded project showing the critical highlight, with a clean console.

### S9: Task panel and editor: create, edit, milestone, progress, assignee, dependencies, delete
- Covers: AC3 (create via UI), AC4, AC5 (visible messages), AC6, AC7 (milestone toggle), AC8 (UI input), AC9 (assign via UI, persists), AC10 and AC11 (UI), AC12 (via field edit), AC13, AC16 (immediate update), AC28 (start edit clamp), AC33 (fields hidden), AC35 (empty-roster assignee choice), AC36 (two tabs), AC40 (UI messages, including an out-of-range cascade), AC41 (task delete confirmation), AC42 (list order)
- Files: `frontend/src/components/tasks/TaskPanel.tsx` (change, replaces the stub), `frontend/src/components/tasks/TaskEditor.tsx` (change, replaces the stub), `frontend/src/components/tasks/DependencyList.tsx` (new), `frontend/src/components/tasks/fields.ts` (new, pure helpers), `frontend/src/components/tasks/fields.test.ts` (new), `frontend/src/styles/tasks.css` (new), `frontend/e2e/tasks.spec.ts` (new)
- Depends on: S7, S8 (e2e asserts on bars, arrows and critical classes)
- Parallel: yes (with S10, S11)
- Steps:
  1. `TaskPanel`: a sticky-left column (TASK_PANEL_WIDTH) with a HEADER_HEIGHT header (columns Name, Start, End, Days, plus an `add-task-button`) and one ROW_HEIGHT `task-row` per task, in `project.tasks` order. The name has an ellipsis and `title`. Clicking a row opens the editor.
  2. `TaskEditor`: a right-side drawer, shown when `state.editor` is set. "new" shows name, start and duration, then create. For an existing task, each field is a text input that commits on Enter or blur and sends only that field (`{start}`, `{end}`, `{duration}` as a number parsed strictly, with non-integers sent as-is so the server rejects them, `{name}`, `{percent_complete}`). Date fields send the typed text unchanged, so malformed dates are rejected by the server. There is also a milestone checkbox (`{is_milestone}`) and an assignee `<select>` ("Unassigned" plus roster people in order, and an `assignee-add-person` button that calls `setRosterOpen(true)`). On a milestone, the end, duration and percent inputs are not rendered. On failure the field reverts to the stored value and `error-message` shows the server message. Inputs always reflect `state.current` after each response, so cascades and clamps show at once.
  3. `DependencyList`: shows predecessors of the open task as `dependency-item`s with `remove-dependency` (no confirmation), plus `predecessor-select` (other tasks of the project) and `add-predecessor`.
  4. `task-delete` calls `confirm` ("Delete task "X"? Its N dependencies will be removed."), then `deleteTask`.
- Tests: vitest `fields.ts` covers parse and format helpers (for example, a duration string passes through untouched unless it is blank). `tasks.spec.ts` (fixed clock 2026-10-01 unless stated): AC3: create "Design" with start 2026-10-05, duration 3, and its row shows end 2026-10-07. AC4: edit duration, start and end, checking the row and bar data attributes each time. AC5 and AC40: end < start, `3.5`, `0`, `2026-02-30`, the malformed `2026-2-5` (in the start field and in the end field), empty name and 3651 each show `error-message`, and the API task is unchanged. AC40 cascade (clock fixed to 2099-12-01 so the timeline stays small): seed A 2099-12-20..2099-12-22 -> B 2099-12-23..2099-12-30. Setting A's end to 2099-12-25 in the editor would push B past 2099-12-31, so `error-message` is visible, the A and B rows and bars keep their old dates, and the API shows both tasks unchanged. AC7 and AC33: tick milestone, the diamond appears, and end, duration and percent inputs are absent. On the AC33 fixture, unticking gives 10-10. AC8: percent 40 is ok, 101 shows an error. AC9: assign Ana, the bar colour changes, and after reload Ana is still assigned. AC35: an empty roster shows only "Unassigned" plus `assignee-add-person`. AC10, AC11, AC13: add A->B, and the arrow appears and B is pushed. C->A and a duplicate each show an error and the arrow count is unchanged; A->A is not offered in the picker (the API rejects it, S5). (Amended after review DD2.) Remove, and the arrow is gone with dates unchanged. AC12 and AC16: on the AC12 fixture, set A's duration so A ends 10-09. B and C rows show 10-10..10-11 and 10-12 without reload, `project-end` updates and the critical classes update. AC28: B start 10-06 shows 10-08. AC36: two pages on the same fixture. Page 1 sets A's end to 10-09, then page 2 (stale) sets B's start to 10-08, and page 2 shows B 10-10 and C 10-12. AC41: task delete with cancel keeps the task, ok removes the task and its arrows. AC42: rows keep creation order after date edits and a reload.
- Evidence: Recipe 3. `cd frontend && npx playwright test e2e/tasks.spec.ts` passes with a clean console. Interactive: claude-in-chrome editing a duration and screenshotting the cascade.

### S10: Roster panel: people, colours, removal
- Covers: AC30 (UI, including rename and rename clash), AC31, AC35 (roster empty), AC41 (person delete confirmation)
- Files: `frontend/src/components/roster/RosterPanel.tsx` (change, replaces the stub), `frontend/src/components/roster/ColourPicker.tsx` (new), `frontend/src/styles/roster.css` (new), `frontend/e2e/roster.spec.ts` (new)
- Depends on: S7, S8 (e2e asserts bar colours)
- Parallel: yes (with S9, S11)
- Steps: a drawer opened by `roster-button` or `setRosterOpen`. It lists people in order (`person-row`, name with ellipsis and `title`, colour dot). The add form has a name input and a `ColourPicker` of 12 `colour-swatch` buttons (`aria-pressed`, accessible name = colour name), with the colour pre-selected to the first palette colour not used in the roster (use the same rule as the backend: first unused, else first). Rename happens inline (Enter or blur). On a failed rename the name reverts to the stored value and `error-message` shows the server message. Clicking a swatch on an existing person sends `updatePerson`. Delete confirms with 'Remove "Ana"? N tasks will become unassigned.' (N counted from `current.tasks`). Errors show `error-message`. The empty roster shows "No people yet" plus the add form.
- Tests: `roster.spec.ts`: add Ana, and the default swatch is the first palette colour. Add Ben, and his default is the second colour. Picking Ana's colour for Ben is allowed. A duplicate "ana" shows an error and the count is unchanged. An empty name and 101 chars are rejected. Rename (AC30): rename Ana to "Anna" via `person-rename`, and the row shows "Anna", her `assignee-tag`s show "Anna", and after reload the roster still shows "Anna". Rename clash: renaming Ben to "anna" shows `error-message`, Ben's row reverts to "Ben", and the API still returns "Ben". Reload, and the roster is the same. AC31: with Ana assigned to 2 seeded tasks, changing her colour gives both bars the new fill with no reload. Removing Ana (confirmation text says "2 tasks"): cancel keeps her. Ok makes both bars the neutral fill with dates unchanged and no `assignee-tag`.
- Evidence: Recipe 3. `cd frontend && npx playwright test e2e/roster.spec.ts` passes with a clean console. Interactive: claude-in-chrome screenshot before and after a colour change.

### S11: Drag to move, drag edges to resize
- Covers: AC7 (milestone not resizable), AC16 (after drag), AC17, AC18, AC19 (snapping in week and month zoom), AC28 (drag and left-edge clamp settle), AC39 (milestone drag settle), AC12 (via move-drag and right-edge resize)
- Files: `frontend/src/components/chart/useBarDrag.ts` (new), `frontend/src/components/chart/Bars.tsx` (change), `frontend/src/styles/chart.css` (change), `frontend/e2e/drag.spec.ts` (new)
- Depends on: S8
- Parallel: yes (with S9, S10)
- Steps: `useBarDrag` uses pointer events with `setPointerCapture`. Pointerdown on the bar body is "move", on `bar-handle-start` or `bar-handle-end` (8px hit areas inside the bar ends, not rendered on milestones) it is a resize. During the drag, only that bar's local transform and width change: compute `proposeDrag(task, mode, daysFromPixels(dx, zoom))` and render at the proposed dates (snapped to days), with no store writes while dragging. On release, `patchForDrag`: null means no change. A movement under 3px counts as a click and opens the editor. Otherwise call `updateTask(id, patch)`. Keep the proposed position until the response arrives, then render the server dates (the "settle"). On error, snap back and show the message. Set `touch-action: none` and cursors `grab` and `ew-resize`.
- Tests: `drag.spec.ts` (fixed clock, seeded, using `page.mouse`): AC17: drag a free bar +64px in day zoom, and data-start and data-end each move +2 days, the duration is unchanged, and it persists after reload. A +47px drop snaps to +1. AC18: right edge +32px gives duration +1 with the same start. Left edge +32px gives duration -1 with the same end. Dragging the left edge past the end leaves duration 1. AC7: a milestone has no handles, and dragging it moves the date. AC28: in the AC28 fixture, drag B -2 days and it settles at 10-08..10-09. The left edge to 10-06 settles at 10-08 with end 10-09. AC39: drag M to 10-08 and it settles on 10-09. AC12 and AC16, on fresh copies of the AC12 fixture: (a) right-edge resize A +2 days (+64px); (b) move-drag A's body +2 days (+64px), so A becomes 10-07..10-09. In each case the B and C bars show 10-10..10-11 and 10-12, `project-end` updates without reload, and after reload all three dates match. AC19: in week and month zoom, a drag of 3 * PX_PER_DAY moves exactly 3 days.
- Evidence: Recipe 3. `cd frontend && npx playwright test e2e/drag.spec.ts` passes with a clean console. Interactive: claude-in-chrome GIF recording of a drag that triggers a cascade (demo evidence).

### S12: Export and import UI
- Covers: AC21, AC22 (through the UI), AC23 (visible message), AC24 (UI shows the new suffixed project)
- Files: `frontend/src/components/io/TransferControls.tsx` (change, replaces the stub), `frontend/e2e/transfer.spec.ts` (new)
- Depends on: S6, S7
- Parallel: yes (with S8)
- Steps: toolbar buttons "Export" (`export-button`, disabled with no project, calls `exportProject`) and "Import" (a label wrapping a hidden `import-input` `<input type=file accept="application/json,.json">`, calling `importFile`, then resetting the input so the same file can be picked again). If the store's `exportProject` or `importFile` from S7 misbehave (for example, re-serialising bytes), report it to the orchestrator rather than editing S7 files.
- Tests: `transfer.spec.ts`: seed a rich project (people, milestone, percent, deps). Export via the UI and capture the file with `page.waitForEvent('download')`. Its JSON has `version` 1, people, tasks and predecessors per C5, with no timestamp-like fields. AC22: delete all projects via API, import the file via `setInputFiles`, export the new project, and the bytes are identical. AC24: import the same file again and "Launch (2)" appears in the list, then "Launch (3)". AC23: importing a file with a cycle shows an `error-message` naming the cycle and the project count is unchanged. A generated file over 5 MB shows a size message.
- Evidence: Recipe 3 plus the round-trip recipe. `cd frontend && npx playwright test e2e/transfer.spec.ts` passes, including the byte-equality assertion, with a clean console.

### S13: Quality gates: performance, 1280x800 layout, console-clean full flow
- Covers: AC25, AC26, AC37
- Files: `frontend/e2e/perf.spec.ts` (new), `frontend/e2e/layout.spec.ts` (new), `frontend/e2e/flow.spec.ts` (new), `frontend/e2e/helpers/bigProject.ts` (new). Fixes only, as needed, in any `frontend/src/**` file (it runs last, alone).
- Depends on: S6, S9, S10, S11, S12
- Parallel: no
- Steps:
  1. `bigProject.ts` exports `buildBigProject(): { doc: object; drag: { taskKey: string; deltaDays: number; cascadedKey: string } }`. `doc` is a valid C5 document with 200 tasks and 250 dependencies: layered DAG, a few milestones, people, and dates computed so every start is at or after its earliest allowed start. `drag` names a move-drag that is known by construction to cascade and to change the critical set: `taskKey` is a non-critical task heading a short side chain whose last task (`cascadedKey`, its direct zero-slack successor or a later one) ends s days (s ≥ 1) before the project end, and `deltaDays = s + 2`. Moving `taskKey` by `deltaDays` pushes `cascadedKey` past the old project end, so both become critical and the old end chain stops being critical.
  2. `perf.spec.ts`: import `doc` via the API and map `taskKey` and `cascadedKey` to task ids from the response (file order = id order). Record `t0` and `page.goto('#/projects/<id>')`. Wait until the counts of `[data-testid=bar],[data-testid=milestone]` = 200 and `arrow` = 250, then perform a drag on a bar and wait for the PATCH request. Assert `Date.now() - t0 < 2000`. For the 200 ms check, first assert the `taskKey` bar lacks class `critical` (a guard that the fixture really changes the critical set). Then install an in-page `pointerup` listener recording `performance.now()` and a `MutationObserver` that resolves once the `cascadedKey` bar's `data-start` has changed and the `taskKey` bar has gained class `critical`. The observer promise also rejects after 2000 ms with a message naming which of the two changes did not happen, so a wrong fixture fails the test instead of hanging it. Drag `taskKey` by `deltaDays * PX_PER_DAY.day` px and assert in-page elapsed time < 200 ms.
  3. `layout.spec.ts` (1280x800): toolbar, task panel and chart are visible. `document.documentElement.scrollWidth <= clientWidth`. A 100-char task, project and person name gets an ellipsis (`scrollWidth > clientWidth` on the element with `text-overflow: ellipsis`) and a `title` with the full text, and the bounding boxes of neighbouring text elements do not intersect.
  4. `flow.spec.ts`: one end-to-end demo path (create project, add task, roster, assign, drag, resize, zoom, delete with confirmation, export and import), relying on the console fixture (AC26).
  5. If budgets fail: memoise `Bars` and `Arrows` rows, avoid re-rendering the whole chart during a drag, and precompute a geometry map.
- Tests: the three specs above, written failing first where the budget is not yet met.
- Evidence: Recipe 3. `just check` (lint, typecheck, test, e2e) exits 0, and `npx playwright test e2e/perf.spec.ts e2e/layout.spec.ts e2e/flow.spec.ts` passes in the installed Chrome. Interactive: claude-in-chrome at 1280x800, a screenshot and a console read with no errors.

## Test strategy
- Unit (pure): pytest for `backend/app/scheduling/` (S2), palette contrast (S4) and naming (S6). Vitest for `frontend/src/timeline/` (S3), the reducer and client (S7), and small pure helpers (S8, S9).
- Integration (API and DB): pytest with FastAPI `TestClient` and a `tmp_path` SQLite file per test (S4, S5, S6), including restart persistence (a second `create_app` on the same file) and the export/import byte round trip.
- E2E: Playwright in the installed Google Chrome (`channel: "chrome"`), against a dedicated backend on 8100 with a throwaway DB and Vite on 5180. `workers: 1`, `resetDb` in `beforeEach`, the clock fixed to 2026-10-01 where "today" matters (2099-12-01 for the S9 out-of-range cascade case), and the auto console-error fixture on every spec (AC26).
- Commands: `just test` (pytest + vitest), `just e2e` (Playwright), `just lint`, `just typecheck`, and `just check` for everything. Each slice's evidence also names its narrower command.

## Risks
- The root `.gitignore` ignores `lib/`, `build/` and `dist/`, so a `src/lib/` folder would silently go uncommitted -> no directory named `lib` (C1), and S1 adds `node_modules/` and DB ignores.
- TypeScript 7 (native) may break `tsc --noEmit` with React types or other tooling -> S1 tries TS 7 and pins `typescript@~5.9` if it fails. Biome is chosen for lint because it has no TypeScript-compiler dependency, unlike typescript-eslint.
- Pydantic lax coercion would accept `"3"`, `3.0` or `true` as a duration, and Python's `bool` is a subclass of `int` -> strict types in request models and explicit `type(x) is int` checks in the importer. Tests cover each case.
- The AC25 200 ms budget relies on a localhost round trip (no client engine), and a Playwright polling delay could distort the measurement -> in-page `performance.now()` plus a MutationObserver with its own timeout, on a drag that `bigProject.ts` guarantees changes the critical set. The drag avoids store writes, and bars and arrows are memoised. If the budget still fails, raise it with the orchestrator rather than adding a second engine silently (D11).
- Export bytes could be altered by the client (re-serialising), which would break AC22 -> the store downloads the raw response blob (C5 note), and S12 asserts byte equality through the UI.
- Timezone or DST drift in the frontend date maths -> UTC day indices only (C6). The clock is fixed in e2e.
- Concurrent writes from two tabs -> `BEGIN IMMEDIATE` serialises writers, and the engine always reads stored data inside the transaction (AC36 tests in S5 and S9).
- OneDrive sync churn on `node_modules/` and `.venv/` may slow installs and watchers -> watch for it, and exclude those folders from sync if it gets slow.
- Parallel slices S9, S10 and S11 all build on S8's chart. S11 is the only one that changes `Bars.tsx` after S8. S9 and S10 only read chart DOM in tests -> file ownership is disjoint as listed.

## Decisions needed
None. The three planner questions were decided by the user on 2026-09-24 and are recorded in `decisions.md`: D10 (React 19 + Vite), D11 (server round trip only, no TypeScript engine copy) and D12 (only zero-slack arrows between critical tasks are highlighted). The plan above assumes all three.

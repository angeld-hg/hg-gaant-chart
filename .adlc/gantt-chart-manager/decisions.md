# Decisions: gantt-chart-manager

## D1: Should dates and durations count every calendar day, or skip weekends?
- Status: decided
- Decision: A) Calendar days, by user, 2026-09-24.
- Raised by: spec-writer (.adlc/gantt-chart-manager/spec.md)
- Context: Affects duration maths, drag snapping, critical path and test fixtures; changing later touches all of them.
- Options:
  - A) Calendar days - every day counts, weekends only shaded. Simplest, easiest to test.
  - B) Working days (Mon-Fri) - durations skip weekends, no weekend start/end. More realistic, more date-maths edge cases.
- Recommendation: A, because it keeps the scheduling core small and verifiable while still looking right.

## D2: What happens when an edit or drag would make a task start before its predecessor finishes?
- Status: decided
- Decision: A) Auto-push, by user, 2026-09-24.
- Raised by: spec-writer (.adlc/gantt-chart-manager/spec.md)
- Context: Defines the core feel of drag-to-reschedule and what AC12 tests.
- Options:
  - A) Auto-push - successors cascade later; a task can't move earlier than predecessors allow (snaps to earliest allowed day). Schedule always valid.
  - B) Block - drop/edit refused, bar snaps back with a message.
  - C) Allow and flag - conflict saved and drawn red; stored schedules can be invalid.
- Recommendation: A, because it keeps stored schedules valid and shows off the dependency engine.

## D3: Is a task assigned to free-text names or to people from a per-project roster?
- Status: decided
- Decision: B) Per-project roster with colours, by user, 2026-09-24.
- Raised by: spec-writer (.adlc/gantt-chart-manager/spec.md)
- Context: A roster enables consistent colours and filtering, but adds CRUD screens and import/export fields.
- Options:
  - A) Free-text name per task (at most one). Minimal.
  - B) Per-project roster (name + colour); task picks at most one person; bars coloured by assignee.
- Recommendation: B, because colour-by-assignee helps the "look great" goal for modest scope.

## D4: What does importing a valid JSON file do?
- Status: decided
- Decision: A) Always create a new project, by user, 2026-09-24.
- Raised by: spec-writer (.adlc/gantt-chart-manager/spec.md)
- Context: Whether import can ever destroy data; shapes the round-trip test (AC24).
- Options:
  - A) Always create a new project, suffixing clashing names ("Launch (2)"). Never destructive.
  - B) Choose between new project and replacing an existing one, with confirmation.
- Recommendation: A, because it is simple, safe, and covers backup/share.

## D5: When a predecessor moves earlier (or shrinks), should its successors follow it back?
- Status: decided
- Raised by: elephant (follow-up to D2)
- Context: D2 auto-pushes successors later; this settles the reverse direction.
- Options:
  - A) Push only - successors never move earlier on their own; slack appears instead.
  - B) Keep chains tight - successors snap back to start right after their predecessor (ASAP).
- Recommendation: A, because it is predictable and respects user-chosen dates.
- Decision: A) Push only, by user, 2026-09-24.

## D6: Should a milestone that follows a task sit on the task's end date instead of the day after?
- Status: decided
- Decision: B) Milestone sits on predecessors latest end (same day), by user, 2026-09-24.
- Raised by: spec-reviewer (reviews/spec-review.md)
- Context: Definitions (earliest allowed start), AC7, AC12, AC14.
- Options:
  - A) One rule: successor starts the day after predecessor ends, milestones included. Simple, but a milestone after a Friday task lands on Saturday and adds a day.
  - B) Milestone's earliest date = its predecessors' latest end (same day); a task after a milestone starts the day after. Matches common Gantt tools; one special case.
- Recommendation: B, because the diamond sits on the day the work finishes.

## D7: Can people have any colour, or only one from a preset palette?
- Status: decided
- Decision: A) Curated preset palette, by user, 2026-09-24.
- Raised by: spec-reviewer (reviews/spec-review.md)
- Context: AC30; label readability constraint.
- Options:
  - A) Preset palette of about 10-12 colours, each with a paired readable text colour. Validation trivial, contrast testable exhaustively.
  - B) Free hex picker. Flexible; text colour computed at runtime; may clash with critical/neutral colours.
- Recommendation: A, because it makes readability a finite, testable list.

## D8: Must project names be unique (case-insensitive) on create/rename, or only on import?
- Status: decided
- Decision: A) Unique everywhere, by user, 2026-09-24.
- Raised by: spec-reviewer (reviews/spec-review.md)
- Context: AC1, AC2, AC24.
- Options:
  - A) Unique everywhere with a visible clash message. Consistent with roster rule and import suffixing.
  - B) Allow duplicates on create/rename; suffix only on import.
- Recommendation: A, for consistency.

## D9: When an API write would break a dependency, does the server clamp/cascade or reject?
- Status: decided
- Decision: A) Server cascades/clamps atomically, returns changed tasks, by user, 2026-09-24.
- Raised by: spec-reviewer (reviews/spec-review.md, blocking item 2)
- Context: The backend contract that every pytest rests on; also decides whether the server is the authority when two tabs are stale.
- Options:
  - A) Server applies the same rules as the UI (cascade, clamp, push-only) atomically and returns every changed task; 4xx only for invalid input. Server is the single source of scheduling truth.
  - B) Server rejects dependency-breaking writes with 4xx; the client computes the cascade and sends all changes.
- Recommendation: A, because the scheduling engine lives in one place (Python, easy to unit-test) and stale clients can't corrupt data.

## D10: Should the frontend use React, or stay framework-free?
- Status: decided
- Decision: A) React 19 + Vite, by user, 2026-09-24.
- Raised by: planner (plan.md)
- Context: Forms, drawers, dialogs and a ~450-element chart; affects every frontend slice.
- Options:
  - A) React 19 + Vite, no router/state/component libs. Declarative re-render from server state. +2 runtime deps.
  - B) Vanilla TypeScript with hand-rolled DOM/SVG. Zero deps, much more update code, more state bugs.
  - C) Preact. React-like, smaller bundle, less common tooling.
- Recommendation: A (plan assumes it), because the interaction surface is large.

## D11: Should the browser wait for the server's cascade after a drag, or predict it with a TypeScript engine copy?
- Status: decided
- Decision: A) Server round trip only, by user, 2026-09-24.
- Raised by: planner (plan.md)
- Context: AC25 200 ms budget vs D9 single scheduling authority.
- Options:
  - A) Server round trip only. One engine; localhost should fit; S13 measures it.
  - B) TS mirror engine for instant prediction, reconciled with server. Budget certain; two engines to keep identical.
- Recommendation: A (plan assumes it); revisit only if S13 fails.

## D12: Should every arrow between two critical tasks be highlighted, or only zero-slack (driving) ones?
- Status: decided
- Decision: B) Zero-slack links only, by user, 2026-09-24.
- Raised by: planner (plan.md)
- Context: AC14 "critical tasks, and the arrows between them"; a slack link between two critical tasks isn't on the path.
- Options:
  - A) Every arrow whose two ends are critical (literal).
  - B) Only arrows with both ends critical and zero link slack. Same result for AC15 fixtures.
- Recommendation: B (plan assumes it), because it shows exactly the chains that decide the end date.

## D13: How should the e2e console-error check treat Chrome's automatic "Failed to load resource: 4xx" log on expected API rejections?
- Status: decided
- Decision: A) Ignore browser 4xx network logs in the e2e console fixture, by user, 2026-09-24. AC26 read as no app errors; 5xx and app console.error still fail.
- Raised by: implementer S7 (BLOCKED report, 2026-09-24)
- Context: Chrome logs a console error line for every 4xx fetch. The shared fixture (frontend/e2e/fixtures.ts, S1) fails any test that sees it, so every test that deliberately submits invalid input (S7, S9, S10, S12) fails at teardown. Also decides how AC26 "no console errors" is read.
- Options:
  - A) Ignore browser network logs matching /^Failed to load resource: the server responded with a status of 4\d\d/. 5xx and real app console.error still fail. AC26 read as "no app errors". Proven: 12/12 on projects.spec.ts.
  - B) Strict by default; specs opt in to expected statuses (test.use({ allowHttpStatuses: [409, 422] })). More precise; every rejection spec must opt in.
  - C) API returns 2xx with an error body. Breaks contract C2 and AC34/AC40 wording.
- Recommendation: A, because the lines come from the browser, not the app, and 5xx and app errors stay caught.

## D14: Should the AC25 "loads within 2 s" measurement exclude Vite dev-server first-compile time?
- Status: decided
- Decision: A) Keep dev-server warm-up in the AC25 measurement, by user, 2026-09-24.
- Raised by: implementer S13a (report, 2026-09-24)
- Context: On a freshly started Vite dev server the first page load measured 1818 ms (Vite compiling modules on demand); warm loads measure ~580 ms. The spec currently warms the dev server in a throwaway browser context before starting the clock. Cascade redraw is ~25-33 ms against 200 ms either way.
- Options:
  - A) Keep the dev-server warm-up. Measures app performance, not dev tooling. Already passing.
  - B) Measure against a production build (vite build + preview) with no warm-up. Most honest "real user" number; adds a build step and a preview server to the perf run.
  - C) Cold dev server, no warm-up. Strictest, but it measures Vite and sits close to the budget (flaky).
- Recommendation: A, because the dev-compile cost isn't something users of a built app would ever pay, and the margin (580 ms vs 2000 ms) is wide.

## D15: Should the chart actually skip re-rendering unchanged bars, or just correct the misleading comment? (CR4)
- Status: decided
- Decision: A) Correct the comment only, by user, 2026-09-24.
- Raised by: code-reviewer (reviews/code-review.md CR4)
- Context: Bars.tsx says only the changed row re-renders, but Chart.tsx rebuilds every ChartItem per mutation so memo never skips. AC25 passes with a wide margin (~25-76 ms vs 200 ms).
- Options:
  - A) Correct the comment only. No behaviour change, no risk; perf already well within budget.
  - B) Reuse unchanged ChartItem objects so memo works. Real optimisation and headroom for bigger projects; more code and a small risk of stale-render bugs.
- Recommendation: A, because the budget is met with a wide margin and the goal is a demo, not scale.

## D16: When an imported name is shortened to fit its suffix, should trailing spaces be trimmed? (CR5)
- Status: decided
- Decision: A) Keep the trim, pin it with a test, note in AC24, by user, 2026-09-24.
- Raised by: code-reviewer (reviews/code-review.md CR5)
- Context: AC24 says the name is "shortened from its end just enough for the suffix to fit". The planner's Spec interpretations (following a round-2 spec-review nit) chose to trim trailing spaces after shortening, so "Big launch (2)" never becomes "Big  (2)". The drift checker accepted this as recorded.
- Options:
  - A) Keep the trim, pin it with a test, and note it in spec.md as a clarification of AC24. Cleaner names.
  - B) Drop the trim (literal AC24). A name can end with a double space before the suffix.
- Recommendation: A, because it is already the recorded interpretation and gives nicer names.

# Spec: Gantt chart manager

## Problem
We need a polished, demo-worthy web app for planning projects on a Gantt chart. It also has to exercise the ADLC end to end: pure scheduling logic, an HTTP API, persistence, and a rich interactive UI. The repo is empty today, so nothing can be planned, scheduled, or demoed yet. The app should stay modest in scope but look professional and behave correctly.

## Goals
- A single user can create projects and plan tasks on a timeline, with dates, durations, milestones, and progress.
- Each project has a roster of people (name and a colour from a preset palette). A task can be assigned to one of them, and its bar takes that person's colour.
- Finish-to-start dependencies are always respected. Rescheduling pushes dependent work later automatically, and the critical path is always visible and correct.
- The server is the single authority on scheduling: whatever a client sends, no stored schedule ever breaks a dependency.
- Rescheduling feels direct: drag a bar to move it, drag its edges to resize it, and zoom the timeline.
- Work survives restarts, and a whole project can be exported to JSON and imported back as a new project without loss.
- Every behaviour below can be verified locally with automated tests (no CI).

## Non-goals
- Authentication, multiple users, permissions, or real-time collaboration.
- Live sync between browser tabs or windows. Another open tab shows changes only after a reload (the server still keeps data valid, see AC36).
- Working-day calendars, skipped weekends, or holidays. Weekends are shaded, but they count as normal days.
- Dependency types other than finish-to-start (no SS/FF/SF), and no lag/lead times.
- Pulling successors earlier automatically when a predecessor moves earlier or shrinks (the scheduling is push-only).
- Summary/parent tasks, task hierarchies, and manual reordering of task rows.
- More than one assignee per task, sharing people across projects, and filtering or grouping by assignee.
- Free-form colour picking (colours come only from the preset palette).
- Resource levelling, capacity planning, costs, or baselines.
- Sub-day (hourly) scheduling. The smallest unit is one day.
- Undo/redo, and import from other formats (MS Project, CSV).
- Importing into, replacing, or merging with an existing project.
- CI pipelines and deployment (local verification only, per gap triage).
- Creating GitHub repos (angeld-hg/angel-adlc and angeld-hg/hg-gaant-chart already exist).

## Users and scenarios
- As a project planner, I create a project and add tasks with dates, so that I can see the plan on a timeline.
- As a planner, I link tasks with dependencies, so that later work moves automatically when earlier work slips, and I can see which chain of work (the critical path) decides the finish date.
- As a planner, I drag and resize bars, so that I can reschedule quickly without typing dates.
- As a planner, I zoom between day, week, and month views, so that I can see both detail and the big picture.
- As a planner, I keep a roster of people with colours and assign tasks to them, so that the chart shows ownership at a glance.
- As a planner, I mark milestones and set % complete, so that the chart shows progress.
- As a planner, I export a project to JSON and import it elsewhere, so that I can back up or share a plan.

Definitions used below:
- Dates are calendar dates, with no time of day, written YYYY-MM-DD in the API and in exported files. Every calendar day counts, including Saturdays and Sundays.
- A task's duration counts days inclusively, so a task that starts and ends on the same day lasts 1 day. For a non-milestone, end = start + duration - 1.
- A milestone has duration 0 and a single date, which serves as both its start and its end.
- For a dependency A -> B ("A finishes before B starts"): if B is a normal task, B's earliest allowed start is the day after A ends. If B is a milestone, B's earliest allowed date is the day A ends (the same day). A milestone's "end" is its date, so a task after a milestone starts the day after it. With several predecessors, the latest of their ends is used.
- The project end is the latest task end (or milestone date) in the project. A project with no tasks has no project end.
- Names (of projects, tasks, and people) are trimmed of leading and trailing spaces before they are checked or stored. "Matches" means equal after trimming, ignoring case.
- The palette is a fixed set of 12 colours, each paired with a label (text) colour. Unassigned tasks use one neutral colour, which is not in the palette.

## Acceptance Criteria
Projects and tasks
- [ ] AC1: Given no projects, when the user creates a project named "Launch", then it appears in the project list, and after a page reload it is still there.
- [ ] AC2: Given a project, the user can rename it (subject to AC34) and delete it (subject to AC41). Deleting a project removes all of its tasks, dependencies, and roster people, and they no longer appear in the UI or the API.
- [ ] AC34: Creating or renaming a project to an empty name, a name over the AC40 length limit, or a name that matches another project (for example "launch" when "Launch" exists) is rejected with a visible message, nothing is stored, and the API returns a 4xx error for the same input. Renaming a project to its own name with different letter case is allowed.
- [ ] AC3: Given a project, when the user creates a task with name, start 2026-10-05, and duration 3, then the task's end is 2026-10-07 and its bar spans exactly those 3 day columns in day zoom.
- [ ] AC27: Given a task that starts on Friday 2026-10-09 with duration 3, then its end is Sunday 2026-10-11, because weekends count. In day zoom, Saturday and Sunday columns are visibly shaded, and the shading has no effect on dates or durations.
- [ ] AC4: Given a non-milestone task, editing its duration keeps the start and moves the end. Editing its start keeps the duration and moves the end. Editing its end keeps the start and changes the duration. (Each edit is still subject to AC12, AC28, AC29, and AC40. Milestones follow AC33.)
- [ ] AC5: Given a task, when the user enters an end date earlier than its start, a duration that is not a whole number, a duration below 1 for a non-milestone, a date that is not a real calendar date in YYYY-MM-DD form, or an empty name, then the change is rejected with a visible message, and the stored task is unchanged (the API returns a 4xx error for the same input).
- [ ] AC40: Limits. Every name (project, task, person) is 1-100 characters after trimming. Every date lies from 2000-01-01 to 2099-12-31. A non-milestone's duration is 1-3650 days. Input outside these limits is rejected with a visible message and nothing is stored (4xx from the API). A change whose cascade (AC12) would push any task past 2099-12-31 is rejected as a whole, with a visible message, and nothing is written.
- [ ] AC6: Given a task, when the user deletes it (subject to AC41), then the task and every dependency touching it are removed.
- [ ] AC42: Tasks are listed, and their chart rows drawn, in creation order. Imported tasks keep the order they have in the file. Roster people are listed in the order they were added. The order is the same after a reload, and changing a task's dates never reorders rows.
- [ ] AC41: Deleting a project, a task, or a roster person first asks the user for confirmation, which says what will be lost (for a project, how many tasks it has; for a person, how many tasks will become unassigned). Cancelling changes nothing. Removing a dependency needs no confirmation. The API deletes without a confirmation step.

Milestones, progress, people
- [ ] AC7: Given a task, when the user marks it as a milestone, then it has duration 0, is drawn as a diamond on its date instead of a bar, and cannot be resized.
- [ ] AC33: Marking a task as a milestone keeps its start as the milestone date, sets its end to the same date, and sets its duration and % complete to 0. On a milestone, the date changes only by editing its start or dragging the diamond. Editing its end or duration, resizing it, or setting % complete to anything other than 0 is not offered in the UI and is rejected by the API with a 4xx error. Unmarking a milestone gives it duration 1 (end = start) and % complete 0, still subject to the dependency rules: given task A (ends 2026-10-09) -> milestone M (10-09), unmarking M makes it 10-10 to 10-10, and M's successors are pushed as in AC12.
- [ ] AC8: Given a non-milestone task, when the user sets % complete to 40, then the bar shows a filled portion that is 40% of its width. Values outside 0-100, or non-integers, are rejected.
- [ ] AC30: Given a project, the user can add a person to its roster with a name and a palette colour, rename them, change their colour, and remove them (subject to AC41). A new person's colour defaults to the first palette colour not yet used in that roster (or the first palette colour if all are used), and two people may share a colour. An empty name, a name over the AC40 limit, a name that matches another person in the same project, or a colour not in the palette is rejected with a visible message, and nothing is stored (the API returns a 4xx error for the same input). The roster persists after a reload.
- [ ] AC38: Every palette colour, and the neutral colour, is paired with a label colour whose contrast ratio against it is at least 4.5:1 (WCAG 2.x formula), and labels on bars and diamonds use that pair. No palette colour equals the neutral colour.
- [ ] AC9: Given a roster containing "Ana", when the user assigns a task to Ana, then the task's bar (or diamond) is drawn in Ana's colour, "Ana" is shown on or next to it, and the assignment is kept after a reload. A task has at most one assignee, and it can have none. Unassigned tasks use the neutral colour. The API rejects, with a 4xx error, an assignment to a person who is not in that task's project.
- [ ] AC31: Given Ana is assigned to tasks, when the user changes Ana's colour, then all of her bars show the new colour immediately (with no reload). When the user removes Ana from the roster, then her tasks remain with their dates unchanged, but they become unassigned and are drawn in the neutral colour.

Dependencies and scheduling
- [ ] AC10: Given tasks A and B, when the user adds a dependency "A finishes before B starts", then an arrow is drawn from the end of A to the start of B. If B currently starts before its earliest allowed start, then the dependency is still added, and B (and its successors, in a cascade) are pushed later as described in AC12.
- [ ] AC11: Given A -> B -> C, when the user tries to add C -> A, or A -> A, or a duplicate A -> B, then the change is rejected with a visible message, and no dependency is stored.
- [ ] AC12: Given A (2026-10-05 to 10-07) -> B (10-08 to 10-09) -> C (10-10 to 10-10), when A's end moves to 10-09 by any means (a duration edit, end edit, start edit, drag, or right-edge resize), then in the same change B becomes 10-10 to 10-11 and C becomes 10-12 to 10-12. Their durations are unchanged, and all three survive a reload. Successors move only as far as needed: if B were instead 10-12 to 10-13 and C 10-14 to 10-14, then moving A's end to 10-09 moves neither B nor C. After any change, no stored schedule breaks a dependency.
- [ ] AC28: Given A (ends 2026-10-07) -> B (10-08 to 10-09), when the user drags B, edits B's start, or drags B's left edge so that B would start on 10-06, then B instead starts on 10-08, its earliest allowed day. A drag or start edit keeps B's duration. A left-edge resize keeps B's end. The bar visibly settles on the allowed day.
- [ ] AC39: Given task A (2026-10-05 to Friday 10-09) -> milestone M -> task C (10-10 to 10-11), M's earliest allowed date is 10-09 (the day A ends) and C's earliest allowed start is 10-10. Dragging M to 10-08 makes it settle on 10-09. When A's end moves to 10-12, M moves to 10-12 and C becomes 10-13 to 10-14.
- [ ] AC29: Given A (2026-10-05 to 10-07) -> B (10-08 to 10-09), when A moves earlier or its duration shrinks (for example, A's end becomes 10-05), then B's dates are unchanged, and B now has slack (push-only).
- [ ] AC13: Given a dependency, the user can remove it, and its arrow disappears. The dates of the tasks it connected are unchanged.
- [ ] AC32: The API applies the same scheduling rules as the UI (AC10 and AC12 cascade, AC28 clamp, AC29 push-only, AC39 milestone rule) to every write, as one atomic change, and its response includes every task whose dates changed, including the edited task with its final dates. For example, a request setting B's start to 10-06 in the AC28 fixture succeeds and stores B as 10-08 to 10-09. Only input that breaks AC5, AC8, AC9, AC11, AC30, AC33, AC34, or AC40 gets a 4xx error, and then nothing is written.
- [ ] AC36: The server computes clamps and cascades from its own stored data at the moment of the write, never from other tasks' dates held by the client. Given two tabs open on the same AC12 fixture, when tab 1 moves A's end to 10-09 (pushing B and C) and then tab 2, still showing the old dates, sets B's start to 10-08, then the stored B starts 10-10, no stored dependency is broken, and tab 2 shows the dates returned by the server for every task in the response.

Critical path
- [ ] AC14: A task is critical if and only if delaying its end (a milestone's date) by one day, with successors moved only as far as the dependencies force, would delay the project end. Critical tasks are visually highlighted. An arrow A -> B is highlighted only if A and B are both critical and the link has zero slack, meaning B starts exactly on the earliest allowed start that A alone would give it (see Definitions). An arrow between two critical tasks whose link has slack is drawn like any other arrow. The highlight stays recognisable on bars of every palette colour and on the neutral colour, so it cannot rely on bar fill colour alone.
- [ ] AC15: Given A (days 1-3) -> C (days 4-6) and B (days 1-2) -> C, then A and C are critical and B is not (B has 1 day of slack). Given two parallel chains that both end on the project end, both chains are critical.
- [ ] AC16: The project end date is shown with the chart. It and the critical path update immediately (with no reload) after any change to a task's dates, duration, or dependencies, including changes made by the cascade in AC12.

Interaction
- [ ] AC17: Given day zoom and a task with no dependency constraints, when the user drags its bar 2 day columns to the right and releases, then its start and end each move 2 days later, its duration is unchanged, and the new dates survive a reload. Drops snap to whole days.
- [ ] AC18: Given a bar, dragging its right edge 1 column right increases duration by 1 and keeps the start. Dragging its left edge 1 column right decreases duration by 1 and keeps the end. A resize cannot reduce duration below 1.
- [ ] AC19: The user can switch zoom between day, week, and month. Each switch changes the timeline header units, and every bar still starts and ends at its correct date in the new scale. Dragging in week or month zoom still snaps to whole days.
- [ ] AC43: When a project opens, the timeline is scrolled so that the earliest task start is near its left edge. The timeline can scroll from at least 30 days before the earliest task start to at least 60 days after the project end, and its range always includes today. For a project with no tasks, it shows the range around today.
- [ ] AC35: Empty states. Given no projects, the app shows a message and a way to create a project. Given a project with no tasks, the chart shows an empty timeline (AC43) with a prompt to add a task, shows no project end, and marks nothing critical. Given an empty roster, the assignee choice offers only "Unassigned" plus a way to add a person. None of these states produces a console error.

Persistence and JSON
- [ ] AC20: Given data created through the app, when the backend server is restarted, then all projects, tasks, dependencies, milestones, progress values, roster people (names and colours), and assignments are unchanged.
- [ ] AC21: Given a project, when the user exports it, then they download a JSON file containing a format version, the project name, its roster (each person's name and colour), and every task's name, start, end, duration, milestone flag, % complete, assignee (a reference to a roster person, or none), and dependencies. Tasks and people are referenced by keys local to the file, not by database identifiers. People and tasks appear in the AC42 order, and dependencies in a fixed order derived from that task order. The file contains no timestamps or other values that change between exports of the same data.
- [ ] AC22: Export a project, import the file into an empty database, then export the imported project. The two files are byte-identical.
- [ ] AC23: Given a JSON file that is malformed, is larger than 5 MB, has an unknown format version, references missing tasks or missing roster people, contains a dependency cycle, a self-dependency, or a duplicate dependency, has a task starting before its earliest allowed start, has a non-milestone whose end is not start + duration - 1, has a milestone whose start and end differ or whose duration or % complete is not 0, uses a colour outside the palette, has an empty or too-long project name, or breaks any rule in AC5, AC8, AC30, or AC40, when the user imports it, then the import is rejected with a message naming the problem, and nothing is written. The importer never adjusts dates to make a file valid. A project name that clashes with an existing one is not an error (see AC24).
- [ ] AC24: Importing a valid file always creates a new project, with its own roster, tasks, and dependencies. Existing projects are never modified. If a project with a matching name already exists, the new one gets the first free suffix " (n)", starting at 2: "Launch" becomes "Launch (2)", then "Launch (3)" on the next import. The suffix is added to the imported name as written, so importing "Launch (2)" when "Launch (2)" exists gives "Launch (2) (2)". If the suffixed name would exceed 100 characters, the imported name is shortened from its end just enough for the suffix to fit.

Quality
- [ ] AC25: Given a project with 200 tasks and 250 dependencies, measured by the browser test suite in the installed Chrome on the dev machine: within 2 seconds of navigating to the project, all 200 bars or diamonds and all 250 arrows are present in the page and a drag on a bar is accepted. After a drag release that triggers a cascade, the page shows the cascaded dates and the updated critical highlight within 200 ms (saving may finish later).
- [ ] AC37: In a 1280x800 browser window, the toolbar, task list, and chart are all visible with no horizontal scroll of the page itself (the timeline may scroll within its own area). Names too long for their space are cut with an ellipsis, shown in full on hover, and never overlap other text.
- [ ] AC26: Loading the app, creating a task, managing the roster, assigning a task, dragging, resizing, zooming, deleting (with confirmation), and export/import produce no errors in the browser console.

## Constraints
- Stack choices already made: Python backend, TypeScript frontend, SQLite persistence, npm. Try TypeScript 7 first, and pin 5.x if the tooling breaks.
- Slice 1 must scaffold backend and frontend with passing smoke tests and a single entry point for test, lint, typecheck, dev, and e2e.
- Verification is local only (no CI). Browser tests must run against the installed Google Chrome, with no browser download.
- Scheduling logic (date maths, cascade, earliest-start snapping, the milestone rule) and critical-path logic must be testable in isolation from the UI and the database.
- Local, single-user app. No secrets, and no network services beyond the app's own backend.
- Mobile layouts are not required; the minimum supported window is 1280x800 (AC37).

## Choices made without a user decision
Picked by the spec-writer to close review items. Any of them can be changed cheaply now.
- Limits (AC40): names 1-100 characters after trimming; dates 2000-01-01 to 2099-12-31; duration up to 3650 days; import files up to 5 MB.
- Delete confirmation (AC41): required for projects, tasks, and people; not for dependencies, and not in the API.
- Milestones (AC33): marking keeps the start as the date; % complete is fixed at 0 on milestones; unmarking gives duration 1.
- Palette (D7, AC30, AC38): 12 colours; colours may repeat within a roster; a new person defaults to the first unused colour; label contrast at least 4.5:1.
- Row order (AC42): creation order (file order on import); manual reordering is a non-goal.
- Import suffix (AC24): appended to the literal imported name ("Launch (2)" becomes "Launch (2) (2)"), shortened to fit 100 characters.
- Project rename (AC34): changing only the letter case of a project's own name is allowed.
- Timeline range (AC43): at least 30 days before the earliest start to 60 days after the project end, always including today.
- Concurrency (AC36, Non-goals): the server stays authoritative; live multi-tab sync is out of scope.

## Decisions needed
None.

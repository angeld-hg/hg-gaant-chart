import { describe, expect, it } from "vitest";
import type { MutationResult, ProjectDetail, ProjectSummary, Task } from "../api/types.ts";
import { type AppState, initialState, reducer } from "./reducer.ts";

function task(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    start: "2026-10-05",
    end: "2026-10-07",
    duration: 3,
    is_milestone: false,
    percent_complete: 0,
    assignee_id: null,
    ...overrides,
  };
}

function detail(id: number, tasks: Task[] = [], name = `Project ${id}`): ProjectDetail {
  return {
    id,
    name,
    people: [],
    tasks,
    dependencies: [],
    schedule: {
      project_end: tasks.length ? "2026-10-07" : null,
      critical_task_ids: [],
      critical_dependency_ids: [],
    },
  };
}

function summary(id: number, taskCount = 0, name = `Project ${id}`): ProjectSummary {
  return { id, name, task_count: taskCount };
}

function withState(overrides: Partial<AppState>): AppState {
  return { ...initialState, ...overrides };
}

describe("initial state", () => {
  it("starts empty in day zoom with nothing open", () => {
    expect(initialState).toEqual({
      projects: [],
      current: null,
      palette: null,
      zoom: "day",
      error: null,
      editor: null,
      rosterOpen: false,
      confirm: null,
      lastChangedTaskIds: [],
      projectsLoaded: false,
    });
  });
});

describe("projects", () => {
  it("replaces the list when projects load", () => {
    const next = reducer(initialState, {
      type: "projects-loaded",
      projects: [summary(1), summary(2)],
    });

    expect(next.projects.map((p) => p.id)).toEqual([1, 2]);
  });

  it("marks the list as loaded, even when it is empty (so the empty state can show)", () => {
    expect(initialState.projectsLoaded).toBe(false);

    const next = reducer(initialState, { type: "projects-loaded", projects: [] });

    expect(next.projectsLoaded).toBe(true);
  });

  it("appends a created project at the end (creation order)", () => {
    const state = withState({ projects: [summary(1)] });

    const next = reducer(state, { type: "project-created", project: summary(2) });

    expect(next.projects.map((p) => p.id)).toEqual([1, 2]);
  });

  it("renames a project in the list and in the open project", () => {
    const state = withState({
      projects: [summary(1, 0, "Launch")],
      current: detail(1, [], "Launch"),
    });

    const next = reducer(state, { type: "project-renamed", project: summary(1, 0, "LAUNCH") });

    expect(next.projects[0]?.name).toBe("LAUNCH");
    expect(next.current?.name).toBe("LAUNCH");
  });

  it("does not touch the open project when another project is renamed", () => {
    const current = detail(1, [], "Launch");
    const state = withState({ projects: [summary(1), summary(2)], current });

    const next = reducer(state, { type: "project-renamed", project: summary(2, 0, "Other") });

    expect(next.current).toBe(current);
  });

  it("removes a deleted project and closes it (and its drawers) when it was open", () => {
    const state = withState({
      projects: [summary(1), summary(2)],
      current: detail(1, [task(10)]),
      editor: { taskId: 10 },
      rosterOpen: true,
      lastChangedTaskIds: [10],
    });

    const next = reducer(state, { type: "project-deleted", id: 1 });

    expect(next.projects.map((p) => p.id)).toEqual([2]);
    expect(next.current).toBeNull();
    expect(next.editor).toBeNull();
    expect(next.rosterOpen).toBe(false);
    expect(next.lastChangedTaskIds).toEqual([]);
  });

  it("keeps the open project when a different one is deleted", () => {
    const current = detail(2);
    const state = withState({ projects: [summary(1), summary(2)], current });

    const next = reducer(state, { type: "project-deleted", id: 1 });

    expect(next.current).toBe(current);
  });

  it("opening a project replaces current and closes the previous project's drawers", () => {
    const state = withState({
      current: detail(1, [task(10)]),
      editor: { taskId: 10 },
      rosterOpen: true,
      lastChangedTaskIds: [10],
    });

    const next = reducer(state, { type: "project-opened", project: detail(2) });

    expect(next.current?.id).toBe(2);
    expect(next.editor).toBeNull();
    expect(next.rosterOpen).toBe(false);
    expect(next.lastChangedTaskIds).toEqual([]);
  });

  it("re-opening the same project keeps its drawers", () => {
    const state = withState({
      current: detail(1, [task(10)]),
      editor: { taskId: 10 },
      rosterOpen: true,
    });

    const next = reducer(state, { type: "project-opened", project: detail(1, [task(10)]) });

    expect(next.editor).toEqual({ taskId: 10 });
    expect(next.rosterOpen).toBe(true);
  });

  it("refreshes the opened project's summary in the list", () => {
    const state = withState({ projects: [summary(1, 0, "Launch")] });

    const next = reducer(state, {
      type: "project-opened",
      project: detail(1, [task(10), task(11)], "Launch"),
    });

    expect(next.projects[0]).toEqual(summary(1, 2, "Launch"));
  });
});

describe("mutation results", () => {
  function result(project: ProjectDetail, changed: number[] = []): MutationResult {
    return { project, changed_task_ids: changed, created_id: null };
  }

  it("replaces current wholesale with the server's project and records the changed ids", () => {
    const state = withState({
      projects: [summary(1, 1)],
      current: detail(1, [task(10)]),
    });
    const pushed = detail(1, [task(10, { end: "2026-10-09" }), task(11, { start: "2026-10-10" })]);

    const next = reducer(state, { type: "mutation-applied", result: result(pushed, [10, 11]) });

    expect(next.current).toBe(pushed);
    expect(next.lastChangedTaskIds).toEqual([10, 11]);
  });

  it("refreshes the project's task count in the list", () => {
    const state = withState({
      projects: [summary(1, 1), summary(2, 5)],
      current: detail(1, [task(10)]),
    });

    const next = reducer(state, {
      type: "mutation-applied",
      result: result(detail(1, [task(10), task(11)]), [11]),
    });

    expect(next.projects).toEqual([summary(1, 2), summary(2, 5)]);
  });

  it("ignores a late result for a project that is no longer open, but still refreshes its count", () => {
    const current = detail(2);
    const state = withState({ projects: [summary(1, 0), summary(2, 0)], current });

    const next = reducer(state, {
      type: "mutation-applied",
      result: result(detail(1, [task(10)]), [10]),
    });

    expect(next.current).toBe(current);
    expect(next.lastChangedTaskIds).toEqual([]);
    expect(next.projects[0]?.task_count).toBe(1);
  });

  it("closes the editor when its task no longer exists", () => {
    const state = withState({ current: detail(1, [task(10), task(11)]), editor: { taskId: 11 } });

    const next = reducer(state, {
      type: "mutation-applied",
      result: result(detail(1, [task(10)])),
    });

    expect(next.editor).toBeNull();
  });

  it("keeps the editor open on a task that still exists, and on a new-task draft", () => {
    const existing = withState({ current: detail(1, [task(10)]), editor: { taskId: 10 } });
    const draft = withState({ current: detail(1, [task(10)]), editor: { taskId: "new" } });
    const after = result(detail(1, [task(10, { duration: 4 })]), [10]);

    expect(reducer(existing, { type: "mutation-applied", result: after }).editor).toEqual({
      taskId: 10,
    });
    expect(reducer(draft, { type: "mutation-applied", result: after }).editor).toEqual({
      taskId: "new",
    });
  });
});

describe("errors", () => {
  it("sets and clears the error message", () => {
    const failed = reducer(initialState, { type: "error-set", message: "Name taken." });
    expect(failed.error).toBe("Name taken.");

    const cleared = reducer(failed, { type: "error-cleared" });
    expect(cleared.error).toBeNull();
  });

  it("replaces an earlier error with the newest one", () => {
    const state = withState({ error: "First." });

    expect(reducer(state, { type: "error-set", message: "Second." }).error).toBe("Second.");
  });
});

describe("ui flags", () => {
  it("opens the editor on a task, on a new draft, and closes it", () => {
    const onTask = reducer(initialState, { type: "editor-set", editor: { taskId: 4 } });
    expect(onTask.editor).toEqual({ taskId: 4 });

    const onDraft = reducer(onTask, { type: "editor-set", editor: { taskId: "new" } });
    expect(onDraft.editor).toEqual({ taskId: "new" });

    expect(reducer(onDraft, { type: "editor-set", editor: null }).editor).toBeNull();
  });

  it("opens and closes the roster", () => {
    const open = reducer(initialState, { type: "roster-set", open: true });
    expect(open.rosterOpen).toBe(true);
    expect(reducer(open, { type: "roster-set", open: false }).rosterOpen).toBe(false);
  });

  it("shows and hides the confirmation dialog", () => {
    const confirm = { title: "Delete project", message: "Sure?", confirmLabel: "Delete" };
    const shown = reducer(initialState, { type: "confirm-set", confirm });
    expect(shown.confirm).toEqual(confirm);
    expect(reducer(shown, { type: "confirm-set", confirm: null }).confirm).toBeNull();
  });

  it("sets the zoom", () => {
    expect(reducer(initialState, { type: "zoom-set", zoom: "month" }).zoom).toBe("month");
  });

  it("stores the palette", () => {
    const palette = { colours: [], neutral: { fill: "#9ca3af", label: "#111827" } };
    expect(reducer(initialState, { type: "palette-loaded", palette }).palette).toBe(palette);
  });
});

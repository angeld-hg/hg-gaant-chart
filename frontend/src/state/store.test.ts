import { describe, expect, it } from "vitest";
import type { MutationResult, ProjectDetail, ProjectSummary, Task } from "../api/types.ts";
import { type AppAction, type AppState, initialState, reducer } from "./reducer.ts";
import { type ActionResult, createWriteQueue } from "./store.tsx";

function task(id: number, start: string): Task {
  return {
    id,
    name: `Task ${id}`,
    start,
    end: start,
    duration: 1,
    is_milestone: false,
    percent_complete: 0,
    assignee_id: null,
  };
}

function detail(tasks: Task[]): ProjectDetail {
  return {
    id: 1,
    name: "Launch",
    people: [],
    tasks,
    dependencies: [],
    schedule: { project_end: null, critical_task_ids: [], critical_dependency_ids: [] },
  };
}

function result(project: ProjectDetail, changed: number[], createdId: number | null = null) {
  return { project, changed_task_ids: changed, created_id: createdId };
}

/** A request the test answers by hand, so it controls the order responses arrive in. */
interface PendingRequest {
  label: string;
  respond(value: MutationResult | ProjectSummary): void;
  reject(error: Error): void;
}

/** Runs the real reducer over whatever the mutator dispatches, and records each request sent. */
function harness(start: AppState) {
  let state = start;
  const sent: PendingRequest[] = [];
  const dispatch = (action: AppAction) => {
    state = reducer(state, action);
  };
  const fail = (error: unknown): ActionResult => {
    const message = error instanceof Error ? error.message : "failed";
    dispatch({ type: "error-set", message });
    return { ok: false, message };
  };
  const { mutate, renameProject } = createWriteQueue(dispatch, fail);
  function request<T = MutationResult>(label: string) {
    return () =>
      new Promise<T>((respond, reject) => {
        sent.push({ label, respond: (value) => respond(value as T), reject });
      });
  }
  function pending(label: string): PendingRequest {
    const found = sent.find((r) => r.label === label);
    if (!found) {
      throw new Error(`request ${label} was not sent`);
    }
    return found;
  }
  return { mutate, renameProject, request, pending, sent, state: () => state };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

/**
 * A network that, of the requests outstanding at each moment, answers the one earliest in
 * `order` first. With every request in flight at once, responses arrive in exactly that order.
 */
async function answerInOrder(
  h: ReturnType<typeof harness>,
  responses: Record<string, MutationResult | ProjectSummary>,
  order: string[],
): Promise<void> {
  const answered = new Set<string>();
  for (let round = 0; round < order.length; round += 1) {
    const outstanding = h.sent.filter((r) => !answered.has(r.label));
    const next = order
      .map((label) => outstanding.find((r) => r.label === label))
      .find((r) => r !== undefined);
    if (!next) {
      break;
    }
    answered.add(next.label);
    next.respond(responses[next.label] as MutationResult | ProjectSummary);
    await settle();
  }
}

const before = detail([task(10, "2026-10-05"), task(11, "2026-10-05")]);
// The server's snapshot after X only, and after X then Y (Y is the later write, so it has both).
const afterX = detail([task(10, "2026-10-12"), task(11, "2026-10-05")]);
const afterXY = detail([task(10, "2026-10-12"), task(11, "2026-10-19")]);

describe("project mutations (CR1)", () => {
  it("keeps the later write's snapshot when two overlapping writes would resolve out of order", async () => {
    const h = harness({ ...initialState, current: before });
    const responses: Record<string, MutationResult> = {
      X: result(afterX, [10]),
      Y: result(afterXY, [11]),
    };

    const x = h.mutate(h.request("X"));
    const y = h.mutate(h.request("Y"));
    await settle();
    // The later write is answered first whenever both are outstanding.
    await answerInOrder(h, responses, ["Y", "X"]);

    await expect(Promise.all([x, y])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(h.sent.map((r) => r.label)).toEqual(["X", "Y"]);
    expect(h.state().current).toBe(afterXY);
    expect(h.state().lastChangedTaskIds).toEqual([11]);
  });

  it("sends a write only after the one before it has landed", async () => {
    const h = harness({ ...initialState, current: before });

    void h.mutate(h.request("X"));
    void h.mutate(h.request("Y"));
    await settle();
    expect(h.sent.map((r) => r.label)).toEqual(["X"]);

    h.pending("X").respond(result(afterX, [10]));
    await settle();
    expect(h.sent.map((r) => r.label)).toEqual(["X", "Y"]);
    expect(h.state().current).toBe(afterX);
  });

  it("still sends the next write after one fails", async () => {
    const h = harness({ ...initialState, current: before });

    const x = h.mutate(h.request("X"));
    const y = h.mutate(h.request("Y"));
    await settle();
    h.pending("X").reject(new Error("Dates are out of range."));
    await settle();
    h.pending("Y").respond(result(afterXY, [11]));

    await expect(x).resolves.toEqual({ ok: false, message: "Dates are out of range." });
    await expect(y).resolves.toEqual({ ok: true });
    expect(h.state().current).toBe(afterXY);
    expect(h.state().error).toBe("Dates are out of range.");
  });
});

describe("renaming a project (CR7)", () => {
  const summary: ProjectSummary = { id: 1, name: "Launch", task_count: 2 };

  it("keeps the new name when a task write in flight would land after the rename", async () => {
    const h = harness({ ...initialState, projects: [summary], current: before });
    // The task write reads the project before the rename, so its snapshot has the old name.
    const responses: Record<string, MutationResult | ProjectSummary> = {
      drag: result(afterX, [10]),
      rename: { ...summary, name: "Launch v2" },
    };

    const drag = h.mutate(h.request("drag"));
    const rename = h.renameProject(h.request<ProjectSummary>("rename"));
    await settle();
    // The rename is answered first whenever it is outstanding alongside the task write.
    await answerInOrder(h, responses, ["rename", "drag"]);

    await expect(Promise.all([drag, rename])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(h.state().projects).toEqual([{ id: 1, name: "Launch v2", task_count: 2 }]);
    expect(h.state().current?.name).toBe("Launch v2");
    expect(h.state().current?.tasks).toBe(afterX.tasks);
    expect(h.sent.map((r) => r.label)).toEqual(["drag", "rename"]);
  });

  it("sends a task write issued after a rename only once the rename has landed", async () => {
    const h = harness({ ...initialState, projects: [summary], current: before });

    const rename = h.renameProject(h.request<ProjectSummary>("rename"));
    const drag = h.mutate(h.request("drag"));
    await settle();
    expect(h.sent.map((r) => r.label)).toEqual(["rename"]);

    h.pending("rename").reject(new Error("A project with that name already exists."));
    await settle();
    expect(h.sent.map((r) => r.label)).toEqual(["rename", "drag"]);
    h.pending("drag").respond(result(afterX, [10]));

    await expect(rename).resolves.toEqual({
      ok: false,
      message: "A project with that name already exists.",
    });
    await expect(drag).resolves.toEqual({ ok: true });
    expect(h.state().current).toBe(afterX);
    expect(h.state().projects).toEqual([summary]);
  });
});

describe("creating a task (CR3)", () => {
  it("opens the created task by created_id even when a drag save lands during the create", async () => {
    const h = harness({ ...initialState, current: before, editor: { taskId: "new" } });
    const created = detail([...afterX.tasks, task(12, "2026-10-06")]);

    const drag = h.mutate(h.request("drag"));
    const create = h.mutate(h.request("create"), { opensCreatedTask: true });
    await settle();
    h.pending("drag").respond(result(afterX, [10]));
    await settle();

    // The drag's changed ids arrive while the create is outstanding; the editor must not follow them.
    expect(h.state().editor).toEqual({ taskId: "new" });

    h.pending("create").respond(result(created, [12], 12));
    await Promise.all([drag, create]);

    expect(h.state().current).toBe(created);
    expect(h.state().editor).toEqual({ taskId: 12 });
  });
});

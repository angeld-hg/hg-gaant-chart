import { describe, expect, it } from "vitest";
import type { MutationResult, ProjectDetail, Task } from "../api/types.ts";
import { type AppAction, type AppState, initialState, reducer } from "./reducer.ts";
import { type ActionResult, createMutator } from "./store.tsx";

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
  respond(value: MutationResult): void;
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
  const mutate = createMutator(dispatch, fail);
  function request(label: string) {
    return () =>
      new Promise<MutationResult>((respond, reject) => {
        sent.push({ label, respond, reject });
      });
  }
  function pending(label: string): PendingRequest {
    const found = sent.find((r) => r.label === label);
    if (!found) {
      throw new Error(`request ${label} was not sent`);
    }
    return found;
  }
  return { mutate, request, pending, sent, state: () => state };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
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
    // A network that always answers the newest outstanding request first.
    const answered = new Set<string>();
    for (let round = 0; round < 5; round += 1) {
      const newest = h.sent.filter((r) => !answered.has(r.label)).at(-1);
      if (!newest) {
        break;
      }
      answered.add(newest.label);
      newest.respond(responses[newest.label] as MutationResult);
      await settle();
    }

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

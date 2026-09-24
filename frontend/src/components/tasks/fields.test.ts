import { describe, expect, it } from "vitest";
import type { Dependency, Task } from "../../api/types.ts";
import {
  assigneeValue,
  daysLabel,
  deleteTaskMessage,
  fieldPatch,
  fieldText,
  parseAssignee,
  parseNumberField,
  predecessorOptions,
  predecessorsOf,
} from "./fields.ts";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    name: "Design",
    start: "2026-10-05",
    end: "2026-10-07",
    duration: 3,
    is_milestone: false,
    percent_complete: 40,
    assignee_id: null,
    ...overrides,
  };
}

function dep(id: number, predecessor_id: number, successor_id: number): Dependency {
  return { id, predecessor_id, successor_id };
}

describe("parseNumberField", () => {
  it.each([
    ["3", 3],
    ["0", 0],
    ["3651", 3651],
    [" 12 ", 12],
    ["-2", -2],
    ["+4", 4],
  ])("turns the whole-number text %j into %j", (text, expected) => {
    expect(parseNumberField(text)).toBe(expected);
  });

  it.each(["3.5", "3.0", "abc", "1e3", "2 days", "0x10"])(
    "passes %j through untouched so the server rejects it",
    (text) => {
      expect(parseNumberField(text)).toBe(text);
    },
  );

  it.each(["", "   ", "\t"])("treats the blank text %j as no value", (text) => {
    expect(parseNumberField(text)).toBeNull();
  });
});

describe("fieldText", () => {
  it("formats each field of a task as the text its input shows", () => {
    const t = task();
    expect(fieldText(t, "name")).toBe("Design");
    expect(fieldText(t, "start")).toBe("2026-10-05");
    expect(fieldText(t, "end")).toBe("2026-10-07");
    expect(fieldText(t, "duration")).toBe("3");
    expect(fieldText(t, "percent_complete")).toBe("40");
  });
});

describe("fieldPatch", () => {
  const t = task();

  it("sends only the edited field", () => {
    expect(fieldPatch(t, "name", "Build")).toEqual({ name: "Build" });
    expect(fieldPatch(t, "start", "2026-10-06")).toEqual({ start: "2026-10-06" });
    expect(fieldPatch(t, "end", "2026-10-09")).toEqual({ end: "2026-10-09" });
    expect(fieldPatch(t, "duration", "5")).toEqual({ duration: 5 });
    expect(fieldPatch(t, "percent_complete", "0")).toEqual({ percent_complete: 0 });
  });

  it("returns null when the text still matches the stored value", () => {
    expect(fieldPatch(t, "name", "Design")).toBeNull();
    expect(fieldPatch(t, "start", "2026-10-05")).toBeNull();
    expect(fieldPatch(t, "end", "2026-10-07")).toBeNull();
    expect(fieldPatch(t, "duration", "3")).toBeNull();
    expect(fieldPatch(t, "duration", " 3 ")).toBeNull();
    expect(fieldPatch(t, "percent_complete", "40")).toBeNull();
  });

  it("sends an unchanged value when forced (an explicit Enter), except a blank number", () => {
    expect(fieldPatch(t, "start", "2026-10-05", true)).toEqual({ start: "2026-10-05" });
    expect(fieldPatch(t, "name", "Design", true)).toEqual({ name: "Design" });
    expect(fieldPatch(t, "duration", "3", true)).toEqual({ duration: 3 });
    expect(fieldPatch(t, "duration", "", true)).toBeNull();
  });

  it("sends dates exactly as typed, so the server judges malformed ones", () => {
    expect(fieldPatch(t, "start", "2026-2-5")).toEqual({ start: "2026-2-5" });
    expect(fieldPatch(t, "end", "2026-02-30")).toEqual({ end: "2026-02-30" });
    expect(fieldPatch(t, "start", "")).toEqual({ start: "" });
  });

  it("sends names as typed, including an empty one (the server rejects it)", () => {
    expect(fieldPatch(t, "name", "")).toEqual({ name: "" });
    expect(fieldPatch(t, "name", "   ")).toEqual({ name: "   " });
  });

  it("sends non-integer numbers as the typed text and ignores a blank number", () => {
    expect(fieldPatch(t, "duration", "3.5")).toEqual({ duration: "3.5" });
    expect(fieldPatch(t, "percent_complete", "12.5")).toEqual({ percent_complete: "12.5" });
    expect(fieldPatch(t, "duration", "")).toBeNull();
    expect(fieldPatch(t, "percent_complete", "  ")).toBeNull();
  });
});

describe("daysLabel", () => {
  it("shows the duration, or a diamond for a milestone", () => {
    expect(daysLabel(task())).toBe("3");
    expect(daysLabel(task({ is_milestone: true, duration: 0, end: "2026-10-05" }))).toBe("◆");
  });
});

describe("assignee select values", () => {
  it("round-trips a person id and the unassigned choice", () => {
    expect(assigneeValue(null)).toBe("");
    expect(assigneeValue(7)).toBe("7");
    expect(parseAssignee("")).toBeNull();
    expect(parseAssignee("7")).toBe(7);
  });
});

describe("dependency helpers", () => {
  const a = task({ id: 1, name: "A" });
  const b = task({ id: 2, name: "B" });
  const c = task({ id: 3, name: "C" });
  const tasks = [a, b, c];
  const deps = [dep(10, 1, 2), dep(11, 2, 3), dep(12, 1, 3)];

  it("lists a task's predecessors in dependency order, with their tasks", () => {
    expect(predecessorsOf(3, tasks, deps)).toEqual([
      { dependency: deps[1], task: b },
      { dependency: deps[2], task: a },
    ]);
    expect(predecessorsOf(1, tasks, deps)).toEqual([]);
  });

  it("offers every other task of the project, in task order", () => {
    expect(predecessorOptions(2, tasks)).toEqual([a, c]);
    expect(predecessorOptions(1, [a])).toEqual([]);
  });
});

describe("deleteTaskMessage", () => {
  const t = task({ id: 2, name: "Build" });

  it("counts every dependency touching the task", () => {
    expect(deleteTaskMessage(t, [dep(1, 1, 2), dep(2, 2, 3), dep(3, 1, 3)])).toBe(
      'Delete task "Build"? Its 2 dependencies will be removed.',
    );
  });

  it("uses the singular for one dependency", () => {
    expect(deleteTaskMessage(t, [dep(1, 2, 3)])).toBe(
      'Delete task "Build"? Its 1 dependency will be removed.',
    );
  });

  it("says it cannot be undone when there are no dependencies", () => {
    expect(deleteTaskMessage(t, [dep(1, 1, 3)])).toBe(
      'Delete task "Build"? This cannot be undone.',
    );
  });
});

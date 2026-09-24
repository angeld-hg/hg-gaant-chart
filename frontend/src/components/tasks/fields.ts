// Pure helpers for the task panel and editor: what each input shows, and what a committed edit
// sends. Validation stays on the server (AC5, AC40): typed dates and non-integer numbers are
// sent as they are, so the server's own message explains what is wrong.
import type { Dependency, NumberInput, Task, TaskPatch } from "../../api/types.ts";

/** The task fields the editor edits through a text input. */
export type TextField = "name" | "start" | "end" | "duration" | "percent_complete";

const WHOLE_NUMBER_RE = /^[+-]?\d+$/;

/**
 * A number typed into a field: whole numbers become numbers, blank text is no value (null), and
 * anything else is passed through untouched so the server rejects it with its message.
 */
export function parseNumberField(text: string): NumberInput | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  return WHOLE_NUMBER_RE.test(trimmed) ? Number(trimmed) : text;
}

/** The text an input shows for the stored value of `field`. */
export function fieldText(task: Task, field: TextField): string {
  switch (field) {
    case "name":
      return task.name;
    case "start":
      return task.start;
    case "end":
      return task.end;
    case "duration":
      return String(task.duration);
    case "percent_complete":
      return String(task.percent_complete);
  }
}

/**
 * The PATCH body for committing `text` in `field`: only that field (C2 UI mapping), or null when
 * there is nothing to send. A blank number is never sent. Otherwise an unchanged value is sent
 * only when `force` is set (an explicit Enter), so the server re-applies its scheduling rules to
 * what it holds (AC36) even when this tab's copy looks current.
 */
export function fieldPatch(
  task: Task,
  field: TextField,
  text: string,
  force = false,
): TaskPatch | null {
  if (field === "duration" || field === "percent_complete") {
    const value = parseNumberField(text);
    if (value === null || (!force && value === Number(fieldText(task, field)))) {
      return null;
    }
    return field === "duration" ? { duration: value } : { percent_complete: value };
  }
  if (!force && text === fieldText(task, field)) {
    return null;
  }
  switch (field) {
    case "name":
      return { name: text };
    case "start":
      return { start: text };
    case "end":
      return { end: text };
  }
}

/** The task list's Days column: the duration, or a diamond for a milestone. */
export function daysLabel(task: Task): string {
  return task.is_milestone ? "◆" : String(task.duration);
}

/** The assignee `<select>` value: "" means Unassigned. */
export function assigneeValue(assigneeId: number | null): string {
  return assigneeId === null ? "" : String(assigneeId);
}

export function parseAssignee(value: string): number | null {
  return value === "" ? null : Number(value);
}

export interface Predecessor {
  dependency: Dependency;
  task: Task;
}

/** The dependencies into `taskId`, in dependency (id) order, each with its predecessor task. */
export function predecessorsOf(
  taskId: number,
  tasks: Task[],
  dependencies: Dependency[],
): Predecessor[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const result: Predecessor[] = [];
  for (const dependency of dependencies) {
    const predecessor = byId.get(dependency.predecessor_id);
    if (dependency.successor_id === taskId && predecessor !== undefined) {
      result.push({ dependency, task: predecessor });
    }
  }
  return result;
}

/**
 * The tasks the predecessor picker offers: every other task, in task order. Cycles and
 * duplicates are left for the server to reject with a visible message (AC11).
 */
export function predecessorOptions(taskId: number, tasks: Task[]): Task[] {
  return tasks.filter((t) => t.id !== taskId);
}

/** The task delete confirmation (AC41), saying how many dependencies go with it. */
export function deleteTaskMessage(task: Task, dependencies: Dependency[]): string {
  const count = dependencies.filter(
    (d) => d.predecessor_id === task.id || d.successor_id === task.id,
  ).length;
  const lost =
    count === 0
      ? "This cannot be undone."
      : `Its ${count} ${count === 1 ? "dependency" : "dependencies"} will be removed.`;
  return `Delete task "${task.name}"? ${lost}`;
}

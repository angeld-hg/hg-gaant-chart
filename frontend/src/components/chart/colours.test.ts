import { describe, expect, it } from "vitest";
import type { Palette, Person, Task } from "../../api/types.ts";
import { colourFor, FALLBACK_NEUTRAL } from "./colours.ts";

const PALETTE: Palette = {
  colours: [
    { name: "blue", fill: "#2563eb", label: "#ffffff" },
    { name: "orange", fill: "#ea580c", label: "#111827" },
    { name: "amber", fill: "#f59e0b", label: "#111827" },
  ],
  neutral: { fill: "#9ca3af", label: "#111827" },
};

const PEOPLE: Person[] = [
  { id: 1, name: "Ana", colour: "#ea580c" },
  { id: 2, name: "Ben", colour: "#2563eb" },
];

function task(overrides: Partial<Task>): Task {
  return {
    id: 10,
    name: "Design",
    start: "2026-10-05",
    end: "2026-10-07",
    duration: 3,
    is_milestone: false,
    percent_complete: 0,
    assignee_id: null,
    ...overrides,
  };
}

const MILESTONE = { is_milestone: true, end: "2026-10-05", duration: 0 };

describe("colourFor (AC9, AC38)", () => {
  it.each([
    ["a task", {}],
    ["a milestone", MILESTONE],
  ])("gives %s assigned to a person that person's palette pair", (_kind, shape) => {
    expect(colourFor(task({ ...shape, assignee_id: 1 }), PEOPLE, PALETTE)).toEqual({
      fill: "#ea580c",
      label: "#111827",
    });
    expect(colourFor(task({ ...shape, assignee_id: 2 }), PEOPLE, PALETTE)).toEqual({
      fill: "#2563eb",
      label: "#ffffff",
    });
  });

  it.each([
    ["a task", {}],
    ["a milestone", MILESTONE],
  ])("gives unassigned %s the neutral pair", (_kind, shape) => {
    expect(colourFor(task({ ...shape, assignee_id: null }), PEOPLE, PALETTE)).toEqual(
      PALETTE.neutral,
    );
  });

  it("falls back to neutral for an assignee missing from the roster", () => {
    expect(colourFor(task({ assignee_id: 99 }), PEOPLE, PALETTE)).toEqual(PALETTE.neutral);
  });

  it("follows a person's colour change without any other input (AC31)", () => {
    const recoloured: Person[] = [{ id: 1, name: "Ana", colour: "#f59e0b" }];
    expect(colourFor(task({ assignee_id: 1 }), recoloured, PALETTE)).toEqual({
      fill: "#f59e0b",
      label: "#111827",
    });
  });

  it("uses the fallback neutral while the palette is still loading", () => {
    expect(colourFor(task({}), PEOPLE, null)).toEqual(FALLBACK_NEUTRAL);
  });

  it("picks a readable label when the person's fill is not in the palette", () => {
    const off: Person[] = [
      { id: 1, name: "Ana", colour: "#1e3a8a" },
      { id: 2, name: "Ben", colour: "#fde68a" },
    ];
    expect(colourFor(task({ assignee_id: 1 }), off, PALETTE)).toEqual({
      fill: "#1e3a8a",
      label: "#ffffff",
    });
    expect(colourFor(task({ assignee_id: 2 }), off, null)).toEqual({
      fill: "#fde68a",
      label: "#111827",
    });
  });
});

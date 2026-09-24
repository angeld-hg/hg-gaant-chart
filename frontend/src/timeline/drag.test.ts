import { describe, expect, it } from "vitest";
import { daysBetween } from "./dates.ts";
import { daysFromPixels, patchForDrag, proposeDrag } from "./drag.ts";

const TASK = { start: "2026-10-05", end: "2026-10-07", is_milestone: false };
const MILESTONE = { start: "2026-10-09", end: "2026-10-09", is_milestone: true };

function duration(p: { start: string; end: string }): number {
  return daysBetween(p.start, p.end) + 1;
}

describe("daysFromPixels (AC19)", () => {
  it.each([
    [47, "day", 1],
    [-17, "day", -1],
    [5, "month", 1],
    [64, "day", 2],
    [15, "day", 0],
    [36, "week", 3],
    [12, "month", 3],
    [0, "day", 0],
  ] as const)("%d px in %s zoom is %d days", (dx, zoom, days) => {
    expect(daysFromPixels(dx, zoom)).toBe(days);
  });

  it("never returns -0", () => {
    expect(Object.is(daysFromPixels(-3, "day"), 0)).toBe(true);
    expect(Object.is(daysFromPixels(-0, "week"), 0)).toBe(true);
  });
});

describe("proposeDrag (AC17, AC18)", () => {
  it("moves both ends and keeps the duration", () => {
    expect(proposeDrag(TASK, "move", 2)).toEqual({ start: "2026-10-07", end: "2026-10-09" });
    expect(proposeDrag(TASK, "move", -3)).toEqual({ start: "2026-10-02", end: "2026-10-04" });
  });

  it("resize-end changes the end and keeps the start", () => {
    expect(proposeDrag(TASK, "resize-end", 1)).toEqual({
      start: "2026-10-05",
      end: "2026-10-08",
    });
    expect(proposeDrag(TASK, "resize-end", -1)).toEqual({
      start: "2026-10-05",
      end: "2026-10-06",
    });
  });

  it("resize-start changes the start and keeps the end", () => {
    expect(proposeDrag(TASK, "resize-start", 1)).toEqual({
      start: "2026-10-06",
      end: "2026-10-07",
    });
    expect(proposeDrag(TASK, "resize-start", -2)).toEqual({
      start: "2026-10-03",
      end: "2026-10-07",
    });
  });

  it("resize-start by +5 on a 3-day task keeps duration 1", () => {
    const p = proposeDrag(TASK, "resize-start", 5);
    expect(p).toEqual({ start: "2026-10-07", end: "2026-10-07" });
    expect(duration(p)).toBe(1);
  });

  it("resize-end by -5 on a 3-day task keeps duration 1", () => {
    const p = proposeDrag(TASK, "resize-end", -5);
    expect(p).toEqual({ start: "2026-10-05", end: "2026-10-05" });
    expect(duration(p)).toBe(1);
  });

  it("moves a milestone's single date", () => {
    expect(proposeDrag(MILESTONE, "move", -1)).toEqual({
      start: "2026-10-08",
      end: "2026-10-08",
    });
  });

  it("does not resize a milestone", () => {
    expect(proposeDrag(MILESTONE, "resize-start", 2)).toEqual({
      start: "2026-10-09",
      end: "2026-10-09",
    });
    expect(proposeDrag(MILESTONE, "resize-end", 2)).toEqual({
      start: "2026-10-09",
      end: "2026-10-09",
    });
  });
});

describe("patchForDrag", () => {
  it("sends only start for a move", () => {
    expect(patchForDrag(TASK, "move", proposeDrag(TASK, "move", 2))).toEqual({
      start: "2026-10-07",
    });
  });

  it("sends only end for a right-edge resize", () => {
    expect(patchForDrag(TASK, "resize-end", proposeDrag(TASK, "resize-end", 1))).toEqual({
      end: "2026-10-08",
    });
  });

  it("sends start and end for a left-edge resize", () => {
    expect(patchForDrag(TASK, "resize-start", proposeDrag(TASK, "resize-start", 1))).toEqual({
      start: "2026-10-06",
      end: "2026-10-07",
    });
  });

  it.each(["move", "resize-start", "resize-end"] as const)(
    "returns null when %s leaves the dates unchanged",
    (mode) => {
      expect(patchForDrag(TASK, mode, proposeDrag(TASK, mode, 0))).toBeNull();
    },
  );

  it("returns null for a clamped resize that ends where it began", () => {
    const oneDay = { start: "2026-10-05", end: "2026-10-05" };
    expect(patchForDrag(oneDay, "resize-start", { ...oneDay })).toBeNull();
  });
});

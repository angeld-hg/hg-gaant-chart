import { describe, expect, it } from "vitest";
import { addDays, daysBetween, weekdayMon0 } from "./dates.ts";
import {
  barGeometry,
  computeRange,
  dateToX,
  headerTiers,
  initialScrollLeft,
  PX_PER_DAY,
  type TimelineRange,
  type Zoom,
} from "./scale.ts";

const ZOOMS: Zoom[] = ["day", "week", "month"];
const TASKS = [
  { start: "2026-10-05", end: "2026-10-07" },
  { start: "2026-11-02", end: "2026-12-01" },
];

function rangeWidth(range: TimelineRange, zoom: Zoom): number {
  return (daysBetween(range.start, range.end) + 1) * PX_PER_DAY[zoom];
}

describe("PX_PER_DAY", () => {
  it("matches the contract", () => {
    expect(PX_PER_DAY).toEqual({ day: 32, week: 12, month: 4 });
  });
});

describe("computeRange (AC43)", () => {
  it.each(ZOOMS)("covers today and 30 days before / 60 after the tasks in %s zoom", (zoom) => {
    const r = computeRange(TASKS, "2026-01-01", zoom);
    expect(r.start <= "2026-01-01").toBe(true);
    expect(r.end >= "2027-01-30").toBe(true);
  });

  it.each(ZOOMS)("covers 30 days before the earliest start in %s zoom", (zoom) => {
    const r = computeRange(TASKS, "2026-10-06", zoom);
    expect(r.start <= addDays("2026-10-05", -30)).toBe(true);
    expect(r.end >= addDays("2026-12-01", 60)).toBe(true);
  });

  it.each(ZOOMS)("includes a today far after the project in %s zoom", (zoom) => {
    const r = computeRange(TASKS, "2028-06-15", zoom);
    expect(r.end >= "2028-06-15").toBe(true);
    expect(r.start <= "2026-09-05").toBe(true);
  });

  it("is exactly today-30..today+60 in day zoom with no tasks", () => {
    expect(computeRange([], "2026-10-05", "day")).toEqual({
      start: "2026-09-05",
      end: "2026-12-04",
    });
  });

  it.each(ZOOMS)("covers today-30..today+60 with no tasks in %s zoom", (zoom) => {
    const r = computeRange([], "2026-10-05", zoom);
    expect(r.start <= "2026-09-05").toBe(true);
    expect(r.end >= "2026-12-04").toBe(true);
  });

  it("widens week ranges to whole Monday-start weeks", () => {
    const r = computeRange(TASKS, "2026-10-06", "week");
    expect(weekdayMon0(r.start)).toBe(0);
    expect(weekdayMon0(r.end)).toBe(6);
    expect(daysBetween(r.start, addDays("2026-10-05", -30))).toBeLessThan(7);
  });

  it("widens month ranges to whole months", () => {
    const r = computeRange(TASKS, "2026-10-06", "month");
    expect(r.start.endsWith("-01")).toBe(true);
    expect(addDays(r.end, 1).endsWith("-01")).toBe(true);
    expect(r.start).toBe("2026-09-01");
    expect(r.end).toBe("2027-01-31");
  });
});

describe("dateToX / barGeometry (AC19)", () => {
  const range: TimelineRange = { start: "2026-09-01", end: "2026-12-31" };

  it("places the left edge of a day at its offset", () => {
    expect(dateToX("2026-09-01", range, "day")).toBe(0);
    expect(dateToX("2026-09-03", range, "day")).toBe(64);
    expect(dateToX("2026-09-03", range, "week")).toBe(24);
    expect(dateToX("2026-09-03", range, "month")).toBe(8);
  });

  it("gives a 3-day bar width 96 in day zoom at its start offset", () => {
    const g = barGeometry(
      { start: "2026-10-05", end: "2026-10-07", is_milestone: false },
      range,
      "day",
    );
    expect(g).toEqual({ x: 32 * daysBetween(range.start, "2026-10-05"), width: 96 });
  });

  it.each(ZOOMS)("scales bar width by duration in %s zoom", (zoom) => {
    const g = barGeometry(
      { start: "2026-10-05", end: "2026-10-07", is_milestone: false },
      range,
      zoom,
    );
    expect(g.width).toBe(3 * PX_PER_DAY[zoom]);
    expect(g.x).toBe(dateToX("2026-10-05", range, zoom));
    // The bar's right edge is the left edge of the day after its end.
    expect(g.x + g.width).toBe(dateToX("2026-10-08", range, zoom));
  });

  it("gives a one-day task one column", () => {
    const g = barGeometry(
      { start: "2026-10-05", end: "2026-10-05", is_milestone: false },
      range,
      "day",
    );
    expect(g.width).toBe(32);
  });

  it.each(ZOOMS)("centres a milestone on its day with width 0 in %s zoom", (zoom) => {
    const g = barGeometry(
      { start: "2026-10-09", end: "2026-10-09", is_milestone: true },
      range,
      zoom,
    );
    expect(g).toEqual({ x: dateToX("2026-10-09", range, zoom) + PX_PER_DAY[zoom] / 2, width: 0 });
  });
});

describe("headerTiers (AC19)", () => {
  const range = computeRange(TASKS, "2026-10-06", "day");

  it.each(ZOOMS)("tiles both tiers over the whole range in %s zoom", (zoom) => {
    const r = computeRange(TASKS, "2026-10-06", zoom);
    const { top, bottom } = headerTiers(r, zoom);
    for (const tier of [top, bottom]) {
      expect(tier.length).toBeGreaterThan(0);
      expect(tier[0]?.x).toBe(0);
      let x = 0;
      for (const u of tier) {
        expect(u.x).toBe(x);
        expect(u.width).toBeGreaterThan(0);
        x += u.width;
      }
      expect(x).toBe(rangeWidth(r, zoom));
      expect(new Set(tier.map((u) => u.key)).size).toBe(tier.length);
    }
  });

  it("uses months over days in day zoom", () => {
    const { top, bottom } = headerTiers(range, "day");
    expect(bottom.length).toBe(daysBetween(range.start, range.end) + 1);
    expect(bottom.every((u) => u.width === 32)).toBe(true);
    const oct5 = bottom.find((u) => u.x === dateToX("2026-10-05", range, "day"));
    expect(oct5?.label).toBe("5");
    expect(oct5?.title).toContain("M");
    expect(top.map((u) => u.label)).toContain("Oct 2026");
    const oct = top.find((u) => u.label === "Oct 2026");
    expect(oct?.width).toBe(31 * 32);
  });

  it("uses months over ISO weeks in week zoom", () => {
    const r = computeRange(TASKS, "2026-10-06", "week");
    const { top, bottom } = headerTiers(r, "week");
    expect(bottom.every((u) => u.width === 7 * 12)).toBe(true);
    expect(bottom.map((u) => u.label)).toContain("W41 5 Oct");
    expect(bottom.map((u) => u.label)).toContain("W1 4 Jan");
    expect(top.map((u) => u.label)).toContain("Nov 2026");
  });

  it("numbers ISO weeks at year boundaries", () => {
    // 2026-12-28 is a Monday in ISO week 53 of 2026; 2027-01-04 starts W1 of 2027.
    const r: TimelineRange = { start: "2026-12-28", end: "2027-01-10" };
    const { bottom } = headerTiers(r, "week");
    expect(bottom.map((u) => u.label)).toEqual(["W53 28 Dec", "W1 4 Jan"]);
  });

  it("uses years over months in month zoom", () => {
    const r = computeRange(TASKS, "2026-10-06", "month");
    const { top, bottom } = headerTiers(r, "month");
    expect(bottom.map((u) => u.label)).toEqual(["Sep", "Oct", "Nov", "Dec", "Jan"]);
    expect(bottom[1]?.width).toBe(31 * 4);
    expect(top.map((u) => u.label)).toEqual(["2026", "2027"]);
  });
});

describe("initialScrollLeft (AC43)", () => {
  it.each(ZOOMS)("puts the earliest start within 7 days of the left edge in %s zoom", (zoom) => {
    const r = computeRange(TASKS, "2026-10-06", zoom);
    const left = initialScrollLeft(TASKS, r, zoom, "2026-10-06");
    const startX = dateToX("2026-10-05", r, zoom);
    expect(startX).toBeGreaterThanOrEqual(left);
    expect(startX - left).toBeLessThanOrEqual(7 * PX_PER_DAY[zoom]);
    expect(startX - left).toBe(2 * PX_PER_DAY[zoom]);
  });

  it("uses today when there are no tasks", () => {
    const r = computeRange([], "2026-10-05", "day");
    expect(initialScrollLeft([], r, "day", "2026-10-05")).toBe(
      dateToX("2026-10-05", r, "day") - 64,
    );
  });

  it("uses the earliest start, not the first task", () => {
    const tasks = [{ start: "2026-11-02" }, { start: "2026-10-05" }];
    const r: TimelineRange = { start: "2026-09-01", end: "2026-12-31" };
    expect(initialScrollLeft(tasks, r, "day", "2026-10-06")).toBe(
      dateToX("2026-10-05", r, "day") - 64,
    );
  });

  it("never goes below 0", () => {
    const r: TimelineRange = { start: "2026-10-05", end: "2026-12-31" };
    expect(initialScrollLeft([{ start: "2026-10-05" }], r, "day", "2026-10-05")).toBe(0);
  });
});

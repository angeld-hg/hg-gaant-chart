import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  fromDayIndex,
  isWeekend,
  toDayIndex,
  todayLocal,
  weekdayMon0,
} from "./dates.ts";

describe("toDayIndex / fromDayIndex", () => {
  it("counts whole days since 1970-01-01", () => {
    expect(toDayIndex("1970-01-01")).toBe(0);
    expect(toDayIndex("1970-01-02")).toBe(1);
    expect(toDayIndex("1969-12-31")).toBe(-1);
  });

  it.each(["2000-01-01", "2024-02-29", "2026-03-29", "2026-10-25", "2026-10-05", "2099-12-31"])(
    "round-trips %s",
    (iso) => {
      expect(fromDayIndex(toDayIndex(iso))).toBe(iso);
    },
  );

  it.each(["2026-2-5", "2026-02-30", "2026-10-05T00:00", "", "abcd-ef-gh"])("rejects %j", (bad) => {
    expect(() => toDayIndex(bad)).toThrow();
  });
});

describe("addDays / daysBetween", () => {
  it("adds calendar days across month and year ends", () => {
    expect(addDays("2026-10-05", 2)).toBe("2026-10-07");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-05", 0)).toBe("2026-10-05");
  });

  it("is unaffected by DST transitions", () => {
    // Europe DST ends 2026-10-25 and US DST starts 2026-03-08.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("is signed b - a", () => {
    expect(daysBetween("2026-10-05", "2026-10-09")).toBe(4);
    expect(daysBetween("2026-10-09", "2026-10-05")).toBe(-4);
    expect(daysBetween("2026-10-05", "2026-10-05")).toBe(0);
  });
});

describe("weekdayMon0 / isWeekend (AC27)", () => {
  it("numbers Monday 0 through Sunday 6", () => {
    expect(weekdayMon0("2026-10-05")).toBe(0);
    expect(weekdayMon0("2026-10-09")).toBe(4);
    expect(weekdayMon0("2026-10-11")).toBe(6);
    expect(weekdayMon0("1970-01-01")).toBe(3);
    expect(weekdayMon0("1969-12-29")).toBe(0);
  });

  it("treats Saturday and Sunday as weekend and Friday as not", () => {
    expect(isWeekend("2026-10-10")).toBe(true);
    expect(isWeekend("2026-10-11")).toBe(true);
    expect(isWeekend("2026-10-09")).toBe(false);
    expect(isWeekend("2026-10-12")).toBe(false);
  });
});

describe("todayLocal", () => {
  it("uses the browser-local calendar date", () => {
    // Constructed from local parts, so it is 23:30 local time on 2026-10-05 in any zone.
    expect(todayLocal(new Date(2026, 9, 5, 23, 30))).toBe("2026-10-05");
    expect(todayLocal(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });

  it("defaults to now", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

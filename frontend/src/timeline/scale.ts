// Timeline geometry: date range, date-to-pixel mapping, bar geometry and header units.
import { addDays, daysBetween, fromDayIndex, toDayIndex, weekdayMon0 } from "./dates.ts";

export type Zoom = "day" | "week" | "month";

export const PX_PER_DAY: Record<Zoom, number> = { day: 32, week: 12, month: 4 };

export interface TimelineRange {
  start: string;
  /** Inclusive. */
  end: string;
}

export interface HeaderUnit {
  key: string;
  label: string;
  x: number;
  width: number;
  /** Optional tooltip text (the weekday letter for day units). */
  title?: string;
}

const RANGE_BEFORE_DAYS = 30;
const RANGE_AFTER_DAYS = 60;
const INITIAL_SCROLL_MARGIN_DAYS = 2;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function firstOfNextMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month1 = Number(iso.slice(5, 7));
  return month1 === 12
    ? `${String(year + 1).padStart(4, "0")}-01-01`
    : `${iso.slice(0, 4)}-${String(month1 + 1).padStart(2, "0")}-01`;
}

function monthLabel(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
}

export function computeRange(
  tasks: { start: string; end: string }[],
  today: string,
  zoom: Zoom,
): TimelineRange {
  let start = addDays(today, -RANGE_BEFORE_DAYS);
  let end = addDays(today, RANGE_AFTER_DAYS);
  const first = tasks[0];
  if (first) {
    let earliest = first.start;
    let projectEnd = first.end;
    for (const t of tasks) {
      earliest = minIso(earliest, t.start);
      projectEnd = maxIso(projectEnd, t.end);
    }
    start = minIso(addDays(earliest, -RANGE_BEFORE_DAYS), today);
    end = maxIso(addDays(projectEnd, RANGE_AFTER_DAYS), today);
  }
  if (zoom === "week") {
    start = addDays(start, -weekdayMon0(start));
    end = addDays(end, 6 - weekdayMon0(end));
  } else if (zoom === "month") {
    start = firstOfMonth(start);
    end = addDays(firstOfNextMonth(end), -1);
  }
  return { start, end };
}

/** The x of the left edge of the day `iso`. */
export function dateToX(iso: string, range: TimelineRange, zoom: Zoom): number {
  return daysBetween(range.start, iso) * PX_PER_DAY[zoom];
}

export function barGeometry(
  t: { start: string; end: string; is_milestone: boolean },
  range: TimelineRange,
  zoom: Zoom,
): { x: number; width: number } {
  const px = PX_PER_DAY[zoom];
  const x = dateToX(t.start, range, zoom);
  if (t.is_milestone) {
    return { x: x + px / 2, width: 0 };
  }
  return { x, width: (daysBetween(t.start, t.end) + 1) * px };
}

/** Splits the range into consecutive units; `nextUnitStart(d)` is the first day of the unit after d. */
function tile(
  range: TimelineRange,
  zoom: Zoom,
  nextUnitStart: (iso: string) => string,
  describe: (unitStart: string) => Omit<HeaderUnit, "x" | "width">,
): HeaderUnit[] {
  const px = PX_PER_DAY[zoom];
  const lastIndex = toDayIndex(range.end);
  const units: HeaderUnit[] = [];
  let cursor = range.start;
  while (toDayIndex(cursor) <= lastIndex) {
    const nextIndex = Math.min(toDayIndex(nextUnitStart(cursor)), lastIndex + 1);
    units.push({
      ...describe(cursor),
      x: dateToX(cursor, range, zoom),
      width: (nextIndex - toDayIndex(cursor)) * px,
    });
    cursor = fromDayIndex(nextIndex);
  }
  return units;
}

function isoWeek(iso: string): number {
  // ISO week: the week (Mon-Sun) belongs to the year of its Thursday.
  const thursday = addDays(iso, 3 - weekdayMon0(iso));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(jan1, thursday) / 7) + 1;
}

const monthUnits = (range: TimelineRange, zoom: Zoom): HeaderUnit[] =>
  tile(range, zoom, firstOfNextMonth, (s) => ({
    key: s.slice(0, 7),
    label: `${monthLabel(s)} ${s.slice(0, 4)}`,
  }));

export function headerTiers(
  range: TimelineRange,
  zoom: Zoom,
): { top: HeaderUnit[]; bottom: HeaderUnit[] } {
  if (zoom === "day") {
    return {
      top: monthUnits(range, zoom),
      bottom: tile(
        range,
        zoom,
        (s) => addDays(s, 1),
        (s) => ({
          key: s,
          label: String(Number(s.slice(8, 10))),
          title: WEEKDAY_LETTERS[weekdayMon0(s)] ?? "",
        }),
      ),
    };
  }
  if (zoom === "week") {
    return {
      top: monthUnits(range, zoom),
      bottom: tile(
        range,
        zoom,
        (s) => addDays(s, 7 - weekdayMon0(s)),
        (s) => {
          const monday = addDays(s, -weekdayMon0(s));
          return {
            key: monday,
            label: `W${isoWeek(monday)} ${Number(monday.slice(8, 10))} ${monthLabel(monday)}`,
          };
        },
      ),
    };
  }
  return {
    top: tile(
      range,
      zoom,
      (s) => `${String(Number(s.slice(0, 4)) + 1).padStart(4, "0")}-01-01`,
      (s) => ({ key: s.slice(0, 4), label: s.slice(0, 4) }),
    ),
    bottom: tile(range, zoom, firstOfNextMonth, (s) => ({
      key: s.slice(0, 7),
      label: monthLabel(s),
    })),
  };
}

export function initialScrollLeft(
  tasks: { start: string }[],
  range: TimelineRange,
  zoom: Zoom,
  today: string,
): number {
  let anchor = tasks[0]?.start ?? today;
  for (const t of tasks) {
    anchor = minIso(anchor, t.start);
  }
  const x = dateToX(anchor, range, zoom) - INITIAL_SCROLL_MARGIN_DAYS * PX_PER_DAY[zoom];
  return Math.max(0, x);
}

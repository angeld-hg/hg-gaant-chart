// Calendar-day maths on "YYYY-MM-DD" strings. A day index is the number of whole days since
// 1970-01-01, computed in UTC so daylight-saving changes never shift a date.

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatParts(year: number, month1: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month1)}-${pad2(day)}`;
}

export function toDayIndex(iso: string): number {
  const m = ISO_RE.exec(iso);
  if (!m) {
    throw new RangeError(`Not a YYYY-MM-DD date: ${JSON.stringify(iso)}`);
  }
  const year = Number(m[1]);
  const month1 = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month1 - 1, day);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month1 - 1 ||
    back.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a real calendar date: ${iso}`);
  }
  return Math.round(ms / MS_PER_DAY);
}

export function fromDayIndex(n: number): string {
  const d = new Date(n * MS_PER_DAY);
  return formatParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(iso: string, n: number): string {
  return fromDayIndex(toDayIndex(iso) + n);
}

/** Signed number of days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return toDayIndex(b) - toDayIndex(a);
}

/** 0 = Monday .. 6 = Sunday. */
export function weekdayMon0(iso: string): number {
  // 1970-01-01 was a Thursday (3).
  return (((toDayIndex(iso) + 3) % 7) + 7) % 7;
}

export function isWeekend(iso: string): boolean {
  return weekdayMon0(iso) >= 5;
}

/** The browser-local calendar date of `now`. */
export function todayLocal(now: Date = new Date()): string {
  return formatParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

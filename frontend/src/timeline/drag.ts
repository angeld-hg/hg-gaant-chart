// Drag maths: pixels to whole days, proposed dates while dragging, and the PATCH on release.
import { addDays } from "./dates.ts";
import { PX_PER_DAY, type Zoom } from "./scale.ts";

export type DragMode = "move" | "resize-start" | "resize-end";

export function daysFromPixels(dx: number, zoom: Zoom): number {
  const days = Math.round(dx / PX_PER_DAY[zoom]);
  // Math.round(-0.3) is -0; normalise so callers can compare with ===/Object.is safely.
  return days === 0 ? 0 : days;
}

export function proposeDrag(
  t: { start: string; end: string; is_milestone: boolean },
  mode: DragMode,
  deltaDays: number,
): { start: string; end: string } {
  if (mode === "move") {
    return { start: addDays(t.start, deltaDays), end: addDays(t.end, deltaDays) };
  }
  if (t.is_milestone) {
    return { start: t.start, end: t.end };
  }
  if (mode === "resize-start") {
    const start = addDays(t.start, deltaDays);
    return { start: start > t.end ? t.end : start, end: t.end };
  }
  const end = addDays(t.end, deltaDays);
  return { start: t.start, end: end < t.start ? t.start : end };
}

export function patchForDrag(
  t: { start: string; end: string },
  mode: DragMode,
  p: { start: string; end: string },
): { start?: string; end?: string } | null {
  if (p.start === t.start && p.end === t.end) {
    return null;
  }
  if (mode === "move") {
    return { start: p.start };
  }
  if (mode === "resize-end") {
    return { end: p.end };
  }
  return { start: p.start, end: p.end };
}

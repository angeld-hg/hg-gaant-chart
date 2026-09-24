// The single source of fill and label colours for bars, milestone diamonds and their pills
// (AC9, AC38): the assignee's palette pair, or the neutral pair when a task is unassigned.
import type { Palette, Person, Task } from "../../api/types.ts";

export interface ColourPair {
  fill: string;
  label: string;
}

const DARK_LABEL = "#111827";
const LIGHT_LABEL = "#ffffff";

/** The server's neutral pair, used only until the palette has loaded. */
export const FALLBACK_NEUTRAL: ColourPair = { fill: "#9ca3af", label: DARK_LABEL };

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Whichever of the two label colours reads better on `fill` (WCAG 2.x contrast). */
function readableLabel(fill: string): string {
  return contrast(fill, LIGHT_LABEL) >= contrast(fill, DARK_LABEL) ? LIGHT_LABEL : DARK_LABEL;
}

export function colourFor(
  task: Pick<Task, "assignee_id">,
  people: Person[],
  palette: Palette | null,
): ColourPair {
  const person =
    task.assignee_id === null ? undefined : people.find((p) => p.id === task.assignee_id);
  if (person === undefined) {
    return palette?.neutral ?? FALLBACK_NEUTRAL;
  }
  const entry = palette?.colours.find((c) => c.fill === person.colour);
  return { fill: person.colour, label: entry?.label ?? readableLabel(person.colour) };
}

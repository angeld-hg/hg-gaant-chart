// The 12 palette swatches as toggle buttons (AC30). The selected one has aria-pressed="true", and
// each button's accessible name is the colour's name.
import type { PaletteColour } from "../../api/types.ts";

/** The first palette fill no one in the roster uses, else the first fill (same rule as the API). */
export function defaultColour(colours: PaletteColour[], used: string[]): string | null {
  const taken = new Set(used);
  return (colours.find((c) => !taken.has(c.fill)) ?? colours[0])?.fill ?? null;
}

export function ColourPicker(props: {
  colours: PaletteColour[];
  value: string | null;
  label: string;
  disabled?: boolean;
  onChange: (fill: string) => void;
}) {
  return (
    <fieldset
      data-testid="colour-picker"
      className="colour-picker"
      aria-label={props.label}
      disabled={props.disabled}
    >
      {props.colours.map((colour) => {
        const selected = colour.fill === props.value;
        return (
          <button
            key={colour.fill}
            type="button"
            data-testid="colour-swatch"
            data-colour={colour.fill}
            className="colour-swatch"
            aria-label={colour.name}
            aria-pressed={selected}
            title={colour.name}
            style={{ backgroundColor: colour.fill, color: colour.label }}
            onClick={() => props.onChange(colour.fill)}
          >
            {selected && (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 8.5l2.5 2.5 5.5-6" />
              </svg>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

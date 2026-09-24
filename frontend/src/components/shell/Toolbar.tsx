// Top bar: open project's name and counts, zoom switch, roster button and the export/import slot.
import { useActions, useAppState } from "../../state/store.tsx";
import type { Zoom } from "../../timeline/scale.ts";
import { TransferControls } from "../io/TransferControls.tsx";

const ZOOMS: { zoom: Zoom; label: string }[] = [
  { zoom: "day", label: "Day" },
  { zoom: "week", label: "Week" },
  { zoom: "month", label: "Month" },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function Toolbar() {
  const { current, zoom, rosterOpen } = useAppState();
  const actions = useActions();

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        {current ? (
          <>
            <h2 className="toolbar-project" title={current.name}>
              {current.name}
            </h2>
            <span className="toolbar-meta">
              {plural(current.tasks.length, "task", "tasks")}
              <span aria-hidden="true"> · </span>
              {plural(current.people.length, "person", "people")}
            </span>
          </>
        ) : (
          <span className="toolbar-placeholder">No project open</span>
        )}
      </div>

      <div className="toolbar-actions">
        <fieldset className="segmented" aria-label="Zoom" disabled={!current}>
          {ZOOMS.map((option) => (
            <button
              key={option.zoom}
              type="button"
              data-testid={`zoom-${option.zoom}`}
              className="segmented-option"
              aria-pressed={zoom === option.zoom}
              onClick={() => actions.setZoom(option.zoom)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <button
          type="button"
          data-testid="roster-button"
          className="button"
          aria-pressed={rosterOpen}
          disabled={!current}
          onClick={() => actions.setRosterOpen(!rosterOpen)}
        >
          <svg className="button-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="6" cy="5.5" r="2.5" />
            <path d="M1.5 13.5c.4-2.5 2.2-4 4.5-4s4.1 1.5 4.5 4" />
            <path d="M10.5 3.2a2.4 2.4 0 010 4.6M12 9.8c1.4.5 2.3 1.8 2.5 3.7" />
          </svg>
          People
          {current && <span className="button-badge">{current.people.length}</span>}
        </button>

        <span className="toolbar-divider" aria-hidden="true" />
        <TransferControls />
      </div>
    </header>
  );
}

// Toolbar Export and Import (AC21-AC24). The store does the work: Export saves the server's bytes
// unchanged, and Import checks the 5 MB limit, posts the file and opens the new project. Errors
// reach the user through the store's error toast.
import { type ChangeEvent, type JSX, useRef, useState } from "react";
import { useActions, useAppState } from "../../state/store.tsx";

type Busy = "export" | "import" | null;

export function TransferControls(): JSX.Element {
  const { current } = useAppState();
  const actions = useActions();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);

  async function onExport() {
    if (current === null) {
      return;
    }
    setBusy("export");
    try {
      await actions.exportProject(current.id);
    } finally {
      setBusy(null);
    }
  }

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared straight away so picking the same file again still fires a change.
    input.value = "";
    if (file === undefined) {
      return;
    }
    setBusy("import");
    try {
      await actions.importFile(file);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="transfer-controls">
      <button
        type="button"
        data-testid="export-button"
        className="button"
        title={
          current ? `Download "${current.name}" as a JSON file` : "Open a project to export it"
        }
        disabled={current === null || busy !== null}
        onClick={() => void onExport()}
      >
        <svg className="button-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.5v7.5M4.8 7l3.2 3.2L11.2 7" />
          <path d="M2.5 11v1.5a1 1 0 001 1h9a1 1 0 001-1V11" />
        </svg>
        Export
      </button>

      <button
        type="button"
        className="button"
        title="Import a project from an exported JSON file"
        disabled={busy !== null}
        onClick={() => fileInput.current?.click()}
      >
        <svg className="button-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 10V2.5M4.8 5.7L8 2.5l3.2 3.2" />
          <path d="M2.5 11v1.5a1 1 0 001 1h9a1 1 0 001-1V11" />
        </svg>
        Import
      </button>
      <input
        ref={fileInput}
        type="file"
        data-testid="import-input"
        accept="application/json,.json"
        aria-label="Import a project file"
        hidden
        tabIndex={-1}
        onChange={(event) => void onFileChosen(event)}
      />
    </div>
  );
}

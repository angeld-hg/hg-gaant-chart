// Modal confirmation for destructive actions (AC41). Esc or the backdrop cancels.
import { useEffect, useId, useRef } from "react";
import { useActions, useAppState } from "../../state/store.tsx";

export function ConfirmDialog() {
  const { confirm } = useAppState();
  const actions = useActions();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const open = confirm !== null;

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        actions.resolveConfirm(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open, actions]);

  if (confirm === null) {
    return null;
  }

  return (
    <div className="dialog-backdrop">
      <button
        type="button"
        className="dialog-backdrop-hit"
        aria-label="Cancel"
        tabIndex={-1}
        onClick={() => actions.resolveConfirm(false)}
      />
      <div
        data-testid="confirm-dialog"
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <div className="dialog-icon">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 3.5l7 12.5H3z" />
            <path d="M10 8.5v3.5M10 14v.01" />
          </svg>
        </div>
        <div className="dialog-body">
          <h3 id={titleId} className="dialog-title">
            {confirm.title}
          </h3>
          <p id={messageId} className="dialog-message">
            {confirm.message}
          </p>
        </div>
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            data-testid="confirm-cancel"
            className="button"
            onClick={() => actions.resolveConfirm(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-ok"
            className="button button-danger"
            onClick={() => actions.resolveConfirm(true)}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

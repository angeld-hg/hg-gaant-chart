// Shows the latest server message (state.error) as an alert; it dismisses itself after a while.
import { useEffect } from "react";
import { useActions, useAppState } from "../../state/store.tsx";

const AUTO_DISMISS_MS = 8000;

export function ErrorToast() {
  const { error } = useAppState();
  const actions = useActions();

  useEffect(() => {
    if (error === null) {
      return;
    }
    const timer = window.setTimeout(() => actions.clearError(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [error, actions]);

  if (error === null) {
    return null;
  }

  return (
    <div className="toast-region">
      <div data-testid="error-message" role="alert" className="toast">
        <span className="toast-icon">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.8v3.7M8 11v.01" />
          </svg>
        </span>
        <span className="toast-message">{error}</span>
        <button
          type="button"
          className="toast-close"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => actions.clearError()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

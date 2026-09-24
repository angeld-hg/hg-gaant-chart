// The open task's predecessors (AC10, AC11, AC13): one item per dependency with a remove button
// (no confirmation, AC41), plus a picker to add another. The server decides whether a new link
// is allowed and pushes the task later if needed, so a rejection shows its message.
import { useState } from "react";
import type { ProjectDetail, Task } from "../../api/types.ts";
import { useActions } from "../../state/store.tsx";
import { predecessorOptions, predecessorsOf } from "./fields.ts";

function datesOf(task: Task): string {
  return task.is_milestone ? task.start : `${task.start} – ${task.end}`;
}

export function DependencyList(props: { task: Task; project: ProjectDetail }) {
  const { task, project } = props;
  const { addDependency, removeDependency } = useActions();
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const predecessors = predecessorsOf(task.id, project.tasks, project.dependencies);
  const options = predecessorOptions(task.id, project.tasks);

  async function add() {
    if (choice === "" || busy) {
      return;
    }
    setBusy(true);
    const result = await addDependency(Number(choice), task.id);
    setBusy(false);
    if (result.ok) {
      setChoice("");
    }
  }

  return (
    <section className="editor-section" aria-label="Predecessors">
      <h3 className="editor-section-title">Depends on</h3>
      {predecessors.length === 0 ? (
        <p className="dependency-empty">No predecessors. This task can start any time.</p>
      ) : (
        <ul className="dependency-list">
          {predecessors.map(({ dependency, task: predecessor }) => (
            <li
              key={dependency.id}
              data-testid="dependency-item"
              data-dependency-id={dependency.id}
              className="dependency-item"
            >
              <svg className="dependency-arrow" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 3v5.5a2 2 0 002 2h8M10 7.5l3 3-3 3" />
              </svg>
              <span className="dependency-name" title={predecessor.name}>
                {predecessor.name}
              </span>
              <span className="dependency-dates">{datesOf(predecessor)}</span>
              <button
                type="button"
                data-testid="remove-dependency"
                className="icon-button danger"
                aria-label={`Remove dependency on ${predecessor.name}`}
                title="Remove dependency"
                onClick={() => void removeDependency(dependency.id)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dependency-add">
        <select
          data-testid="predecessor-select"
          className="editor-select"
          aria-label="Add a predecessor"
          value={choice}
          disabled={options.length === 0}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Choose a task…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="add-predecessor"
          className="button"
          disabled={choice === "" || busy}
          onClick={() => void add()}
        >
          Add
        </button>
      </div>
    </section>
  );
}

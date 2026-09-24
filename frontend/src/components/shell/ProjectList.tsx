// Sidebar project list: creation order, inline create/rename, confirmed delete (AC1, AC2, AC34, AC41).
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "../../api/types.ts";
import { useActions, useAppState } from "../../state/store.tsx";

export type ProjectEditing = { mode: "create" } | { mode: "rename"; id: number } | null;

// Small identity dots so projects are easy to tell apart at a glance.
const PROJECT_DOTS = ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#38bdf8", "#fb923c"];

function dotColour(id: number): string {
  return PROJECT_DOTS[id % PROJECT_DOTS.length] ?? "#818cf8";
}

function tasksPhrase(count: number): string {
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}

function NameForm(props: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    const done = await props.onSubmit(name);
    setBusy(false);
    if (!done) {
      inputRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onCancel();
    }
  }

  return (
    <form className="name-form" onSubmit={submit}>
      {/* No maxLength: the server owns the limit and explains it (AC40). */}
      <input
        ref={inputRef}
        data-testid="project-name-input"
        className="name-form-input"
        value={name}
        placeholder="Project name"
        aria-label="Project name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="submit"
        data-testid="project-submit"
        className="name-form-button name-form-submit"
        aria-label={props.submitLabel}
        title={props.submitLabel}
        disabled={busy}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </button>
      <button
        type="button"
        className="name-form-button"
        aria-label="Cancel"
        title="Cancel (Esc)"
        onClick={props.onCancel}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </button>
    </form>
  );
}

function ProjectItem(props: { project: ProjectSummary; active: boolean; onRename: () => void }) {
  const { project, active } = props;
  const actions = useActions();

  async function remove() {
    const confirmed = await actions.confirm({
      title: "Delete project",
      message: `Delete "${project.name}" and its ${tasksPhrase(project.task_count)}? This cannot be undone.`,
      confirmLabel: "Delete project",
    });
    if (confirmed) {
      await actions.deleteProject(project.id);
    }
  }

  return (
    <li
      data-testid="project-item"
      data-project-id={project.id}
      className={active ? "project-item active" : "project-item"}
    >
      <button
        type="button"
        className="project-link"
        aria-current={active ? "page" : undefined}
        aria-label={project.name}
        onClick={() => void actions.openProject(project.id)}
      >
        <span
          className="project-dot"
          style={{ background: dotColour(project.id) }}
          aria-hidden="true"
        />
        <span className="project-name" title={project.name}>
          {project.name}
        </span>
        <span className="project-count" title={tasksPhrase(project.task_count)}>
          {project.task_count}
        </span>
      </button>
      <div className="project-actions">
        <button
          type="button"
          data-testid="project-rename-button"
          className="project-action"
          aria-label={`Rename ${project.name}`}
          title="Rename"
          onClick={props.onRename}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
          </svg>
        </button>
        <button
          type="button"
          data-testid="project-delete-button"
          className="project-action danger"
          aria-label={`Delete ${project.name}`}
          title="Delete"
          onClick={() => void remove()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" />
          </svg>
        </button>
      </div>
    </li>
  );
}

export function ProjectList(props: {
  editing: ProjectEditing;
  onEditingChange: (editing: ProjectEditing) => void;
}) {
  const { projects, current } = useAppState();
  const actions = useActions();
  const { editing, onEditingChange } = props;
  const close = () => onEditingChange(null);

  return (
    <nav className="sidebar-projects" aria-label="Projects">
      <button
        type="button"
        data-testid="new-project-button"
        className="new-project-button"
        onClick={() => onEditingChange({ mode: "create" })}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" />
        </svg>
        New project
      </button>

      <div className="sidebar-heading">
        <span>Projects</span>
        <span className="sidebar-heading-count">{projects.length}</span>
      </div>

      {editing?.mode === "create" && (
        <div className="project-form-row">
          <NameForm
            initial=""
            submitLabel="Create project"
            onCancel={close}
            onSubmit={async (name) => {
              const result = await actions.createProject(name);
              if (result.ok) {
                close();
              }
              return result.ok;
            }}
          />
        </div>
      )}

      <ul data-testid="project-list" className="project-list">
        {projects.map((project) =>
          editing?.mode === "rename" && editing.id === project.id ? (
            <li
              key={project.id}
              data-testid="project-item"
              data-project-id={project.id}
              className="project-item editing"
            >
              <NameForm
                initial={project.name}
                submitLabel="Save name"
                onCancel={close}
                onSubmit={async (name) => {
                  const result = await actions.renameProject(project.id, name);
                  if (result.ok) {
                    close();
                  }
                  return result.ok;
                }}
              />
            </li>
          ) : (
            <ProjectItem
              key={project.id}
              project={project}
              active={current?.id === project.id}
              onRename={() => onEditingChange({ mode: "rename", id: project.id })}
            />
          ),
        )}
      </ul>
    </nav>
  );
}

// The task editor: a right-side drawer shown while `state.editor` is set. "new" is a small create
// form. For an existing task every text field commits on Enter or blur and sends only itself
// (C2 UI mapping); on failure it goes back to the stored value and the server's message shows.
// Inputs always show `state.current`, so clamps and cascades appear as soon as a response lands.
import "../../styles/tasks.css";
import {
  type FormEvent,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ProjectDetail, Task } from "../../api/types.ts";
import { useActions, useAppState } from "../../state/store.tsx";
import { todayLocal } from "../../timeline/dates.ts";
import { colourFor } from "../chart/colours.ts";
import { DependencyList } from "./DependencyList.tsx";
import {
  assigneeValue,
  deleteTaskMessage,
  fieldPatch,
  fieldText,
  parseAssignee,
  parseNumberField,
  type TextField,
} from "./fields.ts";

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

function Drawer(props: {
  taskId: number | "new";
  eyebrow: string;
  title: string;
  badges?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { openTaskEditor } = useActions();
  return (
    <aside
      data-testid="task-editor"
      data-task-id={props.taskId}
      className="task-editor"
      aria-label={props.taskId === "new" ? "New task" : `Edit task ${props.title}`}
    >
      <header className="task-editor-header">
        <div className="task-editor-heading">
          <span className="task-editor-eyebrow">{props.eyebrow}</span>
          <h2 className="task-editor-title" title={props.title}>
            {props.title}
          </h2>
          {props.badges}
        </div>
        <button
          type="button"
          data-testid="task-editor-close"
          className="icon-button"
          aria-label="Close editor"
          title="Close"
          onClick={() => openTaskEditor(null)}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="task-editor-body">{props.children}</div>
      {props.footer}
    </aside>
  );
}

/** A text input bound to one stored task field that commits on Enter or blur. */
function TaskField(props: {
  task: Task;
  field: TextField;
  testId: string;
  label: string;
  wide?: boolean;
  placeholder?: string;
  numeric?: boolean;
  suffix?: string;
}) {
  const { task, field } = props;
  const { updateTask } = useActions();
  const id = useId();
  // null while not editing: the input then shows the stored value.
  const [draft, setDraft] = useState<string | null>(null);
  const inFlight = useRef(false);
  const stored = fieldText(task, field);

  // Enter always sends (force), so the server re-applies its rules even when this tab's copy
  // looks current (AC36); leaving the field sends only a real change.
  async function commit(text: string, force: boolean) {
    if (inFlight.current) {
      return;
    }
    const patch = fieldPatch(task, field, text, force);
    if (patch !== null) {
      inFlight.current = true;
      await updateTask(task.id, patch);
      inFlight.current = false;
    }
    // Success or failure, show what the server now holds.
    setDraft(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(event.currentTarget.value, true);
    } else if (event.key === "Escape" && draft !== null) {
      // Revert this field only; with nothing typed, Esc closes the drawer instead.
      event.preventDefault();
      setDraft(null);
    }
  }

  function onBlur() {
    if (draft !== null) {
      void commit(draft, false);
    }
  }

  const input = (
    <input
      id={id}
      data-testid={props.testId}
      className="editor-input"
      type="text"
      inputMode={props.numeric ? "numeric" : undefined}
      autoComplete="off"
      spellCheck={field === "name" ? undefined : false}
      placeholder={props.placeholder}
      value={draft ?? stored}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  );
  return (
    <div className={props.wide ? "editor-field wide" : "editor-field"}>
      <label className="editor-label" htmlFor={id}>
        {props.label}
      </label>
      {props.suffix ? (
        <div className="editor-suffix">
          {input}
          <span className="editor-suffix-text">{props.suffix}</span>
        </div>
      ) : (
        input
      )}
    </div>
  );
}

function AssigneeField(props: { task: Task; project: ProjectDetail }) {
  const { task, project } = props;
  const { palette } = useAppState();
  const { updateTask, setRosterOpen } = useActions();
  const id = useId();
  const fill = colourFor(task, project.people, palette).fill;
  return (
    <div className="editor-field wide">
      <label className="editor-label" htmlFor={id}>
        Assignee
      </label>
      <div className="assignee-row">
        <div className="assignee-select-wrap">
          <span className="assignee-dot" style={{ backgroundColor: fill }} aria-hidden="true" />
          <select
            id={id}
            data-testid="task-assignee"
            className="editor-select"
            value={assigneeValue(task.assignee_id)}
            onChange={(event) =>
              void updateTask(task.id, { assignee_id: parseAssignee(event.target.value) })
            }
          >
            <option value="">Unassigned</option>
            {project.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          data-testid="assignee-add-person"
          className="button"
          title="Add people to the roster"
          onClick={() => setRosterOpen(true)}
        >
          Add person
        </button>
      </div>
    </div>
  );
}

function MilestoneToggle(props: { task: Task }) {
  const { task } = props;
  const { updateTask } = useActions();
  // The ticked state shows at once and gives way to the stored flag when the response lands.
  const [pending, setPending] = useState<boolean | null>(null);

  async function toggle(checked: boolean) {
    setPending(checked);
    await updateTask(task.id, { is_milestone: checked });
    setPending(null);
  }

  return (
    <label className="editor-check">
      <input
        type="checkbox"
        data-testid="task-milestone"
        checked={pending ?? task.is_milestone}
        disabled={pending !== null}
        onChange={(event) => void toggle(event.target.checked)}
      />
      <span className="editor-check-text">
        <span className="editor-check-title">Milestone</span>
        <span className="editor-check-hint">
          {task.is_milestone
            ? "A single date. Untick to make it a 1-day task."
            : "A diamond on its start date, with no duration."}
        </span>
      </span>
    </label>
  );
}

function ExistingTaskEditor(props: { task: Task; project: ProjectDetail }) {
  const { task, project } = props;
  const { confirm, deleteTask } = useActions();
  const critical = project.schedule.critical_task_ids.includes(task.id);

  async function onDelete() {
    const ok = await confirm({
      title: "Delete task",
      message: deleteTaskMessage(task, project.dependencies),
      confirmLabel: "Delete task",
    });
    if (ok) {
      await deleteTask(task.id);
    }
  }

  const badges = (
    <div className="task-editor-badges">
      {task.is_milestone && <span className="task-badge">Milestone</span>}
      {critical && <span className="task-badge critical">Critical path</span>}
    </div>
  );
  const footer = (
    <footer className="task-editor-footer">
      <span className="task-editor-footer-note">
        Changes save when you press Enter or leave a field.
      </span>
      <button
        type="button"
        data-testid="task-delete"
        className="button button-danger-quiet"
        onClick={() => void onDelete()}
      >
        Delete
      </button>
    </footer>
  );

  return (
    <Drawer taskId={task.id} eyebrow="Task" title={task.name} badges={badges} footer={footer}>
      <section className="editor-section" aria-label="Details">
        <div className="editor-grid">
          <TaskField task={task} field="name" testId="task-name" label="Name" wide />
          <TaskField
            task={task}
            field="start"
            testId="task-start"
            label={task.is_milestone ? "Date" : "Start"}
            placeholder="YYYY-MM-DD"
            wide={task.is_milestone}
          />
          {!task.is_milestone && (
            <>
              <TaskField
                task={task}
                field="end"
                testId="task-end"
                label="End"
                placeholder="YYYY-MM-DD"
              />
              <TaskField
                task={task}
                field="duration"
                testId="task-duration"
                label="Duration"
                numeric
                suffix="days"
              />
              <TaskField
                task={task}
                field="percent_complete"
                testId="task-percent"
                label="Complete"
                numeric
                suffix="%"
              />
            </>
          )}
        </div>
        <MilestoneToggle task={task} />
        <AssigneeField task={task} project={project} />
      </section>
      <DependencyList task={task} project={project} />
    </Drawer>
  );
}

function NewTaskEditor() {
  const { lastChangedTaskIds } = useAppState();
  const { createTask, openTaskEditor } = useActions();
  const [name, setName] = useState("");
  const [start, setStart] = useState(() => todayLocal());
  const [duration, setDuration] = useState("1");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  // Set while a create is in flight, so the editor can move on to the new task (the response
  // lists only the new task as changed).
  const awaitingCreate = useRef(false);
  const ids = { name: useId(), start: useId(), duration: useId() };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const created = lastChangedTaskIds[0];
    if (awaitingCreate.current && created !== undefined) {
      awaitingCreate.current = false;
      openTaskEditor(created);
    }
  }, [lastChangedTaskIds, openTaskEditor]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    awaitingCreate.current = true;
    const parsed = parseNumberField(duration);
    const result = await createTask({
      name,
      start,
      ...(parsed === null ? {} : { duration: parsed }),
    });
    if (!result.ok) {
      awaitingCreate.current = false;
    }
    setBusy(false);
  }

  const footer = (
    <footer className="task-editor-footer">
      <button type="button" className="button" onClick={() => openTaskEditor(null)}>
        Cancel
      </button>
      <button
        type="submit"
        form="new-task-form"
        data-testid="task-create"
        className="button button-primary"
        disabled={busy}
      >
        Create task
      </button>
    </footer>
  );

  return (
    <Drawer taskId="new" eyebrow="New task" title="Add a task" footer={footer}>
      <form id="new-task-form" className="editor-section" onSubmit={(e) => void onSubmit(e)}>
        <div className="editor-grid">
          <div className="editor-field wide">
            <label className="editor-label" htmlFor={ids.name}>
              Name
            </label>
            <input
              ref={nameRef}
              id={ids.name}
              data-testid="task-name"
              className="editor-input"
              type="text"
              autoComplete="off"
              placeholder="e.g. Design review"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="editor-field">
            <label className="editor-label" htmlFor={ids.start}>
              Start
            </label>
            <input
              id={ids.start}
              data-testid="task-start"
              className="editor-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="YYYY-MM-DD"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div className="editor-field">
            <label className="editor-label" htmlFor={ids.duration}>
              Duration
            </label>
            <div className="editor-suffix">
              <input
                id={ids.duration}
                data-testid="task-duration"
                className="editor-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
              <span className="editor-suffix-text">days</span>
            </div>
          </div>
        </div>
        <p className="editor-hint">
          Weekends count as days. Add dependencies, an assignee or a milestone after creating it.
        </p>
      </form>
    </Drawer>
  );
}

export function TaskEditor(): JSX.Element | null {
  const { editor, current, confirm } = useAppState();
  const { openTaskEditor } = useActions();
  const open = editor !== null;

  // Esc closes the drawer, unless a field or the confirm dialog handled it first.
  useEffect(() => {
    if (!open || confirm !== null) {
      return;
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        openTaskEditor(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, confirm, openTaskEditor]);

  if (editor === null || current === null) {
    return null;
  }
  if (editor.taskId === "new") {
    return <NewTaskEditor />;
  }
  const { taskId } = editor;
  const task = current.tasks.find((t) => t.id === taskId);
  if (task === undefined) {
    return null;
  }
  return <ExistingTaskEditor key={task.id} task={task} project={current} />;
}

// The task list: a sticky-left column beside the chart with a HEADER_HEIGHT header and one
// ROW_HEIGHT row per task in creation order (AC42), so each row lines up with its chart row.
// Clicking a row opens the task editor.
import "../../styles/tasks.css";
import { type CSSProperties, type JSX, memo, useMemo } from "react";
import type { ProjectDetail, Task } from "../../api/types.ts";
import { HEADER_HEIGHT, ROW_HEIGHT, TASK_PANEL_WIDTH } from "../../layout.ts";
import { useActions, useAppState } from "../../state/store.tsx";
import { colourFor } from "../chart/colours.ts";
import { daysLabel } from "./fields.ts";

const TaskRow = memo(function TaskRow(props: {
  task: Task;
  fill: string;
  critical: boolean;
  selected: boolean;
  onOpen: (id: number) => void;
}) {
  const { task, fill, critical, selected, onOpen } = props;
  const classes = ["task-row", selected && "selected", critical && "critical"]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      data-testid="task-row"
      data-task-id={task.id}
      data-start={task.start}
      data-end={task.end}
      data-duration={task.duration}
      className={classes}
      style={{ height: ROW_HEIGHT }}
      aria-current={selected ? "true" : undefined}
      onClick={() => onOpen(task.id)}
    >
      <span className="task-row-name-cell">
        <span
          className={task.is_milestone ? "task-row-swatch task-row-diamond" : "task-row-swatch"}
          style={{ backgroundColor: fill }}
          aria-hidden="true"
        />
        <span data-testid="task-row-name" className="task-row-name" title={task.name}>
          {task.name}
        </span>
        {critical && <span className="task-row-critical" title="On the critical path" />}
      </span>
      <span data-testid="task-row-start" className="task-row-date">
        {task.start}
      </span>
      <span data-testid="task-row-end" className="task-row-date">
        {task.end}
      </span>
      <span
        data-testid="task-row-days"
        className="task-row-days"
        title={task.is_milestone ? "Milestone" : `${task.duration} days`}
      >
        {daysLabel(task)}
      </span>
    </button>
  );
});

export function TaskPanel(props: { project: ProjectDetail }): JSX.Element {
  const { project } = props;
  const { palette, editor } = useAppState();
  const { openTaskEditor } = useActions();
  const critical = useMemo(
    () => new Set(project.schedule.critical_task_ids),
    [project.schedule.critical_task_ids],
  );
  const selectedId = editor?.taskId ?? null;
  const count = project.tasks.length;

  return (
    <div
      className="task-panel"
      style={{ "--task-panel-width": `${TASK_PANEL_WIDTH}px` } as CSSProperties}
    >
      <div
        data-testid="task-panel-header"
        className="task-panel-header"
        style={{ height: HEADER_HEIGHT }}
      >
        <div className="task-panel-title-row">
          <span className="task-panel-title">
            Tasks <span className="task-panel-count">{count}</span>
          </span>
          <button
            type="button"
            data-testid="add-task-button"
            className="task-panel-add"
            aria-pressed={selectedId === "new"}
            onClick={() => openTaskEditor("new")}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            Add task
          </button>
        </div>
        <div className="task-panel-columns" aria-hidden="true">
          <span>Name</span>
          <span>Start</span>
          <span>End</span>
          <span className="task-panel-days-heading">Days</span>
        </div>
      </div>
      <div className="task-panel-rows">
        {project.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            fill={colourFor(task, project.people, palette).fill}
            critical={critical.has(task.id)}
            selected={selectedId === task.id}
            onOpen={openTaskEditor}
          />
        ))}
        {count === 0 && <p className="task-panel-empty">No tasks yet.</p>}
      </div>
    </div>
  );
}

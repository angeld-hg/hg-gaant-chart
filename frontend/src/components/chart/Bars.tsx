// Task bars and milestone diamonds, one row per task in creation order (AC3, AC7, AC8, AC9, AC42).
// Every item is memoised on its own props, so a change to one task re-renders only its row.
import { type CSSProperties, memo } from "react";
import type { Task } from "../../api/types.ts";
import { ROW_HEIGHT } from "../../layout.ts";
import type { ColourPair } from "./colours.ts";

export const BAR_HEIGHT = 24;
export const MILESTONE_SIZE = 16;
/** Half the diagonal of the rotated milestone square: how far its side vertices reach. */
export const MILESTONE_REACH = (MILESTONE_SIZE * Math.SQRT2) / 2;

/** Everything one row needs, precomputed by the chart from the server's ProjectDetail. */
export interface ChartItem {
  task: Task;
  row: number;
  /** Bar left edge, or the centre of a milestone's day. */
  x: number;
  /** 0 for a milestone. */
  width: number;
  colours: ColourPair;
  critical: boolean;
  changed: boolean;
  assignee: string | null;
}

// A name goes inside its bar when it fits there. Otherwise it goes beside the bar, where it has
// more room, unless the bar is at least as wide as that room (then it is cut inside instead).
const OUTSIDE_LABEL_MAX_WIDTH = 240;
const APPROX_CHAR_WIDTH = 6.8;
const LABEL_PADDING = 18;

function labelGoesInside(name: string, width: number): boolean {
  return (
    width >= OUTSIDE_LABEL_MAX_WIDTH || name.length * APPROX_CHAR_WIDTH + LABEL_PADDING <= width
  );
}

function CriticalMarker(props: { item: ChartItem }) {
  return props.item.critical ? (
    <span data-testid="critical-marker" className="critical-marker" title="On the critical path" />
  ) : null;
}

function describe(item: ChartItem): string {
  const { task } = item;
  const parts = [
    task.name,
    task.is_milestone ? `milestone on ${task.start}` : `${task.start} to ${task.end}`,
  ];
  if (!task.is_milestone) {
    parts.push(`${task.duration} ${task.duration === 1 ? "day" : "days"}`);
    parts.push(`${task.percent_complete}% complete`);
  }
  parts.push(item.assignee ? `assigned to ${item.assignee}` : "unassigned");
  if (item.critical) {
    parts.push("on the critical path");
  }
  return parts.join(", ");
}

function rowTop(row: number, height: number): number {
  return row * ROW_HEIGHT + (ROW_HEIGHT - height) / 2;
}

function AssigneeTag(props: { item: ChartItem }) {
  const { item } = props;
  if (item.assignee === null) {
    return null;
  }
  return (
    <span
      data-testid="assignee-tag"
      data-task-id={item.task.id}
      className="assignee-tag"
      title={item.assignee}
      style={{ backgroundColor: item.colours.fill, color: item.colours.label }}
    >
      {item.assignee}
    </span>
  );
}

function classNames(base: string, item: ChartItem): string {
  return [base, item.critical && "critical", item.changed && "changed"].filter(Boolean).join(" ");
}

const TaskBar = memo(function TaskBar(props: { item: ChartItem; onOpen: (id: number) => void }) {
  const { item, onOpen } = props;
  const { task, colours } = item;
  const inside = labelGoesInside(task.name, item.width);
  const label = (
    <span
      data-testid="bar-label"
      className={inside ? "bar-label" : "bar-label bar-label-outside"}
      title={task.name}
    >
      {task.name}
    </span>
  );
  const style: CSSProperties = {
    left: item.x,
    top: rowTop(item.row, BAR_HEIGHT),
    width: item.width,
    height: BAR_HEIGHT,
    backgroundColor: colours.fill,
    color: colours.label,
  };
  return (
    <button
      type="button"
      data-testid="bar"
      data-task-id={task.id}
      data-start={task.start}
      data-end={task.end}
      className={classNames("bar", item)}
      style={style}
      aria-label={describe(item)}
      onClick={() => onOpen(task.id)}
    >
      <span className={task.percent_complete > 0 ? "bar-track has-progress" : "bar-track"}>
        <span
          data-testid="bar-progress"
          className="bar-progress"
          style={{ width: `${task.percent_complete}%` }}
        />
      </span>
      {inside && label}
      <span className="bar-aside">
        <CriticalMarker item={item} />
        {!inside && label}
        {task.percent_complete > 0 && <span className="bar-percent">{task.percent_complete}%</span>}
        <AssigneeTag item={item} />
      </span>
    </button>
  );
});

const MilestoneDiamond = memo(function MilestoneDiamond(props: {
  item: ChartItem;
  onOpen: (id: number) => void;
}) {
  const { item, onOpen } = props;
  const { task } = item;
  return (
    <>
      <button
        type="button"
        data-testid="milestone"
        data-task-id={task.id}
        data-start={task.start}
        data-end={task.end}
        className={classNames("milestone", item)}
        style={{
          left: item.x - MILESTONE_SIZE / 2,
          top: rowTop(item.row, MILESTONE_SIZE),
          width: MILESTONE_SIZE,
          height: MILESTONE_SIZE,
          backgroundColor: item.colours.fill,
        }}
        aria-label={describe(item)}
        onClick={() => onOpen(task.id)}
      />
      <span
        className="milestone-aside"
        style={{ left: item.x + MILESTONE_REACH + 10, top: item.row * ROW_HEIGHT }}
      >
        <CriticalMarker item={item} />
        <span data-testid="milestone-label" className="milestone-label" title={task.name}>
          {task.name}
        </span>
        <AssigneeTag item={item} />
      </span>
    </>
  );
});

export const Bars = memo(function Bars(props: {
  items: ChartItem[];
  onOpen: (id: number) => void;
}) {
  return (
    <>
      {props.items.map((item) =>
        item.task.is_milestone ? (
          <MilestoneDiamond key={item.task.id} item={item} onOpen={props.onOpen} />
        ) : (
          <TaskBar key={item.task.id} item={item} onOpen={props.onOpen} />
        ),
      )}
    </>
  );
});

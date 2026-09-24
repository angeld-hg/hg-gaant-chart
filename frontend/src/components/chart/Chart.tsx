// The timeline: sticky header, grid, weekend shading, today and project-end lines, bars and
// milestones, dependency arrows, and the project-end / critical-path legend. It draws exactly the
// ProjectDetail the server returned, so cascades and the critical path show as soon as a
// response lands (AC16); nothing here schedules.
import "../../styles/chart.css";
import {
  type CSSProperties,
  type JSX,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ProjectDetail } from "../../api/types.ts";
import { ROW_HEIGHT, TASK_PANEL_WIDTH } from "../../layout.ts";
import { useActions, useAppState } from "../../state/store.tsx";
import { addDays, daysBetween, todayLocal, weekdayMon0 } from "../../timeline/dates.ts";
import {
  barGeometry,
  computeRange,
  dateToX,
  headerTiers,
  initialScrollLeft,
  PX_PER_DAY,
  type TimelineRange,
  type Zoom,
} from "../../timeline/scale.ts";
import { Arrows } from "./Arrows.tsx";
import { Bars, type ChartItem } from "./Bars.tsx";
import { colourFor } from "./colours.ts";
import { TimelineHeader } from "./TimelineHeader.tsx";
import { WeekendShading } from "./WeekendShading.tsx";

/** Empty space kept under the last row so the legend never sits on top of it. */
const BOTTOM_PADDING_ROWS = 2;

function Legend(props: { projectEnd: string | null; hasCritical: boolean }) {
  if (props.projectEnd === null) {
    return null;
  }
  return (
    <div className="chart-legend-dock">
      <div className="chart-legend">
        <span data-testid="project-end" className="legend-item legend-end">
          <svg className="legend-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 14V2.5M4 3h7.5l-1.8 2.8L11.5 8.5H4" />
          </svg>
          <span>
            Project end: <strong>{props.projectEnd}</strong>
          </span>
        </span>
        {props.hasCritical && (
          <>
            <span className="legend-divider" aria-hidden="true" />
            <span className="legend-item">
              <span className="legend-critical-swatch" aria-hidden="true" />
              Critical path
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyTasksPrompt(props: { left: number; onAdd: () => void }) {
  return (
    <div
      data-testid="empty-tasks-prompt"
      className="empty-tasks-prompt"
      style={{ left: props.left }}
    >
      <svg className="empty-tasks-art" viewBox="0 0 120 48" aria-hidden="true">
        <rect x="4" y="6" width="54" height="10" rx="5" className="empty-tasks-bar" />
        <rect x="40" y="22" width="44" height="10" rx="5" className="empty-tasks-bar" />
        <rect x="70" y="38" width="46" height="10" rx="5" className="empty-tasks-bar accent" />
      </svg>
      <h3 className="empty-tasks-title">No tasks yet</h3>
      <p className="empty-tasks-text">
        Add the first task to start the plan. Link tasks to see the critical path.
      </p>
      <button type="button" className="button button-primary" onClick={props.onAdd}>
        Add a task
      </button>
    </div>
  );
}

/** The last day of the zoom unit (Monday-start week, or month) that contains `iso`. */
function endOfUnit(iso: string, zoom: Zoom): string {
  if (zoom === "week") {
    return addDays(iso, 6 - weekdayMon0(iso));
  }
  if (zoom === "month") {
    const year = Number(iso.slice(0, 4));
    const month = Number(iso.slice(5, 7));
    const next =
      month === 12
        ? `${year + 1}-01-01`
        : `${iso.slice(0, 4)}-${String(month + 1).padStart(2, "0")}-01`;
    return addDays(next, -1);
  }
  return iso;
}

/**
 * Extends the range's end (AC43 only sets minimums) so the timeline is at least as wide as the
 * visible area once scrolled to its opening position. Otherwise a short month-zoom range would
 * end mid-screen and could not scroll to the earliest task.
 */
function fillViewport(
  range: TimelineRange,
  tasks: { start: string }[],
  today: string,
  zoom: Zoom,
  viewportWidth: number,
): TimelineRange {
  const px = PX_PER_DAY[zoom];
  const needed = initialScrollLeft(tasks, range, zoom, today) + viewportWidth;
  if ((daysBetween(range.start, range.end) + 1) * px >= needed) {
    return range;
  }
  const end = addDays(range.start, Math.ceil(needed / px) - 1);
  return { start: range.start, end: endOfUnit(end, zoom) };
}

/**
 * The shared scroll container. On first mount the parent's ref is not attached yet when child
 * layout effects run, so this falls back to finding it in the DOM.
 */
function scrollerOf(
  scrollerRef: RefObject<HTMLDivElement | null>,
  chartRef: RefObject<HTMLDivElement | null>,
): HTMLDivElement | null {
  return (
    scrollerRef.current ??
    chartRef.current?.closest<HTMLDivElement>("[data-testid=timeline-scroller]") ??
    null
  );
}

function MajorGridLines(props: { xs: number[] }) {
  return (
    <>
      {props.xs.map((x) => (
        <div key={x} className="grid-line major" style={{ left: x }} />
      ))}
    </>
  );
}

export function Chart(props: {
  project: ProjectDetail;
  zoom: Zoom;
  scrollerRef: RefObject<HTMLDivElement | null>;
}): JSX.Element {
  const { project, zoom, scrollerRef } = props;
  const { palette, lastChangedTaskIds } = useAppState();
  const { openTaskEditor } = useActions();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const today = todayLocal();
  // Width of the visible timeline (the scroller minus the sticky task panel); 0 until measured.
  const [viewportWidth, setViewportWidth] = useState(0);

  const range = useMemo(
    () =>
      fillViewport(
        computeRange(project.tasks, today, zoom),
        project.tasks,
        today,
        zoom,
        viewportWidth,
      ),
    [project.tasks, today, zoom, viewportWidth],
  );
  const px = PX_PER_DAY[zoom];
  const width = (daysBetween(range.start, range.end) + 1) * px;
  const rowsHeight = project.tasks.length * ROW_HEIGHT;
  const bodyHeight = rowsHeight + BOTTOM_PADDING_ROWS * ROW_HEIGHT;

  const items = useMemo((): ChartItem[] => {
    const critical = new Set(project.schedule.critical_task_ids);
    const changed = new Set(lastChangedTaskIds);
    const names = new Map(project.people.map((p) => [p.id, p.name]));
    return project.tasks.map((task, row) => {
      const { x, width: barWidth } = barGeometry(task, range, zoom);
      return {
        task,
        row,
        x,
        width: barWidth,
        colours: colourFor(task, project.people, palette),
        critical: critical.has(task.id),
        changed: changed.has(task.id),
        assignee: task.assignee_id === null ? null : (names.get(task.assignee_id) ?? null),
      };
    });
  }, [project, range, zoom, palette, lastChangedTaskIds]);

  const majorLines = useMemo(() => headerTiers(range, zoom).top.map((u) => u.x), [range, zoom]);
  const minorLines = useMemo(
    // Day and week units are uniform, so a repeating background draws them; months vary.
    () => (zoom === "month" ? headerTiers(range, zoom).bottom.map((u) => u.x) : []),
    [range, zoom],
  );

  // Track the visible width so the timeline always fills it and the opening scroll is reachable.
  useLayoutEffect(() => {
    const scroller = scrollerOf(scrollerRef, chartRef);
    if (!scroller) {
      return;
    }
    const measure = () => setViewportWidth(Math.max(0, scroller.clientWidth - TASK_PANEL_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scrollerRef]);

  // Open at the earliest task (AC43) when the project opens and whenever the zoom changes; later
  // edits and resizes keep the user's scroll position. The latest tasks are read through a ref.
  const latest = useRef({ tasks: project.tasks, today });
  latest.current = { tasks: project.tasks, today };
  const scrolledFor = useRef<Zoom | null>(null);
  useLayoutEffect(() => {
    const scroller = scrollerOf(scrollerRef, chartRef);
    if (!scroller || viewportWidth === 0 || scrolledFor.current === zoom) {
      return;
    }
    scrolledFor.current = zoom;
    const { tasks, today: now } = latest.current;
    const openRange = computeRange(tasks, now, zoom);
    scroller.scrollLeft = initialScrollLeft(tasks, openRange, zoom, now);
  }, [zoom, viewportWidth, scrollerRef]);

  const projectEnd = project.schedule.project_end;
  const gridStyle =
    zoom === "month" ? undefined : { backgroundSize: `${zoom === "week" ? 7 * px : px}px 100%` };

  return (
    <div
      ref={chartRef}
      data-testid="chart"
      data-zoom={zoom}
      data-range-start={range.start}
      data-range-end={range.end}
      className={`chart zoom-${zoom}`}
      style={{ width, "--panel-width": `${TASK_PANEL_WIDTH}px` } as CSSProperties}
    >
      <TimelineHeader range={range} zoom={zoom} today={today} />
      <div className="chart-body" style={{ minHeight: bodyHeight }}>
        <WeekendShading range={range} zoom={zoom} />
        <div className={`chart-grid zoom-${zoom}`} style={gridStyle}>
          {minorLines.map((x) => (
            <div key={x} className="grid-line" style={{ left: x }} />
          ))}
        </div>
        <MajorGridLines xs={majorLines} />
        <div className="chart-rows" style={{ height: rowsHeight }} />
        <div
          data-testid="today-line"
          className="today-line"
          style={{ left: dateToX(today, range, zoom) + px / 2 }}
        />
        {projectEnd !== null && (
          <div
            className="project-end-line"
            style={{ left: dateToX(projectEnd, range, zoom) + px }}
            title={`Project end: ${projectEnd}`}
          />
        )}
        <Arrows
          dependencies={project.dependencies}
          items={items}
          criticalDependencyIds={project.schedule.critical_dependency_ids}
          width={width}
          height={rowsHeight}
        />
        <Bars items={items} onOpen={openTaskEditor} />
        {project.tasks.length === 0 && (
          <EmptyTasksPrompt
            left={initialScrollLeft([], range, zoom, today) + 24}
            onAdd={() => openTaskEditor("new")}
          />
        )}
      </div>
      <Legend projectEnd={projectEnd} hasCritical={project.schedule.critical_task_ids.length > 0} />
    </div>
  );
}

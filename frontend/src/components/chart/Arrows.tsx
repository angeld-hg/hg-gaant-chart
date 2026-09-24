// Dependency arrows (AC10): an SVG overlay with one elbow path per finish-to-start link, from the
// predecessor's end to the successor's start. Zero-slack links between critical tasks are
// highlighted (AC14, D12); the server decides which ones those are.
import { memo, useId } from "react";
import type { Dependency } from "../../api/types.ts";
import { ROW_HEIGHT } from "../../layout.ts";
import { type ChartItem, MILESTONE_REACH } from "./Bars.tsx";

/** Horizontal run out of the predecessor (and into the successor) before turning. */
const STUB = 10;
const RADIUS = 4;

function n(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** An elbow path with rounded corners from (x1, y1) to (x2, y2); rows always differ. */
export function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const s = y2 > y1 ? 1 : -1;
  const xa = x1 + STUB;
  const out = `M ${n(x1)} ${n(y1)} H ${n(xa - RADIUS)} Q ${n(xa)} ${n(y1)} ${n(xa)} ${n(y1 + s * RADIUS)}`;
  if (x2 - STUB >= xa) {
    // Room to drop straight down beside the predecessor, then run right into the successor.
    return (
      `${out} V ${n(y2 - s * RADIUS)} Q ${n(xa)} ${n(y2)} ${n(xa + RADIUS)} ${n(y2)}` +
      ` L ${n(x2)} ${n(y2)}`
    );
  }
  // The successor starts left of the turn: drop to the gap between rows, run back, then drop in.
  const ym = y1 + (s * ROW_HEIGHT) / 2;
  const xb = x2 - STUB;
  return (
    `${out} V ${n(ym - s * RADIUS)} Q ${n(xa)} ${n(ym)} ${n(xa - RADIUS)} ${n(ym)}` +
    ` H ${n(xb + RADIUS)} Q ${n(xb)} ${n(ym)} ${n(xb)} ${n(ym + s * RADIUS)}` +
    ` V ${n(y2 - s * RADIUS)} Q ${n(xb)} ${n(y2)} ${n(xb + RADIUS)} ${n(y2)} L ${n(x2)} ${n(y2)}`
  );
}

function exitX(item: ChartItem): number {
  return item.task.is_milestone ? item.x + MILESTONE_REACH : item.x + item.width;
}

function entryX(item: ChartItem): number {
  return item.task.is_milestone ? item.x - MILESTONE_REACH : item.x;
}

function centreY(item: ChartItem): number {
  return item.row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

export const Arrows = memo(function Arrows(props: {
  dependencies: Dependency[];
  items: ChartItem[];
  criticalDependencyIds: number[];
  width: number;
  height: number;
}) {
  // useId may contain characters that url(#...) references do not accept.
  const id = `arrows-${useId().replace(/[^\w-]/g, "")}`;
  const normalHead = `${id}-head`;
  const criticalHead = `${id}-head-critical`;
  const byId = new Map(props.items.map((item) => [item.task.id, item]));
  const critical = new Set(props.criticalDependencyIds);

  return (
    <svg className="chart-arrows" width={props.width} height={props.height} aria-hidden="true">
      <defs>
        <marker
          id={normalHead}
          viewBox="0 0 8 8"
          refX="8"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M0 0.5 L8 4 L0 7.5 Z" className="arrow-head" />
        </marker>
        <marker
          id={criticalHead}
          viewBox="0 0 8 8"
          refX="8"
          refY="4"
          markerWidth="9"
          markerHeight="9"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M0 0.5 L8 4 L0 7.5 Z" className="arrow-head arrow-head-critical" />
        </marker>
      </defs>
      {props.dependencies.map((dep) => {
        const from = byId.get(dep.predecessor_id);
        const to = byId.get(dep.successor_id);
        if (from === undefined || to === undefined) {
          return null;
        }
        const isCritical = critical.has(dep.id);
        return (
          <path
            key={dep.id}
            data-testid="arrow"
            data-from={dep.predecessor_id}
            data-to={dep.successor_id}
            data-dependency-id={dep.id}
            className={isCritical ? "arrow critical" : "arrow"}
            d={arrowPath(exitX(from), centreY(from), entryX(to), centreY(to))}
            markerEnd={`url(#${isCritical ? criticalHead : normalHead})`}
          />
        );
      })}
    </svg>
  );
});

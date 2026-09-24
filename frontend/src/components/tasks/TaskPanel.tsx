// Stub (S7). S9 replaces this with the task list: a sticky-left column of task rows.
import type { JSX } from "react";
import type { ProjectDetail } from "../../api/types.ts";
import { HEADER_HEIGHT, TASK_PANEL_WIDTH } from "../../layout.ts";

export function TaskPanel(_props: { project: ProjectDetail }): JSX.Element {
  return (
    <div
      style={{
        position: "sticky",
        left: 0,
        zIndex: 3,
        flex: `0 0 ${TASK_PANEL_WIDTH}px`,
        width: TASK_PANEL_WIDTH,
        minHeight: "100%",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: HEADER_HEIGHT,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-muted)",
        }}
      />
    </div>
  );
}

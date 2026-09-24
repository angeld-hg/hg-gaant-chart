// The open project: one scroll container holding the sticky-left task panel and the chart
// (C6), so chart x = scroller.scrollLeft is the visible left edge of the timeline.
import { useRef } from "react";
import type { ProjectDetail } from "../../api/types.ts";
import { useAppState } from "../../state/store.tsx";
import { Chart } from "../chart/Chart.tsx";
import { RosterPanel } from "../roster/RosterPanel.tsx";
import { TaskEditor } from "../tasks/TaskEditor.tsx";
import { TaskPanel } from "../tasks/TaskPanel.tsx";

export function ProjectView(props: { project: ProjectDetail }) {
  const { zoom } = useAppState();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className="project-view" aria-label={`${props.project.name} timeline`}>
      <div ref={scrollerRef} data-testid="timeline-scroller" className="timeline-scroller">
        <div className="timeline-content">
          <TaskPanel project={props.project} />
          <Chart project={props.project} zoom={zoom} scrollerRef={scrollerRef} />
        </div>
      </div>
      <TaskEditor />
      <RosterPanel />
    </section>
  );
}

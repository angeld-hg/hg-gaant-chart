// Stub (S7). S8 replaces this with the timeline: headers, bars, milestones and arrows.
import type { JSX, RefObject } from "react";
import type { ProjectDetail } from "../../api/types.ts";
import type { Zoom } from "../../timeline/scale.ts";

export function Chart(_props: {
  project: ProjectDetail;
  zoom: Zoom;
  scrollerRef: RefObject<HTMLDivElement | null>;
}): JSX.Element {
  return <div data-testid="chart" style={{ flex: "1 0 auto", minHeight: "100%" }} />;
}

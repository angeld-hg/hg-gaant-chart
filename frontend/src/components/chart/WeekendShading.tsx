// Full-height tint behind every Saturday and Sunday in day zoom (AC27). Shading is only a visual
// cue: weekends are ordinary calendar days for dates and durations.
import { memo } from "react";
import { addDays, daysBetween, isWeekend } from "../../timeline/dates.ts";
import { dateToX, PX_PER_DAY, type TimelineRange, type Zoom } from "../../timeline/scale.ts";

export const WeekendShading = memo(function WeekendShading(props: {
  range: TimelineRange;
  zoom: Zoom;
}) {
  const { range, zoom } = props;
  if (zoom !== "day") {
    return null;
  }
  const days = daysBetween(range.start, range.end) + 1;
  const shades = [];
  for (let i = 0; i < days; i++) {
    const iso = addDays(range.start, i);
    if (isWeekend(iso)) {
      shades.push(
        <div
          key={iso}
          data-testid="weekend-shade"
          data-date={iso}
          className="weekend-shade"
          style={{ left: dateToX(iso, range, zoom), width: PX_PER_DAY[zoom] }}
        />,
      );
    }
  }
  return <>{shades}</>;
});

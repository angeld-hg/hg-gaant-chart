// The sticky two-tier timeline header (AC19): months over days, months over ISO weeks, or years
// over months, depending on the zoom.
import { memo } from "react";
import { HEADER_HEIGHT } from "../../layout.ts";
import { isWeekend, weekdayMon0 } from "../../timeline/dates.ts";
import {
  dateToX,
  type HeaderUnit,
  headerTiers,
  PX_PER_DAY,
  type TimelineRange,
  type Zoom,
} from "../../timeline/scale.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function TopUnit(props: { unit: HeaderUnit }) {
  const { unit } = props;
  return (
    <div
      data-testid="header-unit"
      data-tier="top"
      data-key={unit.key}
      className="header-unit header-unit-top"
      style={{ left: unit.x, width: unit.width }}
    >
      <span className="header-label">{unit.label}</span>
    </div>
  );
}

function BottomUnit(props: { unit: HeaderUnit; zoom: Zoom; today: string }) {
  const { unit, zoom, today } = props;
  const isDay = zoom === "day";
  const classes = ["header-unit", "header-unit-bottom"];
  if (isDay && isWeekend(unit.key)) {
    classes.push("weekend");
  }
  if (isDay && unit.key === today) {
    classes.push("today");
  }
  return (
    <div
      data-testid="header-unit"
      data-tier="bottom"
      data-key={unit.key}
      className={classes.join(" ")}
      style={{ left: unit.x, width: unit.width }}
      title={isDay ? `${WEEKDAYS[weekdayMon0(unit.key)] ?? ""} ${unit.key}` : undefined}
    >
      {isDay && (
        <span className="header-weekday" aria-hidden="true">
          {unit.title}
        </span>
      )}
      <span className="header-label">{unit.label}</span>
    </div>
  );
}

export const TimelineHeader = memo(function TimelineHeader(props: {
  range: TimelineRange;
  zoom: Zoom;
  today: string;
}) {
  const { range, zoom, today } = props;
  const { top, bottom } = headerTiers(range, zoom);
  const todayX = dateToX(today, range, zoom) + PX_PER_DAY[zoom] / 2;
  return (
    <div className={`timeline-header zoom-${zoom}`} style={{ height: HEADER_HEIGHT }}>
      <div className="header-tier header-tier-top">
        {top.map((unit) => (
          <TopUnit key={unit.key} unit={unit} />
        ))}
      </div>
      <div className="header-tier header-tier-bottom">
        {bottom.map((unit) => (
          <BottomUnit key={unit.key} unit={unit} zoom={zoom} today={today} />
        ))}
      </div>
      <div className="header-today" style={{ left: todayX }} aria-hidden="true" />
    </div>
  );
});

import type { Locator, Page } from "@playwright/test";
import type { Palette, ProjectDetail } from "../src/api/types.ts";
import { addDays, daysBetween } from "../src/timeline/dates.ts";
import { computeRange, PX_PER_DAY, type Zoom } from "../src/timeline/scale.ts";
import { expect, test } from "./fixtures.ts";
import { resetDb, type SeedFixture, seedProject } from "./helpers/api.ts";

const TODAY = "2026-10-01";

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
});

async function openSeeded(page: Page, fixture: SeedFixture) {
  const seeded = await seedProject(page.request, fixture);
  await page.goto(`/#/projects/${seeded.projectId}`);
  await expect(page.getByTestId("chart")).toBeVisible();
  return seeded;
}

async function palette(page: Page): Promise<Palette> {
  return (await (await page.request.get("/api/palette")).json()) as Palette;
}

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

function css(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (b === null) {
    throw new Error("element has no bounding box");
  }
  return b;
}

const bar = (page: Page, id: number) => page.locator(`[data-testid=bar][data-task-id="${id}"]`);
const milestone = (page: Page, id: number) =>
  page.locator(`[data-testid=milestone][data-task-id="${id}"]`);

async function chartRange(page: Page) {
  const chart = page.getByTestId("chart");
  return {
    start: (await chart.getAttribute("data-range-start")) ?? "",
    end: (await chart.getAttribute("data-range-end")) ?? "",
  };
}

/** A bar's x and width relative to the chart's left edge (timeline x 0). */
async function barGeometryOnScreen(page: Page, locator: Locator) {
  const chartBox = await box(page.getByTestId("chart"));
  const b = await box(locator);
  return { x: b.x - chartBox.x, width: b.width };
}

test("AC3: a 3-day task spans exactly its 3 day columns in day zoom", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Design", start: "2026-10-05", duration: 3 }],
  });
  const design = bar(page, taskIds.Design as number);
  await expect(design).toHaveAttribute("data-start", "2026-10-05");
  await expect(design).toHaveAttribute("data-end", "2026-10-07");

  const range = await chartRange(page);
  expect(range).toEqual(computeRange([{ start: "2026-10-05", end: "2026-10-07" }], TODAY, "day"));
  const geo = await barGeometryOnScreen(page, design);
  expect(geo.width).toBeCloseTo(3 * 32, 0);
  expect(geo.x).toBeCloseTo(daysBetween(range.start, "2026-10-05") * 32, 0);

  // The bar's edges line up with the 10-05 and 10-07 day columns in the header.
  const day = (iso: string) =>
    page.locator(`[data-testid=header-unit][data-tier=bottom][data-key="${iso}"]`);
  const first = await box(day("2026-10-05"));
  const last = await box(day("2026-10-07"));
  const barBox = await box(design);
  expect(Math.abs(barBox.x - first.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(barBox.x + barBox.width - (last.x + last.width))).toBeLessThanOrEqual(1);
});

test("AC27: weekends are shaded in day zoom and still count as days", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Friday", start: "2026-10-09", duration: 3 }],
  });
  const friday = bar(page, taskIds.Friday as number);
  await expect(friday).toHaveAttribute("data-end", "2026-10-11");
  expect((await box(friday)).width).toBeCloseTo(96, 0);

  const shade = (iso: string) => page.locator(`[data-testid=weekend-shade][data-date="${iso}"]`);
  await expect(shade("2026-10-10")).toHaveCount(1);
  await expect(shade("2026-10-11")).toHaveCount(1);
  await expect(shade("2026-10-09")).toHaveCount(0);
  await expect(shade("2026-10-12")).toHaveCount(0);
  // Full height of the chart body, and visibly tinted.
  expect(await css(shade("2026-10-10"), "background-color")).not.toBe("rgba(0, 0, 0, 0)");
  const chartBox = await box(page.getByTestId("chart"));
  const shadeBox = await box(shade("2026-10-10"));
  expect(shadeBox.height).toBeGreaterThan(chartBox.height - 60);

  // Only day zoom shades weekends.
  await page.getByTestId("zoom-week").click();
  await expect(page.getByTestId("weekend-shade")).toHaveCount(0);
});

test("AC7: a milestone is a diamond on its date, not a bar", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Build", start: "2026-10-05", duration: 3 },
      { name: "Go live", start: "2026-10-09", is_milestone: true },
    ],
  });
  const id = taskIds["Go live"] as number;
  const diamond = milestone(page, id);
  await expect(diamond).toHaveCount(1);
  await expect(bar(page, id)).toHaveCount(0);
  await expect(diamond).toHaveAttribute("data-start", "2026-10-09");
  await expect(diamond).toHaveAttribute("data-end", "2026-10-09");
  expect(await css(diamond, "transform")).not.toBe("none");

  // Centred on the 10-09 day column.
  const range = await chartRange(page);
  const chartBox = await box(page.getByTestId("chart"));
  const b = await box(diamond);
  const centre = b.x + b.width / 2 - chartBox.x;
  expect(centre).toBeCloseTo(daysBetween(range.start, "2026-10-09") * 32 + 16, 0);
  await expect(page.getByTestId("milestone-label")).toHaveText("Go live");
});

test("AC8: 40% complete fills 40% of the bar's width", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Build", start: "2026-10-05", duration: 5, percent_complete: 40 },
      { name: "Idle", start: "2026-10-05", duration: 5 },
    ],
  });
  const build = bar(page, taskIds.Build as number);
  const barWidth = (await box(build)).width;
  const fillWidth = (await box(build.getByTestId("bar-progress"))).width;
  expect(fillWidth / barWidth).toBeCloseTo(0.4, 2);

  const idle = bar(page, taskIds.Idle as number).getByTestId("bar-progress");
  expect(await idle.evaluate((el) => el.getBoundingClientRect().width)).toBe(0);
});

test("AC9, AC38: bars, diamonds and pills use the assignee's palette pair, else neutral", async ({
  page,
}) => {
  const pal = await palette(page);
  const orange = pal.colours[1];
  if (orange === undefined) {
    throw new Error("palette too short");
  }
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    people: [{ name: "Ana", colour: orange.fill }],
    tasks: [
      { name: "Design", start: "2026-10-05", duration: 5, assignee: "Ana" },
      { name: "Sign-off", start: "2026-10-12", is_milestone: true, assignee: "Ana" },
      { name: "Loose", start: "2026-10-05", duration: 5 },
      { name: "Loose gate", start: "2026-10-12", is_milestone: true },
    ],
  });

  const design = bar(page, taskIds.Design as number);
  expect(await css(design, "background-color")).toBe(rgb(orange.fill));
  expect(await css(design.getByTestId("bar-label"), "color")).toBe(rgb(orange.label));
  const designTag = page.locator(
    `[data-testid=assignee-tag][data-task-id="${taskIds.Design as number}"]`,
  );
  await expect(designTag).toHaveText("Ana");
  expect(await css(designTag, "background-color")).toBe(rgb(orange.fill));
  expect(await css(designTag, "color")).toBe(rgb(orange.label));

  const signOff = milestone(page, taskIds["Sign-off"] as number);
  expect(await css(signOff, "background-color")).toBe(rgb(orange.fill));
  const signOffTag = page.locator(
    `[data-testid=assignee-tag][data-task-id="${taskIds["Sign-off"] as number}"]`,
  );
  await expect(signOffTag).toHaveText("Ana");
  expect(await css(signOffTag, "background-color")).toBe(rgb(orange.fill));
  expect(await css(signOffTag, "color")).toBe(rgb(orange.label));

  const loose = bar(page, taskIds.Loose as number);
  expect(await css(loose, "background-color")).toBe(rgb(pal.neutral.fill));
  expect(await css(loose.getByTestId("bar-label"), "color")).toBe(rgb(pal.neutral.label));
  const looseGate = milestone(page, taskIds["Loose gate"] as number);
  expect(await css(looseGate, "background-color")).toBe(rgb(pal.neutral.fill));
  await expect(page.getByTestId("assignee-tag")).toHaveCount(2);
});

test("AC10, AC14, AC15, AC16: arrows, critical path and project end come from the server", async ({
  page,
}) => {
  // AC15: A (days 1-3) -> C (days 4-6) and B (days 1-2) -> C.
  const { taskIds, projectId } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "A", start: "2026-10-05", duration: 3 },
      { name: "B", start: "2026-10-05", duration: 2 },
      { name: "C", start: "2026-10-08", duration: 3 },
    ],
    deps: [
      ["A", "C"],
      ["B", "C"],
    ],
  });
  const [a, b, c] = [taskIds.A, taskIds.B, taskIds.C] as [number, number, number];
  const arrows = page.getByTestId("arrow");
  await expect(arrows).toHaveCount(2);
  const arrow = (from: number, to: number) =>
    page.locator(`[data-testid=arrow][data-from="${from}"][data-to="${to}"]`);
  await expect(arrow(a, c)).toHaveCount(1);
  await expect(arrow(b, c)).toHaveCount(1);

  await expect(bar(page, a)).toHaveClass(/\bcritical\b/);
  await expect(bar(page, c)).toHaveClass(/\bcritical\b/);
  await expect(bar(page, b)).not.toHaveClass(/\bcritical\b/);
  await expect(arrow(a, c)).toHaveClass(/\bcritical\b/);
  await expect(arrow(b, c)).not.toHaveClass(/\bcritical\b/);

  // The arrow runs from the end of A to the start of C.
  const chartBox = await box(page.getByTestId("chart"));
  const aBox = await box(bar(page, a));
  const cBox = await box(bar(page, c));
  const d = (await arrow(a, c).getAttribute("d")) ?? "";
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  expect(numbers[0]).toBeCloseTo(aBox.x + aBox.width - chartBox.x, 0);
  expect(numbers.at(-2)).toBeCloseTo(cBox.x - chartBox.x, 0);

  await expect(page.getByTestId("project-end")).toContainText("2026-10-10");

  // The chart shows whatever the server returns: change the plan behind its back and reload.
  const detail = (await (
    await page.request.get(`/api/projects/${projectId}`)
  ).json()) as ProjectDetail;
  const bc = detail.dependencies.find((dep) => dep.predecessor_id === b);
  await page.request.patch(`/api/tasks/${b}`, { data: { duration: 3 } });
  await page.reload();
  await expect(bar(page, b)).toHaveClass(/\bcritical\b/);
  await expect(arrow(b, c)).toHaveClass(/\bcritical\b/);
  expect(bc).toBeDefined();
  await page.request.delete(`/api/dependencies/${bc?.id}`);
  await page.request.patch(`/api/tasks/${c}`, { data: { duration: 5 } });
  await page.reload();
  await expect(arrows).toHaveCount(1);
  await expect(bar(page, b)).not.toHaveClass(/\bcritical\b/);
  await expect(page.getByTestId("project-end")).toContainText("2026-10-12");
});

test("AC14: the critical highlight shows on every palette colour and on neutral", async ({
  page,
}) => {
  const pal = await palette(page);
  const people = pal.colours.map((c, i) => ({ name: `P${i + 1}`, colour: c.fill }));
  const tasks = [
    ...people.map((p) => ({
      name: `T ${p.name}`,
      start: "2026-10-05",
      duration: 3,
      assignee: p.name,
    })),
    { name: "T neutral", start: "2026-10-05", duration: 3 },
  ];
  await openSeeded(page, { name: "Launch", people, tasks });
  const bars = page.getByTestId("bar");
  await expect(bars).toHaveCount(13);
  await expect(page.locator("[data-testid=bar].critical")).toHaveCount(13);
  const fills = new Set<string>();
  for (const one of await bars.all()) {
    expect(await css(one, "outline-style")).not.toBe("none");
    expect(Number.parseFloat(await css(one, "outline-width"))).toBeGreaterThanOrEqual(2);
    // The ring sits outside the bar with a gap, so it never depends on the fill.
    expect(Number.parseFloat(await css(one, "outline-offset"))).toBeGreaterThanOrEqual(2);
    fills.add(await css(one, "background-color"));
    await expect(one.getByTestId("critical-marker")).toHaveCount(1);
  }
  expect(fills.size).toBe(13);
});

test("AC19: zoom changes the header units and keeps every bar on its dates", async ({ page }) => {
  const tasks = [
    { name: "Design", start: "2026-10-05", end: "2026-10-07" },
    { name: "Build", start: "2026-10-20", end: "2026-11-18" },
  ];
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Design", start: "2026-10-05", duration: 3 },
      { name: "Build", start: "2026-10-20", duration: 30 },
      { name: "Gate", start: "2026-11-20", is_milestone: true },
    ],
  });
  const bottomLabels = () =>
    page.locator("[data-testid=header-unit][data-tier=bottom] .header-label").allTextContents();
  const topLabels = () =>
    page.locator("[data-testid=header-unit][data-tier=top] .header-label").allTextContents();
  const patterns: Record<Zoom, { top: RegExp; bottom: RegExp }> = {
    day: { top: /^[A-Z][a-z]{2} \d{4}$/, bottom: /^\d{1,2}$/ },
    week: { top: /^[A-Z][a-z]{2} \d{4}$/, bottom: /^W\d{1,2} \d{1,2} [A-Z][a-z]{2}$/ },
    month: { top: /^\d{4}$/, bottom: /^[A-Z][a-z]{2}$/ },
  };
  const everyTask = [...tasks, { name: "Gate", start: "2026-11-20", end: "2026-11-20" }];

  for (const zoom of ["day", "week", "month"] as Zoom[]) {
    await page.getByTestId(`zoom-${zoom}`).click();
    await expect(page.getByTestId("chart")).toHaveAttribute("data-zoom", zoom);
    const bottom = await bottomLabels();
    const top = await topLabels();
    expect(bottom.length).toBeGreaterThan(0);
    for (const label of bottom) {
      expect(label).toMatch(patterns[zoom].bottom);
    }
    for (const label of top) {
      expect(label).toMatch(patterns[zoom].top);
    }

    const range = await chartRange(page);
    // The chart may extend the end to fill the visible area, never the start.
    const minimum = computeRange(everyTask, TODAY, zoom);
    expect(range.start).toBe(minimum.start);
    expect(range.end >= minimum.end).toBe(true);
    const px = PX_PER_DAY[zoom];
    for (const t of tasks) {
      const geo = await barGeometryOnScreen(page, bar(page, taskIds[t.name] as number));
      expect(Math.abs(geo.x - daysBetween(range.start, t.start) * px)).toBeLessThanOrEqual(1);
      const days = daysBetween(t.start, t.end) + 1;
      expect(Math.abs(geo.width - days * px)).toBeLessThanOrEqual(1);
    }
    const gate = await box(milestone(page, taskIds.Gate as number));
    const chartBox = await box(page.getByTestId("chart"));
    const centre = gate.x + gate.width / 2 - chartBox.x;
    expect(
      Math.abs(centre - (daysBetween(range.start, "2026-11-20") * px + px / 2)),
    ).toBeLessThanOrEqual(1);
  }
});

test("AC43: the timeline opens at the earliest start and covers today and the margins", async ({
  page,
}) => {
  const earliest = "2026-11-02";
  await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Later", start: "2026-12-01", duration: 10 },
      { name: "Earliest", start: earliest, duration: 3 },
    ],
  });
  const scroller = page.getByTestId("timeline-scroller");
  for (const zoom of ["day", "week", "month"] as Zoom[]) {
    await page.getByTestId(`zoom-${zoom}`).click();
    await expect(page.getByTestId("chart")).toHaveAttribute("data-zoom", zoom);
    const range = await chartRange(page);
    expect(range.start <= TODAY && TODAY <= range.end).toBe(true);
    expect(range.start <= addDays(earliest, -30)).toBe(true);
    expect(range.end >= addDays("2026-12-10", 60)).toBe(true);
    const px = PX_PER_DAY[zoom];
    const startX = daysBetween(range.start, earliest) * px;
    await expect
      .poll(async () => startX - (await scroller.evaluate((el) => el.scrollLeft)))
      .toBeGreaterThanOrEqual(0);
    const offset = startX - (await scroller.evaluate((el) => el.scrollLeft));
    expect(offset).toBeLessThanOrEqual(7 * px);
    // The chart can actually scroll that far: its width covers the whole range.
    const width = await page.getByTestId("chart").evaluate((el) => el.scrollWidth);
    expect(width).toBeGreaterThanOrEqual((daysBetween(range.start, range.end) + 1) * px);
  }
  // A today line marks the current day.
  await expect(page.getByTestId("today-line")).toHaveCount(1);
});

test("AC35: an empty project shows an empty timeline, a prompt, no end and nothing critical", async ({
  page,
}) => {
  await openSeeded(page, { name: "Empty", tasks: [] });
  const prompt = page.getByTestId("empty-tasks-prompt");
  await expect(prompt).toBeVisible();
  await expect(page.getByTestId("project-end")).toHaveCount(0);
  await expect(page.locator(".critical")).toHaveCount(0);
  await expect(page.getByTestId("bar")).toHaveCount(0);
  await expect(page.getByTestId("header-unit").first()).toBeVisible();

  const range = await chartRange(page);
  expect(range).toEqual({ start: addDays(TODAY, -30), end: addDays(TODAY, 60) });
  const scrollLeft = await page.getByTestId("timeline-scroller").evaluate((el) => el.scrollLeft);
  expect(daysBetween(range.start, TODAY) * 32 - scrollLeft).toBe(64);

  // The prompt's button opens the new-task editor.
  await prompt.getByRole("button", { name: "Add a task" }).click();
  await expect(page.getByTestId("empty-tasks-prompt")).toBeVisible();
});

test("AC42: bars are drawn in creation order, one row per task", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Third by date", start: "2026-10-20", duration: 2 },
      { name: "First by date", start: "2026-10-05", duration: 2 },
      { name: "Gate", start: "2026-10-10", is_milestone: true },
      { name: "Second by date", start: "2026-10-12", duration: 2 },
    ],
  });
  const ids = await page
    .locator("[data-testid=bar], [data-testid=milestone]")
    .evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-task-id"))));
  const expected = ["Third by date", "First by date", "Gate", "Second by date"].map(
    (n) => taskIds[n],
  );
  expect(ids).toEqual(expected);

  // Row i sits at HEADER_HEIGHT + i * ROW_HEIGHT; rows are 36px apart.
  const tops: number[] = [];
  for (const id of expected) {
    const locator = page.locator(`[data-task-id="${id}"]`).first();
    const b = await box(locator);
    tops.push(b.y + b.height / 2);
  }
  for (let i = 1; i < tops.length; i++) {
    expect((tops[i] ?? 0) - (tops[i - 1] ?? 0)).toBeCloseTo(36, 0);
  }
  const chartBox = await box(page.getByTestId("chart"));
  expect((tops[0] ?? 0) - chartBox.y).toBeCloseTo(56 + 18, 0);
});

test("long names are cut with an ellipsis and shown in full on hover", async ({ page }) => {
  const long = `Design ${"x".repeat(90)}`;
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    people: [{ name: `Ana ${"y".repeat(90)}` }],
    tasks: [{ name: long, start: "2026-10-05", duration: 5, assignee: `Ana ${"y".repeat(90)}` }],
  });
  const label = bar(page, taskIds[long] as number).getByTestId("bar-label");
  await expect(label).toHaveAttribute("title", long);
  expect(await css(label, "text-overflow")).toBe("ellipsis");
  expect(await label.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const tag = page.getByTestId("assignee-tag");
  await expect(tag).toHaveAttribute("title", `Ana ${"y".repeat(90)}`);
  expect(await tag.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  // The pill starts after the bar ends, so the two never overlap.
  const barBox = await box(bar(page, taskIds[long] as number));
  expect((await box(tag)).x).toBeGreaterThanOrEqual(barBox.x + barBox.width);
});

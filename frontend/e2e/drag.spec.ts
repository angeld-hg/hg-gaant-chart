// Drag to move and drag edges to resize (S11): AC7, AC12, AC16, AC17, AC18, AC19, AC28, AC39.
// Drags use the real mouse, so they go through the same pointer events a user's would. The bar
// is drawn at the proposed dates while dragging; after release it shows whatever the server
// stored (the "settle").
import type { Locator, Page } from "@playwright/test";
import { PX_PER_DAY } from "../src/timeline/scale.ts";
import { expect, test } from "./fixtures.ts";
import { resetDb, type SeedFixture, seedProject } from "./helpers/api.ts";

const TODAY = "2026-10-01";
const DAY = PX_PER_DAY.day;

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

const bar = (page: Page, id: number) => page.locator(`[data-testid=bar][data-task-id="${id}"]`);
const milestone = (page: Page, id: number) =>
  page.locator(`[data-testid=milestone][data-task-id="${id}"]`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (b === null) {
    throw new Error("element has no bounding box");
  }
  return b;
}

type Grip = "body" | "start" | "end";

/** Where to press: the bar's middle, or the middle of one of its edge handles. */
async function gripPoint(item: Locator, grip: Grip) {
  const target =
    grip === "body"
      ? item
      : item.getByTestId(grip === "start" ? "bar-handle-start" : "bar-handle-end");
  const b = await box(target);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function isTaskPatch(url: string, method: string): boolean {
  return method === "PATCH" && /\/api\/tasks\/\d+$/.test(url);
}

/**
 * Presses `item` at `grip`, moves the mouse `dx` px in steps, runs `whileHeld` (for checks during
 * the drag), releases, and waits for the PATCH the release sends.
 */
async function drag(
  page: Page,
  item: Locator,
  dx: number,
  grip: Grip = "body",
  whileHeld?: () => Promise<void>,
) {
  const from = await gripPoint(item, grip);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 8 });
  if (whileHeld) {
    await whileHeld();
  }
  const patched = page.waitForResponse((r) => isTaskPatch(r.url(), r.request().method()));
  await page.mouse.up();
  return patched;
}

/**
 * The item is drawn on its start date's day column in the header: a bar's left edge on the
 * column's left edge, a diamond's centre on the column's centre. Checked against the header, not
 * the pre-drag screen position, because a change to the earliest start also moves the range.
 */
async function expectOnColumn(page: Page, item: Locator, iso: string) {
  const column = page.locator(`[data-testid=header-unit][data-tier=bottom][data-key="${iso}"]`);
  const isMilestone = (await item.getAttribute("data-testid")) === "milestone";
  await expect
    .poll(async () => {
      const [c, b] = [await box(column), await box(item)];
      return isMilestone ? b.x + b.width / 2 - (c.x + c.width / 2) : b.x - c.x;
    })
    .toBeCloseTo(0, 0);
}

async function expectDates(item: Locator, start: string, end: string) {
  await expect(item).toHaveAttribute("data-start", start);
  await expect(item).toHaveAttribute("data-end", end);
}

test("AC17: dragging a free bar 2 columns right moves both dates 2 days and persists", async ({
  page,
}) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Free", start: "2026-10-05", duration: 3 }],
  });
  const free = bar(page, taskIds.Free as number);
  await expectDates(free, "2026-10-05", "2026-10-07");
  const before = await box(free);

  const response = await drag(page, free, 2 * DAY, "body", async () => {
    // While held, the bar is drawn at the proposed dates: moved 2 columns, same width.
    const held = await box(free);
    expect(held.x - before.x).toBeCloseTo(2 * DAY, 0);
    expect(held.width).toBeCloseTo(before.width, 0);
  });
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ start: "2026-10-07" });

  await expectDates(free, "2026-10-07", "2026-10-09");
  expect((await box(free)).width).toBeCloseTo(3 * DAY, 0);
  await expectOnColumn(page, free, "2026-10-07");

  await page.reload();
  await expectDates(bar(page, taskIds.Free as number), "2026-10-07", "2026-10-09");
});

test("AC17: a drop snaps to whole days (+47px is +1 day)", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Free", start: "2026-10-05", duration: 3 }],
  });
  const free = bar(page, taskIds.Free as number);
  const before = await box(free);

  await drag(page, free, 47, "body", async () => {
    // Snapped while held too: exactly one column, never 47px.
    expect((await box(free)).x - before.x).toBeCloseTo(DAY, 0);
  });
  await expectDates(free, "2026-10-06", "2026-10-08");
  await expectOnColumn(page, free, "2026-10-06");
});

test("AC18: the right edge resizes the end and keeps the start", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Build", start: "2026-10-05", duration: 3 }],
  });
  const build = bar(page, taskIds.Build as number);
  const response = await drag(page, build, DAY, "end");
  expect(response.request().postDataJSON()).toEqual({ end: "2026-10-08" });
  await expectDates(build, "2026-10-05", "2026-10-08");
  expect((await box(build)).width).toBeCloseTo(4 * DAY, 0);

  await page.reload();
  await expectDates(bar(page, taskIds.Build as number), "2026-10-05", "2026-10-08");
});

test("AC18: the left edge resizes the start and keeps the end", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Build", start: "2026-10-05", duration: 3 }],
  });
  const build = bar(page, taskIds.Build as number);
  const response = await drag(page, build, DAY, "start");
  expect(response.request().postDataJSON()).toEqual({ start: "2026-10-06", end: "2026-10-07" });
  await expectDates(build, "2026-10-06", "2026-10-07");
  expect((await box(build)).width).toBeCloseTo(2 * DAY, 0);
});

test("AC18: a resize cannot take the duration below 1", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Left", start: "2026-10-05", duration: 3 },
      { name: "Right", start: "2026-10-05", duration: 3 },
    ],
  });
  const left = bar(page, taskIds.Left as number);
  await drag(page, left, 6 * DAY, "start", async () => {
    expect((await box(left)).width).toBeCloseTo(DAY, 0);
  });
  await expectDates(left, "2026-10-07", "2026-10-07");

  const right = bar(page, taskIds.Right as number);
  await drag(page, right, -6 * DAY, "end", async () => {
    expect((await box(right)).width).toBeCloseTo(DAY, 0);
  });
  await expectDates(right, "2026-10-05", "2026-10-05");
});

test("AC7: a milestone has no resize handles and dragging it moves its date", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Build", start: "2026-10-05", duration: 3 },
      { name: "Go live", start: "2026-10-09", is_milestone: true },
    ],
  });
  const diamond = milestone(page, taskIds["Go live"] as number);
  await expect(diamond.getByTestId("bar-handle-start")).toHaveCount(0);
  await expect(diamond.getByTestId("bar-handle-end")).toHaveCount(0);
  await expect(bar(page, taskIds.Build as number).getByTestId("bar-handle-start")).toHaveCount(1);
  await expect(bar(page, taskIds.Build as number).getByTestId("bar-handle-end")).toHaveCount(1);

  const before = await box(diamond);
  const response = await drag(page, diamond, 2 * DAY, "body", async () => {
    expect((await box(diamond)).x - before.x).toBeCloseTo(2 * DAY, 0);
  });
  expect(response.request().postDataJSON()).toEqual({ start: "2026-10-11" });
  await expectDates(diamond, "2026-10-11", "2026-10-11");
  await page.reload();
  await expectDates(milestone(page, taskIds["Go live"] as number), "2026-10-11", "2026-10-11");
});

const AC28: SeedFixture = {
  name: "Clamp",
  tasks: [
    { name: "A", start: "2026-10-05", duration: 3 },
    { name: "B", start: "2026-10-08", duration: 2 },
  ],
  deps: [["A", "B"]],
};

test("AC28: dragging B 2 days early settles on its earliest allowed day", async ({ page }) => {
  const { taskIds } = await openSeeded(page, AC28);
  const b = bar(page, taskIds.B as number);
  const before = await box(b);
  const response = await drag(page, b, -2 * DAY, "body", async () => {
    // Drawn at the proposal (10-06) while held...
    expect((await box(b)).x - before.x).toBeCloseTo(-2 * DAY, 0);
  });
  expect(response.request().postDataJSON()).toEqual({ start: "2026-10-06" });
  // ...then settles back on 10-08, keeping its duration.
  await expectDates(b, "2026-10-08", "2026-10-09");
  await expectOnColumn(page, b, "2026-10-08");
  expect((await box(b)).width).toBeCloseTo(2 * DAY, 0);
});

test("AC28: dragging B's left edge to 10-06 settles on 10-08 and keeps the end", async ({
  page,
}) => {
  const { taskIds } = await openSeeded(page, AC28);
  const b = bar(page, taskIds.B as number);
  const before = await box(b);
  const response = await drag(page, b, -2 * DAY, "start", async () => {
    // Drawn at the proposal while held: the left edge 2 columns earlier, the right edge fixed.
    const held = await box(b);
    expect(held.x - before.x).toBeCloseTo(-2 * DAY, 0);
    expect(held.width).toBeCloseTo(4 * DAY, 0);
  });
  expect(response.request().postDataJSON()).toEqual({ start: "2026-10-06", end: "2026-10-09" });
  await expectDates(b, "2026-10-08", "2026-10-09");
  await expect.poll(async () => (await box(b)).width).toBeCloseTo(2 * DAY, 0);
  await expectOnColumn(page, b, "2026-10-08");
});

test("AC39: dragging milestone M to 10-08 settles on 10-09, the day A ends", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Milestone",
    tasks: [
      { name: "A", start: "2026-10-05", duration: 5 },
      { name: "M", start: "2026-10-09", is_milestone: true },
      { name: "C", start: "2026-10-10", duration: 2 },
    ],
    deps: [
      ["A", "M"],
      ["M", "C"],
    ],
  });
  const m = milestone(page, taskIds.M as number);
  const before = await box(m);
  const response = await drag(page, m, -DAY, "body", async () => {
    expect((await box(m)).x - before.x).toBeCloseTo(-DAY, 0);
  });
  expect(response.request().postDataJSON()).toEqual({ start: "2026-10-08" });
  await expectDates(m, "2026-10-09", "2026-10-09");
  await expectOnColumn(page, m, "2026-10-09");
  await expectDates(bar(page, taskIds.C as number), "2026-10-10", "2026-10-11");
});

const AC12: SeedFixture = {
  name: "Cascade",
  tasks: [
    { name: "A", start: "2026-10-05", duration: 3 },
    { name: "B", start: "2026-10-08", duration: 2 },
    { name: "C", start: "2026-10-10", duration: 1 },
  ],
  deps: [
    ["A", "B"],
    ["B", "C"],
  ],
};

async function expectCascaded(page: Page, taskIds: Record<string, number>, aStart: string) {
  await expectDates(bar(page, taskIds.A as number), aStart, "2026-10-09");
  await expectDates(bar(page, taskIds.B as number), "2026-10-10", "2026-10-11");
  await expectDates(bar(page, taskIds.C as number), "2026-10-12", "2026-10-12");
}

for (const [how, grip, aStart] of [
  ["a right-edge resize", "end", "2026-10-05"],
  ["a move-drag", "body", "2026-10-07"],
] as const) {
  test(`AC12, AC16: ${how} of A by 2 days cascades to B and C without a reload`, async ({
    page,
  }) => {
    const { taskIds } = await openSeeded(page, AC12);
    await expect(page.getByTestId("project-end")).toContainText("2026-10-10");

    const response = await drag(page, bar(page, taskIds.A as number), 2 * DAY, grip);
    expect(response.status()).toBe(200);
    await expectCascaded(page, taskIds, aStart);
    await expect(page.getByTestId("project-end")).toContainText("2026-10-12");

    await page.reload();
    await expectCascaded(page, taskIds, aStart);
    await expect(page.getByTestId("project-end")).toContainText("2026-10-12");
  });
}

for (const zoom of ["week", "month"] as const) {
  test(`AC19: in ${zoom} zoom a drag of 3 days' width moves exactly 3 days`, async ({ page }) => {
    const { taskIds } = await openSeeded(page, {
      name: "Zoom",
      tasks: [{ name: "Long", start: "2026-10-05", duration: 10 }],
    });
    await page.getByTestId(`zoom-${zoom}`).click();
    await expect(page.getByTestId("chart")).toHaveAttribute("data-zoom", zoom);
    const long = bar(page, taskIds.Long as number);
    const response = await drag(page, long, 3 * PX_PER_DAY[zoom]);
    expect(response.request().postDataJSON()).toEqual({ start: "2026-10-08" });
    await expectDates(long, "2026-10-08", "2026-10-17");
  });
}

test("a press that moves under 3px is a click: nothing is sent", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Click",
    tasks: [{ name: "Free", start: "2026-10-05", duration: 3 }],
  });
  const patches: string[] = [];
  page.on("request", (r) => {
    if (isTaskPatch(r.url(), r.method())) {
      patches.push(r.url());
    }
  });
  const free = bar(page, taskIds.Free as number);
  const from = await gripPoint(free, "body");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 2, from.y, { steps: 2 });
  await page.mouse.up();
  // A drag that returns to where it started changes nothing either.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3 * DAY, from.y, { steps: 4 });
  await page.mouse.move(from.x, from.y, { steps: 4 });
  await page.mouse.up();
  // Give any stray request time to show up before asserting none was sent.
  await page.request.get("/health");
  await expectDates(free, "2026-10-05", "2026-10-07");
  expect(patches).toEqual([]);
});

test("a rejected drag snaps back and shows the server's message", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2099-12-01T12:00:00"));
  const { taskIds } = await openSeeded(page, {
    name: "Edge",
    tasks: [{ name: "Last", start: "2099-12-28", duration: 2 }],
  });
  const last = bar(page, taskIds.Last as number);
  const before = await box(last);
  const response = await drag(page, last, 3 * DAY, "body", async () => {
    expect((await box(last)).x - before.x).toBeCloseTo(3 * DAY, 0);
  });
  expect(response.status()).toBe(422);
  await expect(page.getByTestId("error-message")).toBeVisible();
  await expectDates(last, "2099-12-28", "2099-12-29");
  await expectOnColumn(page, last, "2099-12-28");
});

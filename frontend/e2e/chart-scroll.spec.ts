// Moving the earliest task moves the timeline's start (AC43: the range starts 30 days before the
// earliest task), which shifts every date's x. The scroller must follow, so the dates on screen
// stay where they were and only the moved bar moves, by exactly its days * PX_PER_DAY.
import type { Locator, Page } from "@playwright/test";
import { TASK_PANEL_WIDTH } from "../src/layout.ts";
import { PX_PER_DAY, type Zoom } from "../src/timeline/scale.ts";
import { expect, test } from "./fixtures.ts";
import { resetDb, seedProject } from "./helpers/api.ts";

const TODAY = "2026-10-01";

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
});

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (b === null) {
    throw new Error("element has no bounding box");
  }
  return b;
}

/** A screen x well inside the visible timeline (right of the sticky task panel). */
async function probeX(page: Page): Promise<number> {
  const scroller = await box(page.getByTestId("timeline-scroller"));
  return Math.round(scroller.x + TASK_PANEL_WIDTH + 200);
}

/** The data-key of the bottom-tier header unit drawn under screen x `x`. */
async function headerKeyAt(page: Page, x: number): Promise<string | null> {
  return page.evaluate((screenX) => {
    const units = document.querySelectorAll<HTMLElement>(
      "[data-testid=header-unit][data-tier=bottom]",
    );
    for (const unit of units) {
      const r = unit.getBoundingClientRect();
      if (r.left <= screenX && screenX < r.right) {
        return unit.dataset.key ?? null;
      }
    }
    return null;
  }, x);
}

/** Moves `item` by `days` with a real mouse drag and waits for the PATCH response. */
async function dragDays(page: Page, item: Locator, days: number, zoom: Zoom) {
  const b = await box(item);
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + days * PX_PER_DAY[zoom], from.y, { steps: 8 });
  const patched = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/api\/tasks\/\d+$/.test(r.url()),
  );
  await page.mouse.up();
  expect((await patched).status()).toBe(200);
}

for (const [zoom, moves] of [
  ["day", [1, 3, -2]],
  ["week", [7, -14]],
] as const) {
  test(`in ${zoom} zoom, moving the earliest task keeps the visible dates in place`, async ({
    page,
  }) => {
    const seeded = await seedProject(page.request, {
      name: "Scroll",
      tasks: [
        { name: "Early", start: "2026-10-05", duration: 3 },
        { name: "Later", start: "2026-10-20", duration: 2 },
      ],
    });
    await page.goto(`/#/projects/${seeded.projectId}`);
    const chart = page.getByTestId("chart");
    await expect(chart).toBeVisible();
    if (zoom !== "day") {
      await page.getByTestId(`zoom-${zoom}`).click();
      await expect(chart).toHaveAttribute("data-zoom", zoom);
    }
    const early = page.locator(`[data-testid=bar][data-task-id="${seeded.taskIds.Early}"]`);
    const later = page.locator(`[data-testid=bar][data-task-id="${seeded.taskIds.Later}"]`);
    const x = await probeX(page);

    for (const days of moves) {
      const rangeStart = await chart.getAttribute("data-range-start");
      const keyBefore = await headerKeyAt(page, x);
      const startBefore = await early.getAttribute("data-start");
      const earlyBefore = await box(early);
      const laterBefore = await box(later);

      await dragDays(page, early, days, zoom);
      // The drop moved the earliest start, so the range start moved too.
      await expect(early).not.toHaveAttribute("data-start", startBefore ?? "");
      await expect(chart).not.toHaveAttribute("data-range-start", rangeStart ?? "");

      // The moved bar is exactly `days` columns along on screen; the other bar did not move.
      await expect
        .poll(async () => (await box(early)).x - earlyBefore.x)
        .toBeCloseTo(days * PX_PER_DAY[zoom], 0);
      expect((await box(later)).x - laterBefore.x).toBeCloseTo(0, 0);
      // The same date is still under the same screen x.
      expect(keyBefore).not.toBeNull();
      expect(await headerKeyAt(page, x)).toBe(keyBefore);
    }
  });
}

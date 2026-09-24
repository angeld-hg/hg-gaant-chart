// Performance budgets (AC25) on a 200-task, 250-link project (helpers/bigProject.ts):
// - within 2 s of navigating, every bar, diamond and arrow is on the page and a drag is accepted;
// - after a drag release that cascades, the cascaded dates and the new critical highlight are in
//   the DOM within 200 ms. That is measured in the page (performance.now at pointerup, then a
//   MutationObserver), so Playwright's polling interval never counts against the budget. Under
//   page.clock.setFixedTime, performance.now still follows real time, in whole milliseconds.
import type { Browser, Locator, Page } from "@playwright/test";
import type { ProjectDetail } from "../src/api/types.ts";
import { TASK_PANEL_WIDTH } from "../src/layout.ts";
import { PX_PER_DAY } from "../src/timeline/scale.ts";
import { expect, test } from "./fixtures.ts";
import { resetDb } from "./helpers/api.ts";
import {
  BIG_DEPENDENCIES,
  BIG_TASKS,
  type BigProjectDoc,
  buildBigProject,
} from "./helpers/bigProject.ts";

const TODAY = "2026-10-01";
const LOAD_BUDGET_MS = 2000;
const SETTLE_BUDGET_MS = 200;

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
});

const bar = (page: Page, id: number) => page.locator(`[data-testid=bar][data-task-id="${id}"]`);

function isTaskPatch(url: string, method: string): boolean {
  return method === "PATCH" && /\/api\/tasks\/\d+$/.test(url);
}

/**
 * Scrolls the timeline so `item` sits in the middle rows, a little right of the sticky task
 * panel, with room on its right for a drag.
 */
async function bringIntoView(item: Locator): Promise<void> {
  await item.evaluate((el, panelWidth) => {
    const scroller = el.closest<HTMLElement>("[data-testid=timeline-scroller]");
    if (scroller === null) {
      throw new Error("bar is not inside the timeline scroller");
    }
    const s = scroller.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    scroller.scrollLeft += b.left - (s.left + panelWidth + 120);
    scroller.scrollTop += b.top + b.height / 2 - (s.top + s.height / 2);
  }, TASK_PANEL_WIDTH);
}

/** Presses the middle of a bar, moves `dx` px in steps, releases, and waits for the PATCH. */
async function drag(page: Page, item: Locator, dx: number) {
  await bringIntoView(item);
  const b = await item.boundingBox();
  if (b === null) {
    throw new Error("bar has no bounding box");
  }
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 8 });
  const patched = page.waitForResponse((r) => isTaskPatch(r.url(), r.request().method()));
  await page.mouse.up();
  return patched;
}

/**
 * A task that a 1-day move can't cascade from or put on the critical path: not a milestone, has
 * predecessors (so it is not the earliest start), has no successors, and ends at least 2 days
 * before the project end. It also stays clear of the AC25 drag's tasks.
 */
function warmUpKey(doc: BigProjectDoc, avoid: string[]): string {
  const withSuccessors = new Set(doc.tasks.flatMap((t) => t.predecessors));
  const projectEnd = doc.tasks.map((t) => t.end).reduce((a, b) => (a > b ? a : b));
  const lastSafeEnd = new Date(`${projectEnd}T00:00:00Z`);
  lastSafeEnd.setUTCDate(lastSafeEnd.getUTCDate() - 2);
  const limit = lastSafeEnd.toISOString().slice(0, 10);
  const found = doc.tasks.find(
    (t) =>
      !t.milestone &&
      t.predecessors.length > 0 &&
      !withSuccessors.has(t.key) &&
      t.end <= limit &&
      !avoid.includes(t.key),
  );
  if (found === undefined) {
    throw new Error("bigProject has no task that is safe to warm up with");
  }
  return found.key;
}

/**
 * Opens the app once in a separate, throwaway browser context. A freshly started Vite dev server
 * transforms every module on first request, which can take over a second; that is a cost of the
 * test harness, not of the app. The separate context shares no cache or storage with `page`.
 */
async function warmDevServer(browser: Browser, projectId: number): Promise<void> {
  const context = await browser.newContext();
  try {
    const warm = await context.newPage();
    await warm.goto(`/#/projects/${projectId}`);
    await expect(warm.getByTestId("chart")).toBeVisible();
  } finally {
    await context.close();
  }
}

test("AC25: a 200-task project loads, takes a drag within 2 s, and settles a cascade within 200 ms", async ({
  browser,
  page,
  request,
}) => {
  const { doc, drag: planned } = buildBigProject();
  const imported = await request.post("/api/import", { data: doc });
  expect(imported.status(), await imported.text()).toBe(201);
  const project = (await imported.json()) as ProjectDetail;
  // Tasks are created in file order, so the response's tasks (in id order) line up with the file.
  const idOf = (key: string) => {
    const index = doc.tasks.findIndex((t) => t.key === key);
    const id = project.tasks[index]?.id;
    if (id === undefined) {
      throw new Error(`no imported task for key ${key}`);
    }
    return id;
  };
  const taskId = idOf(planned.taskKey);
  const cascadedId = idOf(planned.cascadedKey);
  const warmUpId = idOf(warmUpKey(doc, [planned.taskKey, planned.cascadedKey]));

  await warmDevServer(browser, project.id);

  // Budget 1: everything drawn and one drag accepted within 2 s of navigating.
  const t0 = Date.now();
  await page.goto(`/#/projects/${project.id}`);
  await expect(page.locator("[data-testid=bar],[data-testid=milestone]")).toHaveCount(BIG_TASKS, {
    timeout: LOAD_BUDGET_MS,
  });
  await expect(page.getByTestId("arrow")).toHaveCount(BIG_DEPENDENCIES, {
    timeout: LOAD_BUDGET_MS,
  });
  const warmUp = await drag(page, bar(page, warmUpId), PX_PER_DAY.day);
  const loadedAndAccepted = Date.now() - t0;
  expect(warmUp.status()).toBe(200);
  console.log(`AC25 load + drag accepted: ${loadedAndAccepted} ms`);
  expect(loadedAndAccepted).toBeLessThan(LOAD_BUDGET_MS);

  // Budget 2: the cascade and the new critical highlight within 200 ms of release.
  const moved = bar(page, taskId);
  // Guard: the fixture really moves this task onto the critical path.
  await expect(moved).not.toHaveClass(/\bcritical\b/);
  await page.evaluate(
    ({ taskId, cascadedId, limitMs }) => {
      const barOf = (id: number) =>
        document.querySelector(`[data-testid=bar][data-task-id="${id}"]`);
      const cascadedStart = barOf(cascadedId)?.getAttribute("data-start") ?? null;
      const chart = document.querySelector("[data-testid=chart]");
      if (chart === null || cascadedStart === null) {
        throw new Error("chart or cascaded bar is missing");
      }
      const seen = () => ({
        cascaded: barOf(cascadedId)?.getAttribute("data-start") !== cascadedStart,
        critical: barOf(taskId)?.classList.contains("critical") ?? false,
      });
      const holder = window as unknown as { __ac25Settle?: Promise<number> };
      holder.__ac25Settle = new Promise<number>((resolve, reject) => {
        let releasedAt: number | null = null;
        let timer: number | undefined;
        const observer = new MutationObserver(() => {
          if (releasedAt === null) {
            return;
          }
          const now = seen();
          if (now.cascaded && now.critical) {
            const elapsed = performance.now() - releasedAt;
            observer.disconnect();
            window.clearTimeout(timer);
            resolve(elapsed);
          }
        });
        observer.observe(chart, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-start", "class"],
        });
        document.addEventListener(
          "pointerup",
          () => {
            releasedAt = performance.now();
            timer = window.setTimeout(() => {
              observer.disconnect();
              const now = seen();
              const missing = [
                now.cascaded ? null : `task ${cascadedId}'s data-start did not change`,
                now.critical ? null : `task ${taskId} did not gain class "critical"`,
              ].filter(Boolean);
              reject(new Error(`after ${limitMs} ms: ${missing.join("; ")}`));
            }, limitMs);
          },
          { capture: true, once: true },
        );
      });
    },
    { taskId, cascadedId, limitMs: LOAD_BUDGET_MS },
  );

  const response = await drag(page, moved, planned.deltaDays * PX_PER_DAY.day);
  expect(response.status()).toBe(200);
  const settledMs = await page.evaluate(
    () => (window as unknown as { __ac25Settle: Promise<number> }).__ac25Settle,
  );
  console.log(`AC25 release -> cascade and critical shown: ${settledMs.toFixed(1)} ms`);
  expect(settledMs).toBeLessThan(SETTLE_BUDGET_MS);
});

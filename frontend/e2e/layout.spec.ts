// The 1280x800 layout (AC37): toolbar, task list and chart all fit with no page-level horizontal
// scroll, long names are cut with an ellipsis and shown in full on hover, and no text overlaps.
// Also: the task editor and roster drawers share the right edge, so only one is open at a time.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { resetDb, type SeedFixture, seedProject } from "./helpers/api.ts";

const TODAY = "2026-10-01";
const VIEWPORT = { width: 1280, height: 800 };

/** A realistic 100-character name (the AC40 maximum), unique per prefix. */
function longName(prefix: string): string {
  const phrase = `${prefix} quarterly platform migration and customer onboarding programme `;
  const words = phrase.repeat(3);
  // 99 characters of words plus a final letter, so trimming never shortens it.
  return `${words.slice(0, 99)}Z`;
}

const PROJECT = longName("Project");
const TASK = longName("Task");
const MILESTONE = longName("Milestone");
const PERSON = longName("Person");

test.use({ viewport: VIEWPORT });

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

/** A long-named project with a long-named person, task and milestone, plus a long timeline. */
const LONG_FIXTURE: SeedFixture = {
  name: PROJECT,
  people: [{ name: PERSON }],
  tasks: [
    { name: TASK, start: "2026-10-05", duration: 3, assignee: PERSON },
    { name: MILESTONE, start: "2026-10-12", is_milestone: true },
    { name: "Short", start: "2026-10-05", duration: 2 },
    { name: "Long tail", start: "2026-11-02", duration: 120 },
  ],
  deps: [[TASK, MILESTONE]],
};

async function pageScroll(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
    };
  });
}

async function expectNoPageScroll(page: Page) {
  const s = await pageScroll(page);
  expect(s.scrollWidth, "page scrollWidth").toBeLessThanOrEqual(s.clientWidth);
  expect(s.bodyScrollWidth, "body scrollWidth").toBeLessThanOrEqual(s.clientWidth);
  expect(s.scrollHeight, "page scrollHeight").toBeLessThanOrEqual(s.clientHeight);
}

/** Asserts the element is fully inside the viewport and has a non-empty box. */
async function expectInViewport(locator: Locator, what: string) {
  await expect(locator, what).toBeVisible();
  // Drawers slide in; measure where they settle, not a mid-animation frame.
  await locator.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = await locator.boundingBox();
  expect(box, `${what} box`).not.toBeNull();
  if (box === null) return;
  expect(box.width, `${what} width`).toBeGreaterThan(0);
  expect(box.height, `${what} height`).toBeGreaterThan(0);
  expect(box.x, `${what} left`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${what} top`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(VIEWPORT.width + 0.5);
  expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(VIEWPORT.height + 0.5);
}

/**
 * The element holding `name` is cut with an ellipsis: it (or the nearest ancestor with
 * `text-overflow: ellipsis`) overflows, and some element on that path carries the full text as
 * its `title`, so hovering shows it in full.
 */
async function expectEllipsised(locator: Locator, name: string, what: string) {
  await expect(locator, what).toBeVisible();
  const info = await locator.evaluate((el) => {
    let node: Element | null = el;
    while (node !== null && getComputedStyle(node).textOverflow !== "ellipsis") {
      node = node.parentElement;
    }
    if (node === null) return null;
    const style = getComputedStyle(node);
    const titled = el.closest("[title]");
    return {
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflow: style.overflowX,
      whiteSpace: style.whiteSpace,
      title: el.getAttribute("title") ?? titled?.getAttribute("title") ?? null,
    };
  });
  expect(info, `${what} has text-overflow: ellipsis`).not.toBeNull();
  if (info === null) return;
  expect(info.overflow, `${what} overflow`).not.toBe("visible");
  expect(info.whiteSpace, `${what} white-space`).toMatch(/nowrap|pre/);
  expect(info.scrollWidth, `${what} is cut`).toBeGreaterThan(info.clientWidth);
  expect(info.title, `${what} title`).toBe(name);
}

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  // A shared edge (touching) is not an overlap; allow half a pixel for subpixel layout.
  const eps = 0.5;
  return (
    a.x + eps < b.x + b.width &&
    b.x + eps < a.x + a.width &&
    a.y + eps < b.y + b.height &&
    b.y + eps < a.y + a.height
  );
}

/** Every pair of the given visible text elements has disjoint bounding boxes. */
async function expectNoOverlap(items: [string, Locator][]) {
  const boxes: [string, Box][] = [];
  for (const [what, locator] of items) {
    await expect(locator, what).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${what} box`).not.toBeNull();
    if (box !== null) boxes.push([what, box]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [wa, a] = boxes[i] as [string, Box];
      const [wb, b] = boxes[j] as [string, Box];
      expect(
        intersects(a, b),
        `${wa} ${JSON.stringify(a)} overlaps ${wb} ${JSON.stringify(b)}`,
      ).toBe(false);
    }
  }
}

const taskRow = (page: Page, name: string) =>
  page.getByTestId("task-row").filter({ has: page.locator(`[title="${name}"]`) });

test("AC37: at 1280x800 the toolbar, task list and chart fit with no page scroll", async ({
  page,
}) => {
  await openSeeded(page, LONG_FIXTURE);

  await expectInViewport(page.locator(".toolbar"), "toolbar");
  await expectInViewport(page.locator(".sidebar"), "sidebar");
  await expectInViewport(page.getByTestId("timeline-scroller"), "timeline scroller");
  await expectInViewport(page.getByTestId("task-panel-header"), "task panel header");
  await expectInViewport(page.getByTestId("task-row").first(), "first task row");
  for (const id of ["zoom-day", "zoom-week", "zoom-month", "roster-button"]) {
    await expectInViewport(page.getByTestId(id), id);
  }

  // The chart itself is visible beside the task panel: part of it lies inside the viewport.
  const chart = page.getByTestId("chart");
  await expect(chart).toBeVisible();
  const scroller = await page.getByTestId("timeline-scroller").boundingBox();
  const panel = await page.getByTestId("task-panel-header").boundingBox();
  expect(scroller).not.toBeNull();
  expect(panel).not.toBeNull();
  if (scroller && panel) {
    // At least 400px of timeline shows to the right of the task list.
    expect(scroller.x + scroller.width - (panel.x + panel.width)).toBeGreaterThanOrEqual(400);
  }
  await expect(page.locator("[data-testid=bar]").first()).toBeInViewport();

  // The page never scrolls sideways; the long timeline scrolls inside its own area instead.
  await expectNoPageScroll(page);
  const inner = await page
    .getByTestId("timeline-scroller")
    .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(inner.scrollWidth).toBeGreaterThan(inner.clientWidth);

  for (const zoom of ["zoom-week", "zoom-month", "zoom-day"]) {
    await page.getByTestId(zoom).click();
    await expect(page.getByTestId(zoom)).toHaveAttribute("aria-pressed", "true");
    await expectNoPageScroll(page);
  }

  // Each drawer keeps the frame too.
  await page.getByTestId("roster-button").click();
  await expectInViewport(page.getByTestId("roster-panel"), "roster panel");
  await expectNoPageScroll(page);
  await page.getByTestId("roster-close").click();
  await taskRow(page, TASK).click();
  await expectInViewport(page.getByTestId("task-editor"), "task editor");
  await expectNoPageScroll(page);
});

test("AC37: long project, task and person names are cut with an ellipsis and never overlap", async ({
  page,
}) => {
  const { projectId } = await openSeeded(page, LONG_FIXTURE);

  // Sidebar project item.
  const item = page.locator(`[data-testid=project-item][data-project-id="${projectId}"]`);
  const projectName = item.locator(".project-name");
  await expectEllipsised(projectName, PROJECT, "sidebar project name");
  await expectNoOverlap([
    ["sidebar project name", projectName],
    ["sidebar task count", item.locator(".project-count")],
  ]);

  // Toolbar title.
  const toolbarName = page.locator(".toolbar-project");
  await expectEllipsised(toolbarName, PROJECT, "toolbar project name");
  await expectNoOverlap([
    ["toolbar project name", toolbarName],
    ["toolbar meta", page.locator(".toolbar-meta")],
    ["zoom day", page.getByTestId("zoom-day")],
    ["zoom week", page.getByTestId("zoom-week")],
    ["zoom month", page.getByTestId("zoom-month")],
    ["roster button", page.getByTestId("roster-button")],
  ]);

  // Task list rows.
  for (const [name, what] of [
    [TASK, "task row name"],
    [MILESTONE, "milestone row name"],
  ] as const) {
    const row = taskRow(page, name);
    const rowName = row.getByTestId("task-row-name");
    await expectEllipsised(rowName, name, what);
    await expectNoOverlap([
      [what, rowName],
      [`${what} start`, row.getByTestId("task-row-start")],
      [`${what} end`, row.getByTestId("task-row-end")],
      [`${what} days`, row.getByTestId("task-row-days")],
    ]);
  }

  // Chart labels: the task label and the milestone label have the full name on hover and do not
  // run into each other or into the task list.
  const barLabel = page.locator("[data-testid=bar-label]", { hasText: "Task quarterly" });
  const milestoneLabel = page.getByTestId("milestone-label");
  await expect(barLabel).toHaveAttribute("title", TASK);
  await expect(milestoneLabel).toHaveAttribute("title", MILESTONE);
  await expectEllipsised(barLabel, TASK, "bar label");
  await expectEllipsised(milestoneLabel, MILESTONE, "milestone label");
  await expectNoOverlap([
    ["bar label", barLabel],
    ["milestone label", milestoneLabel],
    ["task row name", taskRow(page, TASK).getByTestId("task-row-name")],
    ["milestone row name", taskRow(page, MILESTONE).getByTestId("task-row-name")],
  ]);

  // Roster row.
  await page.getByTestId("roster-button").click();
  const personRow = page.getByTestId("person-row").first();
  const personName = personRow.locator(".person-name");
  await expectEllipsised(personName, PERSON, "person name");
  await expectNoOverlap([
    ["person colour", personRow.getByTestId("person-colour")],
    ["person name", personName],
    ["person count", personRow.locator(".person-count")],
    ["roster title", page.locator(".roster-title")],
  ]);
  await page.getByTestId("roster-close").click();

  // Task editor title and the assignee shown there.
  await taskRow(page, TASK).click();
  const editor = page.getByTestId("task-editor");
  const editorTitle = editor.locator(".task-editor-title");
  await expectEllipsised(editorTitle, TASK, "editor title");
  await expectNoOverlap([
    ["editor title", editorTitle],
    ["editor close", editor.getByTestId("task-editor-close")],
  ]);
  await expectNoPageScroll(page);
});

test("the task editor and the roster never overlap: opening one closes the other", async ({
  page,
}) => {
  await openSeeded(page, LONG_FIXTURE);
  const editor = page.getByTestId("task-editor");
  const roster = page.getByTestId("roster-panel");
  const rosterButton = page.getByTestId("roster-button");

  // Editor open, then People: the roster replaces the editor.
  await taskRow(page, TASK).click();
  await expect(editor).toBeVisible();
  await rosterButton.click();
  await expect(roster).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(rosterButton).toHaveAttribute("aria-pressed", "true");

  // Roster open, then a task row: the editor replaces the roster.
  await taskRow(page, "Short").click();
  await expect(editor).toBeVisible();
  await expect(roster).toHaveCount(0);
  await expect(rosterButton).toHaveAttribute("aria-pressed", "false");

  // The same holds for the new-task draft.
  await rosterButton.click();
  await expect(roster).toBeVisible();
  await page.getByTestId("add-task-button").click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-task-id", "new");
  await expect(roster).toHaveCount(0);

  // Closing the roster does not reopen the editor, and vice versa.
  await rosterButton.click();
  await page.getByTestId("roster-close").click();
  await expect(roster).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await expectNoPageScroll(page);
});

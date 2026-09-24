// S13 (AC26): one end-to-end demo path through the UI only. Create a project, add tasks, manage
// the roster, assign, drag, resize, zoom, delete (with confirmation), export and import. The auto
// console fixture in fixtures.ts fails the test if any step logs a browser console error.
import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import type { ProjectDetail, ProjectSummary } from "../src/api/types.ts";
import { PX_PER_DAY } from "../src/timeline/scale.ts";
import { expect, test } from "./fixtures.ts";
import { resetDb } from "./helpers/api.ts";

const TODAY = "2026-10-01";
const DAY = PX_PER_DAY.day;

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
});

const editor = (page: Page) => page.getByTestId("task-editor");
const rows = (page: Page) => page.getByTestId("task-row");
const row = (page: Page, id: number) =>
  page.locator(`[data-testid=task-row][data-task-id="${id}"]`);
const bar = (page: Page, id: number) => page.locator(`[data-testid=bar][data-task-id="${id}"]`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (b === null) {
    throw new Error("element has no bounding box");
  }
  return b;
}

async function addTaskViaUi(page: Page, name: string, start: string, duration: number) {
  const before = await rows(page).count();
  await page.getByTestId("add-task-button").click();
  await expect(editor(page)).toHaveAttribute("data-task-id", "new");
  await editor(page).getByTestId("task-name").fill(name);
  await editor(page).getByTestId("task-start").fill(start);
  await editor(page).getByTestId("task-duration").fill(String(duration));
  await editor(page).getByTestId("task-create").click();
  await expect(rows(page)).toHaveCount(before + 1);
  const id = Number(await rows(page).nth(before).getAttribute("data-task-id"));
  // The editor moves on to the new task.
  await expect(editor(page)).toHaveAttribute("data-task-id", String(id));
  return id;
}

/** Presses the bar body or an edge handle, moves `dx` px, releases, and waits for the PATCH. */
async function drag(page: Page, item: Locator, dx: number, grip: "body" | "end") {
  const target = grip === "body" ? item : item.getByTestId("bar-handle-end");
  const b = await box(target);
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 8 });
  const patched = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/api\/tasks\/\d+$/.test(r.url()),
  );
  await page.mouse.up();
  const response = await patched;
  expect(response.status()).toBe(200);
}

async function expectDates(page: Page, id: number, start: string, end: string) {
  await expect(bar(page, id)).toHaveAttribute("data-start", start);
  await expect(bar(page, id)).toHaveAttribute("data-end", end);
  await expect(row(page, id)).toHaveAttribute("data-start", start);
  await expect(row(page, id)).toHaveAttribute("data-end", end);
}

async function detail(page: Page, id: number): Promise<ProjectDetail> {
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as ProjectDetail;
}

test("AC26: the full demo path runs without a single browser console error", async ({ page }) => {
  // Load the app with no projects and create one.
  await page.goto("/");
  await expect(page.getByTestId("empty-projects")).toBeVisible();
  await page.getByTestId("new-project-button").click();
  await page.getByTestId("project-name-input").fill("Demo");
  await page.getByTestId("project-submit").click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Demo");
  await expect(page).toHaveURL(/#\/projects\/\d+$/);
  const projectId = Number(/#\/projects\/(\d+)$/.exec(page.url())?.[1]);
  await expect(page.getByTestId("chart")).toBeVisible();

  // Add two tasks.
  const design = await addTaskViaUi(page, "Design", "2026-10-05", 3);
  await expectDates(page, design, "2026-10-05", "2026-10-07");
  const build = await addTaskViaUi(page, "Build", "2026-10-12", 2);
  await expectDates(page, build, "2026-10-12", "2026-10-13");
  await editor(page).getByTestId("task-editor-close").click();
  await expect(editor(page)).toHaveCount(0);

  // Manage the roster: add Ana, then close the drawer.
  await page.getByTestId("roster-button").click();
  await expect(page.getByTestId("roster-panel")).toBeVisible();
  await page.getByTestId("person-name-input").fill("Ana");
  await page.getByTestId("person-add").click();
  await expect(page.getByTestId("person-row")).toHaveCount(1);
  await page.getByTestId("roster-close").click();
  await expect(page.getByTestId("roster-panel")).toHaveCount(0);

  // Assign Ana to Design.
  await row(page, design).click();
  await expect(editor(page)).toHaveAttribute("data-task-id", String(design));
  await editor(page).getByTestId("task-assignee").selectOption({ label: "Ana" });
  await expect(bar(page, design).getByTestId("assignee-tag")).toHaveText("Ana");
  await editor(page).getByTestId("task-editor-close").click();
  await expect(editor(page)).toHaveCount(0);

  // Drag Design 2 days right, then drag its right edge 1 day further.
  await drag(page, bar(page, design), 2 * DAY, "body");
  await expectDates(page, design, "2026-10-07", "2026-10-09");
  await drag(page, bar(page, design), DAY, "end");
  await expectDates(page, design, "2026-10-07", "2026-10-10");

  // Zoom through week and month and back to day; the bar keeps its dates.
  for (const zoom of ["week", "month", "day"]) {
    await page.getByTestId(`zoom-${zoom}`).click();
    await expect(page.getByTestId("chart")).toHaveAttribute("data-zoom", zoom);
    await expect(page.getByTestId(`zoom-${zoom}`)).toHaveAttribute("aria-pressed", "true");
    await expectDates(page, design, "2026-10-07", "2026-10-10");
  }

  // Delete Build: cancel once, then confirm.
  await row(page, build).click();
  await expect(editor(page)).toHaveAttribute("data-task-id", String(build));
  await editor(page).getByTestId("task-delete").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText('Delete task "Build"?');
  await page.getByTestId("confirm-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, build)).toHaveCount(1);
  await editor(page).getByTestId("task-delete").click();
  await page.getByTestId("confirm-ok").click();
  await expect(row(page, build)).toHaveCount(0);
  await expect(bar(page, build)).toHaveCount(0);

  const stored = await detail(page, projectId);
  expect(stored.tasks.map((t) => [t.name, t.start, t.end])).toEqual([
    ["Design", "2026-10-07", "2026-10-10"],
  ]);
  expect(stored.people.map((p) => p.name)).toEqual(["Ana"]);
  expect(stored.tasks[0]?.assignee_id).toBe(stored.people[0]?.id);

  // Export through the toolbar.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("demo.gantt.json");
  const bytes = await readFile(await download.path());
  const doc = JSON.parse(bytes.toString("utf8"));
  expect(doc.project).toEqual({ name: "Demo" });
  expect(doc.people.map((p: { name: string }) => p.name)).toEqual(["Ana"]);
  expect(
    doc.tasks.map((t: { name: string; start: string; end: string; assignee: string | null }) => [
      t.name,
      t.start,
      t.end,
      t.assignee,
    ]),
  ).toEqual([["Design", "2026-10-07", "2026-10-10", doc.people[0].key]]);

  // Import the file back: a second project opens with the same content.
  await page.getByTestId("import-input").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.getByTestId("project-item")).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Demo (2)");
  await expect(rows(page)).toHaveCount(1);
  const imported = Number(await rows(page).first().getAttribute("data-task-id"));
  await expectDates(page, imported, "2026-10-07", "2026-10-10");
  await expect(bar(page, imported).getByTestId("assignee-tag")).toHaveText("Ana");

  const projects = (await (await page.request.get("/api/projects")).json()) as ProjectSummary[];
  expect(projects.map((p) => p.name)).toEqual(["Demo", "Demo (2)"]);
  // The copy holds the same data; only the name got the suffix.
  const reexport = await page.request.get(`/api/projects/${projects[1]?.id}/export`);
  expect(await reexport.json()).toEqual({ ...doc, project: { name: "Demo (2)" } });

  // Delete the original project with confirmation; the copy stays.
  await page
    .locator(`[data-project-id="${projectId}"]`)
    .getByTestId("project-delete-button")
    .click();
  await expect(dialog).toContainText('Delete "Demo" and its 1 task? This cannot be undone.');
  await page.getByTestId("confirm-ok").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("project-item")).toHaveCount(1);
  await expect(page.getByTestId("project-item").first()).toContainText("Demo (2)");
  expect((await page.request.get(`/api/projects/${projectId}`)).status()).toBe(404);
});

import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { createProject, resetDb, seedProject } from "./helpers/api.ts";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

const items = (page: Page) => page.getByTestId("project-item");

async function createViaUi(page: Page, name: string) {
  await page.getByTestId("new-project-button").click();
  await page.getByTestId("project-name-input").fill(name);
  await page.getByTestId("project-submit").click();
}

async function expectProjectNames(page: Page, names: string[]) {
  const request = page.request;
  const response = await request.get("/api/projects");
  const projects = (await response.json()) as { name: string }[];
  expect(projects.map((p) => p.name)).toEqual(names);
}

test("AC35: with no projects the app shows a message and a way to create one", async ({ page }) => {
  await page.goto("/");

  const empty = page.getByTestId("empty-projects");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("No projects yet");
  await expect(items(page)).toHaveCount(0);

  await empty.getByRole("button", { name: "Create a project" }).click();
  await expect(page.getByTestId("project-name-input")).toBeFocused();
  await page.getByTestId("project-name-input").fill("Launch");
  await page.keyboard.press("Enter");

  await expect(items(page)).toHaveCount(1);
  await expect(empty).toHaveCount(0);
});

test("AC1: a created project is listed, opened, and still there after a reload", async ({
  page,
}) => {
  await page.goto("/");

  await createViaUi(page, "  Launch  ");

  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText("Launch");
  await expect(page.getByTestId("timeline-scroller")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch");
  await expect(page).toHaveURL(/#\/projects\/\d+$/);
  await expectProjectNames(page, ["Launch"]);

  await page.reload();

  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText("Launch");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch");
});

test("projects are listed in creation order and the hash picks the open one", async ({
  page,
  request,
}) => {
  await createProject(request, "Zulu");
  const alpha = await createProject(request, "Alpha");
  await createProject(request, "Mike");

  await page.goto(`/#/projects/${alpha.id}`);

  await expect(items(page)).toHaveText([/Zulu/, /Alpha/, /Mike/]);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Alpha");
  await expect(page.locator(`[data-project-id="${alpha.id}"] [aria-current="page"]`)).toBeVisible();

  await items(page)
    .filter({ hasText: "Mike" })
    .getByRole("button", { name: "Mike", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Mike");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Alpha");
});

test("AC34: a name matching another project is rejected with a visible message", async ({
  page,
}) => {
  await page.goto("/");
  await createViaUi(page, "Launch");
  await expect(items(page)).toHaveCount(1);

  await createViaUi(page, "launch");

  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(page.getByTestId("error-message")).toContainText('"Launch" already exists');
  await expect(items(page)).toHaveCount(1);
  await expectProjectNames(page, ["Launch"]);

  // The API gives the same answer.
  const response = await page.request.post("/api/projects", { data: { name: "LAUNCH" } });
  expect(response.status()).toBe(409);
});

test("AC34/AC40: empty and over-long names are rejected and nothing is stored", async ({
  page,
}) => {
  await page.goto("/");

  await createViaUi(page, "   ");
  await expect(page.getByTestId("error-message")).toContainText("must not be empty");
  await expect(items(page)).toHaveCount(0);

  await page.getByTestId("project-name-input").fill("x".repeat(101));
  await page.getByTestId("project-submit").click();
  await expect(page.getByTestId("error-message")).toContainText("at most 100 characters");
  await expect(items(page)).toHaveCount(0);
  await expectProjectNames(page, []);

  // Exactly 100 is fine.
  await page.getByTestId("project-name-input").fill("y".repeat(100));
  await page.getByTestId("project-submit").click();
  await expect(items(page)).toHaveCount(1);
});

test("AC2/AC34: rename works (including a case-only change) and a clash is rejected", async ({
  page,
  request,
}) => {
  const launch = await createProject(request, "Launch");
  await createProject(request, "Other");
  await page.goto(`/#/projects/${launch.id}`);
  const item = page.locator(`[data-project-id="${launch.id}"]`);

  await item.getByTestId("project-rename-button").click();
  await expect(page.getByTestId("project-name-input")).toHaveValue("Launch");
  await page.getByTestId("project-name-input").fill("LAUNCH");
  await page.getByTestId("project-submit").click();

  await expect(item).toContainText("LAUNCH");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("LAUNCH");
  await expectProjectNames(page, ["LAUNCH", "Other"]);

  await item.getByTestId("project-rename-button").click();
  await page.getByTestId("project-name-input").fill("other");
  await page.getByTestId("project-submit").click();
  await expect(page.getByTestId("error-message")).toContainText('"Other" already exists');
  await page.keyboard.press("Escape");
  await expect(item).toContainText("LAUNCH");
  await expectProjectNames(page, ["LAUNCH", "Other"]);

  await page.reload();
  await expect(items(page)).toHaveText([/LAUNCH/, /Other/]);
});

test("AC41: cancelling a project delete changes nothing", async ({ page, request }) => {
  const { projectId } = await seedProject(request, {
    name: "Launch",
    tasks: [
      { name: "Design", start: "2026-10-05", duration: 3 },
      { name: "Build", start: "2026-10-08", duration: 2 },
    ],
  });
  await page.goto("/");

  await page
    .locator(`[data-project-id="${projectId}"]`)
    .getByTestId("project-delete-button")
    .click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-cancel").click();

  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);
  const response = await request.get(`/api/projects/${projectId}`);
  expect(response.status()).toBe(200);
  expect(((await response.json()) as { tasks: unknown[] }).tasks).toHaveLength(2);
});

test("AC2/AC41: a confirmed delete names the task count and removes everything", async ({
  page,
  request,
}) => {
  const { projectId, taskIds } = await seedProject(request, {
    name: "Launch",
    people: [{ name: "Ana" }],
    tasks: [
      { name: "Design", start: "2026-10-05", duration: 3, assignee: "Ana" },
      { name: "Build", start: "2026-10-08", duration: 2 },
    ],
    deps: [["Design", "Build"]],
  });
  const keep = await createProject(request, "Keep");
  await page.goto(`/#/projects/${projectId}`);

  await page
    .locator(`[data-project-id="${projectId}"]`)
    .getByTestId("project-delete-button")
    .click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText('Delete "Launch" and its 2 tasks? This cannot be undone.');
  await page.getByTestId("confirm-ok").click();

  await expect(dialog).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText("Keep");
  // The next project opens in its place.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Keep");
  await expect(page).toHaveURL(new RegExp(`#/projects/${keep.id}$`));

  expect((await request.get(`/api/projects/${projectId}`)).status()).toBe(404);
  expect(
    (await request.patch(`/api/tasks/${taskIds.Design}`, { data: { name: "x" } })).status(),
  ).toBe(404);
});

test("AC41: the delete message uses the singular for one task", async ({ page, request }) => {
  const { projectId } = await seedProject(request, {
    name: "Solo",
    tasks: [{ name: "Only", start: "2026-10-05" }],
  });
  await page.goto("/");

  await page
    .locator(`[data-project-id="${projectId}"]`)
    .getByTestId("project-delete-button")
    .click();

  await expect(page.getByTestId("confirm-dialog")).toContainText(
    'Delete "Solo" and its 1 task? This cannot be undone.',
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);
});

test("the error message can be dismissed", async ({ page }) => {
  await page.goto("/");
  await createViaUi(page, "");
  await expect(page.getByTestId("error-message")).toBeVisible();

  await page.getByRole("button", { name: "Dismiss" }).click();

  await expect(page.getByTestId("error-message")).toHaveCount(0);
});

test("AC37: at 1280x800 the layout fits the window and long names get an ellipsis", async ({
  page,
  request,
}) => {
  const longName = `Quarterly roadmap ${"x".repeat(82)}`;
  const project = await createProject(request, longName);
  await page.goto(`/#/projects/${project.id}`);

  const toolbar = page.getByRole("banner");
  await expect(toolbar).toBeVisible();
  await expect(page.getByTestId("timeline-scroller")).toBeVisible();
  await expect(page.getByTestId("chart")).toBeAttached();
  for (const zoom of ["zoom-day", "zoom-week", "zoom-month", "roster-button"]) {
    await expect(page.getByTestId(zoom)).toBeVisible();
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);

  for (const locator of [
    page.locator(`[data-project-id="${project.id}"] .project-name`),
    page.getByRole("heading", { level: 2 }),
  ]) {
    await expect(locator).toHaveAttribute("title", longName);
    const cut = await locator.evaluate((el) => ({
      overflowing: el.scrollWidth > el.clientWidth,
      ellipsis: getComputedStyle(el).textOverflow,
    }));
    expect(cut).toEqual({ overflowing: true, ellipsis: "ellipsis" });
  }
});

test("zoom buttons show which zoom is active", async ({ page, request }) => {
  const project = await createProject(request, "Launch");
  await page.goto(`/#/projects/${project.id}`);

  await expect(page.getByTestId("zoom-day")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("zoom-month").click();
  await expect(page.getByTestId("zoom-month")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("zoom-day")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("zoom-week")).toHaveAttribute("aria-pressed", "false");
});

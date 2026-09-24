import type { Locator, Page } from "@playwright/test";
import type { Palette, ProjectDetail, Task } from "../src/api/types.ts";
import { expect, test } from "./fixtures.ts";
import { resetDb, type SeedFixture, seedProject } from "./helpers/api.ts";

const TODAY = "2026-10-01";

test.beforeEach(async ({ page, request }) => {
  await resetDb(request);
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
});

// ---------- helpers ----------

async function openSeeded(page: Page, fixture: SeedFixture) {
  const seeded = await seedProject(page.request, fixture);
  await page.goto(`/#/projects/${seeded.projectId}`);
  await expect(page.getByTestId("chart")).toBeVisible();
  return seeded;
}

async function project(page: Page, projectId: number): Promise<ProjectDetail> {
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as ProjectDetail;
}

async function apiTask(page: Page, projectId: number, taskId: number): Promise<Task> {
  const found = (await project(page, projectId)).tasks.find((t) => t.id === taskId);
  if (!found) {
    throw new Error(`task ${taskId} not found`);
  }
  return found;
}

const row = (page: Page, id: number) =>
  page.locator(`[data-testid=task-row][data-task-id="${id}"]`);
const bar = (page: Page, id: number) => page.locator(`[data-testid=bar][data-task-id="${id}"]`);
const milestone = (page: Page, id: number) =>
  page.locator(`[data-testid=milestone][data-task-id="${id}"]`);
const editor = (page: Page) => page.getByTestId("task-editor");

async function openEditor(page: Page, id: number) {
  await row(page, id).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toHaveAttribute("data-task-id", String(id));
}

/** Types into an editor field and commits it with Enter. */
async function commit(page: Page, testId: string, value: string) {
  const input = editor(page).getByTestId(testId);
  await input.fill(value);
  await input.press("Enter");
}

/** The row shows the dates (as text and attributes) and the bar has the same dates. */
async function expectDates(page: Page, id: number, start: string, end: string) {
  const r = row(page, id);
  await expect(r).toHaveAttribute("data-start", start);
  await expect(r).toHaveAttribute("data-end", end);
  await expect(r.getByTestId("task-row-start")).toHaveText(start);
  await expect(r.getByTestId("task-row-end")).toHaveText(end);
  const item = page.locator(`[data-task-id="${id}"]:is([data-testid=bar],[data-testid=milestone])`);
  await expect(item).toHaveAttribute("data-start", start);
  await expect(item).toHaveAttribute("data-end", end);
}

async function dismissError(page: Page) {
  await page.getByTestId("error-message").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("error-message")).toHaveCount(0);
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (b === null) {
    throw new Error("element has no bounding box");
  }
  return b;
}

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

const AC12: SeedFixture = {
  name: "Launch",
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

// ---------- tests ----------

test("AC3: creating a task in the editor adds its row and a 3-day bar", async ({ page }) => {
  await openSeeded(page, { name: "Launch", tasks: [] });
  await page.getByTestId("add-task-button").click();
  await expect(editor(page)).toHaveAttribute("data-task-id", "new");
  await editor(page).getByTestId("task-name").fill("Design");
  await editor(page).getByTestId("task-start").fill("2026-10-05");
  await editor(page).getByTestId("task-duration").fill("3");
  await editor(page).getByTestId("task-create").click();

  const rows = page.getByTestId("task-row");
  await expect(rows).toHaveCount(1);
  const id = Number(await rows.first().getAttribute("data-task-id"));
  await expect(rows.first()).toContainText("Design");
  await expectDates(page, id, "2026-10-05", "2026-10-07");
  await expect(row(page, id)).toHaveAttribute("data-duration", "3");
  // The editor moves on to the new task.
  await expect(editor(page)).toHaveAttribute("data-task-id", String(id));
  await expect(editor(page).getByTestId("task-end")).toHaveValue("2026-10-07");
});

test("AC35: the empty-timeline prompt opens the new-task form", async ({ page }) => {
  await openSeeded(page, { name: "Launch", tasks: [] });
  await page.getByTestId("empty-tasks-prompt").getByRole("button", { name: "Add a task" }).click();
  await expect(editor(page)).toHaveAttribute("data-task-id", "new");
  await expect(editor(page).getByTestId("task-name")).toBeFocused();
  await editor(page).getByTestId("task-editor-close").click();
  await expect(editor(page)).toHaveCount(0);
});

test("AC4: duration, start and end edits each move the right dates", async ({ page }) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Design", start: "2026-10-05", duration: 3 }],
  });
  const id = taskIds.Design as number;
  await openEditor(page, id);

  // Duration keeps the start and moves the end.
  await commit(page, "task-duration", "5");
  await expectDates(page, id, "2026-10-05", "2026-10-09");
  await expect(editor(page).getByTestId("task-end")).toHaveValue("2026-10-09");

  // Start keeps the duration and moves the end.
  await commit(page, "task-start", "2026-10-07");
  await expectDates(page, id, "2026-10-07", "2026-10-11");
  await expect(editor(page).getByTestId("task-duration")).toHaveValue("5");

  // End keeps the start and changes the duration; committed by blur this time.
  const end = editor(page).getByTestId("task-end");
  await end.fill("2026-10-12");
  await end.press("Tab");
  await expectDates(page, id, "2026-10-07", "2026-10-12");
  await expect(editor(page).getByTestId("task-duration")).toHaveValue("6");
  await expect(row(page, id)).toHaveAttribute("data-duration", "6");

  const stored = await apiTask(page, projectId, id);
  expect([stored.start, stored.end, stored.duration]).toEqual(["2026-10-07", "2026-10-12", 6]);
});

test("AC5, AC40: invalid edits show the server message and change nothing", async ({ page }) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Design", start: "2026-10-05", duration: 3 }],
  });
  const id = taskIds.Design as number;
  const before = await apiTask(page, projectId, id);
  await openEditor(page, id);

  const cases: [string, string, string][] = [
    ["task-end", "2026-10-04", "2026-10-07"],
    ["task-duration", "3.5", "3"],
    ["task-duration", "0", "3"],
    ["task-duration", "3651", "3"],
    ["task-start", "2026-02-30", "2026-10-05"],
    ["task-start", "2026-2-5", "2026-10-05"],
    ["task-end", "2026-2-5", "2026-10-07"],
    ["task-start", "1999-12-31", "2026-10-05"],
    ["task-name", "", "Design"],
    ["task-name", "   ", "Design"],
    ["task-name", "x".repeat(101), "Design"],
    ["task-percent", "101", "0"],
  ];
  for (const [testId, value, stored] of cases) {
    await commit(page, testId, value);
    await expect(page.getByTestId("error-message"), `${testId}=${value}`).toBeVisible();
    await expect(page.getByTestId("error-message")).not.toHaveText("");
    // The field goes back to the stored value.
    await expect(editor(page).getByTestId(testId)).toHaveValue(stored);
    await dismissError(page);
  }
  await expectDates(page, id, "2026-10-05", "2026-10-07");
  expect(await apiTask(page, projectId, id)).toEqual(before);
});

test("AC40: an edit whose cascade passes 2099-12-31 is rejected as a whole", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2099-12-01T12:00:00"));
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Far future",
    tasks: [
      { name: "A", start: "2099-12-20", duration: 3 },
      { name: "B", start: "2099-12-23", duration: 8 },
    ],
    deps: [["A", "B"]],
  });
  const [a, b] = [taskIds.A as number, taskIds.B as number];
  const before = await project(page, projectId);
  await openEditor(page, a);
  await commit(page, "task-end", "2099-12-25");
  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(editor(page).getByTestId("task-end")).toHaveValue("2099-12-22");
  await expectDates(page, a, "2099-12-20", "2099-12-22");
  await expectDates(page, b, "2099-12-23", "2099-12-30");
  expect((await project(page, projectId)).tasks).toEqual(before.tasks);
});

test("AC7, AC33: ticking milestone draws a diamond and hides end, duration and percent", async ({
  page,
}) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Go live", start: "2026-10-05", duration: 3, percent_complete: 20 }],
  });
  const id = taskIds["Go live"] as number;
  await openEditor(page, id);
  await editor(page).getByTestId("task-milestone").check();

  await expect(milestone(page, id)).toHaveCount(1);
  await expect(bar(page, id)).toHaveCount(0);
  await expect(editor(page).getByTestId("task-milestone")).toBeChecked();
  for (const testId of ["task-end", "task-duration", "task-percent"]) {
    await expect(editor(page).getByTestId(testId)).toHaveCount(0);
  }
  await expect(editor(page).getByTestId("task-start")).toHaveValue("2026-10-05");
  await expectDates(page, id, "2026-10-05", "2026-10-05");
  const stored = await apiTask(page, projectId, id);
  expect([stored.is_milestone, stored.duration, stored.percent_complete]).toEqual([true, 0, 0]);
});

test("AC33: unticking a milestone after A (ends 10-09) gives 10-10 to 10-10", async ({ page }) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "A", start: "2026-10-05", duration: 5 },
      { name: "M", start: "2026-10-09", is_milestone: true },
    ],
    deps: [["A", "M"]],
  });
  const m = taskIds.M as number;
  await openEditor(page, m);
  await expect(editor(page).getByTestId("task-end")).toHaveCount(0);
  await editor(page).getByTestId("task-milestone").uncheck();

  await expect(bar(page, m)).toHaveCount(1);
  await expectDates(page, m, "2026-10-10", "2026-10-10");
  await expect(editor(page).getByTestId("task-duration")).toHaveValue("1");
  await expect(editor(page).getByTestId("task-percent")).toHaveValue("0");
  const stored = await apiTask(page, projectId, m);
  expect([stored.is_milestone, stored.start, stored.duration]).toEqual([false, "2026-10-10", 1]);
});

test("AC8: percent 40 fills 40% of the bar; 101 is rejected", async ({ page }) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Build", start: "2026-10-05", duration: 5 }],
  });
  const id = taskIds.Build as number;
  await openEditor(page, id);
  await commit(page, "task-percent", "40");
  await expect.poll(async () => (await apiTask(page, projectId, id)).percent_complete).toBe(40);
  const progress = bar(page, id).getByTestId("bar-progress");
  await expect(progress).toHaveAttribute("style", /width: 40%/);
  const ratio = (await box(progress)).width / (await box(bar(page, id))).width;
  expect(ratio).toBeCloseTo(0.4, 2);

  await commit(page, "task-percent", "101");
  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(editor(page).getByTestId("task-percent")).toHaveValue("40");
  expect((await apiTask(page, projectId, id)).percent_complete).toBe(40);
});

test("AC9: assigning Ana colours the bar and survives a reload", async ({ page }) => {
  const { projectId, taskIds, personIds } = await openSeeded(page, {
    name: "Launch",
    people: [{ name: "Ana" }, { name: "Ben" }],
    tasks: [{ name: "Build", start: "2026-10-05", duration: 3 }],
  });
  const id = taskIds.Build as number;
  const palette = (await (await page.request.get("/api/palette")).json()) as Palette;
  const ana = (await project(page, projectId)).people.find((p) => p.name === "Ana");
  const anaPair = palette.colours.find((c) => c.fill === ana?.colour);
  expect(anaPair).toBeDefined();

  await expect(bar(page, id)).toHaveCSS("background-color", rgb(palette.neutral.fill));
  await openEditor(page, id);
  const select = editor(page).getByTestId("task-assignee");
  await expect(select.locator("option")).toHaveText(["Unassigned", "Ana", "Ben"]);
  await select.selectOption({ label: "Ana" });

  await expect(bar(page, id)).toHaveCSS("background-color", rgb(anaPair?.fill ?? ""));
  await expect(bar(page, id).getByTestId("assignee-tag")).toHaveText("Ana");
  await expect
    .poll(async () => (await apiTask(page, projectId, id)).assignee_id)
    .toBe(personIds.Ana);

  await page.reload();
  await expect(bar(page, id).getByTestId("assignee-tag")).toHaveText("Ana");
  await openEditor(page, id);
  await expect(editor(page).getByTestId("task-assignee")).toHaveValue(String(personIds.Ana));

  await editor(page).getByTestId("task-assignee").selectOption({ label: "Unassigned" });
  await expect(bar(page, id)).toHaveCSS("background-color", rgb(palette.neutral.fill));
  await expect(bar(page, id).getByTestId("assignee-tag")).toHaveCount(0);
});

test("AC35: with an empty roster the assignee choice is Unassigned plus add-person", async ({
  page,
}) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [{ name: "Build", start: "2026-10-05", duration: 3 }],
  });
  await openEditor(page, taskIds.Build as number);
  const select = editor(page).getByTestId("task-assignee");
  await expect(select.locator("option")).toHaveText(["Unassigned"]);
  await expect(select).toHaveValue("");
  const addPerson = editor(page).getByTestId("assignee-add-person");
  await expect(addPerson).toBeVisible();
  await addPerson.click();
});

test("AC10, AC11, AC13: add, reject and remove dependencies from the editor", async ({ page }) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "A", start: "2026-10-05", duration: 3 },
      { name: "B", start: "2026-10-06", duration: 2 },
      { name: "C", start: "2026-10-12", duration: 1 },
    ],
  });
  const [a, b, c] = [taskIds.A as number, taskIds.B as number, taskIds.C as number];
  const arrows = page.getByTestId("arrow");
  const addPredecessor = async (name: string) => {
    await editor(page).getByTestId("predecessor-select").selectOption({ label: name });
    await editor(page).getByTestId("add-predecessor").click();
  };

  // AC10: A -> B draws an arrow and pushes B to start after A.
  await openEditor(page, b);
  await expect(editor(page).getByTestId("predecessor-select").locator("option")).toHaveText([
    "Choose a task…",
    "A",
    "C",
  ]);
  await addPredecessor("A");
  await expect(arrows).toHaveCount(1);
  await expect(page.locator(`[data-testid=arrow][data-from="${a}"][data-to="${b}"]`)).toHaveCount(
    1,
  );
  await expectDates(page, b, "2026-10-08", "2026-10-09");
  await expect(editor(page).getByTestId("dependency-item")).toHaveText([/A/]);

  // B -> C (C already starts late enough, so it stays put).
  await openEditor(page, c);
  await addPredecessor("B");
  await expect(arrows).toHaveCount(2);
  await expectDates(page, c, "2026-10-12", "2026-10-12");

  // AC11: C -> A is a cycle.
  await openEditor(page, a);
  await addPredecessor("C");
  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(arrows).toHaveCount(2);
  await dismissError(page);
  // A -> A is not even offered.
  await expect(
    editor(page).getByTestId("predecessor-select").locator("option", { hasText: /^A$/ }),
  ).toHaveCount(0);

  // AC11: a duplicate A -> B.
  await openEditor(page, b);
  await addPredecessor("A");
  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(arrows).toHaveCount(2);
  await dismissError(page);
  expect((await project(page, projectId)).dependencies).toHaveLength(2);

  // AC13: removing A -> B needs no confirmation and leaves the dates alone.
  const item = editor(page).getByTestId("dependency-item");
  await expect(item).toHaveCount(1);
  await item.getByTestId("remove-dependency").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(arrows).toHaveCount(1);
  await expect(editor(page).getByTestId("dependency-item")).toHaveCount(0);
  await expectDates(page, a, "2026-10-05", "2026-10-07");
  await expectDates(page, b, "2026-10-08", "2026-10-09");
  expect((await project(page, projectId)).dependencies).toHaveLength(1);
});

test("AC16: adding and removing a dependency updates project end and critical path without a reload", async ({
  page,
}) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "A", start: "2026-10-05", duration: 3 },
      { name: "B", start: "2026-10-06", duration: 2 },
      { name: "C", start: "2026-10-05", duration: 4 },
    ],
  });
  const [a, b, c] = [taskIds.A as number, taskIds.B as number, taskIds.C as number];
  const projectEnd = page.getByTestId("project-end");
  const arrow = page.locator(`[data-testid=arrow][data-from="${a}"][data-to="${b}"]`);
  const expectCritical = async (critical: number[], notCritical: number[]) => {
    for (const id of critical) {
      await expect(bar(page, id)).toHaveClass(/critical/);
    }
    for (const id of notCritical) {
      await expect(bar(page, id)).not.toHaveClass(/critical/);
    }
  };

  // Only C ends on the project end.
  await expect(projectEnd).toContainText("2026-10-08");
  await expectCritical([c], [a, b]);
  // No navigation may happen: a marker on window survives only without a reload.
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  // A -> B pushes B past C: the project end moves and A, B (joined by a zero-slack link) are critical.
  await openEditor(page, b);
  await editor(page).getByTestId("predecessor-select").selectOption({ label: "A" });
  await editor(page).getByTestId("add-predecessor").click();
  await expectDates(page, b, "2026-10-08", "2026-10-09");
  await expect(projectEnd).toContainText("2026-10-09");
  await expectCritical([a, b], [c]);
  await expect(arrow).toHaveClass(/critical/);

  // Removing A -> B leaves the dates (and so the end) alone, but A no longer drives anything.
  await editor(page).getByTestId("dependency-item").getByTestId("remove-dependency").click();
  await expect(arrow).toHaveCount(0);
  await expectDates(page, b, "2026-10-08", "2026-10-09");
  await expect(projectEnd).toContainText("2026-10-09");
  await expectCritical([b], [a, c]);

  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true);
});

test("AC12, AC16: a duration edit cascades and updates project end and critical path", async ({
  page,
}) => {
  const { projectId, taskIds } = await openSeeded(page, {
    ...AC12,
    tasks: [...AC12.tasks, { name: "D", start: "2026-10-05", duration: 6 }],
  });
  const [a, b, c, d] = ["A", "B", "C", "D"].map((k) => taskIds[k] as number) as [
    number,
    number,
    number,
    number,
  ];
  await expect(page.getByTestId("project-end")).toContainText("2026-10-10");
  await expect(bar(page, d)).toHaveClass(/critical/);

  await openEditor(page, a);
  await commit(page, "task-duration", "5");
  await expectDates(page, a, "2026-10-05", "2026-10-09");
  await expectDates(page, b, "2026-10-10", "2026-10-11");
  await expectDates(page, c, "2026-10-12", "2026-10-12");
  await expect(page.getByTestId("project-end")).toContainText("2026-10-12");
  for (const id of [a, b, c]) {
    await expect(bar(page, id)).toHaveClass(/critical/);
  }
  await expect(bar(page, d)).not.toHaveClass(/critical/);

  await page.reload();
  await expectDates(page, b, "2026-10-10", "2026-10-11");
  const stored = await project(page, projectId);
  expect(stored.tasks.map((t) => [t.start, t.end])).toEqual([
    ["2026-10-05", "2026-10-09"],
    ["2026-10-10", "2026-10-11"],
    ["2026-10-12", "2026-10-12"],
    ["2026-10-05", "2026-10-10"],
  ]);
});

test("AC28: a start edit before the earliest allowed day settles on it", async ({ page }) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "A", start: "2026-10-05", duration: 3 },
      { name: "B", start: "2026-10-08", duration: 2 },
    ],
    deps: [["A", "B"]],
  });
  const b = taskIds.B as number;
  await openEditor(page, b);
  await commit(page, "task-start", "2026-10-06");
  await expect(editor(page).getByTestId("task-start")).toHaveValue("2026-10-08");
  await expectDates(page, b, "2026-10-08", "2026-10-09");
  await expect(page.getByTestId("error-message")).toHaveCount(0);
  const stored = await apiTask(page, projectId, b);
  expect([stored.start, stored.end]).toEqual(["2026-10-08", "2026-10-09"]);
});

test("AC36: a stale second tab gets the server's clamped, cascaded dates", async ({
  page,
  context,
}) => {
  const { taskIds, projectId } = await openSeeded(page, AC12);
  const [a, b, c] = ["A", "B", "C"].map((k) => taskIds[k] as number) as [number, number, number];

  const page2 = await context.newPage();
  const errors2: string[] = [];
  page2.on("pageerror", (e) => errors2.push(e.message));
  page2.on("console", (m) => {
    if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) {
      errors2.push(m.text());
    }
  });
  await page2.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page2.goto(`/#/projects/${projectId}`);
  await expectDates(page2, b, "2026-10-08", "2026-10-09");

  // Tab 1 moves A's end to 10-09, pushing B and C.
  await openEditor(page, a);
  await commit(page, "task-end", "2026-10-09");
  await expectDates(page, c, "2026-10-12", "2026-10-12");

  // Tab 2 still shows the old dates and sets B's start to 10-08.
  await expectDates(page2, b, "2026-10-08", "2026-10-09");
  await openEditor(page2, b);
  await commit(page2, "task-start", "2026-10-08");
  await expectDates(page2, a, "2026-10-05", "2026-10-09");
  await expectDates(page2, b, "2026-10-10", "2026-10-11");
  await expectDates(page2, c, "2026-10-12", "2026-10-12");
  expect(errors2).toEqual([]);
  await page2.close();
});

test("AC41, AC6: deleting a task asks first, then removes it and its arrows", async ({ page }) => {
  const { projectId, taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "A", start: "2026-10-05", duration: 3 },
      { name: "B", start: "2026-10-08", duration: 2 },
      { name: "C", start: "2026-10-10", duration: 1 },
    ],
    deps: [
      ["A", "B"],
      ["B", "C"],
    ],
  });
  const b = taskIds.B as number;
  await openEditor(page, b);

  await editor(page).getByTestId("task-delete").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText('Delete task "B"? Its 2 dependencies will be removed.');
  await page.getByTestId("confirm-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, b)).toHaveCount(1);
  await expect(page.getByTestId("arrow")).toHaveCount(2);

  await editor(page).getByTestId("task-delete").click();
  await page.getByTestId("confirm-ok").click();
  await expect(row(page, b)).toHaveCount(0);
  await expect(bar(page, b)).toHaveCount(0);
  await expect(page.getByTestId("arrow")).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  const stored = await project(page, projectId);
  expect(stored.tasks.map((t) => t.name)).toEqual(["A", "C"]);
  expect(stored.dependencies).toEqual([]);
});

test("AC42: rows keep creation order after date edits and a reload", async ({ page }) => {
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "First", start: "2026-10-05", duration: 2 },
      { name: "Second", start: "2026-10-06", duration: 2 },
      { name: "Third", start: "2026-10-07", duration: 2 },
    ],
  });
  const ids = ["First", "Second", "Third"].map((k) => String(taskIds[k]));
  const order = () =>
    page.getByTestId("task-row").evaluateAll((els) => els.map((e) => e.dataset.taskId));

  await openEditor(page, taskIds.First as number);
  await commit(page, "task-start", "2026-10-20");
  await expectDates(page, taskIds.First as number, "2026-10-20", "2026-10-21");
  expect(await order()).toEqual(ids);

  await page.reload();
  await expect(page.getByTestId("task-row")).toHaveCount(3);
  expect(await order()).toEqual(ids);
  await expect(page.getByTestId("task-row")).toHaveText([/First/, /Second/, /Third/]);
});

test("task rows line up with chart rows and long names are cut with a title", async ({ page }) => {
  const long = `Very long task name ${"x".repeat(80)}`;
  const { taskIds } = await openSeeded(page, {
    name: "Launch",
    tasks: [
      { name: "Build", start: "2026-10-05", duration: 3 },
      { name: long, start: "2026-10-08", duration: 2 },
      { name: "Go live", start: "2026-10-10", is_milestone: true },
    ],
  });
  for (const key of ["Build", long, "Go live"]) {
    const id = taskIds[key] as number;
    const rowBox = await box(row(page, id));
    const item = page.locator(
      `[data-task-id="${id}"]:is([data-testid=bar],[data-testid=milestone])`,
    );
    const itemBox = await box(item);
    expect(rowBox.height).toBeCloseTo(36, 0);
    expect(Math.abs(rowBox.y + rowBox.height / 2 - (itemBox.y + itemBox.height / 2))).toBeLessThan(
      1.5,
    );
  }
  // The panel header is as tall as the chart header.
  const header = await box(page.getByTestId("task-panel-header"));
  const firstRow = await box(page.getByTestId("task-row").first());
  expect(header.height).toBeCloseTo(56, 0);
  expect(firstRow.y - header.y).toBeCloseTo(56, 0);

  const name = row(page, taskIds[long] as number).getByTestId("task-row-name");
  await expect(name).toHaveAttribute("title", long);
  const overflow = await name.evaluate((el) => ({
    cut: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow,
  }));
  expect(overflow).toEqual({ cut: true, ellipsis: "ellipsis" });

  // The milestone row shows its single date and a diamond in the Days column.
  await expect(row(page, taskIds["Go live"] as number)).toHaveAttribute("data-duration", "0");

  // Escape closes the editor.
  await openEditor(page, taskIds.Build as number);
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);
});

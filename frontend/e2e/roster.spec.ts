// Roster drawer (S10): add, rename, recolour and remove people (AC30, AC31, AC35, AC41).
import type { Locator, Page } from "@playwright/test";
import type { Palette, Person, ProjectDetail } from "../src/api/types.ts";
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

async function openRoster(page: Page): Promise<Locator> {
  await page.getByTestId("roster-button").click();
  const panel = page.getByTestId("roster-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function palette(page: Page): Promise<Palette> {
  return (await (await page.request.get("/api/palette")).json()) as Palette;
}

async function projectDetail(page: Page, id: number): Promise<ProjectDetail> {
  return (await (await page.request.get(`/api/projects/${id}`)).json()) as ProjectDetail;
}

async function people(page: Page, id: number): Promise<Person[]> {
  return (await projectDetail(page, id)).people;
}

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

const rows = (page: Page) => page.getByTestId("person-row");
const row = (page: Page, name: string) =>
  page.getByTestId("person-row").filter({ has: page.locator(`[title="${name}"]`) });
const addForm = (page: Page) => page.getByTestId("roster-add-form");
const swatch = (scope: Locator, fill: string) =>
  scope.locator(`[data-testid=colour-swatch][data-colour="${fill}"]`);
const bar = (page: Page, id: number) => page.locator(`[data-testid=bar][data-task-id="${id}"]`);

async function addPerson(page: Page, name: string, colour?: string) {
  await page.getByTestId("person-name-input").fill(name);
  if (colour !== undefined) {
    await swatch(addForm(page), colour).click();
  }
  await page.getByTestId("person-add").click();
}

async function renameViaUi(rowLocator: Locator, name: string) {
  await rowLocator.getByTestId("person-rename").click();
  const input = rowLocator.getByTestId("person-rename-input");
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press("Enter");
}

test("AC35: an empty roster shows a message and the add form", async ({ page }) => {
  await openSeeded(page, { name: "Launch", tasks: [] });
  const panel = await openRoster(page);

  await expect(panel.getByTestId("roster-empty")).toHaveText("No people yet");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId("person-name-input")).toBeVisible();
  await expect(page.getByTestId("person-name-input")).toBeFocused();
  await expect(addForm(page).getByTestId("colour-swatch")).toHaveCount(12);
  await expect(page.getByTestId("person-add")).toBeVisible();

  // The toolbar button toggles the drawer, and the close button hides it too.
  await page.getByTestId("roster-button").click();
  await expect(panel).toHaveCount(0);
  await openRoster(page);
  await page.getByTestId("roster-close").click();
  await expect(panel).toHaveCount(0);
});

test("AC30: new people default to the first unused colour and may share a colour", async ({
  page,
}) => {
  const { projectId } = await openSeeded(page, { name: "Launch", tasks: [] });
  const { colours } = await palette(page);
  const [first, second, third] = colours.map((c) => c.fill);
  await openRoster(page);

  // Swatches carry the colour name as their accessible name.
  await expect(addForm(page).getByRole("button", { name: colours[0]?.name })).toHaveAttribute(
    "data-colour",
    first as string,
  );

  // Ana: the first palette colour is pre-selected.
  await expect(swatch(addForm(page), first as string)).toHaveAttribute("aria-pressed", "true");
  await expect(addForm(page).locator("[aria-pressed=true]")).toHaveCount(1);
  await addPerson(page, "Ana");
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "Ana")).toBeVisible();
  await expect(page.getByTestId("roster-empty")).toHaveCount(0);
  await expect(page.getByTestId("person-name-input")).toHaveValue("");

  // Ben: the second colour is now the default, but picking Ana's colour is allowed.
  await expect(swatch(addForm(page), second as string)).toHaveAttribute("aria-pressed", "true");
  await expect(swatch(addForm(page), first as string)).toHaveAttribute("aria-pressed", "false");
  await addPerson(page, "Ben", first);
  await expect(rows(page)).toHaveCount(2);

  // The default stays "first unused", so it is still the second colour.
  await expect(swatch(addForm(page), second as string)).toHaveAttribute("aria-pressed", "true");
  await addPerson(page, "Cara");
  await expect(rows(page)).toHaveCount(3);
  await expect(swatch(addForm(page), third as string)).toHaveAttribute("aria-pressed", "true");

  const stored = await people(page, projectId);
  expect(stored.map((p) => [p.name, p.colour])).toEqual([
    ["Ana", first],
    ["Ben", first],
    ["Cara", second],
  ]);
  // The row dot shows the person's colour.
  await expect(row(page, "Cara").getByTestId("person-colour")).toHaveCSS(
    "background-color",
    rgb(second as string),
  );

  // The roster persists and keeps its order after a reload.
  await page.reload();
  await openRoster(page);
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).locator(".person-name")).toHaveText(["Ana", "Ben", "Cara"]);
});

test("AC30: invalid names are rejected with a message and nothing is stored", async ({ page }) => {
  const { projectId } = await openSeeded(page, {
    name: "Launch",
    people: [{ name: "Ana" }],
    tasks: [],
  });
  await openRoster(page);
  await expect(rows(page)).toHaveCount(1);

  for (const name of ["ana", "  ANA ", "", "   ", "x".repeat(101)]) {
    await addPerson(page, name);
    await expect(page.getByTestId("error-message")).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    // The typed text is kept so the user can fix it.
    await expect(page.getByTestId("person-name-input")).toHaveValue(name);
    await page.getByTestId("error-message").getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByTestId("error-message")).toHaveCount(0);
  }
  expect((await people(page, projectId)).map((p) => p.name)).toEqual(["Ana"]);

  // 100 characters is the limit and is accepted; a long name gets an ellipsis and a title.
  const long = "y".repeat(100);
  await addPerson(page, long);
  await expect(rows(page)).toHaveCount(2);
  const longName = row(page, long).locator(".person-name");
  await expect(longName).toHaveCSS("text-overflow", "ellipsis");
  expect(await longName.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("AC30: rename inline, with the new name on bars; a clashing rename reverts", async ({
  page,
}) => {
  const { projectId, personIds } = await openSeeded(page, {
    name: "Launch",
    people: [{ name: "Ana" }, { name: "Ben" }],
    tasks: [
      { name: "Design", start: "2026-10-05", duration: 3, assignee: "Ana" },
      { name: "Build", start: "2026-10-08", duration: 2, assignee: "Ana" },
      { name: "Test", start: "2026-10-10", duration: 2, assignee: "Ben" },
    ],
  });
  await openRoster(page);

  const anna = page.locator(`[data-testid=person-row][data-person-id="${personIds.Ana}"]`);
  await renameViaUi(anna, "Anna");
  await expect(anna.locator(".person-name")).toHaveText("Anna");
  await expect(anna.getByTestId("person-rename-input")).toHaveCount(0);
  await expect(page.getByTestId("assignee-tag").filter({ hasText: "Anna" })).toHaveCount(2);
  await expect(page.getByTestId("error-message")).toHaveCount(0);

  // Blur commits too, and Escape cancels.
  const ben = page.locator(`[data-testid=person-row][data-person-id="${personIds.Ben}"]`);
  await ben.getByTestId("person-rename").click();
  await ben.getByTestId("person-rename-input").fill("Benjamin");
  await ben.getByTestId("person-rename-input").press("Escape");
  await expect(ben.locator(".person-name")).toHaveText("Ben");
  await ben.getByTestId("person-rename").click();
  await ben.getByTestId("person-rename-input").fill("Benny");
  await page.getByTestId("person-name-input").click();
  await expect(ben.locator(".person-name")).toHaveText("Benny");
  await renameViaUi(ben, "Ben");
  await expect(ben.locator(".person-name")).toHaveText("Ben");

  // Clash: "anna" matches Anna, so the server refuses and the row reverts to "Ben".
  await renameViaUi(ben, "anna");
  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(ben.locator(".person-name")).toHaveText("Ben");
  await expect(ben.getByTestId("person-rename-input")).toHaveCount(0);
  expect((await people(page, projectId)).map((p) => p.name)).toEqual(["Anna", "Ben"]);

  await page.reload();
  await openRoster(page);
  await expect(rows(page).locator(".person-name")).toHaveText(["Anna", "Ben"]);
  await expect(page.getByTestId("assignee-tag").filter({ hasText: "Anna" })).toHaveCount(2);
});

test("AC31, AC41: recolouring updates bars at once; removing confirms and unassigns", async ({
  page,
}) => {
  const { projectId, taskIds, personIds } = await openSeeded(page, {
    name: "Launch",
    people: [{ name: "Ana" }, { name: "Ben" }],
    tasks: [
      { name: "Design", start: "2026-10-05", duration: 3, assignee: "Ana" },
      { name: "Build", start: "2026-10-08", duration: 2, assignee: "Ana" },
      { name: "Test", start: "2026-10-10", duration: 2, assignee: "Ben" },
    ],
  });
  const { colours, neutral } = await palette(page);
  const [first, , , purple] = colours.map((c) => c.fill);
  const design = bar(page, taskIds.Design as number);
  const build = bar(page, taskIds.Build as number);
  await expect(design).toHaveCSS("background-color", rgb(first as string));
  // No navigation may happen: a marker on window survives only without a reload.
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  await openRoster(page);
  const ana = page.locator(`[data-testid=person-row][data-person-id="${personIds.Ana}"]`);
  await ana.getByTestId("person-colour").click();
  const picker = ana.getByTestId("colour-picker");
  await expect(picker.getByTestId("colour-swatch")).toHaveCount(12);
  await expect(swatch(picker, first as string)).toHaveAttribute("aria-pressed", "true");
  await swatch(picker, purple as string).click();

  await expect(design).toHaveCSS("background-color", rgb(purple as string));
  await expect(build).toHaveCSS("background-color", rgb(purple as string));
  await expect(ana.getByTestId("person-colour")).toHaveCSS(
    "background-color",
    rgb(purple as string),
  );
  await expect(ana.getByTestId("colour-picker")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true);
  expect((await people(page, projectId)).find((p) => p.id === personIds.Ana)?.colour).toBe(purple);

  const before = await projectDetail(page, projectId);

  // Remove, then cancel: nothing changes.
  await ana.getByTestId("person-delete").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText('Remove "Ana"? 2 tasks will become unassigned.');
  await page.getByTestId("confirm-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expect(rows(page)).toHaveCount(2);
  expect(await projectDetail(page, projectId)).toEqual(before);

  // Remove, then ok: Ana's tasks keep their dates but become unassigned and neutral.
  await ana.getByTestId("person-delete").click();
  await page.getByTestId("confirm-ok").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(design).toHaveCSS("background-color", rgb(neutral.fill));
  await expect(build).toHaveCSS("background-color", rgb(neutral.fill));
  await expect(page.getByTestId("assignee-tag")).toHaveCount(1);
  await expect(page.getByTestId("assignee-tag")).toHaveText("Ben");
  await expect(design).toHaveAttribute("data-start", "2026-10-05");
  await expect(design).toHaveAttribute("data-end", "2026-10-07");
  await expect(build).toHaveAttribute("data-start", "2026-10-08");
  await expect(build).toHaveAttribute("data-end", "2026-10-09");

  const after = await projectDetail(page, projectId);
  expect(after.people.map((p) => p.name)).toEqual(["Ben"]);
  expect(after.tasks.map((t) => [t.name, t.start, t.end, t.assignee_id])).toEqual([
    ["Design", "2026-10-05", "2026-10-07", null],
    ["Build", "2026-10-08", "2026-10-09", null],
    ["Test", "2026-10-10", "2026-10-11", personIds.Ben],
  ]);

  // A person with one task gets the singular wording.
  const ben = page.locator(`[data-testid=person-row][data-person-id="${personIds.Ben}"]`);
  await ben.getByTestId("person-delete").click();
  await expect(dialog).toContainText('Remove "Ben"? 1 task will become unassigned.');
  await page.getByTestId("confirm-cancel").click();
});

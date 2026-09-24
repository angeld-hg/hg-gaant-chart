// S12: export and import through the toolbar (AC21, AC22, AC23, AC24).
import { readFile } from "node:fs/promises";
import type { APIRequestContext, Page } from "@playwright/test";
import type { ProjectSummary } from "../src/api/types.ts";
import { expect, test } from "./fixtures.ts";
import { resetDb, seedProject } from "./helpers/api.ts";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

const items = (page: Page) => page.getByTestId("project-item");

/** People, a milestone, % complete values, an unassigned task and a chain of dependencies. */
async function seedLaunch(request: APIRequestContext): Promise<number> {
  const { projectId } = await seedProject(request, {
    name: "Launch",
    people: [{ name: "Ana" }, { name: "Ben" }],
    tasks: [
      { name: "Design", start: "2026-10-05", duration: 3, percent_complete: 40, assignee: "Ana" },
      { name: "Build", start: "2026-10-08", duration: 5, percent_complete: 10, assignee: "Ben" },
      { name: "Docs", start: "2026-10-06", duration: 2 },
      { name: "Go live", start: "2026-10-14", is_milestone: true },
    ],
    deps: [
      ["Design", "Build"],
      ["Build", "Go live"],
      ["Docs", "Go live"],
    ],
  });
  return projectId;
}

/** Clicks Export and returns the downloaded file's name and exact bytes. */
async function exportViaUi(page: Page): Promise<{ filename: string; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());
  return { filename: download.suggestedFilename(), bytes };
}

async function projectNames(request: APIRequestContext): Promise<string[]> {
  const response = await request.get("/api/projects");
  return ((await response.json()) as ProjectSummary[]).map((p) => p.name);
}

function jsonFile(name: string, doc: unknown) {
  return { name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc)) };
}

test("AC21: Export downloads the server's C5 file with file-local keys and no timestamps", async ({
  page,
  request,
}) => {
  const projectId = await seedLaunch(request);
  await page.goto(`/#/projects/${projectId}`);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch");

  const { filename, bytes } = await exportViaUi(page);

  expect(filename).toBe("launch.gantt.json");
  // Saved exactly as the server sent it: never re-serialised by the client.
  const served = await (await request.get(`/api/projects/${projectId}/export`)).body();
  expect(bytes.equals(served)).toBe(true);

  const text = bytes.toString("utf8");
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  expect(text).not.toMatch(/"(created|updated|exported|timestamp|generated)[a-z_]*"/i);

  const doc = JSON.parse(text);
  expect(Object.keys(doc)).toEqual(["format", "version", "project", "people", "tasks"]);
  expect(doc.format).toBe("hg-gantt");
  expect(doc.version).toBe(1);
  expect(doc.project).toEqual({ name: "Launch" });
  expect(doc.people.map((p: { key: string; name: string }) => [p.key, p.name])).toEqual([
    ["p1", "Ana"],
    ["p2", "Ben"],
  ]);
  for (const person of doc.people) {
    expect(person.colour).toMatch(/^#[0-9a-f]{6}$/);
  }
  expect(doc.tasks).toEqual([
    {
      key: "t1",
      name: "Design",
      start: "2026-10-05",
      end: "2026-10-07",
      duration: 3,
      milestone: false,
      percent_complete: 40,
      assignee: "p1",
      predecessors: [],
    },
    {
      key: "t2",
      name: "Build",
      start: "2026-10-08",
      end: "2026-10-12",
      duration: 5,
      milestone: false,
      percent_complete: 10,
      assignee: "p2",
      predecessors: ["t1"],
    },
    {
      key: "t3",
      name: "Docs",
      start: "2026-10-06",
      end: "2026-10-07",
      duration: 2,
      milestone: false,
      percent_complete: 0,
      assignee: null,
      predecessors: [],
    },
    {
      key: "t4",
      name: "Go live",
      start: "2026-10-14",
      end: "2026-10-14",
      duration: 0,
      milestone: true,
      percent_complete: 0,
      assignee: null,
      predecessors: ["t2", "t3"],
    },
  ]);

  // Exporting the same data again gives the same bytes.
  const again = await exportViaUi(page);
  expect(again.bytes.equals(bytes)).toBe(true);
});

test("Export is disabled until a project is open; Import is always available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("empty-projects")).toBeVisible();
  await expect(page.getByTestId("export-button")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Import" })).toBeEnabled();
  await expect(page.getByTestId("import-input")).toHaveAttribute(
    "accept",
    "application/json,.json",
  );
});

test("AC22 + AC24: import into an empty database re-exports byte-identical; re-imports get suffixes", async ({
  page,
  request,
}) => {
  const projectId = await seedLaunch(request);
  await page.goto(`/#/projects/${projectId}`);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch");
  const original = await exportViaUi(page);

  await resetDb(request);
  await page.goto("/");
  await expect(page.getByTestId("empty-projects")).toBeVisible();

  const file = { name: original.filename, mimeType: "application/json", buffer: original.bytes };
  await page.getByTestId("import-input").setInputFiles(file);

  // The imported project is listed and opened.
  await expect(items(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch");
  await expect(page).toHaveURL(/#\/projects\/\d+$/);
  // The input is cleared after each pick, so choosing the same file again fires a change.
  await expect(page.getByTestId("import-input")).toHaveValue("");

  const roundTrip = await exportViaUi(page);
  expect(roundTrip.filename).toBe("launch.gantt.json");
  expect(roundTrip.bytes.toString("utf8")).toBe(original.bytes.toString("utf8"));
  expect(roundTrip.bytes.equals(original.bytes)).toBe(true);

  // AC24: the same file again creates new projects with the first free suffix.
  await page.getByTestId("import-input").setInputFiles(file);
  await expect(items(page)).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch (2)");
  await expect(items(page).nth(1)).toContainText("Launch (2)");

  await page.getByTestId("import-input").setInputFiles(file);
  await expect(items(page)).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch (3)");
  await expect(items(page).nth(2)).toContainText("Launch (3)");
  expect(await projectNames(request)).toEqual(["Launch", "Launch (2)", "Launch (3)"]);

  // Existing projects are never modified: the first import still exports the original bytes.
  const projects = (await (await request.get("/api/projects")).json()) as ProjectSummary[];
  const first = await (await request.get(`/api/projects/${projects[0]?.id}/export`)).body();
  expect(first.equals(original.bytes)).toBe(true);
});

const task = (key: string, name: string, start: string, predecessors: string[]) => ({
  key,
  name,
  start,
  end: start,
  duration: 1,
  milestone: false,
  percent_complete: 0,
  assignee: null,
  predecessors,
});

test("AC23: a file with a dependency cycle is rejected with a message naming it; nothing is written", async ({
  page,
  request,
}) => {
  const projectId = await seedLaunch(request);
  await page.goto(`/#/projects/${projectId}`);
  await expect(items(page)).toHaveCount(1);

  const cyclic = {
    format: "hg-gantt",
    version: 1,
    project: { name: "Loop" },
    people: [],
    tasks: [task("a", "Alpha", "2026-10-05", ["b"]), task("b", "Beta", "2026-10-06", ["a"])],
  };
  await page.getByTestId("import-input").setInputFiles(jsonFile("loop.gantt.json", cyclic));

  const alert = page.getByTestId("error-message");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("cycle");
  await expect(alert).toContainText('"a"');
  await expect(items(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Launch");
  expect(await projectNames(request)).toEqual(["Launch"]);
});

test("AC23: malformed JSON and an unknown version show the server's message", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("empty-projects")).toBeVisible();
  const alert = page.getByTestId("error-message");

  await page.getByTestId("import-input").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format": "hg-gantt", '),
  });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("not valid JSON");
  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toHaveCount(0);

  await page.getByTestId("import-input").setInputFiles(
    jsonFile("v2.json", {
      format: "hg-gantt",
      version: 2,
      project: { name: "X" },
      people: [],
      tasks: [],
    }),
  );
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("unknown format version 2");

  await expect(page.getByTestId("empty-projects")).toBeVisible();
  expect(await projectNames(request)).toEqual([]);
});

test("AC23: a file over 5 MB is refused with a size message and never uploaded", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("empty-projects")).toBeVisible();

  const uploads: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/import")) {
      uploads.push(req.url());
    }
  });

  await page.getByTestId("import-input").setInputFiles({
    name: "huge.gantt.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0x20),
  });

  const alert = page.getByTestId("error-message");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("5 MB");
  await expect(alert).toContainText("huge.gantt.json");
  expect(uploads).toEqual([]);
  expect(await projectNames(request)).toEqual([]);
});

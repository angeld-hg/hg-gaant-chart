/* Verifier throwaway (run 3): CR7 in the real UI. A task edit is committed; its server response is
   held for 1500 ms (the write has already landed server-side, so its snapshot carries the OLD name).
   While it is held, the user renames the project. Expect: the rename is sent only after the task
   response arrives, and the final UI shows the NEW name plus the edited dates. No reload. */
import { createRequire } from "node:module";
const require = createRequire("/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart/frontend/package.json");
const { chromium } = require("@playwright/test");
const API = `http://localhost:${process.env.GV_PORT ?? 8340}`, WEB = `http://localhost:${process.env.GV_WEB_PORT ?? 5340}`;
const NAME = `Race ${Date.now()}`;
const j = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return r.status === 204 ? null : r.json();
};
const p = await j("POST", "/api/projects", { name: NAME });
const t = (await j("POST", `/api/projects/${p.id}/tasks`, { name: "Design", start: "2026-10-05", duration: 3 })).created_id;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [], log = [], t0 = Date.now();
const at = () => `${String(Date.now() - t0).padStart(5)}ms`;
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push(e.message));
page.on("request", (r) => r.method() === "PATCH" && log.push(`${at()} SEND ${r.method()} ${new URL(r.url()).pathname} ${r.postData()}`));
page.on("response", (r) => r.request().method() === "PATCH" && log.push(`${at()} RECV ${r.status()} ${new URL(r.url()).pathname}`));
await page.route(`**/api/tasks/${t}`, async (route) => {
  const resp = await route.fetch();
  const body = await resp.text();
  log.push(`${at()} (server answered task PATCH; holding response 1500 ms; project.name in body = ${JSON.parse(body).project.name})`);
  await new Promise((r) => setTimeout(r, 1500));
  await route.fulfill({ response: resp, body });
});
await page.goto(`${WEB}/#/projects/${p.id}`);
await page.getByTestId("chart").waitFor();
await page.evaluate(() => { window.__marker = 1; });
await page.locator(`[data-testid=task-row][data-task-id="${t}"]`).click();
const dur = page.getByTestId("task-editor").getByTestId("task-duration");
await dur.fill("5"); await dur.press("Enter");
await page.waitForTimeout(200);
const item = page.locator(`[data-project-id="${p.id}"]`);
await item.getByTestId("project-rename-button").click();
await page.getByTestId("project-name-input").fill(NAME + " v2");
await page.getByTestId("project-submit").click();
log.push(`${at()} (user submitted rename)`);
await page.waitForTimeout(3000);
const ui = await page.evaluate(({ t, pid }) => {
  const b = document.querySelector(`[data-testid=bar][data-task-id="${t}"]`);
  return { heading: document.querySelector("h2")?.textContent, listItem: document.querySelector(`[data-project-id="${pid}"]`)?.textContent, bar: `${b?.dataset.start}/${b?.dataset.end}`, noReload: window.__marker === 1 };
}, { t, pid: p.id });
const server = await j("GET", `/api/projects/${p.id}`);
console.log(log.join("\n"));
console.log("UI after both:", JSON.stringify(ui));
console.log("server:", JSON.stringify({ name: server.name, task: server.tasks.map((x) => `${x.start}/${x.end}`) }));
console.log("console errors:", JSON.stringify(errs));
await browser.close();

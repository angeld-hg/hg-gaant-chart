// Verifier throwaway: AC16 after dependency add/remove, in the real UI, no reload; console check; 1280x800 screenshot.
import { createRequire } from "node:module";
const require = createRequire("/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart/frontend/package.json");
const { chromium } = require("@playwright/test");
const API = `http://localhost:${process.env.GV_PORT ?? 8290}`, WEB = `http://localhost:${process.env.GV_WEB_PORT ?? 5290}`, OUT = process.argv[2];
const j = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return r.status === 204 ? null : r.json();
};
const p = await j("POST", "/api/projects", { name: "AC16 deps" });
const a = (await j("POST", `/api/projects/${p.id}/tasks`, { name: "A", start: "2026-10-05", duration: 3 })).created_id;
const b = (await j("POST", `/api/projects/${p.id}/tasks`, { name: "B", start: "2026-10-05", duration: 2 })).created_id;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push(e.message));
const state = async (label) => {
  const s = await page.evaluate(({ a, b }) => {
    const bar = (id) => document.querySelector(`[data-testid=bar][data-task-id="${id}"]`);
    const arrows = [...document.querySelectorAll("[data-testid=arrow]")].map((x) => `${x.dataset.from}->${x.dataset.to}${x.classList.contains("critical") ? "(critical)" : ""}`);
    const f = (id) => `${bar(id)?.dataset.start}/${bar(id)?.dataset.end}${bar(id)?.classList.contains("critical") ? " critical" : ""}`;
    return { A: f(a), B: f(b), arrows, projectEnd: document.querySelector("[data-testid=project-end]")?.textContent, noReload: window.__marker === 1 };
  }, { a, b });
  console.log(label.padEnd(22), JSON.stringify(s));
};
await page.goto(`${WEB}/#/projects/${p.id}`);
await page.getByTestId("chart").waitFor();
await page.waitForSelector(`[data-testid=bar][data-task-id="${b}"]`);
await page.evaluate(() => { window.__marker = 1; });
await state("initial");
await page.locator(`[data-testid=task-row][data-task-id="${b}"]`).click();
await page.getByTestId("predecessor-select").selectOption({ label: "A" });
await page.getByTestId("add-predecessor").click();
await page.waitForSelector("[data-testid=arrow]");
await page.waitForFunction((b) => document.querySelector(`[data-testid=bar][data-task-id="${b}"]`)?.dataset.start === "2026-10-08", b);
await state("after add A->B");
await page.screenshot({ path: OUT, fullPage: false });
await page.getByTestId("remove-dependency").click();
await page.waitForFunction(() => document.querySelectorAll("[data-testid=arrow]").length === 0);
await page.waitForTimeout(150);
await state("after remove A->B");
const doc = { w: await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]) };
console.log("page scrollWidth/clientWidth", JSON.stringify(doc.w));
console.log("console errors:", JSON.stringify(errs));
await browser.close();

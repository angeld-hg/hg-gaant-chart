import { expect, test } from "./fixtures.ts";

test("loads the app shell without console errors", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Gantt" })).toBeVisible();
});

test("proxies /health through Vite to the e2e backend", async ({ request }) => {
  const response = await request.get("/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

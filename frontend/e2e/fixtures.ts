import { test as base, expect } from "@playwright/test";

/**
 * Every e2e spec imports `test` from here. The automatic `consoleErrors` fixture records
 * `console.error` messages and uncaught page errors, then fails the test if there were any (AC26).
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          const { url } = message.location();
          errors.push(`console.error: ${message.text()}${url ? ` (${url})` : ""}`);
        }
      });
      page.on("pageerror", (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

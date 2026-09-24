import { test as base, expect } from "@playwright/test";

/**
 * Every e2e spec imports `test` from here. The automatic `consoleErrors` fixture records
 * `console.error` messages and uncaught page errors, then fails the test if there were any (AC26).
 */
// D13: Chrome itself logs this line for every 4xx fetch, including the rejections that tests
// provoke on purpose. It is a browser network log, not an app error, so it is ignored.
// 5xx responses, app console.error calls and page errors still fail the test.
const EXPECTED_HTTP_REJECTION =
  /^Failed to load resource: the server responded with a status of 4\d\d/;

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !EXPECTED_HTTP_REJECTION.test(message.text())) {
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

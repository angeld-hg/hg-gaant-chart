import path from "node:path";
import { defineConfig } from "@playwright/test";

const BACKEND_PORT = 8100;
const FRONTEND_PORT = 5180;

const frontendDir = import.meta.dirname;
const backendDir = path.resolve(frontendDir, "..", "backend");
const e2eDataDir = path.join(frontendDir, ".e2e-data");
const e2eDbPath = path.join(e2eDataDir, "e2e.db");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    channel: "chrome",
    headless: true,
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // A fresh throwaway DB for every run.
      command:
        `rm -f "${e2eDbPath}" && mkdir -p "${e2eDataDir}" && ` +
        `GANTT_DB_PATH="${e2eDbPath}" uv run uvicorn app.main:app --port ${BACKEND_PORT}`,
      cwd: backendDir,
      url: `http://localhost:${BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      cwd: frontendDir,
      env: { GANTT_API_URL: `http://localhost:${BACKEND_PORT}` },
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

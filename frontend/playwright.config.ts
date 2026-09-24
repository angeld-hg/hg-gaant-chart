import path from "node:path";
import { defineConfig } from "@playwright/test";

// Every run owns its ports, DB and output dir, so concurrent runs in one tree don't collide.
// Override with GANTT_E2E_API_PORT, GANTT_E2E_WEB_PORT, GANTT_E2E_DB_PATH, GANTT_E2E_OUTPUT_DIR.
const DEFAULT_BACKEND_PORT = 8100;
const DEFAULT_FRONTEND_PORT = 5180;

function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a TCP port (1-65535), got "${raw}"`);
  }
  return port;
}

const BACKEND_PORT = portFromEnv("GANTT_E2E_API_PORT", DEFAULT_BACKEND_PORT);
const FRONTEND_PORT = portFromEnv("GANTT_E2E_WEB_PORT", DEFAULT_FRONTEND_PORT);

const frontendDir = import.meta.dirname;
const backendDir = path.resolve(frontendDir, "..", "backend");

// A non-default API port gets its own DB file by default, so two runs never share one.
const defaultDbFile = BACKEND_PORT === DEFAULT_BACKEND_PORT ? "e2e.db" : `e2e-${BACKEND_PORT}.db`;
const e2eDbPath = path.resolve(
  frontendDir,
  process.env.GANTT_E2E_DB_PATH || path.join(".e2e-data", defaultDbFile),
);
const e2eDataDir = path.dirname(e2eDbPath);

// Playwright wipes outputDir at start, so a non-default run gets its own (git-ignored) dir.
const defaultOutputDir =
  FRONTEND_PORT === DEFAULT_FRONTEND_PORT
    ? "test-results"
    : path.join(".e2e-data", `test-results-${FRONTEND_PORT}`);
const outputDir = path.resolve(frontendDir, process.env.GANTT_E2E_OUTPUT_DIR || defaultOutputDir);

export default defineConfig({
  testDir: "./e2e",
  outputDir,
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
      // Never attach to another run's servers: a busy port fails this run instead.
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

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiUrl = process.env.GANTT_API_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiUrl,
      "/health": apiUrl,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

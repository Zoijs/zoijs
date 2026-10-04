// Playwright config — browser smoke tests for the Admin Dashboard demo.
// Serves the repository root so the app's import map can resolve every package.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:3520",
  },
  webServer: {
    command: "node ../../scripts/test-server.mjs ../.. 3520",
    url: "http://127.0.0.1:3520/__ready",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

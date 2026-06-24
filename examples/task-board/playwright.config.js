// Playwright config — browser smoke tests for the Task Board demo.
// Serves the repository root so the app's import map can resolve every package.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3500",
  },
  webServer: {
    command: "npx serve -l 3500 ../..",
    url: "http://localhost:3500",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

// Playwright config — real-browser testing for @zoijs/action.
//
// Serves the repository root (no build step) so the examples' import maps can
// resolve both @zoijs/core and @zoijs/action from local source.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3400",
  },
  webServer: {
    command: "npx serve -l 3400 ..",
    url: "http://localhost:3400",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

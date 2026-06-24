// Playwright config — real-browser testing for @zoijs/resource.
//
// Serves the repository root (no build step) so the examples' import maps can
// resolve both @zoijs/core and @zoijs/resource from local source.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3200",
  },
  webServer: {
    command: "npx serve -l 3200 ..",
    url: "http://localhost:3200",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

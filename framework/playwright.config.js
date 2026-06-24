// Playwright config — real-browser testing for Zoijs.
//
// Serves the framework root (no build step) and runs the example smoke tests +
// browser regression tests in Chromium, Firefox, and WebKit.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  // Absorb transient CI flakiness (cold server start, first module fetch).
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npx serve -l 3000 .",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

// Browser smoke tests for the Task Board ecosystem demo (Chromium/Firefox/WebKit).
//
// The app is served at a sub-path, so the initial route is "*" (Not Found). We
// drive it through its nav, which uses absolute in-app paths.

import { test, expect } from "@playwright/test";

const base = "/examples/task-board/";

const goHome = (page) => page.getByRole("link", { name: "Home", exact: true }).click();
const goTasks = (page) => page.getByRole("link", { name: "Tasks", exact: true }).click();

test("unknown route renders Not Found (initial sub-path)", async ({ page }) => {
  await page.goto(base);
  await expect(page.locator("main h1")).toHaveText("Page not found");
});

test("Home renders and sets the document title", async ({ page }) => {
  await page.goto(base);
  await goHome(page);
  await expect(page.locator("main h1")).toHaveText("Task Board");
  await expect(page).toHaveTitle("Task Board · Built with Zoijs");
});

test("Tasks page loads the list and updates the title", async ({ page }) => {
  await page.goto(base);
  await goTasks(page);
  await expect(page).toHaveTitle("Tasks · Task Board");
  await expect(page.locator("ul.tasks li")).toHaveCount(4); // seed data
});

test("create a task, then see it in the list", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "New", exact: true }).click();
  await page.locator('input[name="title"]').fill("Write the docs");
  await page.getByRole("button", { name: "Create task" }).click();

  await expect(page).toHaveURL(/\/tasks$/); // redirected on success
  await expect(page.locator("ul.tasks li")).toHaveCount(5);
  await expect(page.locator("ul.tasks li", { hasText: "Write the docs" })).toHaveCount(1);
});

test("delete a task removes it from the list", async ({ page }) => {
  await page.goto(base);
  await goTasks(page);
  await expect(page.locator("ul.tasks li")).toHaveCount(4);
  await page
    .locator("ul.tasks li", { hasText: "Submit a form with an action" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.locator("ul.tasks li")).toHaveCount(3);
});

test("open task details from the list", async ({ page }) => {
  await page.goto(base);
  await goTasks(page);
  await page.getByRole("link", { name: "Try the Zoijs router" }).click();
  await expect(page).toHaveURL(/\/tasks\/1$/);
  await expect(page.locator("main h1")).toHaveText("Try the Zoijs router");
});

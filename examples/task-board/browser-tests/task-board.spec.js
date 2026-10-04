// Browser smoke tests for the Task Board ecosystem demo (Chromium/Firefox/WebKit).
//
// The app is hosted at a sub-path and passes `base: "/examples/task-board"` to
// the router, so the initial load resolves to Home (not the "*" route) and all
// links/URLs carry the base.

import { test, expect } from "@playwright/test";

const base = "/examples/task-board/";

test("loads correctly under the sub-path (Home)", async ({ page }) => {
  await page.goto(base);
  await expect(page.locator("main h1")).toHaveText("Task Board");
  await expect(page).toHaveTitle("Task Board · Built with Zoijs");
  // links carry the base
  await expect(page.getByRole("link", { name: "Tasks", exact: true })).toHaveAttribute(
    "href",
    "/examples/task-board/tasks"
  );
});

test("navigation under the base updates the page, URL, and title", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page).toHaveURL(/\/examples\/task-board\/tasks$/);
  await expect(page).toHaveTitle("Tasks · Task Board");
  await expect(page.locator("ul.tasks li")).toHaveCount(4);
});

test("deep navigation to task details works under the base", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByRole("link", { name: "Try the Zoijs router" }).click();
  await expect(page).toHaveURL(/\/examples\/task-board\/tasks\/1$/);
  await expect(page.locator("main h1")).toHaveText("Try the Zoijs router");
});

test("create a task, then see it in the list", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "New", exact: true }).click();
  await page.locator('input[name="title"]').fill("Write the docs");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page).toHaveURL(/\/examples\/task-board\/tasks$/);
  await expect(page.locator("ul.tasks li")).toHaveCount(5);
  await expect(page.locator("ul.tasks li", { hasText: "Write the docs" })).toHaveCount(1);
});

test("delete a task removes it from the list", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.locator("ul.tasks li")).toHaveCount(4);
  await page
    .locator("ul.tasks li", { hasText: "Submit a form with an action" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.locator("ul.tasks li")).toHaveCount(3);
});

test("the back button returns to the previous page", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByRole("link", { name: "Try the Zoijs router" }).click();
  await expect(page.locator("main h1")).toHaveText("Try the Zoijs router");
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText("Tasks");
});

test("an unknown path under the base hits the Not Found route", async ({ page }) => {
  await page.goto(base);
  // Simulate a back/forward to a bad in-app URL (client-side, no full reload).
  await page.evaluate(() => {
    history.pushState({}, "", "/examples/task-board/does-not-exist");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator("main h1")).toHaveText("Page not found");
});

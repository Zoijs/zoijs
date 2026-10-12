// The user-management example (api/examples/users) end to end, in every engine: an authenticated
// createApi() client against the demo API on the second origin (scripts/demo-users-api.mjs).

import { test, expect } from "@playwright/test";

const EXAMPLE = "/api/examples/users/";

async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // The browser itself logs failed HTTP responses (e.g. the 401s and 503s the demo produces on
  // purpose) as console errors; anything else is a real error.
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(EXAMPLE);
  await expect(page.getByRole("cell", { name: "Ada Lovelace", exact: true })).toBeVisible();
  return errors;
}

const list = (page) => page.locator("tbody tr td:first-child");

test("users example: loads the list through the authenticated client, with an accessible form", async ({ page }) => {
  const sent = [];
  page.on("request", (r) => r.url().includes("/__demo/") && r.method() !== "OPTIONS" && sent.push({ method: r.method(), url: r.url(), auth: r.headers().authorization ?? null }));
  const errors = await open(page);
  await expect(list(page)).toHaveText(["Ada Lovelace", "Alan Turing"]);
  // The list request carried the Bearer token from the session; the sign-in request didn't.
  const usersGet = sent.find((r) => r.method === "GET" && r.url.endsWith("/users"));
  expect(usersGet.auth).toMatch(/^Bearer demo-[0-9a-f-]{36}$/);
  expect(sent.find((r) => r.url.endsWith("/session")).auth).toBeNull();
  // Labels, names and states a screen reader relies on
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Ada Lovelace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Alan Turing" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("users example: a 422 shows the server's message in the form, focus stays there; a valid user is added", async ({ page }) => {
  const errors = await open(page);
  await page.getByLabel("Name").fill("Grace Hopper");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Add user" }).click();
  const alert = page.locator("#form-error");
  await expect(alert).toHaveText("Enter a valid email address, like name@example.com.");
  await expect(page.getByLabel("Name")).toBeFocused();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-describedby", "form-error");

  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(list(page)).toHaveText(["Ada Lovelace", "Alan Turing", "Grace Hopper"]); // invalidated → reloaded
  await expect(page.locator("#announcer")).toHaveText("Added Grace Hopper.");
  await expect(alert).toHaveText("");
  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByLabel("Name")).toBeFocused();
  expect(errors).toEqual([]);
});

test("users example: edit and delete — keyboard only, with announcements", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "Edit Alan Turing" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Edit Alan Turing" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeFocused();
  await expect(page.getByLabel("Name")).toHaveValue("Alan Turing");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Alan M. Turing");
  await page.keyboard.press("Enter"); // submits the form
  await expect(list(page)).toHaveText(["Ada Lovelace", "Alan M. Turing"]);
  await expect(page.locator("#announcer")).toHaveText("Saved changes to Alan M. Turing.");
  await expect(page.getByRole("heading", { name: "Add a user" })).toBeVisible();

  await page.getByRole("button", { name: "Delete Ada Lovelace" }).focus();
  await page.keyboard.press("Enter");
  await expect(list(page)).toHaveText(["Alan M. Turing"]);
  await expect(page.locator("#announcer")).toHaveText("Deleted Ada Lovelace.");
  expect(errors).toEqual([]);
});

test("users example: a simulated outage and network failure show a useful error and a working retry", async ({ page }) => {
  await open(page);
  await page.getByLabel("Server error (503)").check();
  const alert = page.locator("section [role=alert]");
  await expect(alert).toContainText("The server had a problem. Try again in a moment.");
  await page.getByLabel("Network failure").check();
  await expect(alert).toContainText("Can't reach the server.");
  await page.getByLabel("Normal").check();
  await expect(list(page)).toHaveText(["Ada Lovelace", "Alan Turing"]);
  await page.getByLabel("Server error (503)").check();
  await expect(alert).toBeVisible();
  await page.getByLabel("Normal").check(); // the reactive query changes → a new request
  await expect(alert).toHaveCount(0);
});

test("users example: a slow server times out (network timeout, not an auth timeout)", async ({ page }) => {
  test.slow(); // two 2 s attempts
  await open(page);
  await page.getByLabel("Slow server (timeout)").check();
  await expect(page.locator("section [role=alert]")).toContainText("The server took too long to answer.", { timeout: 15_000 });
});

test("users example: an expired token recovers once — for a GET and for a mutation, never in a loop", async ({ page }) => {
  const sessions = [];
  const posts = [];
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    if (r.url().endsWith("/session")) sessions.push(r.url());
    if (r.url().endsWith("/users")) posts.push(r.headers()["idempotency-key"]);
  });
  const errors = await open(page);
  expect(sessions).toHaveLength(1); // the initial sign-in

  // GET: 401 → one refresh → the list loads again
  await page.getByRole("button", { name: "Expire my token" }).click();
  await page.getByRole("button", { name: "Refresh list" }).click();
  await expect(page.getByRole("button", { name: "Refresh list" })).toBeEnabled();
  await expect(list(page)).toHaveText(["Ada Lovelace", "Alan Turing"]);
  await page.waitForTimeout(300);
  expect(sessions).toHaveLength(2);
  await expect(page.locator("section [role=alert]")).toHaveCount(0);

  // Mutation: 401 → one refresh → ONE new run (a new idempotency key) → added exactly once
  await page.getByRole("button", { name: "Expire my token" }).click();
  await page.getByLabel("Name").fill("Grace Hopper");
  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(list(page)).toHaveText(["Ada Lovelace", "Alan Turing", "Grace Hopper"]);
  await page.waitForTimeout(300);
  expect(sessions).toHaveLength(3);
  expect(posts).toHaveLength(2);
  expect(new Set(posts).size).toBe(2);
  expect(errors).toEqual([]);
});

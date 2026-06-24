// Type tests for @zoijs/router's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { html } from "@zoijs/core";
import { createRouter } from "../src/index.js";
import type { Router, RouteParams } from "../src/index.js";

const routes = {
  "/": () => html`<h1>Home</h1>`,
  "/about": () => html`<h1>About</h1>`,
  "/users/:id": (params: RouteParams) => html`<h1>User ${params.id}</h1>`,
  "*": () => html`<h1>Not Found</h1>`,
};

const router: Router = createRouter(routes);

// optional base path
const based: Router = createRouter(routes, { base: "/app" });
void based;

// @ts-expect-error — base must be a string
createRouter(routes, { base: 123 });

const v: Element = router.view();
const a = router.link("/", "Home");
router.go("/about");
const path: string = router.path();
const query: RouteParams = router.query();
const id: string = query.id ?? "";
router.destroy();

// @ts-expect-error — go() needs a path
router.go();

// @ts-expect-error — link() needs text
router.link("/");

void [v, a, path, id];

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

// @ts-expect-error — link() needs content
router.link("/");

// replace navigation (L5)
router.go("/about", { replace: true });
router.go("/about", {});
// @ts-expect-error — replace is a boolean
router.go("/about", { replace: "yes" });

// rich link content and link building blocks (L6)
const rich = router.link("/about", html`<b>About</b> us`);
const reactive = router.link("/about", () => (path === "/" ? "Home" : html`<i>Back</i>`));
const h: string = router.href("/about");
const onClick: (e: MouseEvent) => void = router.onLinkClick("/about");
const active: boolean = router.isActive("/docs", { exact: false });
const custom = html`<a class="nav" href=${router.href("/x")} onclick=${router.onLinkClick("/x")}
  aria-current=${() => (router.isActive("/x") ? "page" : null)}>X</a>`;
// @ts-expect-error — link content isn't an arbitrary object
router.link("/about", { label: "About" });
// @ts-expect-error — exact is a boolean
router.isActive("/x", { exact: 1 });

// a route may render nothing (L8)
createRouter({ "/": () => null, "*": () => html`<h1>404</h1>` });

void [v, a, path, id, rich, reactive, h, onClick, active, custom];

// ---- SEC-10: decodeSlash ----------------------------------------------------------
createRouter({ "/f/:name": () => null }, { decodeSlash: false });
// @ts-expect-error — decodeSlash is a boolean
createRouter({ "/f/:name": () => null }, { decodeSlash: "no" });

// Type definitions for @zoijs/router.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

import type { TemplateResult } from "@zoijs/core";

/** Params captured from a dynamic route (e.g. `/users/:id` → `{ id: "42" }`). */
export type RouteParams = Record<string, string>;

/**
 * A route component: a function that receives the matched params and returns an
 * `html` template (or `null` to render nothing).
 */
export type RouteComponent = (params: RouteParams) => TemplateResult | null;

/** A `{ pattern: component }` map. Use `"*"` for the not-found route. */
export type Routes = Record<string, RouteComponent>;

/** The result of {@link Router.match}: the matched route component and its params. */
export interface RouteMatch {
  component: RouteComponent;
  params: RouteParams;
}

/** Options for {@link createRouter}. */
export interface RouterOptions {
  /**
   * A sub-path the app is hosted under, e.g. `"/app"`. It is stripped before
   * matching and prepended in `link`/`go`, so your route patterns and
   * `router.path()` stay base-free. Trailing slash optional.
   */
  base?: string;
  /**
   * Intercept plain left-clicks on **any** internal `<a>` (not just `link()`s) and
   * navigate client-side instead of reloading. Makes links inside rendered content
   * (Markdown, a CMS body) behave like a SPA. Bows out for modifier/new-tab clicks,
   * `target`, `download`, external origins, other schemes, same-page `#hash` links,
   * links outside `base`, and any `<a data-native>`. Default `false`.
   */
  interceptLinks?: boolean;
  /**
   * **Server-rendering only.** The request URL path (e.g. `"/users/42?tab=posts"`,
   * including any `base`) to render for — used instead of `window.location` when there
   * is no browser. This is what makes routed SSR render the route for *this* request;
   * on the client it's ignored. Defaults to `"/"`. Pair with {@link Router.match} to
   * load that route's data before rendering.
   */
  location?: string;
}

/** A router created by {@link createRouter}. */
export interface Router {
  /** The outlet the current page renders into. Place it once: `${router.view()}`. */
  view(): Element;
  /** An `<a>` that navigates without a full page reload. */
  link(path: string, text: string): TemplateResult;
  /** Navigate programmatically (pushes a history entry). */
  go(path: string): void;
  /** The current path (reactive). */
  path(): string;
  /** The current query string as a plain object (reactive). */
  query(): RouteParams;
  /**
   * Resolve a path to its matched route **without rendering** — `{ component, params }`.
   * For routed SSR: learn which route (and params) a request hits so you can load that
   * route's data before `renderToString`. Defaults to the current location; also
   * accepts a URL path (the `base` and any query string are handled for you).
   */
  match(path?: string): RouteMatch;
  /** Remove the back/forward listener. Called automatically on app unmount. */
  destroy(): void;
}

/**
 * Create a router from a `{ pattern: component }` map.
 *
 * ```ts
 * const router = createRouter({
 *   "/": Home,
 *   "/users/:id": (params) => html`<h1>User ${params.id}</h1>`,
 *   "*": () => html`<h1>Not Found</h1>`,
 * });
 * ```
 *
 * Hosted under a sub-path? Pass a `base`:
 *
 * ```ts
 * const router = createRouter(routes, { base: "/app" });
 * ```
 *
 * Routed SSR? Pass the request URL as `location`, and use `match()` to load its data:
 *
 * ```ts
 * const router = createRouter(routes, { location: req.url });
 * const { params } = router.match();        // route + params for this request
 * const data = await loadData(params);      // your per-request data loading
 * const body = renderToString(() => App(router)); // view() renders the right route
 * ```
 */
export function createRouter(routes: Routes, options?: RouterOptions): Router;

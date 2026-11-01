// Type definitions for @zoijs/router.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

import type { TemplateResult } from "@zoijs/core";

/** Params captured from a dynamic route (e.g. `/users/:id` → `{ id: "42" }`). */
export type RouteParams = Record<string, string>;

/**
 * A route component: a function that receives the matched params and returns an
 * `html` template, or `null` to render nothing (an empty outlet).
 */
export type RouteComponent = (params: RouteParams) => TemplateResult | null;

/**
 * What a link can show: text, a number, a template (icons, markup), a DOM node, or a function
 * returning one of those (reactive) — anything a `${…}` child slot accepts.
 */
export type LinkContent =
  | string
  | number
  | TemplateResult
  | Node
  | null
  | (() => string | number | TemplateResult | Node | null);

/** Options for {@link Router.go}. */
export interface GoOptions {
  /**
   * Replace the current history entry instead of adding one (`history.replaceState`) — for
   * redirects and frequently changing URL state, so Back skips the intermediate states.
   * Scrolls only to a `#hash` target, or to the top when the page changed. Default `false`.
   */
  replace?: boolean;
}

/** Options for {@link Router.isActive}. */
export interface ActiveOptions {
  /**
   * `true` (default): the same path and, when the target has a query, the same query.
   * `false`: the path or any sub-path (`"/docs"` matches `"/docs/intro"`); the query is ignored.
   */
  exact?: boolean;
}

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
  /**
   * Decode `%2F` in params into `/`? Default `true` (the original behavior). With `false`
   * an encoded slash stays encoded — `/files/..%2Fadmin` gives `params.name === "..%2Fadmin"`,
   * never `"../admin"` — while every other escape (`%20`, `%C3%A9`, …) still decodes. Use it
   * when params feed paths, API URLs, or identifiers. Params are untrusted data either way.
   */
  decodeSlash?: boolean;
}

/** A router created by {@link createRouter}. */
export interface Router {
  /** The outlet the current page renders into. Place it once: `${router.view()}`. */
  view(): Element;
  /**
   * An `<a>` that navigates without a full page reload, with `aria-current="page"` while
   * {@link Router.isActive}. `content` is text or any template content. For your own classes,
   * attributes or handlers, build the `<a>` from {@link Router.href} and {@link Router.onLinkClick}.
   */
  link(path: string, content: LinkContent): TemplateResult;
  /**
   * The `href` for a link to `path`: an app path gets the `base` prepended; an external URL
   * (`scheme:` or `//host`) is returned unchanged.
   */
  href(path: string): string;
  /**
   * A click handler that navigates to `path` client-side — `onclick=${router.onLinkClick(path)}`
   * on your own `<a href=${router.href(path)}>`. Modified or non-primary clicks, a `target`
   * other than `_self`, `download`, an already-handled event, and external URLs are left to the
   * browser.
   */
  onLinkClick(path: string): (event: MouseEvent) => void;
  /** Whether `path` is the current route (reactive) — e.g. for `aria-current` or a class. */
  isActive(path: string, options?: ActiveOptions): boolean;
  /**
   * Navigate programmatically. Pushes a history entry, or replaces the current one with
   * `{ replace: true }`. Takes an app path (`"/users/1"`, `"?tab=2"`, `"#top"`); an absolute URL,
   * any scheme, or `//host` throws a `TypeError` — use `location.assign()` to leave the app.
   */
  go(path: string, options?: GoOptions): void;
  /** The current path (reactive). Doesn't change — or wake readers — on query/hash-only navigation. */
  path(): string;
  /** The current query string as a plain object (reactive; an equal query keeps the same object). */
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

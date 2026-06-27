// @zoijs/router — a tiny, optional router for Zoijs single-page apps.
//
// Philosophy: stay small and beginner-friendly. Routes are a plain object that
// maps a URL pattern to a component. A component is just a function that returns
// an html() template and receives the matched params as a plain object:
//
//   import { html, mount } from "@zoijs/core";
//   import { createRouter } from "@zoijs/router";
//
//   const router = createRouter({
//     "/": Home,
//     "/about": About,
//     "/users/:id": (params) => html`<h1>User ${params.id}</h1>`,
//     "*": () => html`<h1>Not Found</h1>`,
//   });
//
//   function App() {
//     return html`
//       <nav>${router.link("/", "Home")} ${router.link("/about", "About")}</nav>
//       ${router.view()}
//     `;
//   }
//   mount(App, "#app");
//
// If your app is hosted under a sub-path (e.g. https://site.com/app/), pass a
// `base` so routes stay clean: createRouter(routes, { base: "/app" }).
//
// No JSX, no build step, no providers, no hooks, no nested-outlet system. It
// builds entirely on the core's public API (html, mount, createState, onCleanup)
// — the core package is unchanged.

import { html, mount, createState, onCleanup } from "@zoijs/core";

/**
 * Create a router from a `{ pattern: component }` map.
 * @param {Record<string, (params: Record<string,string>) => any>} routes
 * @param {{ base?: string }} [options]
 */
export function createRouter(routes, options = {}) {
  const { matchers, notFound } = compile(routes);
  const base = normalizeBase(options.base); // "" when hosting at the root

  // Browser pathname → app path (route patterns are written without the base).
  const stripBase = (pathname) => {
    if (!base) return pathname;
    if (pathname === base) return "/";
    if (pathname.startsWith(base + "/")) return pathname.slice(base.length);
    return pathname; // outside the base → won't match app routes → "*"
  };
  // App path → browser URL (prepend the base for href / pushState).
  const toBrowser = (appPath) => (base ? base + appPath : appPath) || "/";
  // Server-side there is no URL: default to the app root and an empty query, so
  // createRouter() and a first render don't throw. (Per-request routed SSR — feeding
  // the real request path in — is a separate, planned step.)
  const appPath = () => (typeof window === "undefined" ? "/" : stripBase(window.location.pathname));
  const readLocation = () => ({
    path: appPath(),
    query: typeof window === "undefined" ? {} : parseQuery(window.location.search),
  });

  // One reactive cell holds the current location. path(), query(), and the
  // active-link state read it, so they update when the URL changes.
  const location = createState(readLocation());

  // The page itself is rendered imperatively with mount(): mounting runs the
  // component inside an owner scope (so its onCleanup is captured) and the
  // returned unmount() disposes that scope on the next navigation — that is how
  // a page's onCleanup fires when you route away from it.
  let outlet = null;
  let unmountPage = null;
  const renderPage = () => {
    if (!outlet) return;
    const { component, params } = match(appPath());
    if (unmountPage) unmountPage(); // dispose the previous page → its onCleanup runs
    unmountPage = mount(() => (component ? component(params) : null), outlet);
  };

  // Apply a URL change: refresh the reactive cell and swap the page.
  const apply = () => {
    location.set(readLocation());
    renderPage();
  };

  // Back/forward buttons fire "popstate"; re-read the URL when they do. (Skipped
  // server-side, where there is no window to listen on.)
  if (typeof window !== "undefined") window.addEventListener("popstate", apply);

  // Optional: intercept clicks on ANY internal <a> (not just router.link ones) so
  // a plain left-click navigates client-side instead of doing a full page reload.
  // This is what makes links inside rendered content — Markdown, a CMS body — feel
  // like a single-page app without wrapping each one. Off by default; enable with
  // createRouter(routes, { interceptLinks: true }). It bows out for everything a
  // user would expect to behave normally (new-tab/modifier clicks, target,
  // download, external origins, other schemes, same-page #hashes, links outside the
  // app's base, and an explicit `data-native` opt-out).
  const onLinkClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.hasAttribute("data-native")) return;
    if (a.origin !== window.location.origin) return; // external origin → real navigation
    const href = a.getAttribute("href");
    if (!href || href[0] === "#") return; // in-page anchor → let the browser scroll
    if (a.pathname === window.location.pathname && a.search === window.location.search && a.hash) return; // same page #hash
    const within = !base || a.pathname === base || a.pathname.startsWith(base + "/");
    if (!within) return; // outside the app's base → not ours; let it navigate
    e.preventDefault();
    go(stripBase(a.pathname) + a.search + a.hash);
  };
  if (options.interceptLinks && typeof window !== "undefined") window.addEventListener("click", onLinkClick);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", apply);
      if (options.interceptLinks) window.removeEventListener("click", onLinkClick);
    }
    if (unmountPage) unmountPage();
  };

  const match = (path) => {
    const parts = segments(path);
    for (const m of matchers) {
      if (m.segs.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < m.segs.length; i++) {
        const seg = m.segs[i];
        if (seg.name) params[seg.name] = safeDecode(parts[i]);
        else if (seg.literal !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { component: m.component, params };
    }
    return { component: notFound, params: {} };
  };

  const go = (to) => {
    if (typeof window === "undefined") return; // navigation is a client-only action
    const target = toBrowser(String(to));
    if (target === currentUrl()) return; // already here — don't spam history
    window.history.pushState({}, "", target);
    apply();
  };

  const link = (to, text) => {
    const onClick = (e) => {
      // Let the browser handle anything that isn't a plain left-click, and any
      // absolute URL (external link) — so "open in new tab" etc. still work.
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(to)) return;
      e.preventDefault();
      go(to);
    };
    return html`<a
      href=${toBrowser(to)}
      onclick=${onClick}
      aria-current=${() => (location.get().path === to ? "page" : false)}
      >${text}</a
    >`;
  };

  // view() returns the outlet: an invisible (display: contents) element the
  // router renders the current page into. Place it once in your layout.
  const view = () => {
    // SSR: no DOM to mount into — return the matched route's template directly so it
    // serializes to HTML. With no request URL available server-side that's the "/"
    // route; reactivity and client navigation attach when the page hydrates.
    if (typeof document === "undefined") {
      const { component, params } = match(appPath());
      return component ? component(params) : null;
    }
    outlet = document.createElement("div");
    outlet.style.display = "contents";
    onCleanup(destroy); // unmount the page + drop the popstate listener on teardown
    renderPage();
    return outlet;
  };

  const path = () => location.get().path;
  const query = () => location.get().query;

  return { view, link, go, path, query, destroy };
}

// ---- internals ---------------------------------------------------------------

function compile(routes) {
  const matchers = [];
  let notFound = () => null;
  for (const [pattern, component] of Object.entries(routes)) {
    if (pattern === "*") {
      notFound = component;
      continue;
    }
    const segs = segments(pattern).map((s) =>
      s.startsWith(":") ? { name: s.slice(1), literal: null } : { name: null, literal: s }
    );
    matchers.push({ pattern, component, segs, score: segs.filter((s) => s.name).length });
  }
  // Fewer params = more specific, so "/users/new" beats "/users/:id" regardless
  // of declaration order. Array.sort is stable, so ties keep their order.
  matchers.sort((a, b) => a.score - b.score);
  return { matchers, notFound };
}

// Normalize a base path: ensure a leading slash, drop the trailing slash.
// "" / "/" → "" (root); "app" → "/app"; "/examples/task-board/" → "/examples/task-board".
function normalizeBase(base) {
  if (!base) return "";
  let b = String(base).trim();
  if (!b.startsWith("/")) b = "/" + b;
  if (b.endsWith("/")) b = b.slice(0, -1);
  return b;
}

function segments(path) {
  // "/users/:id" -> ["users", ":id"]; "/" and "" -> []
  return String(path).split("?")[0].split("/").filter(Boolean);
}

function currentUrl() {
  return window.location.pathname + window.location.search;
}

function parseQuery(search) {
  const out = {};
  for (const [key, value] of new URLSearchParams(search)) out[key] = value;
  return out;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

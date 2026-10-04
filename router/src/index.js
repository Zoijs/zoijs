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
 * @param {{ base?: string, location?: string }} [options]
 */
export function createRouter(routes, options = {}) {
  const { matchers, notFound } = compile(routes);
  const base = normalizeBase(options.base); // "" when hosting at the root

  // Server-rendering only: a request URL path ("/users/42?tab=posts"), used instead
  // of `window.location` when there is no browser. This is what makes routed SSR
  // render the route for THIS request; on the client it's ignored. Defaults to "/"
  // so an SSR render without it still works (and doesn't throw).
  const serverUrl = options.location != null ? String(options.location) : "/";
  const serverPathname = serverUrl.split("?")[0] || "/";
  const qI = serverUrl.indexOf("?");
  const serverSearch = qI >= 0 ? serverUrl.slice(qI) : "";

  // Browser pathname → app path (route patterns are written without the base).
  const stripBase = (pathname) => {
    if (!base) return pathname;
    if (pathname === base) return "/";
    if (pathname.startsWith(base + "/")) return pathname.slice(base.length);
    return pathname; // outside the base → won't match app routes → "*"
  };
  // App path → browser URL (prepend the base for href / pushState).
  const toBrowser = (appPath) => (base ? base + appPath : appPath) || "/";
  // The current app path: the browser URL on the client, or the server-provided
  // `location` (default "/") when there is no window. Routed SSR works by passing
  // the request URL as `location`, so `view()` renders the matching route.
  const appPath = () =>
    typeof window === "undefined" ? stripBase(serverPathname) : stripBase(window.location.pathname);
  const readLocation = () => ({
    path: appPath(),
    query: parseQuery(typeof window === "undefined" ? serverSearch : window.location.search),
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
  let currentMatch = null; // { component, params } the page is currently mounted for
  let rendering = false; // re-entrancy guard
  let pendingRender = false;
  const renderPage = () => {
    if (!outlet) return;
    // Re-entrancy guard (Ro4): if a component navigates synchronously during its own mount, a
    // nested render here would mount a page and then be overwritten by the outer mount, leaking
    // that page's owner (its effects/listeners/onCleanup). Flag it and let the in-flight loop
    // pick up the newest URL instead.
    if (rendering) {
      pendingRender = true;
      return;
    }
    rendering = true;
    try {
      do {
        pendingRender = false;
        const m = match(appPath());
        if (unmountPage) unmountPage(); // dispose the previous page → its onCleanup runs
        unmountPage = mount(() => (m.component ? m.component(m.params) : null), outlet);
        currentMatch = m;
      } while (pendingRender); // a nav during mount asked for another render — do it now, in order
    } finally {
      rendering = false;
    }
  };

  // Apply a URL change: refresh the reactive cell, and swap the page ONLY when the matched route
  // or its params actually changed (Ro1). A hash- or query-only change keeps the same component
  // mounted — re-mounting it would wipe uncontrolled DOM state (form input, scroll, focus) and
  // flicker head tags — while the reactive `location` cell still updates for query()/path() reads.
  const apply = () => {
    location.set(readLocation());
    if (currentMatch) {
      const next = match(appPath());
      if (next.component === currentMatch.component && sameParams(next.params, currentMatch.params)) return;
    }
    renderPage();
  };

  // ---- scroll management (Ro2/Ro3) ------------------------------------------
  // Pages render with JS AFTER the URL changes, so the browser's own scroll restoration can't
  // work (the target DOM doesn't exist yet when it tries). Take it over: remember scroll on the
  // outgoing entry, scroll to the target's #hash (or top) on a forward nav, and restore the saved
  // position on back/forward.
  if (typeof window !== "undefined" && window.history && "scrollRestoration" in window.history) {
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      /* not settable in this environment — leave the default */
    }
  }
  const hashTarget = (hash) => {
    if (!hash || hash.length < 2 || typeof document === "undefined") return null;
    try {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return null;
    }
  };
  const saveScroll = () => {
    if (typeof window === "undefined") return;
    try {
      window.history.replaceState({ ...(window.history.state || {}), zoijsScrollY: window.scrollY || 0 }, "");
    } catch {
      /* ignore */
    }
  };
  const scrollAfterForward = (hash) => {
    if (typeof window === "undefined") return;
    const el = hashTarget(hash);
    if (el) el.scrollIntoView();
    else window.scrollTo(0, 0);
  };

  // Back/forward buttons fire "popstate": re-read the URL, then restore scroll. (Skipped
  // server-side, where there is no window to listen on.)
  const onPopstate = () => {
    apply();
    if (typeof window === "undefined") return;
    const el = hashTarget(window.location.hash);
    if (el) {
      el.scrollIntoView();
      return;
    }
    const y = window.history.state && window.history.state.zoijsScrollY;
    window.scrollTo(0, typeof y === "number" ? y : 0);
  };
  if (typeof window !== "undefined") window.addEventListener("popstate", onPopstate);

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
      window.removeEventListener("popstate", onPopstate);
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
    saveScroll(); // remember where we are, on the OUTGOING entry (so Back can restore it)
    window.history.pushState({}, "", target);
    apply();
    // Forward nav: scroll to the target's #hash (Ro3), or to the top for a new page (Ro2).
    const h = target.indexOf("#");
    scrollAfterForward(h >= 0 ? target.slice(h) : "");
  };

  const link = (to, text) => {
    const onClick = (e) => {
      // Let the browser handle anything that isn't a plain left-click, and any
      // absolute URL (external link) — so "open in new tab" etc. still work.
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Absolute (`scheme:`) OR protocol-relative (`//host/…`) targets are external — let the
      // browser navigate. Ro6: `//host` is a DIFFERENT origin, so pushState() would throw a
      // SecurityError and the click would do nothing.
      if (/^[a-z][a-z0-9+.-]*:/i.test(to) || String(to).startsWith("//")) return;
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

  // view() returns the outlet: a wrapper element the router renders the current page into.
  // Place it once in your layout. It carries the class `zoijs-router-outlet` rather than an
  // inline `style="display: contents"` — so a strict `style-src 'self'` Content-Security-Policy
  // (which blocks inline style attributes, and would see one when a route is prerendered to
  // static HTML) needs no exception. Make the wrapper layout-transparent in your CSS:
  //     .zoijs-router-outlet { display: contents; }
  const view = () => {
    // SSR: no DOM to mount into — return the matched route's template directly so it
    // serializes to HTML. With routed SSR (`location`) that's the request's route;
    // otherwise the "/" route. Reactivity and client navigation attach on hydration.
    if (typeof document === "undefined") {
      const { component, params } = match(appPath());
      return component ? component(params) : null;
    }
    outlet = document.createElement("div");
    outlet.className = "zoijs-router-outlet"; // style it `display: contents` in your CSS (above)
    onCleanup(destroy); // unmount the page + drop the popstate listener on teardown
    renderPage();
    return outlet;
  };

  // Resolve a path to its matched route WITHOUT rendering — `{ component, params }`.
  // For routed SSR: learn which route (and params) a request hits, so you can load
  // that route's data before renderToString. Defaults to the current location; also
  // accepts a URL path (the base and any query string are handled for you).
  const matched = (to) => match(to != null ? stripBase(String(to).split("?")[0]) : appPath());

  const path = () => location.get().path;
  const query = () => location.get().query;

  return { view, link, go, path, query, match: matched, destroy };
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

// Shallow equality of two route-param maps — used to decide whether a URL change actually
// changed the route (vs. only its hash/query), so the page isn't needlessly re-mounted.
function sameParams(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
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

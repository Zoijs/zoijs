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
// No JSX, no build step, no providers, no hooks, no nested-outlet system. It
// builds entirely on the core's public API (html, mount, createState, onCleanup)
// — the core package is unchanged.

import { html, mount, createState, onCleanup } from "@zoijs/core";

/**
 * Create a router from a `{ pattern: component }` map.
 * @param {Record<string, (params: Record<string,string>) => any>} routes
 */
export function createRouter(routes) {
  const { matchers, notFound } = compile(routes);

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
    const { component, params } = match(window.location.pathname);
    if (unmountPage) unmountPage(); // dispose the previous page → its onCleanup runs
    unmountPage = mount(() => (component ? component(params) : null), outlet);
  };

  // Apply a URL change: refresh the reactive cell and swap the page.
  const apply = () => {
    location.set(readLocation());
    renderPage();
  };

  // Back/forward buttons fire "popstate"; re-read the URL when they do.
  window.addEventListener("popstate", apply);
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener("popstate", apply);
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
    const target = String(to);
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
      href=${to}
      onclick=${onClick}
      aria-current=${() => (location.get().path === to ? "page" : false)}
      >${text}</a
    >`;
  };

  // view() returns the outlet: an invisible (display: contents) element the
  // router renders the current page into. Place it once in your layout.
  const view = () => {
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

function segments(path) {
  // "/users/:id" -> ["users", ":id"]; "/" and "" -> []
  return String(path).split("?")[0].split("/").filter(Boolean);
}

function readLocation() {
  return {
    path: window.location.pathname,
    query: parseQuery(window.location.search),
  };
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

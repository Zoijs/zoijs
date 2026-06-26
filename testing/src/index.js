// @zoijs/testing — tiny first-party testing helpers for Zoijs.
//
// It drives the REAL DOM with the platform's own tools: there is no custom
// renderer, no virtual snapshot format, and no test runner. Use it with any
// runner (`node:test`, Vitest) and any DOM (jsdom, happy-dom, a real browser).
// Built entirely on @zoijs/core's public API.
//
//   import { render, screen, fireEvent, waitFor } from "@zoijs/testing";
//
//   const { getByRole } = render(Counter);
//   await fireEvent.click(getByRole("button"));
//   assert.equal(getByRole("button").textContent.trim(), "1");

import { mount, html, createState } from "@zoijs/core";

// ---- async: tick + waitFor --------------------------------------------------
// Zoijs batches reactive updates on a microtask, so a test must yield once after
// changing state before the DOM reflects it. tick() yields a full task (covers
// the microtask flush); waitFor() retries until an assertion stops throwing.

/** Resolve after the queued reactive flush has run. */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Retry `fn` until it returns without throwing (e.g. a getBy* query, or an
 * assertion), or reject with its last error after `timeout` ms.
 */
export async function waitFor(fn, { timeout = 1000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (Date.now() - start >= timeout) throw err;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

// ---- queries ----------------------------------------------------------------

function resolveRoot(root) {
  return typeof root === "function" ? root() : root;
}

function matchText(actual, expected, { exact = true } = {}) {
  if (expected instanceof RegExp) return expected.test(actual);
  const a = actual;
  const e = String(expected);
  return exact ? a === e : a.toLowerCase().includes(e.toLowerCase());
}

// An element's OWN text (its direct text-node children), so a match lands on the
// innermost element that holds the text rather than every ancestor.
function ownText(el) {
  let s = "";
  for (const node of el.childNodes) if (node.nodeType === 3) s += node.textContent;
  return s.trim();
}

// Best-effort accessible name: aria-label, an associated <label>, alt, or text.
function accessibleName(el) {
  const aria = el.getAttribute && el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledby = el.getAttribute && el.getAttribute("aria-labelledby");
  if (labelledby && el.ownerDocument) {
    const l = el.ownerDocument.getElementById(labelledby);
    if (l) return l.textContent.trim();
  }
  if (el.id && el.ownerDocument) {
    for (const label of el.ownerDocument.querySelectorAll("label[for]")) {
      if (label.getAttribute("for") === el.id) return label.textContent.trim();
    }
  }
  if (el.tagName === "IMG") return (el.getAttribute("alt") || "").trim();
  return el.textContent.trim();
}

// Implicit ARIA roles we resolve (a deliberately small, common set) + [role=…].
const IMPLICIT_ROLE = {
  button: "button, [role=button]",
  link: "a[href], [role=link]",
  heading: "h1, h2, h3, h4, h5, h6, [role=heading]",
  textbox: "input:not([type]), input[type=text], input[type=email], input[type=search], input[type=url], input[type=tel], input[type=password], textarea, [role=textbox]",
  checkbox: "input[type=checkbox], [role=checkbox]",
  radio: "input[type=radio], [role=radio]",
  list: "ul, ol, [role=list]",
  listitem: "li, [role=listitem]",
  img: "img, [role=img]",
};

const queryAllByText = (root, text, opts) =>
  [...root.querySelectorAll("*")].filter((el) => matchText(ownText(el), text, opts));

const queryAllByTestId = (root, id) =>
  [...root.querySelectorAll("[data-testid]")].filter((el) => el.getAttribute("data-testid") === id);

const queryAllByRole = (root, role, { name } = {}) => {
  const selector = IMPLICIT_ROLE[role] || `[role=${role}]`;
  let els = selector ? [...root.querySelectorAll(selector)] : [];
  if (name != null) {
    els = els.filter((el) => matchText(accessibleName(el), name, { exact: !(name instanceof RegExp) }));
  }
  return els;
};

const queryAllByLabelText = (root, text, opts) => {
  const out = [];
  for (const label of root.querySelectorAll("label")) {
    if (!matchText(label.textContent.trim(), text, opts)) continue;
    const forId = label.getAttribute("for");
    const control = forId
      ? [...root.querySelectorAll("[id]")].find((e) => e.id === forId)
      : label.querySelector("input, textarea, select");
    if (control && !out.includes(control)) out.push(control);
  }
  return out;
};

// Build the get/query/getAll/queryAll/find/findAll family from one queryAll fn.
function family(label, queryAll) {
  const queryAllBy = (root, ...args) => queryAll(resolveRoot(root), ...args);
  const queryBy = (root, ...args) => {
    const els = queryAllBy(root, ...args);
    if (els.length > 1) throw new Error(`Found multiple elements by ${label}: ${args[0]}`);
    return els[0] || null;
  };
  const getAllBy = (root, ...args) => {
    const els = queryAllBy(root, ...args);
    if (!els.length) throw new Error(`Unable to find an element by ${label}: ${args[0]}`);
    return els;
  };
  const getBy = (root, ...args) => {
    const els = getAllBy(root, ...args);
    if (els.length > 1) throw new Error(`Found multiple elements by ${label}: ${args[0]}`);
    return els[0];
  };
  const findBy = (root, ...args) => waitFor(() => getBy(root, ...args));
  const findAllBy = (root, ...args) => waitFor(() => getAllBy(root, ...args));
  return { queryAllBy, queryBy, getAllBy, getBy, findBy, findAllBy };
}

const QUERIES = {
  Text: family("text", queryAllByText),
  TestId: family("test id", queryAllByTestId),
  Role: family("role", queryAllByRole),
  LabelText: family("label text", queryAllByLabelText),
};

/**
 * Bind the whole query family to a root element (or a function returning one, so
 * `screen` can re-resolve `document.body` each call). Returns an object with
 * getByText / queryByRole / findByTestId / … pre-applied to that root.
 */
export function bindQueries(rootOrFn) {
  const bound = {};
  for (const [suffix, q] of Object.entries(QUERIES)) {
    bound[`queryBy${suffix}`] = (...a) => q.queryBy(rootOrFn, ...a);
    bound[`queryAllBy${suffix}`] = (...a) => q.queryAllBy(rootOrFn, ...a);
    bound[`getBy${suffix}`] = (...a) => q.getBy(rootOrFn, ...a);
    bound[`getAllBy${suffix}`] = (...a) => q.getAllBy(rootOrFn, ...a);
    bound[`findBy${suffix}`] = (...a) => q.findBy(rootOrFn, ...a);
    bound[`findAllBy${suffix}`] = (...a) => q.findAllBy(rootOrFn, ...a);
  }
  return bound;
}

/** Queries bound to `document.body` — for components rendered into the page. */
export const screen = bindQueries(() => document.body);

// ---- render + cleanup -------------------------------------------------------

const mounted = new Set();

/**
 * Mount a component (or template) into a fresh container appended to the page,
 * and return the container plus queries scoped to it and an `unmount`. Every
 * render is tracked so `cleanup()` (e.g. in an afterEach) tears them all down.
 */
export function render(component, { container, baseElement = document.body } = {}) {
  const el = container || document.createElement("div");
  if (!container) baseElement.appendChild(el);
  const unmountCore = mount(component, el);

  const teardown = () => {
    unmountCore();
    if (!container && el.parentNode) el.parentNode.removeChild(el);
  };
  const record = { teardown };
  mounted.add(record);

  return {
    container: el,
    baseElement,
    debug: (node = el) => console.log(node.innerHTML),
    unmount: () => {
      teardown();
      mounted.delete(record);
    },
    ...bindQueries(el),
  };
}

/** Unmount everything `render()` created and remove its containers. */
export function cleanup() {
  for (const record of mounted) {
    try {
      record.teardown();
    } catch {
      // a teardown throwing must not block the others
    }
  }
  mounted.clear();
}

// ---- fireEvent --------------------------------------------------------------

const DEFAULTS = { bubbles: true, cancelable: true };

/**
 * Dispatch a real DOM event on `el`, then yield so Zoijs's batched update has
 * applied — `await fireEvent.click(btn)` leaves the DOM up to date. Pass
 * `{ target: { value } }` to set a property (e.g. an input's value) first.
 */
export function fireEvent(el, type, init = {}) {
  const { target, ...eventInit } = init;
  if (target) Object.assign(el, target);
  el.dispatchEvent(new Event(type, { ...DEFAULTS, ...eventInit }));
  return tick();
}

for (const type of ["click", "input", "change", "submit", "keydown", "keyup", "focus", "blur"]) {
  fireEvent[type] = (el, init) => fireEvent(el, type, init);
}

// ---- mockRouter -------------------------------------------------------------

/**
 * A controllable stand-in for an `@zoijs/router` instance, for testing a
 * component that reads `router.path()` / `router.query()` or calls `router.go()`.
 * `setPath` / `setQuery` let the test simulate navigation; `path`/`query` are
 * reactive, so bindings that read them update.
 */
export function mockRouter({ path = "/", query = {} } = {}) {
  const pathState = createState(path);
  const queryState = createState({ ...query });
  return {
    view: () => document.createElement("div"),
    link: (to, text) => html`<a href=${to}>${text}</a>`,
    go: (to) => pathState.set(to),
    path: () => pathState.get(),
    query: () => queryState.get(),
    destroy: () => {},
    // test controls
    setPath: (p) => pathState.set(p),
    setQuery: (q) => queryState.set({ ...q }),
  };
}

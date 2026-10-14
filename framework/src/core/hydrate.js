// hydrate.js — matching server-rendered DOM to a template before adopting it.
//
// @zoijs/ssr brackets each dynamic region: a slot is `<!--zoijs:[-->…<!--zoijs-->` in the
// outermost template and `<!--zoijs:(-->…<!--zoijs:)-->` deeper (so an older core, which only
// adopts the outermost template, ignores them); each list item / array entry gets a `(…)`
// bracket. A bound element carries `data-zoijs-bind` (outermost) or `data-zoijs-h` (deeper).
//
// A template boundary is adopted only if its static skeleton matches the server DOM exactly
// (elements, static attributes, static text, a marker for every part). Otherwise nothing is
// bound to those nodes: the caller renders that one boundary on the client instead.

import { isDev } from "../reactivity/env.js";

const isStart = (n) => n.nodeType === 8 && (n.data === "zoijs:[" || n.data === "zoijs:(");
const isEnd = (n) => n.nodeType === 8 && (n.data === "zoijs" || n.data === "zoijs:)");
// Not compared: whitespace-only text and plain comments (so indentation around the server
// HTML, e.g. inside the mount target, never forces a re-render).
const ignorable = (n) => (n.nodeType === 3 && !n.data.trim()) || (n.nodeType === 8 && !isStart(n) && !isEnd(n));

/** Nodes strictly between `before` (null = first child) and `end` (null = last child). */
export function regionNodes(parent, before, end) {
  const out = [];
  for (let n = before ? before.nextSibling : parent.firstChild; n && n !== end; n = n.nextSibling) out.push(n);
  return out;
}

// From a start marker, the sibling end marker that closes it (nested brackets skipped).
function closing(s, end) {
  for (let d = 0; s && s !== end; s = s.nextSibling) {
    if (isStart(s)) d++;
    else if (isEnd(s) && !--d) return s;
  }
  return null;
}

/**
 * The `count` item brackets directly inside a slot, as [start, end] pairs. Anything else
 * there (another count, stray content): report, empty the slot, and return null.
 */
export function slotItems(start, anchor, count) {
  let out = [];
  for (let s = start.nextSibling; s !== anchor; s = s.nextSibling) {
    if (ignorable(s)) continue;
    const e = isStart(s) && closing(s, anchor);
    if (!e) {
      out = null;
      break;
    }
    out.push([s, (s = e)]);
  }
  if (out && out.length === count) return out;
  mismatch(anchor.parentNode, false, "different list items");
  for (const n of regionNodes(anchor.parentNode, start, anchor)) n.remove();
  return null;
}

let reason = "";
const fail = (why) => ((reason = why), false);

// Walk template siblings `t` against server siblings `s` (up to `end`), collecting the server
// node for each part in document order: a child part's end marker (its start into `starts`),
// an element part's element.
function match(t, s, end, nodes, starts) {
  for (;; t = t.nextSibling, s = s.nextSibling) {
    while (t && ignorable(t)) t = t.nextSibling;
    while (s && s !== end && ignorable(s)) s = s.nextSibling;
    if (!t) return !s || s === end || fail("extra node");
    if (!s || s === end) return fail("missing node");
    if (t.nodeType === 8) {
      const e = isStart(s) && closing(s, end);
      if (!e) return fail("missing hydration marker");
      starts[nodes.length] = s;
      nodes.push((s = e));
    } else if (t.nodeType !== s.nodeType) return fail("different node");
    else if (t.nodeType === 3) {
      if (t.data !== s.data) return fail("different text");
    } else {
      if (t.localName !== s.localName || t.namespaceURI !== s.namespaceURI) return fail("different element");
      for (const a of t.attributes) if (a.name !== "data-zoijs-bind" && s.getAttribute(a.name) !== a.value) return fail(`different "${a.name}"`);
      if (t.hasAttribute("data-zoijs-bind")) {
        if (!s.hasAttribute("data-zoijs-bind") && !s.hasAttribute("data-zoijs-h")) return fail("missing hydration marker");
        nodes.push(s);
      }
      // Raw-text content (textarea, title, …) is the element's value, not structure.
      if (!/^(textarea|title|script|style)$/.test(t.localName) && !match(t.firstChild, s.firstChild, null, nodes, starts)) return false;
    }
  }
}

/** Match a template's content against the server region: the parts' nodes, or null. */
export function matchTemplate(tpl, parent, before, end) {
  const nodes = [];
  const starts = [];
  return match(tpl.firstChild, before ? before.nextSibling : parent.firstChild, end, nodes, starts) ? { nodes, starts } : null;
}

// ---- outcome of the current mount(…, { hydrate: true }) -----------------------

let status = null;
export const beginHydration = () => (status = { mismatches: 0, root: false });
export const endHydration = () => {
  const s = status;
  status = null;
  return { status: s.root ? "client-rendered" : s.mismatches ? "recovered" : "hydrated", mismatches: s.mismatches };
};

/** Count a recovered mismatch; in dev, say where and why (names and kinds, never values). */
export function mismatch(parent, root, why = reason) {
  if (status) {
    status.mismatches++;
    status.root ||= root;
  }
  if (isDev())
    console.warn(
      `Zoijs hydration: ${why} in ${parent.nodeType === 1 ? `<${parent.localName}>` : "the mount target"}; the client's version replaced it.` +
        (/marker/.test(why) ? " Render the server HTML with renderToString(…, { hydratable: true })." : "")
    );
}

// @zoijs/ssr — render Zoijs components to an HTML string, on the server.
//
//   import { renderToString } from "@zoijs/ssr";
//   const html = renderToString(App);   // "<main>…</main>"
//
// It evaluates a component to HTML with no DOM and zero dependencies. Each dynamic
// value is read once (its current value) and serialized: text is escaped, URL
// attributes are scheme-checked, event handlers and refs are dropped (they are
// wired on the client). The SAME security predicates the browser renderer uses are
// reused from `@zoijs/core/server`, so server output and client output make
// identical safety decisions — no second, drifting implementation.
//
// The output is the component's own markup; you place it inside your HTML shell and
// serve it. On the client, `hydrate(App, target)` adopts that server DOM in place —
// reusing its elements and attaching events/reactivity, with no full re-render and
// no flash (render the markup with `{ hydratable: true }` so the markers are kept).

import {
  isTemplateResult,
  isEachMarker,
  templateHTML,
  toText,
  escapeText,
  escapeAttr,
  isSafeUrl,
  isSafeAttributeName,
  URL_ATTRS,
} from "@zoijs/core/server";
import { mount } from "@zoijs/core";

const CHILD_MARKER = "<!--zoijs-->";
const ELEMENT_MARKER = " data-zoijs-bind";
const SLOT_START = "<!--zoijs:[-->"; // marks where a child slot's content begins

// Set for the duration of a render. When true, the output keeps the markers a
// client needs to hydrate (the slot start/anchor comments and `data-zoijs-bind`);
// when false (the default), markers are stripped for clean static output.
let hydratable = false;
// Markers are only emitted for the OUTERMOST template. Hydration clears and
// re-renders each dynamic slot's content, so nested markers would be discarded —
// and worse, the client's node walk would mis-match them. renderDepth tracks the
// outermost template so only its own slots/elements are marked.
let renderDepth = 0;

/**
 * Render a component (a function returning `html\`…\``, or a template result) to an
 * HTML string. Reactive values are read once.
 *
 * Pass `{ hydratable: true }` to keep the markers `mount(..., { hydrate: true })` /
 * `hydrate()` needs to adopt this DOM on the client; omit it for clean static output
 * (SSG) you don't hydrate.
 * @param {Function|object} component
 * @param {{ hydratable?: boolean }} [options]
 * @returns {string}
 */
export function renderToString(component, options) {
  const result = typeof component === "function" ? component() : component;
  hydratable = !!(options && options.hydratable);
  try {
    return renderValue(result);
  } finally {
    // Reset both, so a component that throws mid-render leaves no leaked state.
    hydratable = false;
    renderDepth = 0;
  }
}

// A "value" is anything that can land in a text slot (or be the whole component):
// a template result, an each() list, an array, a primitive, or nothing.
function renderValue(value) {
  if (value == null || value === true || value === false) return ""; // render nothing
  if (isTemplateResult(value)) return renderTemplate(value);
  if (isEachMarker(value)) return renderEach(value);
  if (Array.isArray(value)) {
    let out = "";
    for (const v of value) out += renderValue(v);
    return out;
  }
  if (typeof value === "object" && typeof value.nodeType === "number") {
    // A raw DOM Node can't exist (or be serialized) on a server.
    throw new Error("@zoijs/ssr: a raw DOM node can't be server-rendered — return html`…` from components instead.");
  }
  return escapeText(toText(value)); // string / number / bigint → escaped text
}

function renderEach(marker) {
  const items = typeof marker.items === "function" ? marker.items() : marker.items;
  if (items == null) return "";
  let out = "";
  for (const item of items) out += renderValue(marker.renderFn(item));
  return out;
}

// Walk the static HTML skeleton, injecting values at each marker. The skeleton's
// markers appear in document order, and `parts` is in the same order, so a single
// linear pass with a part cursor stays aligned.
function renderTemplate(result) {
  renderDepth++;
  const top = hydratable && renderDepth === 1; // only the outermost template is marked
  const skeleton = templateHTML(result);
  const { parts, values } = result;
  let out = "";
  let pos = 0;
  let p = 0;

  while (pos < skeleton.length) {
    const childAt = skeleton.indexOf(CHILD_MARKER, pos);
    const elemAt = skeleton.indexOf(ELEMENT_MARKER, pos);
    if (childAt === -1 && elemAt === -1) {
      out += skeleton.slice(pos);
      break;
    }
    const childNext = elemAt === -1 || (childAt !== -1 && childAt < elemAt);
    if (childNext) {
      out += skeleton.slice(pos, childAt);
      const part = parts[p++]; // { type: "child", hole }
      const raw = values[part.hole];
      const content = renderValue(typeof raw === "function" ? raw() : raw);
      // Hydratable (top level only): bracket the content with the slot start marker
      // + keep the anchor, so the client can clear exactly this slot and re-render.
      out += top ? SLOT_START + content + CHILD_MARKER : content;
      pos = childAt + CHILD_MARKER.length;
    } else {
      // Trailing whitespace here is the separator left where dynamic attributes
      // were sliced out of the skeleton — insignificant intra-tag whitespace. Trim
      // it so the emitted start tag is clean (e.g. `<input value="x"/>`).
      out += skeleton.slice(pos, elemAt).replace(/[ \t\n\r\f]+$/, "");
      const part = parts[p++]; // { type: "element", attrs }
      // Hydratable (top level only): keep `data-zoijs-bind` so the client finds this
      // element to adopt (attach its events / reactive attributes in place).
      if (top) out += ELEMENT_MARKER;
      out += renderAttributes(part.attrs, values);
      pos = elemAt + ELEMENT_MARKER.length;
    }
  }
  renderDepth--;
  return out;
}

function renderAttributes(attrs, values) {
  let out = "";
  for (const attr of attrs) {
    if (attr.event) continue; // event handlers are wired on the client
    if (attr.name === "ref") continue; // ref is a client-only binding
    out += serializeAttribute(attr.name, computeAttribute(attr, values));
  }
  return out;
}

function computeAttribute(attr, values) {
  if (attr.whole) {
    const raw = values[attr.holes[0]];
    return typeof raw === "function" ? raw() : raw;
  }
  // static text + one or more holes → a joined string
  let s = attr.strings[0];
  for (let i = 0; i < attr.holes.length; i++) {
    const hv = values[attr.holes[i]];
    s += (typeof hv === "function" ? hv() : hv) + attr.strings[i + 1];
  }
  return s;
}

// Mirror the client renderer's applyAttribute decisions, but emit a string:
// unsafe names dropped, unsafe URLs dropped, value/checked serialized as the
// markup form, false/null omitted, true → bare, otherwise name="escaped".
function serializeAttribute(name, value) {
  if (!isSafeAttributeName(name)) return ""; // on*, srcdoc
  if (URL_ATTRS.has(name) && !isSafeUrl(toText(value))) return ""; // dangerous scheme
  if (name === "checked") return value ? " checked" : "";
  if (name === "value") {
    return value == null || value === false ? "" : ` value="${escapeAttr(value)}"`;
  }
  if (value === false || value == null) return "";
  if (value === true) return ` ${name}=""`;
  return ` ${name}="${escapeAttr(value)}"`;
}

// ---- hydration (client) -----------------------------------------------------

/**
 * Hydrate a server-rendered page: run `component` and ADOPT the existing DOM inside
 * `target` (from `renderToString(component, { hydratable: true })`) instead of
 * re-creating it. The server's elements are reused exactly and their events +
 * reactive attributes are attached in place — no full re-render, no flash. Returns
 * an `unmount()`. (Thin wrapper over the core's `mount(..., { hydrate: true })`.)
 * @param {Function|object} component
 * @param {Element|string} target
 * @returns {() => void} unmount
 */
export function hydrate(component, target) {
  return mount(component, target, { hydrate: true });
}

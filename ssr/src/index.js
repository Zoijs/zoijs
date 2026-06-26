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
// serve it. On the client, `mount(App, target)` takes over the page. (Seamless
// hydration that adopts the server DOM in place is a future core capability — see
// the package README and RFC 0008.)

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

const CHILD_MARKER = "<!--zoijs-->";
const ELEMENT_MARKER = " data-zoijs-bind";

/**
 * Render a component (a function returning `html\`…\``, or a template result) to an
 * HTML string. Reactive values are read once.
 * @param {Function|object} component
 * @returns {string}
 */
export function renderToString(component) {
  const result = typeof component === "function" ? component() : component;
  return renderValue(result);
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
      out += renderValue(typeof raw === "function" ? raw() : raw);
      pos = childAt + CHILD_MARKER.length;
    } else {
      // Trailing whitespace here is the separator left where dynamic attributes
      // were sliced out of the skeleton — insignificant intra-tag whitespace. Trim
      // it so the emitted start tag is clean (e.g. `<input value="x"/>`).
      out += skeleton.slice(pos, elemAt).replace(/[ \t\n\r\f]+$/, "");
      const part = parts[p++]; // { type: "element", attrs }
      out += renderAttributes(part.attrs, values);
      pos = elemAt + ELEMENT_MARKER.length;
    }
  }
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

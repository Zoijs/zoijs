// server.js — DOM-free building blocks for server rendering (@zoijs/ssr).
//
// Reached via the subpath `@zoijs/core/server`. It exposes exactly what a string
// renderer needs to walk an html() result and emit safe HTML WITHOUT a DOM:
//
//   - the static HTML skeleton + part descriptors of a template result,
//   - markers for the two value kinds (a template result, an each() list),
//   - and the SAME security predicates the client renderer uses, so server output
//     and client output make identical safety decisions (escaping, URL schemes,
//     unsafe attribute names).
//
// Nothing here touches the DOM, and the main nine-function surface is unchanged —
// this is server tooling behind its own subpath, like `@zoijs/core/devtools`.

export {
  toText,
  escapeText,
  escapeAttr,
  isSafeUrl,
  isSafeAttributeName,
  URL_ATTRS,
} from "./utils/security.js";

/** True for an `html\`…\`` result (brand check — does not build the DOM template). */
export function isTemplateResult(value) {
  return !!(value && value.__zoijsTemplate === true);
}

/** True for an `each(...)` list marker. */
export function isEachMarker(value) {
  return !!(value && value.__zoijsEach === true);
}

/**
 * The static HTML skeleton of a template result — the author's HTML with unique
 * markers (`<!--zoijs-->` for a child slot, ` data-zoijs-bind` on a dynamic
 * element). A server renderer injects values at those markers. The result's
 * `parts` (document-ordered descriptors) and `values` are read directly.
 */
export function templateHTML(result) {
  return result.__staticHTML;
}

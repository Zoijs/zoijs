// @zoijs/head — set the page title and meta description from a component.
//
// The whole idea: a setter snapshots the current value and registers an
// onCleanup that restores it. So when a routed page unmounts, its title/meta
// revert automatically, and the next page sets its own — no head manager, no
// providers, no reconciliation.
//
//   import { html } from "@zoijs/core";
//   import { title, description } from "@zoijs/head";
//
//   function About() {
//     title("About | Zoijs App");
//     description("Learn more about this Zoijs application.");
//     return html`<h1>About</h1>`;
//   }
//
// Built entirely on the core's public API (onCleanup) — the core is unchanged.

import { onCleanup } from "@zoijs/core";

/**
 * Set `document.title`. When the calling component unmounts, the previous title
 * is restored.
 * @param {string} value
 */
export function title(value) {
  const previous = document.title;
  document.title = String(value);
  onCleanup(() => {
    document.title = previous;
  });
}

/**
 * Set `<meta name="description">` (creating it if needed). Restored on unmount.
 * @param {string} value
 */
export function description(value) {
  return meta("description", value);
}

/**
 * Set `<meta name="...">` (creating it if needed) to `content`. When the calling
 * component unmounts, the tag is restored to its previous content — or removed
 * if this call created it.
 * @param {string} name
 * @param {string} content
 */
export function meta(name, content) {
  let el = findMeta(name);
  const created = !el;
  const previous = el ? el.getAttribute("content") : null;

  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", String(name));
    document.head.appendChild(el);
  }
  el.setAttribute("content", String(content));

  onCleanup(() => {
    if (created) el.remove();
    else if (previous === null) el.removeAttribute("content");
    else el.setAttribute("content", previous);
  });
}

// Match by reading the name attribute (not a built selector), so an odd name
// can never break a CSS selector or inject one.
function findMeta(name) {
  const wanted = String(name);
  for (const el of document.head.querySelectorAll("meta[name]")) {
    if (el.getAttribute("name") === wanted) return el;
  }
  return null;
}

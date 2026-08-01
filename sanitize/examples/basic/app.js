// Demo for @zoijs/sanitize: an untrusted HTML string, rendered as safe nodes in a
// Zoijs binding. Also exposes `window.sanitizeTest` so the browser tests can push
// payloads through sanitize() in a real browser and confirm nothing executes.

import { html, mount, createState } from "@zoijs/core";
import { sanitize } from "@zoijs/sanitize";

// A "post body" that mixes legitimate rich text with injection attempts.
const DIRTY =
  '<h2>Release notes</h2>' +
  '<p>Thanks for trying <strong>Zoijs</strong>! Read the ' +
  '<a href="https://zoijs.dev" target="_blank">docs</a>.</p>' +
  '<img src="../../../framework/examples/favicon.svg" alt="logo" width="32" />' +
  '<script>window.__xss = true<\/script>' +
  '<p onclick="window.__xss = true">Nothing runs from this paragraph.</p>' +
  '<a href="javascript:window.__xss = true">disarmed link</a>';

function App() {
  const source = createState(DIRTY);
  return html`
    <article data-testid="output">${() => sanitize(source.get())}</article>
  `;
}

mount(App, "#app");

// Test hook — lets the Playwright spec sanitize arbitrary payloads and observe
// whether anything executes when the result is inserted into the live document.
window.sanitizeTest = {
  sanitize,
  run(payload) {
    window.__xss = false;
    const host = document.createElement("div");
    document.body.appendChild(host);
    for (const node of sanitize(payload)) host.appendChild(node);
    return host;
  },
};

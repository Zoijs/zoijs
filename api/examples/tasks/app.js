// @zoijs/api example: a same-origin JSON list, an HTTP error, and a blocked cross-origin URL.
// The "API" is static JSON served next to this page.

import { html, mount, each } from "@zoijs/core";
import { api } from "@zoijs/api";

function Tasks() {
  const tasks = api("./data/tasks.json");
  return html`
    <section id="tasks">
      <h2>Tasks <button onclick=${() => tasks.refresh()} disabled=${() => tasks.loading()}>Refresh</button></h2>
      ${() => {
        if (tasks.loading() && !tasks.data()) return html`<p class="muted">Loading…</p>`;
        if (tasks.error()) return html`<p role="alert">Failed: ${tasks.error().message}</p>`;
        return html`<ul>${each(() => tasks.data() ?? [], (t) => t.id, (t) => html`<li>${t.title}</li>`)}</ul>`;
      }}
    </section>
  `;
}

// Shows the structured ApiError for a URL that is expected to fail.
function Failing({ id, url }) {
  const req = api(url);
  return html`
    <section id=${id}>
      ${() => {
        const err = req.error();
        if (!err) return html`<p class="muted">${req.loading() ? "Loading…" : "Unexpectedly succeeded"}</p>`;
        return html`<p role="alert" data-type=${err.type} data-status=${String(err.status)}>${err.message}</p>`;
      }}
    </section>
  `;
}

function App() {
  return html`
    <h1>@zoijs/api</h1>
    ${Tasks()}
    <h2>HTTP error</h2>
    ${Failing({ id: "missing", url: "./data/missing.json" })}
    <h2>Cross-origin (blocked, no request is sent)</h2>
    ${Failing({ id: "cross-origin", url: "https://example.com/data" })}
  `;
}

mount(App, "#app");

// Refresh button — re-run the fetcher on demand. The old value stays visible
// while the new one loads, and the button disables itself during the load.

import { html, mount } from "@zoijs/core";
import { resource } from "@zoijs/resource";
import { delay } from "../fake-api.js";

function ServerTime() {
  const time = resource(() => delay(new Date().toLocaleTimeString(), 500));

  return html`
    <h1>Refresh</h1>
    <p>
      <button onclick=${() => time.refresh()} disabled=${() => time.loading()}>
        ${() => (time.loading() ? "Loading…" : "Refresh")}
      </button>
    </p>
    ${() =>
      time.error()
        ? html`<p class="err">${time.error().message}</p>`
        : html`<p class="time">Server time: <strong>${() => time.data()}</strong></p>`}
  `;
}

mount(ServerTime, "#app");

// User profile — one resource, three states (loading / error / success).

import { html, mount } from "@zoijs/core";
import { resource } from "@zoijs/resource";
import { delay, sampleUser } from "../fake-api.js";

function Profile() {
  const user = resource(() => delay(sampleUser));

  return html`
    <h1>User profile</h1>
    ${() =>
      user.loading()
        ? html`<p class="muted">Loading…</p>`
        : user.error()
          ? html`<p class="err">${user.error().message}</p>`
          : html`
              <div class="card">
                <h2>${() => user.data().name}</h2>
                <p class="muted">${() => user.data().title}</p>
              </div>
            `}
  `;
}

mount(Profile, "#app");

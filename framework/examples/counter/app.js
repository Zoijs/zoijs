// Counter — built with Zoijs.
//
// Milestone 2: the count is a *reactive binding* — note ${() => count.get()}.
// The arrow function makes it live: when count changes, only that text node
// updates in place. The component never re-runs.

import { html, mount, createState } from "../../src/index.js";

function Counter() {
  const count = createState(0);

  return html`
    <div class="counter">
      <h1>Zoijs Counter</h1>
      <p class="count">${() => count.get()}</p>
      <button onclick=${() => count.set(count.get() + 1)}>Increment</button>
      <button onclick=${() => count.set(count.get() - 1)}>Decrement</button>
    </div>
  `;
}

mount(Counter, document.querySelector("#app"));

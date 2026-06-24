// computed() — derived values that update automatically.
//
// `fullName` is derived from two states; `parity` from a third. We never set
// them — they recompute lazily when their inputs change, and only the bindings
// that read them update.

import { html, mount, createState, computed } from "../../src/index.js";

function App() {
  const first = createState("Jane");
  const last = createState("Doe");
  const fullName = computed(() => `${first.get()} ${last.get()}`.trim());

  const count = createState(0);
  const parity = computed(() => (count.get() % 2 === 0 ? "even" : "odd"));

  return html`
    <div class="demo">
      <h1>computed()</h1>
      <label>First<input value=${() => first.get()} oninput=${(e) => first.set(e.target.value)} /></label>
      <label>Last<input value=${() => last.get()} oninput=${(e) => last.set(e.target.value)} /></label>
      <p>Full name: <strong>${() => fullName.get()}</strong></p>
      <hr />
      <p>Count: ${() => count.get()} — it is <strong>${() => parity.get()}</strong></p>
      <button onclick=${() => count.set(count.get() + 1)}>+1</button>
    </div>
  `;
}

mount(App, document.querySelector("#app"));

// Live text input — demonstrates fine-grained text bindings reacting to input.
//
// Typing fires `oninput`, which sets state; the two ${() => ...} bindings below
// update in place. Nothing else re-renders.

import { html, mount, createState } from "../../src/index.js";

function LiveInput() {
  const text = createState("");

  return html`
    <div class="demo">
      <h1>Live Text Input</h1>
      <input placeholder="Type here..." oninput=${(e) => text.set(e.target.value)} />
      <p>You typed: <strong>${() => text.get()}</strong></p>
      <p>Length: ${() => text.get().length}</p>
    </div>
  `;
}

mount(LiveInput, document.querySelector("#app"));

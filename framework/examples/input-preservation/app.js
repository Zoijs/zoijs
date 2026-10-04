// Input-preservation demo — keyed reuse keeps live DOM state.
//
// Type something into a row's input, then Reverse or Add. Because matching keys
// reuse the same <input> node (it is moved, not recreated), the text you typed
// — and focus — survive the reorder. A non-keyed rebuild would lose them.

import { html, mount, each, createState } from "../../src/index.js";

const rows = createState([
  { id: 1 },
  { id: 2 },
  { id: 3 },
]);
let nextId = 4;

const reverse = () => rows.set([...rows.get()].reverse());
const addTop = () => rows.set([{ id: nextId++ }, ...rows.get()]);

function App() {
  return html`
    <div class="demo">
      <h1>Input Preservation</h1>
      <div class="row">
        <button onclick=${reverse}>Reverse</button>
        <button onclick=${addTop}>Add to top</button>
      </div>
      <ul>${each(
        () => rows.get(),
        (r) => r.id,
        (r) => html`
          <li>
            <label>Row ${r.id}</label>
            <input placeholder="type here, then reorder..." />
          </li>`
      )}</ul>
      <p>Type into a row, then reorder — your text and focus stay put.</p>
    </div>
  `;
}

mount(App, document.querySelector("#app"));

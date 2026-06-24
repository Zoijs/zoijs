// Reorder demo — keyed reconciliation MOVES existing nodes, never recreates.
//
// Each <li> is tagged with a colour set once when the node is created. After a
// shuffle the colours travel with their items, proving the same DOM nodes were
// moved rather than rebuilt.

import { html, mount, each, createState } from "../../src/index.js";

const colors = ["#ffd5d5", "#d5ffd9", "#d5e5ff", "#fff0d5", "#eedcff"];
const items = createState(
  [1, 2, 3, 4, 5].map((n) => ({ id: n, label: `Item ${n}`, color: colors[n - 1] }))
);

const shuffle = () => {
  const next = [...items.get()];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  items.set(next);
};
const reverse = () => items.set([...items.get()].reverse());

function App() {
  return html`
    <div class="demo">
      <h1>Reorder (nodes move, not rebuild)</h1>
      <div class="row">
        <button onclick=${shuffle}>Shuffle</button>
        <button onclick=${reverse}>Reverse</button>
      </div>
      <ul>${each(
        () => items.get(),
        (it) => it.id,
        (it) => html`<li style=${`background:${it.color}`}>${it.label}</li>`
      )}</ul>
      <p>Each item's colour is set once at creation. If colours follow the items
         after shuffling, the nodes were moved — not recreated.</p>
    </div>
  `;
}

mount(App, document.querySelector("#app"));

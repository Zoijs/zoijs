import { html, mount, createState } from "@zoijs/core";

// A complete Zoijs app: state, markup, and one mount call. No build step.
function App() {
  const count = createState(0);

  return html`
    <main>
      <h1>{{APP_TITLE}}</h1>
      <p>Edit <code>src/app.js</code> and reload.</p>
      <button onclick=${() => count.set(count.get() + 1)}>
        Clicked ${() => count.get()} times
      </button>
    </main>
  `;
}

mount(App, "#app");

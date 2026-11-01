// Theme toggle — the user's choice is saved to localStorage and restored on load.

import { html, mount } from "@zoijs/core";
import { storage } from "@zoijs/storage";

const theme = storage("demo-theme", "light");

// Apply the persisted theme right away, and again on every change.
const apply = (t) => document.documentElement.setAttribute("data-theme", t);
apply(theme.peek());

function App() {
  const toggle = () => {
    const next = theme.get() === "dark" ? "light" : "dark";
    theme.set(next);
    apply(next);
  };

  return html`
    <h1>Theme toggle</h1>
    <p>Pick a theme, then reload the page — your choice sticks.</p>
    <button onclick=${toggle}>
      Switch to ${() => (theme.get() === "dark" ? "light" : "dark")} mode
    </button>
    <p class="status">Current theme: <strong data-testid="theme">${() => theme.get()}</strong></p>
  `;
}

mount(App, "#app");

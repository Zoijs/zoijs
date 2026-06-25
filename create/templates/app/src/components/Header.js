import { html } from "@zoijs/core";

// Parent -> child: the Header receives derived stats as reader functions and
// renders the hero. It holds no state of its own.
export function Header({ completed, total }) {
  return html`
    <header class="hero">
      <span class="badge">Built with Zoijs</span>
      <h1>{{APP_TITLE}}</h1>
      <p class="tagline">A tiny project dashboard — plain HTML, CSS, and JavaScript. No build step.</p>
      <p class="summary">
        <strong>${() => completed()}</strong> of <strong>${() => total()}</strong> tasks done
      </p>
    </header>
  `;
}

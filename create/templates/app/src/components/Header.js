import { html } from "@zoijs/core";

// Parent → child communication: Header receives plain data (`title`) and a
// reader function (`remaining`) as arguments. It owns no state of its own.
export function Header({ title, remaining }) {
  return html`
    <header>
      <h1>${title}</h1>
      <p class="count">
        ${() => remaining()} task${() => (remaining() === 1 ? "" : "s")} left
      </p>
    </header>
  `;
}

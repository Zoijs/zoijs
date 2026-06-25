import { html } from "@zoijs/core";

// A small, reusable presentational component used four times in the stats grid.
// Parent -> child: it simply renders the label, value, and accent it is given —
// composition without any shared state.
export function StatCard({ label, value, accent }) {
  return html`
    <div class="card stat stat-${accent}">
      <div class="stat-value">${() => value()}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

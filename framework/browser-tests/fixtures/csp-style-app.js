// External bootstrap for csp-style.html: renders every style-binding form under the strict
// style-src policy, records CSP violations, and exposes controls for the spec.

window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => {
  window.__violations.push(`${e.violatedDirective} ${e.blockedURI || "(inline)"} ${e.sample || ""}`.trim());
});
window.__error = null;

try {
  const { html, mount, createState } = await import("/src/index.js");
  const h = createState(10);
  const obj = createState({ color: "rgb(255, 0, 0)", marginTop: "4px" });
  window.__style = {
    grow: () => h.set(h.peek() + 10),
    swap: () => obj.set({ color: "rgb(0, 0, 255)" }),
    clear: () => obj.set(null),
  };
  mount(
    () => html`
      <div id="obj" style=${() => ({ height: `${h.get()}px`, "--gap": "6px", opacity: 0.5 })}></div>
      <div id="str" style=${"width: 33px; color: rgb(0, 128, 0)"}></div>
      <div id="mixed" style="width: ${() => h.get() * 2}px; border-top-width: 2px"></div>
      <div id="swap" style=${() => obj.get()}></div>
      <svg><rect id="rect" width="5" height="5" style=${{ fill: "rgb(255, 0, 0)" }} /></svg>
    `,
    "#app"
  );
  window.__rendered = true;
} catch (err) {
  window.__error = String((err && err.message) || err);
}

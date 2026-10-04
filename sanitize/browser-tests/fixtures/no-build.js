// Loads core + sanitize through the page's import map and sanitizes a hostile string.
window.__r = { error: null, html: null };
try {
  const { html, mount } = await import("@zoijs/core");
  const { sanitize } = await import("@zoijs/sanitize");
  const nodes = sanitize('<b id="x">ok</b><img src=x onerror="window.__xss=1"><a href="javascript:alert(1)">l</a>');
  window.__r.html = nodes.map((n) => n.outerHTML ?? n.textContent).join("");
  mount(() => html`<article>${nodes}</article>`, "#app");
} catch (err) {
  window.__r.error = String((err && err.message) || err);
}
window.__r.done = true;

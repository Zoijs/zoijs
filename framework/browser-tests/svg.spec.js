// SVG context in real engines (L1, found by Zoijs Insight). each() items, nested and conditional
// templates inside an <svg> must be SVG elements that actually draw: an element in the HTML
// namespace has no geometry (no getBBox) and paints nothing. Core ≤ 1.9.0 parsed them as HTML.

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("each() items, conditional and nested templates inside <svg> draw, and stay SVG across updates", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { html, mount, each, createState } = await import("/src/index.js");
    const target = document.body.appendChild(document.createElement("div"));
    const pts = createState([{ id: 1, x: 10 }, { id: 2, x: 30 }]);
    const show = createState(true);
    const Bars = () => html`${each(() => pts.get(), (p) => p.id, (p) => html`<rect class="bar" x=${() => p.x} y="0" width="5" height="20" />`)}`;
    mount(
      () => html`<svg width="100" height="40" viewBox="0 0 100 40">
        <defs><linearGradient id="lg">${each([0, 1], (n) => n, (n) => html`<stop offset=${n} stop-color="red" />`)}</linearGradient></defs>
        <g>${Bars}</g>
        ${() => (show.get() ? html`<circle class="dot" cx="50" cy="20" r="5" />` : null)}
      </svg>`,
      target
    );
    const snap = () => [...target.querySelectorAll("rect.bar, circle.dot, stop")].map((el) => {
      const b = el.getBBox ? el.getBBox() : null;
      return { tag: el.localName, svg: el instanceof SVGElement, w: b ? b.width : 0 };
    });
    const before = snap();
    pts.set([{ id: 2, x: 30 }, { id: 3, x: 50 }, { id: 1, x: 70 }]);
    show.set(false);
    await new Promise((res) => setTimeout(res));
    show.set(true);
    await new Promise((res) => setTimeout(res));
    const after = snap();
    const xs = [...target.querySelectorAll("rect.bar")].map((el) => el.getAttribute("x"));
    target.remove();
    return { before, after, xs };
  });
  for (const el of [...r.before, ...r.after]) expect(el.svg, el.tag).toBe(true);
  expect(r.before.filter((e) => e.tag !== "stop").every((e) => e.w > 0)).toBe(true); // real geometry
  expect(r.after.filter((e) => e.tag === "rect")).toHaveLength(3);
  expect(r.xs).toEqual(["30", "50", "70"]);
});

test("<foreignObject> content stays HTML", async ({ page }) => {
  const ns = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    const target = document.createElement("div");
    mount(() => html`<svg><foreignObject width="50" height="20">${html`<p>hi</p>`}</foreignObject></svg>`, target);
    return target.querySelector("p").namespaceURI;
  });
  expect(ns).toBe("http://www.w3.org/1999/xhtml");
});

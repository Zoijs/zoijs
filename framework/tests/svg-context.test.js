// SVG context for templates (L1, found by Zoijs Insight). A template is parsed once, in HTML
// context, so a fragment meant for an <svg> — an each() item, a nested or conditional template,
// a component — used to come out as HTML elements that don't draw (core ≤ 1.9.0). Content
// inserted under an SVG element (not <foreignObject>) is now parsed in SVG context.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, each, createState, onCleanup } from "../src/index.js";
import { flush } from "../src/reactivity/scheduler.js";

const SVG = "http://www.w3.org/2000/svg";
const XHTML = "http://www.w3.org/1999/xhtml";
const host = () => document.body.appendChild(document.createElement("div"));
const ns = (el, sel) => [...el.querySelectorAll(sel)].map((n) => n.namespaceURI);

test("each() items inside <svg> and <g> are SVG elements, with their attributes", () => {
  const el = host();
  mount(() => html`<svg viewBox="0 0 10 10"><g>${each([1, 2], (n) => n, (n) => html`<circle cx=${n} r="1" />`)}</g></svg>`, el);
  assert.deepEqual(ns(el, "circle"), [SVG, SVG]);
  assert.deepEqual([...el.querySelectorAll("circle")].map((c) => c.getAttribute("cx")), ["1", "2"]);
});

test("keyed insert, remove, reorder and attribute updates keep SVG elements (and their identity)", () => {
  const el = host();
  const pts = createState([{ id: "a", x: 1 }, { id: "b", x: 2 }]);
  mount(() => html`<svg>${each(() => pts.get(), (p) => p.id, (p) => html`<rect data-id=${p.id} x=${() => p.x} />`)}</svg>`, el);
  const [a, b] = el.querySelectorAll("rect");

  pts.set([{ id: "b", x: 2 }, { id: "c", x: 3 }, { id: "a", x: 9 }]); // reorder + insert + update
  flush();
  const rects = [...el.querySelectorAll("rect")];
  assert.deepEqual(rects.map((r) => r.dataset.id), ["b", "c", "a"]);
  assert.deepEqual(rects.map((r) => r.namespaceURI), [SVG, SVG, SVG], "the inserted item is SVG too");
  assert.equal(rects[0], b, "moved, not recreated");
  assert.equal(rects[2], a);
  assert.equal(a.getAttribute("x"), "9", "reactive attribute on a reused item");

  pts.set([{ id: "c", x: 3 }]); // remove
  flush();
  assert.deepEqual(ns(el, "rect"), [SVG]);
});

test("case-sensitive SVG attributes survive (viewBox, preserveAspectRatio)", () => {
  const el = host();
  mount(() => html`<svg>${each([1], (n) => n, () => html`<svg viewBox="0 0 4 4" preserveAspectRatio="none"></svg>`)}</svg>`, el);
  const inner = el.querySelector("svg svg");
  assert.equal(inner.getAttribute("viewBox"), "0 0 4 4");
  assert.equal(inner.getAttribute("preserveAspectRatio"), "none");
});

test("nested structures: <defs>, <clipPath>, <linearGradient> stops, conditional and static children", () => {
  const el = host();
  const stops = createState(["red", "blue"]);
  const show = createState(true);
  mount(
    () => html`<svg>
      <defs>
        <linearGradient id="g">${each(() => stops.get(), (c) => c, (c) => html`<stop stop-color=${c} />`)}</linearGradient>
        <clipPath id="c">${html`<circle r="2" />`}</clipPath>
      </defs>
      ${() => (show.get() ? html`<g><path d="M0 0" /></g>` : null)}
    </svg>`,
    el
  );
  assert.deepEqual(ns(el, "stop, #c circle, g, path"), [SVG, SVG, SVG, SVG, SVG]);
  stops.set(["red", "green", "blue"]);
  show.set(false);
  flush();
  assert.deepEqual(ns(el, "stop"), [SVG, SVG, SVG]);
  assert.equal(el.querySelector("g"), null);
  show.set(true);
  flush();
  assert.equal(el.querySelector("g").namespaceURI, SVG);
});

test("a component's root-level each() inherits the SVG context of where it is inserted", () => {
  const el = host();
  const items = createState([1, 2]);
  const Dots = () => html`${each(() => items.get(), (n) => n, (n) => html`<circle r=${n} />`)}`;
  mount(() => html`<svg>${Dots}${() => Dots()}</svg>`, el);
  assert.deepEqual(ns(el, "circle"), [SVG, SVG, SVG, SVG]);
  items.set([1, 2, 3]);
  flush();
  assert.deepEqual(ns(el, "circle"), [SVG, SVG, SVG, SVG, SVG, SVG]);
});

test("<foreignObject> content stays HTML; HTML around an <svg> stays HTML", () => {
  const el = host();
  mount(() => html`<svg><foreignObject>${html`<p>hi</p>`}${each([1], (n) => n, () => html`<b>b</b>`)}</foreignObject></svg>${html`<p>out</p>`}`, el);
  assert.deepEqual(ns(el, "p, b"), [XHTML, XHTML, XHTML]);
});

test("mount() into an <svg> element parses the component as SVG", () => {
  const svg = document.createElementNS(SVG, "svg");
  document.body.appendChild(svg);
  const unmount = mount(() => html`<circle r="1" />`, svg);
  assert.equal(svg.firstElementChild.namespaceURI, SVG);
  unmount();
  assert.equal(svg.childNodes.length, 0);
});

test("removed SVG items run their cleanup; unmount disposes the whole list", () => {
  const el = host();
  const items = createState([1, 2, 3]);
  const cleaned = [];
  const unmount = mount(
    () => html`<svg>${each(() => items.get(), (n) => n, (n) => {
      onCleanupFor(n, cleaned);
      return html`<circle r=${n} />`;
    })}</svg>`,
    el
  );
  items.set([1, 3]);
  flush();
  assert.deepEqual(cleaned, [2]);
  unmount();
  assert.deepEqual(cleaned.sort(), [1, 2, 3]);
  assert.equal(el.querySelectorAll("circle").length, 0);
});

test("ordinary HTML lists are unaffected", () => {
  const el = host();
  mount(() => html`<ul>${each([1, 2], (n) => n, (n) => html`<li>${n}</li>`)}</ul>`, el);
  assert.deepEqual(ns(el, "li"), [XHTML, XHTML]);
});

function onCleanupFor(n, out) {
  onCleanup(() => out.push(n));
}

// ---- MathML and unsafeHTML (follow-ups to L1) --------------------------------------------------
const MATHML = "http://www.w3.org/1998/Math/MathML";

test("each() items and nested templates inside <math> are MathML; <mi>/<mtext> content is HTML", () => {
  const el = host();
  const terms = createState(["x", "y"]);
  mount(() => html`<math><mrow>${each(() => terms.get(), (t) => t, (t) => html`<mi>${t}</mi><mo>+</mo>`)}</mrow><mtext>${html`<b>note</b>`}</mtext></math>`, el);
  assert.deepEqual(ns(el, "mi, mo"), [MATHML, MATHML, MATHML, MATHML]);
  assert.equal(el.querySelector("b").namespaceURI, XHTML, "text integration point → HTML");
  terms.set(["x", "y", "z"]);
  flush();
  assert.deepEqual(ns(el, "mi"), [MATHML, MATHML, MATHML]);
});

test("unsafeHTML() inside <svg> parses as SVG; inside <foreignObject> as HTML", async () => {
  const { unsafeHTML } = await import("../src/unsafe.js");
  const el = host();
  mount(() => html`<svg>${unsafeHTML('<circle r="1"/><g><rect/></g>')}<foreignObject>${unsafeHTML("<p>x</p>")}</foreignObject></svg>`, el);
  assert.deepEqual(ns(el, "circle, g, rect"), [SVG, SVG, SVG]);
  assert.equal(el.querySelector("p").namespaceURI, XHTML);
});

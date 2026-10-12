// Real-engine checks for the list/binding fixes (found while reviewing Zoijs Insight): multi-root
// each() items keep their binding content through reorders (live spans), list-item proxies
// enumerate, class bindings keep foreign classes, and MathML/unsafeHTML get the right namespace.

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("multi-root items: reorder, toggle and remove keep each item's rows together", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { html, mount, each, createState } = await import("/src/index.js");
    const tick = () => new Promise((res) => setTimeout(res));
    const target = document.createElement("div");
    const items = createState([{ id: 1, show: true }, { id: 2, show: true }]);
    mount(() => html`<table><tbody>${each(() => items.get(), (i) => i.id, (i) => html`<tr><td>a${i.id}</td></tr>${() => (i.show ? html`<tr><td>b${i.id}</td></tr>` : null)}`)}</tbody></table>`, target);
    const rows = () => [...target.querySelectorAll("td")].map((t) => t.textContent).join(",");
    const out = [rows()];
    items.set([{ id: 2, show: true }, { id: 1, show: true }]); await tick(); out.push(rows());
    items.set([{ id: 1, show: false }, { id: 2, show: true }]); await tick();
    items.set([{ id: 2, show: true }, { id: 1, show: true }]); await tick(); out.push(rows());
    items.set([{ id: 1, show: true }]); await tick(); out.push(rows());
    return out;
  });
  expect(r).toEqual(["a1,b1,a2,b2", "a2,b2,a1,b1", "a2,b2,a1,b1", "a1,b1"]);
});

test("list-item proxies: spread, keys, JSON, arrays and instanceof", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { html, mount, each } = await import("/src/index.js");
    let obj, arr, dated;
    mount(() => html`<ul>${each([{ id: 1, t: "x" }, [2, 3], { id: 4, when: new Date(0) }], (x) => x.id ?? x[0], (x) => {
      if (Array.isArray(x)) arr = x; else if (x.when) dated = x; else obj = x;
      return html`<li></li>`;
    })}</ul>`, document.createElement("div"));
    return { spread: { ...obj, done: true }, keys: Object.keys(obj), json: JSON.stringify(obj), isArray: Array.isArray(arr), arr: [...arr], date: dated.when instanceof Date };
  });
  expect(r).toEqual({ spread: { id: 1, t: "x", done: true }, keys: ["id", "t"], json: '{"id":1,"t":"x"}', isArray: true, arr: [2, 3], date: true });
});

test("class bindings keep classes added by other code", async ({ page }) => {
  const cls = await page.evaluate(async () => {
    const { html, mount, createState } = await import("/src/index.js");
    const target = document.createElement("div");
    const on = createState(false);
    mount(() => html`<div class=${() => (on.get() ? "btn active" : "btn")}></div>`, target);
    const d = target.firstElementChild;
    d.classList.add("show");
    on.set(true);
    await new Promise((res) => setTimeout(res));
    return [...d.classList].sort();
  });
  expect(cls).toEqual(["active", "btn", "show"]);
});

test("MathML lists and unsafeHTML inside <svg> get their namespace", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { html, mount, each } = await import("/src/index.js");
    const { unsafeHTML } = await import("/src/unsafe.js");
    const target = document.body.appendChild(document.createElement("div"));
    mount(() => html`<math><mrow>${each(["x", "y"], (t) => t, (t) => html`<mi>${t}</mi>`)}</mrow></math>
      <svg width="20" height="20">${unsafeHTML('<circle cx="10" cy="10" r="5"/>')}</svg>`, target);
    const c = target.querySelector("circle");
    const out = { mi: [...target.querySelectorAll("mi")].map((m) => m.namespaceURI), circle: c.namespaceURI, drawn: c.getBBox().width };
    target.remove();
    return out;
  });
  expect(r.mi).toEqual(["http://www.w3.org/1998/Math/MathML", "http://www.w3.org/1998/Math/MathML"]);
  expect(r.circle).toBe("http://www.w3.org/2000/svg");
  expect(r.drawn).toBe(10);
});

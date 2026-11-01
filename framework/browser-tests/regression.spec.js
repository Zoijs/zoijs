// Browser regression tests — exercise the framework directly via dynamic import
// in each real browser, mirroring the jsdom tests but on real engines (Proxy,
// <template>, TreeWalker, queueMicrotask, replaceChildren, setAttributeNS...).

import { test, expect } from "@playwright/test";

// Each test runs in the page context; import() resolves against the dev server.
test.beforeEach(async ({ page }) => {
  await page.goto("/"); // same-origin page so dynamic import works
});

test("text binding updates the same Text node in place", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, createState } = await import("/src/index.js");
    const target = document.createElement("div");
    const c = createState(0);
    mount(() => html`<span>${() => c.get()}</span>`, target);
    const span = target.querySelector("span");
    const node = span.firstChild;
    c.set(1);
    await new Promise((r) => setTimeout(r, 0));
    return span.textContent === "1" && span.firstChild === node;
  });
  expect(ok).toBe(true);
});

test("attribute binding: toggle boolean and remove on null", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, createState } = await import("/src/index.js");
    const target = document.createElement("div");
    const disabled = createState(false);
    const cls = createState("off");
    mount(() => html`<button disabled=${() => disabled.get()} class=${() => cls.get()}>x</button>`, target);
    const btn = target.querySelector("button");
    const before = !btn.hasAttribute("disabled") && btn.getAttribute("class") === "off";
    disabled.set(true);
    cls.set(null);
    await new Promise((r) => setTimeout(r, 0));
    return before && btn.hasAttribute("disabled") && !btn.hasAttribute("class");
  });
  expect(ok).toBe(true);
});

test("event listeners are removed on unmount", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    const target = document.createElement("div");
    let clicks = 0;
    const unmount = mount(() => html`<button onclick=${() => clicks++}>x</button>`, target);
    const btn = target.querySelector("button");
    btn.click();
    unmount();
    btn.click();
    return clicks === 1;
  });
  expect(ok).toBe(true);
});

test("each() reorder preserves node identity (moves, not recreates)", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, each, createState } = await import("/src/index.js");
    const target = document.createElement("div");
    const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
    mount(() => html`<ul>${each(() => s.get(), (x) => x.id, (x) => html`<li>${() => x.name}</li>`)}</ul>`, target);
    const find = (t) => [...target.querySelectorAll("li")].find((li) => li.textContent === t);
    const a = find("a");
    const c = find("c");
    s.set([{ id: 3, name: "c" }, { id: 2, name: "b" }, { id: 1, name: "a" }]);
    await new Promise((r) => setTimeout(r, 0));
    const texts = [...target.querySelectorAll("li")].map((li) => li.textContent).join(",");
    return texts === "c,b,a" && find("a") === a && find("c") === c;
  });
  expect(ok).toBe(true);
});

test("input focus + value preserved across reorder", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, each, createState } = await import("/src/index.js");
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const rows = createState([{ id: 1 }, { id: 2 }]);
    mount(
      () => html`<ul>${each(() => rows.get(), (r) => r.id, (r) => html`<li><input data-id=${String(r.id)} /></li>`)}</ul>`,
      host
    );
    const input2 = host.querySelector('input[data-id="2"]');
    input2.focus();
    input2.value = "typed";
    rows.set([{ id: 2 }, { id: 1 }]); // reverse
    await new Promise((r) => setTimeout(r, 0));
    const after = host.querySelector('input[data-id="2"]');
    return after === input2 && after.value === "typed" && document.activeElement === after;
  });
  expect(ok).toBe(true);
});

test("falsy conditional (cond && html) renders nothing, not 'false'", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, createState } = await import("/src/index.js");
    const target = document.createElement("div");
    const show = createState(false);
    mount(() => html`<div>${() => show.get() && html`<p>hi</p>`}</div>`, target);
    const empty1 = target.querySelector("div").textContent === "" && !target.querySelector("p");
    show.set(true);
    await new Promise((r) => setTimeout(r, 0));
    const shown = !!target.querySelector("p");
    show.set(false);
    await new Promise((r) => setTimeout(r, 0));
    const empty2 = target.querySelector("div").textContent === "" && !target.querySelector("p");
    return empty1 && shown && empty2;
  });
  expect(ok).toBe(true);
});

test("onCleanup runs on unmount and on list-item removal", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, each, createState } = await import("/src/index.js");
    const { onCleanup } = await import("/src/reactivity/owner.js");

    let unmounted = false;
    const u = mount(() => { onCleanup(() => (unmounted = true)); return html`<p>x</p>`; }, document.createElement("div"));
    u();

    const items = createState([{ id: 1 }, { id: 2 }]);
    const cleaned = [];
    mount(
      () => html`<ul>${each(() => items.get(), (x) => x.id, (x) => { onCleanup(() => cleaned.push(x.id)); return html`<li>${() => x.id}</li>`; })}</ul>`,
      document.createElement("div")
    );
    items.set([{ id: 1 }]);
    await new Promise((r) => setTimeout(r, 0));

    return unmounted === true && cleaned.length === 1 && cleaned[0] === 2;
  });
  expect(ok).toBe(true);
});

test("unmount() detaches DOM and stops reactivity", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, createState } = await import("/src/index.js");
    const target = document.createElement("div");
    const c = createState(0);
    const unmount = mount(() => html`<span>${() => c.get()}</span>`, target);
    const span = target.querySelector("span");
    unmount();
    const detached = target.childNodes.length === 0;
    c.set(99);
    await new Promise((r) => setTimeout(r, 0));
    return detached && span.textContent !== "99";
  });
  expect(ok).toBe(true);
});

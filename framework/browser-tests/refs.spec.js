// Browser tests for callback refs — prove the connection guarantee jsdom can't:
// after a ref fires, the element is in the live document, so focus / layout /
// canvas all work. Runs in Chromium, Firefox, and WebKit.

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/"); // same-origin so dynamic import() resolves against the dev server
});

test("ref receives a connected element after render", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    let el = null;
    let connectedInRef = false;
    mount(() => html`<input ref=${(node) => { el = node; connectedInRef = node.isConnected; }} />`, host);
    await new Promise((r) => setTimeout(r, 0));
    return el === host.querySelector("input") && connectedInRef === true;
  });
  expect(ok).toBe(true);
});

test("ref can focus an input", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    mount(() => html`<input ref=${(el) => el.focus()} />`, host);
    await new Promise((r) => setTimeout(r, 0));
    return document.activeElement === host.querySelector("input");
  });
  expect(ok).toBe(true);
});

test("ref can measure layout (element is laid out)", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    let width = -1;
    mount(() => html`<div ref=${(el) => (width = el.getBoundingClientRect().width)} style="width:120px">box</div>`, host);
    await new Promise((r) => setTimeout(r, 0));
    return width > 0;
  });
  expect(ok).toBe(true);
});

test("ref gives a usable canvas 2D context", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    let painted = false;
    mount(
      () => html`<canvas width="32" height="32" ref=${(el) => {
        const ctx = el.getContext("2d");
        ctx.fillStyle = "#f00";
        ctx.fillRect(0, 0, 10, 10);
        painted = ctx.getImageData(1, 1, 1, 1).data[0] === 255;
      }}></canvas>`,
      host
    );
    await new Promise((r) => setTimeout(r, 0));
    return painted === true;
  });
  expect(ok).toBe(true);
});

test("refs fire per item in each() and clean up on removal", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount, each, createState } = await import("/src/index.js");
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const items = createState([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const seen = [];
    const cleaned = [];
    mount(
      () => html`<ul>${each(
        () => items.get(),
        (x) => x.id,
        (x) => html`<li ref=${() => { seen.push(x.id); return () => cleaned.push(x.id); }}>${() => x.id}</li>`
      )}</ul>`,
      host
    );
    await new Promise((r) => setTimeout(r, 0));
    items.set([{ id: 1 }, { id: 3 }]); // remove 2
    await new Promise((r) => setTimeout(r, 0));
    return seen.join(",") === "1,2,3" && cleaned.join(",") === "2";
  });
  expect(ok).toBe(true);
});

test("ref cleanup runs on unmount", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    let cleaned = false;
    const unmount = mount(() => html`<div ref=${() => () => (cleaned = true)}></div>`, host);
    await new Promise((r) => setTimeout(r, 0));
    unmount();
    return cleaned === true;
  });
  expect(ok).toBe(true);
});

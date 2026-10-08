// Tests for @zoijs/testing. It tests itself the way a user would test their app:
// render a real component, query the real DOM, fire real events.

import test from "node:test";
import assert from "node:assert/strict";
import { html, createState, mount, each } from "@zoijs/core";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  tick,
  cleanup,
  mockRouter,
  bindQueries,
} from "../src/index.js";

test.afterEach(() => cleanup());

// A small counter component reused across tests.
function Counter() {
  const count = createState(0);
  return html`<button onclick=${() => count.set(count.get() + 1)}>count: ${() => count.get()}</button>`;
}

test("render mounts the component and scopes queries to its container", () => {
  const { container, getByRole, getByText } = render(Counter);
  assert.ok(container.querySelector("button"));
  assert.equal(getByRole("button").textContent.trim(), "count: 0");
  assert.equal(getByText(/count: 0/).tagName, "BUTTON");
});

test("fireEvent.click drives a reactive update (await shows the new DOM)", async () => {
  const { getByRole } = render(Counter);
  const btn = getByRole("button");
  await fireEvent.click(btn);
  assert.equal(btn.textContent.trim(), "count: 1");
  await fireEvent.click(btn);
  assert.equal(btn.textContent.trim(), "count: 2");
});

test("getByText matches the innermost element holding the text", () => {
  const { getByText } = render(() => html`<div><span>hello</span></div>`);
  assert.equal(getByText("hello").tagName, "SPAN");
});

test("getByTestId finds by data-testid", () => {
  const { getByTestId } = render(() => html`<p data-testid="greeting">hi</p>`);
  assert.equal(getByTestId("greeting").textContent, "hi");
});

test("getByRole filters by accessible name", () => {
  const { getByRole } = render(() => html`<div><button>Save</button><button>Cancel</button></div>`);
  assert.equal(getByRole("button", { name: "Save" }).textContent, "Save");
});

test("getByLabelText finds the associated control (for= and wrapping label)", () => {
  const { getByLabelText } = render(
    () => html`<form>
      <label for="email">Email</label>
      <input id="email" />
      <label>Name <input data-testid="name" /></label>
    </form>`
  );
  assert.equal(getByLabelText("Email").id, "email");
  assert.equal(getByLabelText("Name").getAttribute("data-testid"), "name");
});

test("queryBy returns null when absent; getBy throws a helpful error", () => {
  const { queryByText, getByText } = render(() => html`<p>here</p>`);
  assert.equal(queryByText("missing"), null);
  assert.throws(() => getByText("missing"), /Unable to find/);
});

test("getBy throws when more than one element matches", () => {
  const { getByText } = render(() => html`<div><p>dup</p><p>dup</p></div>`);
  assert.throws(() => getByText("dup"), /multiple/);
});

test("waitFor / findBy resolve once async content appears", async () => {
  function Async() {
    const msg = createState("loading");
    setTimeout(() => msg.set("loaded"), 10);
    return html`<p>${() => msg.get()}</p>`;
  }
  const { findByText, getByText } = render(Async);
  assert.equal(getByText("loading").textContent, "loading");
  const el = await findByText("loaded");
  assert.equal(el.textContent, "loaded");
});

test("screen queries the document body", () => {
  render(() => html`<h1>Title</h1>`);
  assert.equal(screen.getByRole("heading").textContent, "Title");
});

test("cleanup unmounts and removes the container", () => {
  const { container } = render(Counter);
  assert.ok(container.parentNode);
  cleanup();
  assert.equal(container.parentNode, null);
});

test("fireEvent sets a target property before dispatching (input value)", async () => {
  const value = createState("");
  function Field() {
    return html`<input oninput=${(e) => value.set(e.target.value)} value=${() => value.get()} />`;
  }
  const { getByRole } = render(Field);
  await fireEvent.input(getByRole("textbox"), { target: { value: "hello" } });
  assert.equal(value.peek(), "hello");
});

test("mockRouter exposes reactive path/query and go()", async () => {
  const router = mockRouter({ path: "/home" });
  const target = document.createElement("div");
  document.body.appendChild(target);
  mount(() => html`<p>${() => router.path()}</p>`, target);
  assert.equal(target.querySelector("p").textContent, "/home");
  router.go("/about");
  await tick();
  assert.equal(target.querySelector("p").textContent, "/about");
  target.remove();
});

test("bindQueries can scope queries to any element", () => {
  const root = document.createElement("section");
  root.innerHTML = "<button>Go</button>";
  assert.equal(bindQueries(root).getByRole("button").textContent, "Go");
});

// ---- a fuller "sample app" test, end to end ---------------------------------

test("sample app: a todo list (add + toggle) tested through the DOM", async () => {
  function Todos() {
    const items = createState([{ id: 1, text: "first", done: false }]);
    const draft = createState("");
    let nextId = 2;
    const add = (e) => {
      e.preventDefault();
      const text = draft.get().trim();
      if (!text) return;
      items.set([...items.get(), { id: nextId++, text, done: false }]);
      draft.set("");
    };
    return html`
      <form onsubmit=${add}>
        <label>New <input value=${() => draft.get()} oninput=${(e) => draft.set(e.target.value)} /></label>
        <button type="submit">Add</button>
      </form>
      <ul>${each(() => items.get(), (t) => t.id, (t) => html`<li>${() => t.text}</li>`)}</ul>
      <p data-testid="count">${() => items.get().length} item(s)</p>
    `;
  }

  const { getByLabelText, getByRole, getByTestId, findByText } = render(Todos);
  assert.equal(getByTestId("count").textContent.trim(), "1 item(s)");

  await fireEvent.input(getByLabelText("New"), { target: { value: "second" } });
  await fireEvent.submit(getByRole("button", { name: "Add" }).closest("form"));

  await findByText("second");
  assert.equal(getByTestId("count").textContent.trim(), "2 item(s)");
});

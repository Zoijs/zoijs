// Type tests for Zoijs's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error — if they ever stop erroring,
// tsc fails the build, which keeps the types honest.

import { html, mount, createState, computed, each, configure } from "../src/index.js";
import type { State, Computed, Component, TemplateResult } from "../src/index.js";

// ---- createState<number> ----------------------------------------------------
const count = createState(0); // inferred State<number>
const n: number = count.get();
count.set(n + 1);
const p: number = count.peek();
// @ts-expect-error — number state rejects a string
count.set("nope");

const explicit: State<number> = createState<number>(0);
explicit.set(5);

// ---- createState<string> ----------------------------------------------------
const name = createState("Jane"); // State<string>
const s: string = name.get();
// @ts-expect-error — string state rejects a number
name.set(123);

// ---- computed<string> -------------------------------------------------------
const fullName = computed(() => `${name.get()} Doe`); // Computed<string>
const f: string = fullName.get();
// @ts-expect-error — a computed has no set()
fullName.set("x");

const isEven: Computed<boolean> = computed<boolean>(() => count.get() % 2 === 0);
// a custom equals compares two computed values of T (L3: never called with undefined first)
const box = computed(() => ({ n: count.get() }), (a, b) => a.n === b.n);
const boxN: number = box.get().n;
void boxN;
const b: boolean = isEven.peek();

// ---- each<T> ----------------------------------------------------------------
interface Todo {
  id: number;
  text: string;
  done: boolean;
}
const todos = createState<Todo[]>([]);

const list = each(
  () => todos.get(),
  (t) => t.id, // t is Todo
  (t) => html`<li>${() => t.text}</li>`
);

each(
  () => todos.get(),
  (t) => t.id,
  (t) => {
    const text: string = t.text; // typed item
    // @ts-expect-error — unknown property on Todo
    const bad = t.nope;
    return html`<li>${text}</li>`;
  }
);

// plain-array form
each(
  todos.peek(),
  (t) => t.id,
  (t) => html`<li>${t.text}</li>`
);

// ---- mount + component ------------------------------------------------------
const App: Component = () => html`<div>${() => count.get()}</div>`;
const unmount: () => void = mount(App, "#app");
unmount();
const hydrated = mount(App, "#app", { hydrate: true });
const status: "hydrated" | "recovered" | "client-rendered" | undefined = hydrated.hydration?.status;
const mismatches: number | undefined = hydrated.hydration?.mismatches;
void status;
void mismatches;
// @ts-expect-error — the result is read-only
hydrated.hydration = { status: "hydrated", mismatches: 0 };
mount(html`<p>hi</p>`, document.body);
// @ts-expect-error — mount needs a target
mount(App);

// ---- configure --------------------------------------------------------------
configure({ dev: false });
configure({});
// @ts-expect-error — dev must be a boolean
configure({ dev: "no" });

// ---- html returns an opaque TemplateResult ----------------------------------
const tpl: TemplateResult = html`<span>${"x"}</span>`;
mount(tpl, "#app");

// reference the values so noUnusedLocals (if enabled elsewhere) stays quiet
void [p, s, f, b, list, explicit];

// ---- @zoijs/core/unsafe (SEC-3) --------------------------------------------------
import { unsafeHTML } from "../src/unsafe.js";
import type { UnsafeHTMLResult } from "../src/unsafe.js";

const rawResult: UnsafeHTMLResult = unsafeHTML("<b>trusted</b>");
html`<article>${rawResult}</article>`;
html`<article>${() => unsafeHTML("<i>x</i>")}</article>`;
// @ts-expect-error — only a string (or a TrustedHTML, where the DOM lib declares it)
unsafeHTML(42);
// @ts-expect-error — an arbitrary object is not TrustedHTML
unsafeHTML({ toString: () => "<b>" });
// @ts-expect-error — the result is opaque: not assignable to string
const asString: string = rawResult;
void asString;

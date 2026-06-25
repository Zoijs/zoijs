# RFC 0001 — Element Refs

- Status: **Draft (proposed)**
- Target: `@zoijs/core` 1.1.0 (additive MINOR)
- Affects: documented binding semantics (no new export)

## 1. Problem statement

Zoijs has no official way to get the **rendered DOM element** for a node in a
template. Several ordinary tasks need the real element:

- focusing an input (`el.focus()`)
- scrolling (`el.scrollIntoView()`)
- measuring layout (`el.getBoundingClientRect()`)
- drawing to a `<canvas>` (`el.getContext("2d")`)
- mounting a third-party DOM library (a chart, a code editor, a map)

Today the only escape hatch is `document.querySelector` from inside an event or a
`setTimeout`, which is fragile (global lookups, id collisions, timing guesses)
and has no cleanup story. We want the **smallest** primitive that hands you the
element safely, with deterministic teardown, **without** turning Zoijs into a
hooks/lifecycle framework.

### Constraints from the renderer (verified against `src/`)

Two facts about the current engine shape the whole design:

1. **`ref` is not special yet.** `ref=${fn}` parses as an ordinary whole-value
   attribute; `bindAttribute` would run it in an `effect` and try to
   `setAttribute("ref", …)`. So any ref support needs a small branch in the
   renderer — it cannot live in an external package.
2. **Elements are detached at bind time.** `render()` binds parts while the DOM
   is still a `DocumentFragment`; it's connected only *after* `render()` returns
   (`mount` → `replaceChildren`; lists/children → `insertBefore`). A ref invoked
   **synchronously** would run on a disconnected node, so `focus()`/`scrollIntoView()`/
   `getBoundingClientRect()` would silently fail. **Refs must be deferred one
   microtask**, after which the standard mount/each/child paths are connected.

The good news: cleanup is already solved. `onCleanup` is active during binding
(the renderer uses it for `removeEventListener`), and `each` runs each item in its
own owner — so a ref's teardown can reuse the exact same mechanism, including
per-item disposal.

## 2. API options

### Option 1 — Callback ref (recommended)

```js
html`<input ref=${(el) => el.focus()} />`
```

Optionally return a cleanup function (mirrors the listener pattern):

```js
html`<div ref=${(el) => {
  const chart = makeChart(el);
  return () => chart.destroy();   // runs on unmount / list-item removal
}}></div>`
```

- **Simplicity:** highest. It's "a function that receives the element" — the same
  mental model as `onclick=${fn}`. No new import, no `.current`, no lifecycle.
- **Implementation:** one branch in `bindAttribute`; deferred via microtask;
  cleanup via `onCleanup`. ~15 lines. No parser change.
- **Cleanup:** excellent — owner-scoped and deterministic, identical to listeners.
- **Beginner-friendly:** very. Reads top-to-bottom; nothing to learn beyond "ref."
- **Renderer compatibility:** high. Purely additive; static `ref="x"` is untouched.
- **Frozen-core risk:** minimal. **No new export** (stays at seven functions);
  additive binding semantic → MINOR.

### Option 2 — Ref object

```js
const input = ref();
html`<input ref=${input} />`;
input.current.focus();
```

- **Simplicity:** lower. Adds a `ref()` factory and a `.current` field.
- **Implementation:** factory + renderer assigns `.current` (still deferred) +
  null it on cleanup. More surface; the "when is `.current` set?" timing becomes
  **user-visible** (`.current` is `null` until connected — a classic footgun).
- **Cleanup:** must null `.current` on unmount to avoid stale references.
- **Beginner-friendly:** medium. `.current` is a React-ism; encourages stashing
  elements in variables and poking them imperatively from a distance.
- **Renderer compatibility:** same branch as Option 1, **plus a new export**.
- **Frozen-core risk:** higher. Grows the seven-function core to eight and imports
  a React-shaped concept the philosophy warns against.

### Option 3 — `onMount` helper

```js
onMount(() => { /* … */ });
```

- A lifecycle hook that **doesn't actually hand you an element** — you'd still
  `querySelector` to find it. It answers "when," not "which."
- **Simplicity:** medium, but insufficient alone; usually paired with a ref anyway.
- **Beginner-friendly:** friendly name, but reintroduces a lifecycle phase — the
  first step toward the "lifecycle maze" the philosophy explicitly forbids.
- **Frozen-core risk:** new export **and** a new lifecycle concept. Highest.

### Option 4 — Smaller alternatives considered

- **4a. Callback ref + returned disposer** — this *is* Option 1 with the cleanup
  contract spelled out. Chosen.
- **4b. `ref` writes to a `createState` cell** (`ref=${cell}` → `cell.set(el)`).
  Reuses an existing primitive, no new export, reactive element access. Rejected
  for v1: putting element identity into reactive state invites accidental
  re-render loops and muddies the "state is data" model. Can be added later if
  demand appears; the callback already covers it (`ref=${(el) => cell.set(el)}`).
- **4c. A dedicated `@zoijs/ref` package.** Impossible without core support — the
  renderer must recognize the `ref` attribute. Rejected.

## 3. Recommended API

**Option 1 — the callback ref**, with an optional returned cleanup function.

```
ref=${(element) => void | (() => void)}
```

- The callback runs **once**, on a microtask after the node is inserted (so the
  element is connected for focus/scroll/measure).
- It is **not reactive** — the function value is read once, never re-run on state
  change. (To react to data, do it inside the callback or with normal bindings.)
- If it returns a function, that disposer runs on unmount or list-item removal.
- Only a **function** is accepted. A non-function `ref=${x}` is ignored with a
  dev-mode warning (it's almost always a mistake); a static `ref="x"` string is
  left as an ordinary attribute (full backward compatibility).

Why this one: it's the only option that adds **zero exports**, reuses the
event-handler mental model and the listener-cleanup machinery already in the
renderer, and stays one concept deep. It's the smallest change that makes
focus/scroll/measure/canvas/third-party integration safe.

## 4. Cleanup design

Mirror the existing listener pattern, with a guard for the deferral window:

```js
// inside bindAttribute, when attr.name === "ref" and the value is a function
let active = true;
let cleanup = null;
onCleanup(() => {
  active = false;
  if (cleanup) { cleanup(); cleanup = null; }
});
queueMicrotask(() => {
  if (!active) return;                 // unmounted before the microtask fired
  const c = fn(el);
  if (typeof c === "function") {
    if (active) cleanup = c;
    else c();                          // disposed during fn(); tear down now
  }
});
```

Properties:

- **Owner-scoped:** `onCleanup` registers into the render's active owner, so refs
  tear down on `unmount()` and on `each` item removal automatically.
- **Deferral-safe:** an element created and removed within the same tick never
  runs its setup against a torn-down node.
- **`each`:** because item binding runs inside the item's owner, a ref fires once
  per item on create and its disposer fires on that item's removal — no extra work.
- **Errors:** a throwing ref/disposer is contained the same way `disposeOwner`
  already contains throwing cleanups (logged, others still run).

## 5. Implementation plan

All changes are internal to the renderer; the public export list is unchanged.

1. **`renderer.js` — intercept `ref` in `bindAttribute`.** Before the generic
   whole/multi handling, add: if `attr.name === "ref"` and `attr.whole`, read the
   raw value; if it's a function, run the deferred-callback-with-cleanup block
   above and `return`; if it's not a function, `isDev()` warn and `return`
   (don't set a literal attribute).
2. **No parser change.** `finalizeAttr` already produces a whole-value AttrPart for
   `ref=${…}`; `/^on/` doesn't match, so it isn't mistaken for an event.
3. **Reserve the name minimally.** Document `ref` as a reserved binding name. Static
   `ref="…"` remains a normal attribute (no part is emitted), so nothing breaks.
4. **Types (`index.d.ts`).** Extend the template typing notes / JSDoc to describe
   `ref` as `(el: Element) => void | (() => void)`. No exported symbol changes.
5. **Versioning.** Ship as **1.1.0** (additive binding semantic, MINOR per
   `VERSIONING.md` item 3). Add a `CHANGELOG.md` entry.

Estimated change: ~15–20 lines in `renderer.js`, plus docs and tests. The frozen
seven-function surface is untouched.

## 6. Test plan

Unit/DOM (jsdom, `node --test`):

- ref receives the element instance; runs exactly once.
- ref is **not** reactive: changing unrelated state does not re-invoke it.
- returned disposer runs on `unmount()`.
- ref under `each`: fires per item; disposer fires on that item's removal; not on
  reorders that merely move an existing item.
- element-removed-before-microtask: setup does not run (or runs then immediately
  disposes); no throw.
- non-function `ref=${123}` is ignored + dev warning; static `ref="x"` stays a
  literal attribute.
- throwing ref/disposer is contained; sibling cleanups still run.

Browser (Playwright, Chromium/Firefox/WebKit) — proves the connection guarantee
that jsdom can't:

- `ref=${(el) => el.focus()}` → `document.activeElement` is the input after mount.
- `ref` measures a non-zero `getBoundingClientRect()` (element is connected).
- a `<canvas>` ref gets a usable 2D context and paints.

Type tests (`tsc --noEmit`): `ref` callback param is `Element`; returning a
function and returning `void` both type-check; returning a non-function errors.

## 7. Documentation plan

- New concept page **"Element refs"** under Learn: the callback form, the
  connected-after-microtask guarantee, the cleanup contract, and the "not
  reactive" rule. Lead with focus, then a canvas/third-party example.
- Add `ref` to the **Bindings** reference next to events, framed as "a function
  that receives the element," explicitly contrasted with reactive bindings.
- A short **recipe**: integrating a third-party chart/editor (setup in the ref,
  `destroy()` in the returned cleanup).
- `VERSIONING.md`/`API Reference`: note `ref` as a reserved binding name.
- Cross-link from FAQ ("How do I focus an input / use canvas?").

## 8. Go / No-Go recommendation

**GO**, scoped to **Option 1 only** for 1.1.0.

It resolves a real, recurring gap (focus, scroll, measure, canvas, third-party
DOM) with the smallest possible footprint: no new export, no new concept beyond
"ref is a function that gets the element," cleanup that reuses the existing owner
model, and a one-branch renderer change that's fully backward compatible. It
deferred-fires so the element is actually connected — the one subtlety, and one
the API hides from beginners.

**No-Go on** ref objects, `onMount`, and any lifecycle surface for now — they add
exports and React-shaped concepts for no capability the callback ref lacks. If a
concrete need for retained element handles emerges later, revisit **4b** (`ref`
writing to a `createState` cell), which still adds zero exports.

**Open question (non-blocking):** whether to additionally accept a `createState`
cell as a ref target in this release. Recommendation: ship callback-only first;
add the cell form only if real usage asks for it.

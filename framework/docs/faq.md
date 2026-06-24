# FAQ

## Is there really no build step?

Yes. Zoijs is plain ES modules. A `<script type="module">` is the whole toolchain. You only need to serve files over http (because browsers block module imports over `file://`).

## Why `${() => x.get()}` instead of just `${x.get()}`?

The arrow function is what makes a binding *live*. Zoijs runs your component once and then updates individual nodes; the arrow lets it re-read the value when a dependency changes. A bare `${x.get()}` is a static value, inserted once. See [Core Concepts](concepts/core-concepts.md).

## Is this like React?

It shares the component idea and immutable-update style, but **there's no re-rendering, no JSX, no hooks, no build step, and no Virtual DOM**. Setup runs once; only the exact nodes that depend on changed state update.

## How do I do conditionals?

Return different templates with a ternary, or use `&&`:

```js
html`<div>${() => loggedIn.get() ? html`<p>Welcome</p>` : html`<a>Sign in</a>`}</div>`;
html`<div>${() => error.get() && html`<p class="err">${() => error.get()}</p>`}</div>`;
```

`null`, `undefined`, `true`, and `false` all render **nothing** — so `cond && html\`...\`` works as expected. (Note: `0` renders `"0"`, just like JSX, so use `list.length > 0 ? … : null` rather than `list.length && …`.)

## How do components share state?

Create state in a module and import it where needed — it's the same `createState` primitive in a shared place. Zoijs has no separate global-store concept; you don't need one.

## How do I pass data to a component ("props")?

Components are plain functions, so pass an argument:

```js
function Greeting({ name }) { return html`<p>Hi ${() => name.get()}</p>`; }
html`${Greeting({ name })}`;
```

## Is it secure?

By default, yes. Text is rendered as inert (escaped) text, dangerous URL schemes (`javascript:`) are blocked, event handlers are function references (never strings), and there's no `eval` — so it's CSP-friendly. There's intentionally **no raw-HTML escape hatch** today.

## How big / fast is it?

Tiny runtime (no shipped parser beyond a small scanner, no VDOM). Updates are fine-grained: cost scales with what changed, not app size. See the [benchmark example](../examples/benchmark/).

## Which browsers are supported?

Modern evergreen browsers (Chrome/Edge 86+, Firefox 78+, Safari 14+). Automatically tested on Chromium, Firefox, and WebKit. No IE.

## Does it support TypeScript?

Yes — type definitions ship in the package, with full generics for state, computed, and lists. It stays JavaScript-first; TypeScript is optional. See the [API Reference](api-reference.md#typescript).

## Does it do routing / SSR / a global store?

Not yet — these are intentionally out of the core to keep it small. They may arrive later as **optional** modules that never compromise the no-build, small-core identity.

## Can I use my own CSS / Tailwind / etc.?

Yes — it's just HTML and classes. Use a `<link>`, a `<style>`, inline styles, or any CSS tool. Zoijs doesn't dictate styling.

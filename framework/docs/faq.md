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

### Showing a component conditionally

Return the component **uncalled** and Zoijs constructs it for you:

```js
html`<div>${() => (show.get() ? Profile : null)}</div>`;
// with props: wrap the call — and pass getters for props that should stay live
html`<div>${() => (show.get() ? () => Profile({ id: () => userId.get() }) : null)}</div>`;
```

The arrow decides *whether* (and which) component shows; it's the only part that's tracked. Zoijs then calls the component once, untracked, so state it reads during setup belongs to the component and doesn't make the condition re-run. The component keeps its local state, DOM, and focus until the condition changes; when it does, the old one is disposed (its `onCleanup` runs) and a new one is set up.

Don't call the component inside the arrow — `${() => show.get() ? Profile() : null}`. Then `Profile()` runs *during* the condition, so any `.get()` in its setup becomes part of the condition, and changing that state rebuilds `Profile` (losing its state). Zoijs can't tell those reads apart from the condition's own reads, so it can't fix this for you. Reads inside a props wrapper (`() => Profile({ id: userId.get() })`) are untracked too — that passes a one-time snapshot; use a getter (`id: () => userId.get()`) for a live prop.

## How do components share state?

Create state in a module and import it where needed — it's the same `createState` primitive in a shared place. Zoijs has no separate global-store concept; you don't need one.

## How do I pass data to a component ("props")?

Components are plain functions, so pass an argument:

```js
function Greeting({ name }) { return html`<p>Hi ${() => name.get()}</p>`; }
html`${Greeting({ name })}`;
```

## Is it secure?

By default, yes. Text is rendered as inert (escaped) text, dangerous URL schemes (`javascript:`) are blocked, event handlers are function references (never strings), and there's no `eval` — so it works under a strict script CSP (a `style=${…}` binding needs `style-src-attr 'unsafe-inline'`; see the [production checklist](production-security.md)). Raw HTML has exactly one explicit, opt-in route: `unsafeHTML()` from `@zoijs/core/unsafe`, for markup you've established as trusted (it bypasses escaping; untrusted HTML goes through `@zoijs/sanitize`). See [Security](security.md#markup-untrusted-html-and-trusted-raw-html).

## How big / fast is it?

Tiny runtime (no shipped parser beyond a small scanner, no VDOM). Updates are fine-grained: cost scales with what changed, not app size. See the [benchmark example](../examples/benchmark/).

## Which browsers are supported?

Modern evergreen browsers (Chrome/Edge 86+, Firefox 78+, Safari 14+). Automatically tested on Chromium, Firefox, and WebKit. No IE.

## Does it support TypeScript?

Yes — type definitions ship in the package, with full generics for state, computed, and lists. It stays JavaScript-first; TypeScript is optional. See the [API Reference](api-reference.md#typescript).

## Does it do routing / SSR / a global store?

Routing and SSR are intentionally **not in the core** — but they ship as optional packages: [`@zoijs/router`](../../router/README.md) for client-side routing and [`@zoijs/ssr`](../../ssr/README.md) for server-side rendering + static prerendering with in-place hydration. A global store is deliberately left out (state is local and composable); a `@zoijs/storage` reactive value covers persistence. Each optional package is opt-in and never compromises the no-build, small-core identity.

## Do I get editor highlighting and IntelliSense?

Yes, without any Zoijs-specific tooling. The `html` tag follows the `lit-html` convention,
so a highlighter like VS Code's `bierner.lit-html` colours the markup inside `` html`` ``;
and because every package ships `.d.ts`, you get autocomplete and optional type-checking
of plain JavaScript (`checkJs`) — no build step, no migration to TypeScript. Scaffolded
apps come pre-configured. See [Editor Setup](editor-setup.md).

## Can I use my own CSS / Tailwind / etc.?

Yes — it's just HTML and classes. Use a `<link>`, a `<style>`, inline styles, or any CSS tool. Zoijs doesn't dictate styling.

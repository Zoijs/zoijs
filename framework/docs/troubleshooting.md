# Troubleshooting

The most common issues, and how to fix them.

## "My value renders once but never updates"

You forgot the arrow function. This is the #1 mistake.

```js
${count.get()}        // ❌ static — rendered once
${() => count.get()}  // ✅ live — updates on change
```

Same for attributes and `each` items: `class=${() => x.get()}`, `each(() => list.get(), …)`.

## "The page is blank / nothing renders"

- **Not served over http?** ES modules don't load from `file://`. Use `npm run dev` (or any static server) and open `http://localhost:7310/...`.
- **Missing trailing slash?** Open `/examples/counter/`, not `/examples/counter`. Without it, relative `./app.js` resolves to the wrong folder.
- **Check the console.** A thrown template error (see below) or a 404 on a module will appear there.

## "My list doesn't update when I push to the array"

Zoijs reacts to `set`, not in-place mutation.

```js
items.get().push(x);            // ❌ nothing happens
items.set([...items.get(), x]); // ✅
```

## "My todo toggles/reorders weirdly"

You're probably keying the list by **index**. Use a stable id:

```js
each(() => todos.get(), (t) => t.id, …);   // ✅ stable key
each(() => todos.get(), (t, i) => i, …);   // ❌ index breaks on reorder
```

## "An input loses focus or its value when the list changes"

That's the symptom of nodes being recreated. Make sure you key by a stable id (above) and that unchanged items keep their object reference when you update the array. See [Lists](concepts/lists.md).

## "My component's setup runs again and it loses its state"

You probably call it inside a live binding: `${() => show.get() ? Panel() : null}`. `Panel()` then runs as part of the condition, so any state it reads during setup re-runs the condition and rebuilds it. Return it uncalled instead — `${() => show.get() ? Panel : null}` (or `() => Panel(props)`). See [FAQ: showing a component conditionally](faq.md#showing-a-component-conditionally).

## "I get a thrown template error"

Zoijs refuses to silently corrupt output. These throw with a clear message:

| Pattern | Why |
|---|---|
| `<${tag}>` | dynamic tag names aren't supported |
| `<div ${x}>` | dynamic/spread attribute names aren't supported |
| `<script>${x}</script>` / `<style>${x}</style>` | interpolation into script/style isn't supported (injection surface) |
| `<textarea>a ${x}</textarea>` | a `${}` in `<textarea>/<title>` must be the *only* content (a bare `<textarea>${x}</textarea>` is fine) |
| `<!-- ${x} -->` | interpolation inside comments isn't supported |
| `onclick="a ${fn}"` | event handlers must be a single `${}` value |
| `.value=${x}` / `?disabled=${x}` / `@click=${fn}` (Lit syntax) | not supported — use `value=${x}`, `disabled=${x}`, `onclick=${fn}` (see [Coming from Lit](migration/from-lit.md)) |
| `[x]=${v}`, `(click)=${fn}`, … | a bound attribute needs a plain HTML name |
| `title="&hellip; ${x}"` | in an attribute that also has a `${}`, the static text may use numeric references (`&#8230;`), `&amp; &lt; &gt; &quot; &apos;` and the Latin-1 names (`&nbsp;`, `&eacute;`, …); write other characters directly |

Rewrite to a supported form (e.g. `disabled=${cond}` instead of `<input ${cond}>`).

## "Attribute … got an object/array, stringified as …"

You bound an array or plain object to an ordinary attribute (`data-x=${["a", "b"]}`), so it
became `"a,b"` or `"[object Object]"` — usually a bug. Pass a string instead
(`data-x=${JSON.stringify(value)}`, `class=${list.join(" ")}`). The value still renders as before;
the warning is development-only. (`style=${{ … }}` is the supported object form and never warns.)

## "I see a duplicate key warning"

Two `each` items returned the same key. Keys must be unique. (Warnings only show in [dev mode](concepts/production-mode.md).)

## "A binding threw and I see a console error"

Zoijs contains the error so other bindings keep working, and logs it. Fix the throwing function; check the stack trace in the console.

## "I see `ZJS201: incompatible copies of @zoijs/core`" / "two copies of Zoijs are loaded"

Several **compatible** copies of `@zoijs/core` on one page (a CDN copy plus a bundled one, a component library that bundled its own core) are fine: every copy using runtime protocol 1 (introduced in core 1.9.0) in the same JavaScript realm joins one shared reactive runtime, so state, effects, cleanups, the `onError` hook and the `zoijs` Trusted Types policy work across them. They don't share across iframes or workers — each realm has its own. Core 1.8.0 and older keep per-copy state and never log `ZJS201`: with one of those on the page, state from one copy silently won't update the other's bindings — load a single version.

`ZJS201` (dev mode) means a copy speaking a **different runtime protocol** — in practice a different major version — is loaded too. Those copies can't share reactivity: state from one won't update bindings from the other. Load a single major version (dedupe your dependencies / import map). Library authors: declare `@zoijs/core` as a `peerDependency` and don't bundle it.

## "Warnings are noisy in production"

Load the production entry, `@zoijs/core/prod`, or call `configure({ dev: false })` before `mount`. See [Production mode](concepts/production-mode.md).

---

Still stuck? Check the [FAQ](faq.md) or read the relevant [concept page](README.md#core-concepts).

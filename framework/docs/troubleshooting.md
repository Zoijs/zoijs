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

- **Not served over http?** ES modules don't load from `file://`. Use `npm run dev` (or any static server) and open `http://localhost:3000/...`.
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

## "I get a thrown template error"

Zoijs refuses to silently corrupt output. These throw with a clear message:

| Pattern | Why |
|---|---|
| `<${tag}>` | dynamic tag names aren't supported |
| `<div ${x}>` | dynamic/spread attribute names aren't supported |
| `<textarea>${x}</textarea>` | interpolation inside raw-text elements isn't supported |
| `<!-- ${x} -->` | interpolation inside comments isn't supported |
| `onclick="a ${fn}"` | event handlers must be a single `${}` value |

Rewrite to a supported form (e.g. `disabled=${cond}` instead of `<input ${cond}>`).

## "I see a duplicate key warning"

Two `each` items returned the same key. Keys must be unique. (Warnings only show in [dev mode](concepts/production-mode.md).)

## "A binding threw and I see a console error"

Zoijs contains the error so other bindings keep working, and logs it. Fix the throwing function; check the stack trace in the console.

## "Warnings are noisy in production"

Turn them off: `configure({ dev: false })` before `mount`. See [Production mode](concepts/production-mode.md).

---

Still stuck? Check the [FAQ](faq.md) or read the relevant [concept page](README.md#core-concepts).

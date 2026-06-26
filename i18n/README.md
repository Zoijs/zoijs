# @zoijs/i18n

Tiny, reactive internationalization for [Zoijs](https://zoijs.dev). A reactive
locale, a message lookup with interpolation and plurals, and the platform's own
`Intl` formatters for numbers, dates, and lists. Switch the locale and every binding
that read a translation updates in place — no provider, no context, no re-render.

```bash
npm i @zoijs/i18n   # peer: @zoijs/core
```

```js
import { createI18n } from "@zoijs/i18n";

export const i18n = createI18n({
  locale: "en",
  fallback: "en",
  messages: {
    en: {
      hello: "Hello, {name}!",
      items: { one: "{count} item", other: "{count} items" },
      nav: { home: "Home" },
    },
    fr: {
      hello: "Bonjour, {name} !",
      items: { one: "{count} article", other: "{count} articles" },
      nav: { home: "Accueil" },
    },
  },
});
```

```js
import { html, mount } from "@zoijs/core";
import { i18n } from "./i18n.js";

function Greeting() {
  return html`
    <p>${() => i18n.t("hello", { name: "Ada" })}</p>
    <p>${() => i18n.t("items", { count: 3 })}</p>
    <button onclick=${() => i18n.setLocale(i18n.locale() === "en" ? "fr" : "en")}>
      ${() => i18n.t("nav.home")}
    </button>
  `;
}
mount(Greeting, "#app");
```

Wrap each translation in `${() => …}` so it's a live binding — then `setLocale()`
updates exactly those nodes.

## API

`createI18n({ locale, fallback?, messages? })` returns an instance with **reader
methods** (reactive — read them inside `${() => …}`) and two writers:

| Method | Kind | Description |
|---|---|---|
| `t(key, vars?)` | reader | Translate `key`. Fills `{placeholders}` from `vars`; selects a plural by `vars.count`. Dotted keys (`"nav.home"`) walk nested tables. A missing key returns the key itself, so gaps are obvious. |
| `has(key)` | reader | Whether `key` resolves in the current or fallback locale. |
| `locale()` | reader | The current locale tag. |
| `n(value, options?)` | reader | A number via `Intl.NumberFormat` in the current locale. |
| `d(value, options?)` | reader | A date via `Intl.DateTimeFormat`. |
| `list(values, options?)` | reader | A list ("a, b, and c") via `Intl.ListFormat`. |
| `setLocale(locale)` | writer | Switch locale; every reader binding updates. |
| `add(locale, messages)` | writer | Merge more messages into a locale — for lazily-loaded bundles. |

## Plurals

A message can be an object keyed by [CLDR plural category](https://cldr.unicode.org/index/cldr-spec/plural-rules)
(`one` / `other`, plus `zero` / `two` / `few` / `many` where a language uses them).
The right entry is chosen by `Intl.PluralRules` for the active locale — so Polish,
Arabic, or Russian plural rules just work, with no rules of your own:

```js
messages: {
  pl: { files: { one: "{count} plik", few: "{count} pliki", many: "{count} plików", other: "{count} pliku" } },
}
i18n.t("files", { count: 5 }); // → "5 plików"
```

## Formatting

`n`, `d`, and `list` are thin, memoized wrappers over `Intl` — they take the same
options and follow the current locale:

```js
i18n.n(1234.5, { style: "currency", currency: "EUR" }); // "€1,234.50"
i18n.d(new Date(), { dateStyle: "long" });               // "June 26, 2026"
i18n.list(["a", "b", "c"], { type: "conjunction" });     // "a, b, and c"
```

## Lazy-loading locales

Ship one locale and fetch others on demand — `add()` is reactive, so bindings update
when the bundle arrives:

```js
async function load(locale) {
  i18n.add(locale, await fetch(`/i18n/${locale}.json`).then((r) => r.json()));
  i18n.setLocale(locale);
}
```

## What it is not

No global singleton, no provider component, no context, no AST/ICU message compiler,
no build step, and no runtime dependencies. Translations come back as **plain
strings** — Zoijs renders them as inert text, so an interpolated value like
`<img onerror=…>` is shown literally, never executed.

## License

MIT © Zoijs contributors

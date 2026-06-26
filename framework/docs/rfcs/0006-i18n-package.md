# RFC 0006 — Internationalization package (`@zoijs/i18n`)

- Status: **Accepted** — implemented as `@zoijs/i18n` 0.1.0 (2026-06-26)
- Target: a new **optional package** (peer on `@zoijs/core`, zero runtime deps)
- Affects: **no core change.** First package of Phase 7 (ecosystem fill).

## 1. Problem statement

Localizing a Zoijs app today means hand-rolling the same three things: a reactive
"current locale," a message lookup with `{placeholder}` interpolation, and correct
pluralization. The first two are easy; the third is a trap — English `n === 1 ? …`
logic is wrong for most of the world (Polish has four plural forms, Arabic six). And
once you have a locale, you also want locale-correct **numbers and dates**, which
means `Intl` keyed to that same reactive locale.

It's repetitive boilerplate with a real correctness cliff (plurals), and it wants to
be reactive so switching locale updates the page. That's exactly the shape of an
optional package.

## 2. Rule of Three

1. **Explainable in under two minutes?** **Yes.** "A reactive locale + a message
   lookup + the platform's `Intl`." `t("hello", { name })` reads the locale, finds the
   string, fills placeholders. Switch the locale, bindings update. No provider, no
   context, no compiler.
2. **Implementable without core changes?** **Yes, cleanly.** The whole thing is one
   `createState` (the locale), one `createState` (the catalog), and the platform's
   `Intl.PluralRules` / `NumberFormat` / `DateTimeFormat` / `ListFormat`. It imports
   only `createState` from `@zoijs/core` — the star topology holds, zero runtime deps.
3. **Would 80–90% of apps benefit?** **The ones that localize, yes — and even
   single-locale apps** benefit from `n()` / `d()` (locale-correct money, dates,
   lists). i18n is a near-universal "real app" need, and the correctness win on
   plurals is something most hand-rolled versions get wrong. It clears the bar.

**Verdict: ship.**

## 3. Design

```ts
const i18n = createI18n({ locale: "en", fallback?: "en", messages?: {…} });

i18n.t(key, vars?)        // reactive: interpolation + plural (Intl.PluralRules)
i18n.has(key)             // reactive: key resolves in current/fallback?
i18n.locale()             // reactive: current locale
i18n.setLocale(loc)       // writer: every reader binding updates
i18n.add(loc, messages)   // writer: merge a lazily-loaded bundle (reactive)
i18n.n(value, options?)   // reactive: Intl.NumberFormat
i18n.d(value, options?)   // reactive: Intl.DateTimeFormat
i18n.list(values, opts?)  // reactive: Intl.ListFormat
```

- **Reader-method API.** `t` / `locale` / `n` / `d` / `list` are reactive readers (read
  them inside `${() => …}`); `setLocale` / `add` are writers. Same design language as
  `@zoijs/resource` (`data()` / `loading()`) and `@zoijs/forms` — codified in
  `scope.md` §8.
- **Plurals via the platform.** A message can be `{ one, other, … }`; the category is
  chosen by `Intl.PluralRules` for the active locale. No custom rules, every language
  correct for free.
- **Interpolation is dumb on purpose.** `{name}` substitution only — no ICU message
  AST, no `{count, plural, …}` mini-language to parse. Plurals are an object instead, so
  there's no compiler and no eval. Dotted keys (`"nav.home"`) just walk nested objects.
- **Formatters are memoized** by locale + options (constructing an `Intl` formatter is
  the expensive part; lookups are cheap).
- **Missing keys return the key**, so gaps are visible in the UI and in tests rather
  than silently blank.

## 4. Security

Translations come back as **plain strings**, which Zoijs renders as **inert text** when
bound in a template — so an interpolated value like `<img onerror=…>` shows literally
and never executes. No `eval`, no `new Function`, no message compiler, no raw-HTML sink.
Re-runs the Phase 2 supply-chain gate: zero deps, peer-only on `@zoijs/core`.

## 5. Out of scope (guardrails)

- **No ICU compiler.** No `{count, plural, one {#} other {#}}` parsing — plural objects
  cover the need without an AST or eval. (If full ICU is ever wanted, it's additive.)
- **No global singleton / provider / context.** You create an instance and import it,
  like any module. (Zoijs has no context system, by design.)
- **No HTML-in-translation.** Messages are text. Rich formatting is composition in the
  template (`html\`<b>${i18n.t("x")}</b>\``), not markup baked into strings.
- **No automatic locale detection / routing.** Reading `navigator.language` or a URL
  segment is one line in app code; baking a policy in would over-reach.

## 6. Alternatives considered

- **A full ICU MessageFormat.** Powerful, but it's a parser + runtime for a syntax most
  apps barely use — well over "one file's worth of concept," and a mini-language to
  learn. Plural objects + `Intl.PluralRules` cover the 90% with none of it.
- **Just document a recipe** (like auth). A locale state + lookup is writable by hand,
  but the plural-correctness cliff and the want for memoized `Intl` formatters make a
  tiny shared package clearly worth it — it removes a real footgun, not just
  boilerplate. (Auth had no such correctness cliff; that's why auth stayed a recipe and
  i18n ships.)
- **Reactive messages compiled to functions.** Faster interpolation, but needs a build
  or `new Function` — against "no build step" and the security stance. Rejected.

## 7. Decision

**Accepted.** Ship `@zoijs/i18n` 0.1.0: `createI18n` with the reader-method API above,
zero deps, peer on `@zoijs/core`. Add tests (incl. a reactive-locale render and an
injection-inertness check), types, a README, a docs page, and the ecosystem listings.
Wire it into the supply-chain, doc-coverage, and root test gates.

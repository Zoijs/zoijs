# Accessibility

Zoijs has a structural advantage for accessibility: you write **real HTML with native
elements and native events**, so the platform's built-in semantics, keyboard behavior,
and focus management are yours for free. There is no Virtual DOM re-creating elements,
no synthetic event layer, and no component abstraction hiding the markup. Use the right
element and most of accessibility is already done.

This guide covers the handful of things you still own — and shows the exact patterns the
[Admin](../../examples/admin), [Contacts](../../examples/contacts), and
[Task Board](../../examples/task-board) example apps use.

## Start with native elements

The single highest-impact rule: **use the element that already does the job.**

```js
// ✓ a real button — focusable, Enter/Space activate it, announced as a button
html`<button onclick=${onSave}>Save</button>`

// ✗ a div pretending to be a button — not focusable, no keyboard, no role
html`<div class="button" onclick=${onSave}>Save</div>`
```

- **`<button>`** for actions, **`<a href>`** for navigation. Never a clickable `<div>`.
- **`<nav>`, `<main>`, `<header>`, `<aside>`, `<form>`** for landmarks — screen-reader
  users jump between them.
- **One `<h1>` per page**, then `<h2>`/`<h3>` in order — don't skip levels for styling.
- **`<table>`** with `<th scope="col">` for tabular data; **`<ul>`/`<ol>`** for lists;
  **`<dl>`** for key/value detail.

## Label every input

Every form control needs an accessible name. Wrap it in a `<label>` (simplest), or use
`aria-label` when there's no visible text (a search box, an icon button):

```js
// visible label, associated by wrapping — no id/for bookkeeping
html`<label>Email <input type="email" name="email" /></label>`

// no visible label → aria-label
html`<input type="search" aria-label="Search users" placeholder="Search…" />`

// icon-only button → give it a name
html`<button aria-label="Close" onclick=${close}>×</button>`
```

For validation, set **`aria-invalid`** when a field is in error and put the message in a
**`role="alert"`** element so it's announced:

```js
html`<label class="field">
  <span>Email</span>
  <input
    aria-invalid=${() => (touched(name) && error(name) ? "true" : "false")}
    oninput=${...} onblur=${...}
  />
  ${() => (touched(name) && error(name) ? html`<small role="alert">${error(name)}</small>` : null)}
</label>`
```

## Announce async state

Loading, success, and error messages appear *after* the page renders, so a screen reader
won't notice them unless they're in a **live region**. Zoijs makes this a one-attribute
change because you're writing the markup directly:

```js
${() => (data.loading() ? html`<p role="status">Loading…</p>` : null)}   // polite
${() => (data.error() ? html`<p role="alert">${data.error().message}</p>` : null)} // assertive
```

- **`role="status"`** (polite) for progress and success — announced when the user is idle.
- **`role="alert"`** (assertive) for errors — announced immediately.

Because a binding adds these elements to the DOM exactly when the state changes, the live
region fires at the right moment, with no extra wiring.

## Reflect state to assistive tech, not just to CSS

A common gap: an active tab or filter looks selected (a CSS class) but says nothing to a
screen reader. Add the matching ARIA state alongside the class:

```js
// active nav link — aria-current="page"
html`<a aria-current=${() => (active ? "page" : false)} class=${() => (active ? "active" : "")}>…</a>`

// a toggle filter chip — aria-pressed
html`<button aria-pressed=${() => (on ? "true" : "false")} class=${() => (on ? "active" : "")}>…</button>`
```

[`@zoijs/router`](../../router/README.md)'s `link()` already sets `aria-current="page"`
on the active link for you — you only need this for hand-rolled controls.

## Manage focus on client-side navigation

In a single-page app the page changes but focus doesn't move, so keyboard and
screen-reader users are left where they were. After a route change, move focus to the main
region. Give `<main>` an `id` and `tabindex="-1"`, then focus it when the path changes:

```js
function App() {
  let first = true;
  effect(() => {
    router.path();              // re-runs on every navigation
    if (first) return void (first = false); // not on the initial render
    document.getElementById("main")?.focus();
  });

  return html`
    <a class="skip-link" href="#main">Skip to content</a>
    <header>…<nav aria-label="Primary">…</nav></header>
    <main id="main" tabindex="-1">${router.view()}</main>
  `;
}
```

This is plain reactivity — `effect` runs once on mount and again whenever `router.path()`
changes — not a framework feature you have to learn.

## A keyboard skip link

A **skip link** lets keyboard users jump past repeated navigation straight to the content.
It's the first focusable element, visually hidden until focused (see `.skip-link` /
`.sr-only` in the examples' CSS):

```js
html`<a class="skip-link" href="#main">Skip to content</a>`
```

```css
.skip-link { position: absolute; top: -48px; left: 8px; transition: top .15s; }
.skip-link:focus { top: 8px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

Use `.sr-only` for text that should be read but not seen — a label for an icon-only
column header, or "Favorite" next to a decorative star (mark the star `aria-hidden="true"`).

## Don't forget the basics

- **`<html lang="en">`** (or your language) so screen readers use the right voice.
- **Visible focus**: keep a `:focus-visible` outline — don't `outline: none` without a
  replacement.
- **Color contrast**: text should meet WCAG AA (4.5:1 for body text). Check both your
  light and dark themes.
- **Don't rely on color alone** to convey meaning — pair it with text or an icon.

## Testing

[`@zoijs/testing`](../../testing/README.md)'s role- and label-based queries double as an
accessibility check: if `getByRole("button", { name: "Save" })` finds your control, it has
the right role and an accessible name. Querying by role/label instead of by class nudges
you toward accessible markup.

```js
const { getByRole, getByLabelText } = render(Settings);
getByRole("button", { name: "Save" });      // a real, named button exists
getByLabelText("Email");                      // the input is labelled
```

For a full audit, run an automated checker (axe DevTools, Lighthouse, or `axe-core` in
CI) and test with a real screen reader and keyboard — no library replaces that.

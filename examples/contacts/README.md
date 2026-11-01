# Contacts — a Zoijs CRUD showcase

A small CRM that shows the complete **create / read / update / delete** shape in Zoijs,
built from plain files — no build step, no store, no providers.

| Package | Used for |
|---|---|
| `@zoijs/core` | `html` / `mount` / `each` / `computed` / `createState` |
| `@zoijs/router` | list / new / detail / edit pages, `:id` params, navigation |
| `@zoijs/resource` | load the list and a single contact (reads) |
| `@zoijs/action` | create / update / delete (writes) |
| `@zoijs/forms` | the contact form — shared by create and edit; validation |
| `@zoijs/head` | per-page `<title>` |

## Run it

```bash
npm run dev
# then open http://localhost:3530/examples/contacts/   (keep the trailing slash)
```

## What to look at

- **`app.js`** — read it top to bottom. One `ContactForm` component is reused for both
  **create** and **edit**: the same form, validation, and markup, wired to a different
  `action`.
- **Validation** lives in one `rules` object and runs through `@zoijs/forms`; errors
  show inline once a field is touched, and the submit is blocked until it validates.
- **Reads vs writes** — the list and a contact are `resource`s; create/update/delete are
  `action`s. After a write, navigation (or a `refresh`) reflects the change.
- **Safe by default** — names, emails, and companies render as inert text; the `mailto:`
  link is scheme-checked. No `innerHTML`.

## Tests

```bash
npm run test:browser   # Playwright smoke tests across Chromium, Firefox, WebKit
```

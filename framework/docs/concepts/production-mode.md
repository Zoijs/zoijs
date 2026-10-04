# Production mode

> *(Next release.)* The production entry and entry-based starting mode below ship in the next
> core release. On core 1.8.0, call `configure({ dev: false })` before `mount` instead.

Zoijs has a development mode (helpful warnings, the devtools hook) and a production
mode (quiet, no graph introspection). **Which one you start in depends on the entry
you load** — you don't have to remember to flip a flag:

| You load | Starts in |
|---|---|
| `@zoijs/core` (`src/index.js`) | development |
| `@zoijs/core/prod` (`src/prod.js`) | **production** |
| `@zoijs/core` from a bundler's **production build** (Vite, webpack…) | **production** — the package's `"production"` export condition selects `prod.js` |

Both entries are the same API; only the starting mode differs.

**No build step (import map / CDN):** point the import map at the production entry
when you deploy:

```html
<script type="importmap">
  { "imports": { "@zoijs/core": "./node_modules/@zoijs/core/src/prod.js" } }
</script>
```

(or `./vendor/zoijs/core/prod.js` if you vendor `src/`, or the `/prod` subpath on a CDN).
In development, keep `src/index.js`. If you forget, Zoijs warns once in the console
when development mode runs on a non-`localhost` host.

### Monitoring errors in production

Production mode silences warnings, not failures. To see the errors Zoijs contains
(throwing bindings, boundary fallbacks, failed resources…) in your monitoring, add
`configure({ onError(error, info) { … } })` — it works in both modes. See
[Error monitoring](../api-reference.md#error-monitoring-configure-onerror-).

### Overriding

`configure({ dev })` still works on either entry and wins over the default — call it
once, at the top of your app, before mounting:

```js
import { configure, mount } from "@zoijs/core";
configure({ dev: false }); // or { dev: true } to debug a production build
```

The mode is **one setting per page** (per JavaScript realm): if more than one
compatible copy of `@zoijs/core` is loaded, the first one to load picks the starting
mode, later copies join it, and `configure()` from any copy applies to all of them.

## What changes

| | Development (default) | Production (`dev: false`) |
|---|---|---|
| Helpful warnings | shown | silenced |
| Devtools hook (`@zoijs/devtools`) | can attach | never attaches |
| Behavior / safety | identical | identical |

**Safety is always on.** Every security check (escaping, URL and attribute guards, forged-result rejection, the `html` tagged-template check) and all loop protection and error containment work identically in both modes — production just skips the console noise and the devtools hook.

## Recommendation

Develop on `@zoijs/core` (the warnings catch real bugs early) and deploy with `@zoijs/core/prod` — or let your bundler's production build pick it for you. Production mode is one item on the [production security checklist](../production-security.md); go through the rest before you ship.

---

Back to the [docs home](../README.md), or jump to a [tutorial](../README.md#tutorials-build-something).

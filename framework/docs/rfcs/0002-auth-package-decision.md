# Decision 0002 — Does Zoijs need an official auth package?

- Status: **Decided — No (Go on a guide recipe, No-Go on a package)**
- Context: follows the [Authentication & Authorization guide](https://zoijs.dev/auth)
  on zoijs.dev, which implements full auth with existing packages.

## 1. Can auth be handled cleanly with what exists today?

**Yes — fully, for the common cases.** The auth guide builds a complete
cookie-session app with no new primitive:

| Concern | Built from | Notes |
|---|---|---|
| Who am I? (current user) | `@zoijs/resource` | one module: `resource(() => fetch("/api/me"))` |
| Login | `@zoijs/forms` + `@zoijs/action` | a form and a POST |
| Logout | `@zoijs/action` | clear server session + `currentUser.refresh()` |
| Roles / permissions | `computed()` | `isAdmin = computed(() => user()?.roles.includes("admin"))` |
| Protected route | `@zoijs/router` + a guard fn | render the page or redirect |
| Lightweight client state | `@zoijs/storage` | non-sensitive UI hints only |

There is no capability gap. No provider, no context, no global store — the "auth
system" is four small modules you can read end to end. That is the philosophy
working as intended.

## 2. What pain remains?

Real, but narrow — it's **boilerplate and two reactivity footguns**, not missing
power:

1. **Repeated boilerplate.** Every app re-writes the same ~30–40 lines: the
   current-user resource, the `protectedPage` guard, the `isAdmin` computed, the
   redirect dance. Identical across apps.
2. **The guard must be reactive (footgun).** Because setup runs once, the guard's
   user check has to live inside a `${() => …}` binding, or it reads the resource
   once and never reacts when it resolves. Easy to get wrong; the guide had to be
   careful here.
3. **Redirect timing (footgun).** Calling `router.go()` during render is unsafe;
   it must be deferred (`queueMicrotask`). Another easy mistake.
4. **Return-to-URL after login**, **global 401 handling**, and **JWT refresh
   loops** are each fiddly and rolled by hand. But these are also the parts most
   coupled to a specific backend.

Crucially, items 2–3 are **not auth-specific** — they're "conditionally render
based on a reactive value, with a safe redirect." That's a *router/reactivity*
concern, not an auth one.

## 3. Would a package simplify real apps, or add framework complexity?

**It would mostly add complexity and risk for a thin convenience.**

Against a package (decisive):

- **Auth is coupled to your backend.** Cookie vs JWT, endpoint shapes, the role
  model, refresh strategy — all vary. A generic package is either opinionated
  (forces your backend) or so configurable it stops being simple. Both bad.
- **Gravitational pull toward what the philosophy forbids.** "Auth package" is
  one issue away from `<AuthProvider>`, `useAuth`, a global session store, and
  hooks. The blast radius of scope creep is large.
- **It's a snippet, not a system.** The reusable part is ~40 lines that wrap
  `resource` + `computed` + a guard. Patterns belong in docs; freezing them as a
  dependency adds permanent API surface and maintenance for little gain.
- **Ecosystem just stabilized at core + 6.** A 7th *optional* that's really a
  copy-paste snippet is a costly, hard-to-reverse signal.
- **Security perception (see §4).** A blessed package implies guarantees it can't
  make and could centralize one insecure default across every app that adopts it.

For a package (weak): it would kill the boilerplate and encode the safe guard so
beginners don't trip on footguns 2–3. Real, but achievable without a dependency.

## 4. Security risk review

- **False confidence.** A framework-blessed `@zoijs/auth` implies "auth is handled
  / this is secure." Real enforcement is **server-side**; a client package cannot
  authenticate or authorize anything. Naming like `auth.can("admin")` invites
  treating a cosmetic check as a security boundary.
- **Centralized insecure default.** If the package offered token persistence for
  convenience, the natural-but-wrong choice is `localStorage`, making every
  adopting app XSS-exfiltratable. The guide's thesis — *HttpOnly cookie is the
  source of truth, client only hints* — is easy to state in docs and easy to
  quietly violate in a package's "session manager."
- **Client session drift.** A package that "manages the session" tends toward
  holding session state on the client; the secure posture keeps it in the
  `HttpOnly` cookie and re-confirms via the current-user resource.
- **Net:** the safest posture is documented patterns that repeat "the server
  enforces," with **no client code that holds credentials or implies enforcement.**
  A package raises this risk; it does not lower it.

## 5. If a package were built anyway — the smallest possible API

For the record (not recommended now). One factory, no provider, no context, no
network beyond a `load` you inject, **no token/credential storage, no crypto**:

```js
import { createAuth } from "@zoijs/auth";

const auth = createAuth({
  // You own the requests; the package never touches credentials directly.
  load: () => fetch("/api/me", { credentials: "include" })
                .then((r) => (r.ok ? r.json() : null)),
});

auth.user();            // resource-style reader: the user object or null (reactive)
auth.loading();         // reactive boolean
auth.refresh();         // re-run load() after login/logout
auth.isAuthenticated;   // computed boolean
auth.can(predicate);    // computed from your own role/permission predicate
auth.protect(Page, { redirect: "/login" }); // reactive guard, safe deferred redirect
```

That is the *ceiling*. Note what it still refuses to do: no login/logout network
calls (use `@zoijs/action`), no token handling, no storage of secrets, no
provider/context, no role model of its own. Which is exactly why it barely earns
its keep — it's the guide's snippet with the guard footgun pre-solved.

## Recommendation

**Do not build `@zoijs/auth`.** Auth is fully expressible with
`router` + `resource` + `action` + `forms` + `storage` + `computed()`, and the
residual pain is boilerplate plus two *reactivity* footguns — neither of which is
auth-specific.

Address the pain without a dependency:

1. **Keep the guide as the source of truth** (done) — it already proves the
   pattern and hammers the security model.
2. **Ship a copy-paste `auth.js` recipe** (~40 lines) in the guide, with the
   reactive guard and deferred redirect pre-solved. Zero dependency; the app owns
   and edits it. This removes the boilerplate and the footguns at once.
3. **If footguns 2–3 prove common, generalize in `@zoijs/router`** via a separate
   RFC — a *generic* guarded-route / safe-redirect helper, not an auth package.
   That fixes the real (non-auth) primitive at the right layer.

**Re-evaluate a package only if** real-world usage shows everyone writing the
same ~40-line wrapper **and** a clean `load`/`login`/`logout` injection can
abstract the backend coupling without growing toward a provider. Until then, a
package is more complexity and more risk than the snippet it would replace.

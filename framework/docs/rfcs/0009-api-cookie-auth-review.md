# RFC 0009 — Cookie authentication for `createApi()` clients: security review

- Status: **Review complete — not implemented** (no code change; revisit only against §7)
- Target: `@zoijs/api` (would be additive if ever accepted)
- Affects: nothing today. `api()` keeps `credentials: "same-origin"`; `createApi()` clients keep
  `credentials: "omit"`. Bearer tokens (`auth`, 0.3.0) remain the only cross-origin credential.

## 1. Question

Should a `createApi()` client be able to send the browser's **cookies** (and other ambient
credentials) to its external origin — i.e. `fetch(…, { credentials: "include" })` — so an app can
use a cookie session on `api.example.com` from `app.example.com`?

## 2. What it would take, mechanically

- The request: `credentials: "include"`. The browser then attaches cookies for the target
  (subject to `SameSite` and third-party-cookie policy, §4), HTTP authentication, and TLS client
  certificates.
- The server: `Access-Control-Allow-Origin: <the exact page origin>` (the `*` wildcard is
  forbidden with credentials), `Access-Control-Allow-Credentials: true`, and for non-simple
  requests a preflight allowing the methods and headers used. Otherwise the browser refuses to
  expose the response — but a *simple* request (GET/HEAD/POST with safelisted headers and a
  form-ish body) may already have been **sent**, with cookies, before that refusal.

## 3. Threats

| # | Threat | Why it matters here |
|---|---|---|
| T1 | **CSRF** | Ambient cookies are sent no matter which site triggered the request. A client that sends cookies to an API makes that API's cookie session usable by any page that can cause a request to it, unless the server defends itself (§5). Bearer tokens don't have this property: the page must hold the token. |
| T2 | **CORS misconfiguration** | Servers that reflect any `Origin` with `Allow-Credentials: true` let every site read authenticated responses. Opting clients into `include` makes Zoijs apps depend on every API getting this right. |
| T3 | **Simple requests are sent before CORS decides** | CORS protects *reading* responses, not *sending* requests. A credentialed simple POST performs its side effect even when the response is blocked. |
| T4 | **Redirects** | With credentials, a redirect to another origin can carry cookies for that origin. `createApi()` already uses `redirect: "manual"` (never follows), which must remain non-negotiable for any credentialed mode. |
| T5 | **Credentials beyond cookies** | `include` also enables browser HTTP-auth and client certificates — broader than "the session cookie". There's no fetch option for "cookies only". |
| T6 | **Mixed credential models** | Cookie + Bearer on one client blurs which credential authorized a request and doubles the leak surface. |
| T7 | **Unreliable delivery** | Third-party cookies are blocked or partitioned by default in Safari (ITP) and Firefox (Total Cookie Protection), and restricted in Chrome. A cross-*site* cookie flow is fragile by design; only same-*site* cookies (e.g. `app.example.com` → `api.example.com`) work dependably. |

## 4. Same-site vs. cross-site

- **Same-site, cross-origin** (`app.example.com` → `api.example.com`, same registrable domain):
  `SameSite=Lax`/`Strict` cookies are sent; third-party-cookie blocking doesn't apply. This is the
  only case where a cookie session across origins is dependable — and also where CSRF from a
  sibling subdomain (or a subdomain takeover) becomes the main risk.
- **Cross-site** (`app.example` → `api.other.example`): requires `SameSite=None; Secure`, is
  blocked or partitioned in major browsers, and maximizes T1. Not a supportable default.

## 5. Server-side defenses a cookie-authenticated API would need

Zoijs can't enforce these; any future option would have to document them as requirements:

1. `SameSite=Lax` (or `Strict`) session cookies, `Secure`, `HttpOnly`, a narrow `Domain`/`Path`.
2. **Origin verification** on every state-changing request (reject unknown `Origin`).
3. A CSRF defense that a simple request can't satisfy: a required custom header (which forces a
   preflight), or a synchronizer/double-submit token.
4. An exact `Access-Control-Allow-Origin` allowlist — never reflection — plus
   `Allow-Credentials: true` only for that list.
5. No state changes on GET.

## 6. Decision

**Not implemented.** `createApi()` clients stay `credentials: "omit"`; Bearer tokens via `auth`
remain the supported cross-origin credential. Same-origin cookie sessions keep working through
`api()` (unchanged, `credentials: "same-origin"`). The risks in §3 are real, partly outside
Zoijs's control (T1, T2, T7), and the Bearer model already covers the cross-origin use case
without ambient authority.

## 7. If it's ever reconsidered — minimum bar

Any proposal must, at least:

- be an explicit, per-client opt-in (no default change; never on `api()`), visibly named (e.g.
  `credentials: "include"`), and refuse combination with `auth` (T6);
- keep `redirect: "manual"` and the exact-origin lock (T4);
- be limited to same-site targets, or require a written justification for cross-site (§4, T7);
- force a preflight for every request (e.g. by always sending a custom marker header), so a
  credentialed request is never "simple" (T3) — and document the server requirements in §5;
- ship with browser tests in Chromium, Firefox and WebKit for: cookies sent only to the
  configured origin, refusal without `Allow-Credentials`, no cookies across a redirect, and
  behavior under each browser's third-party-cookie defaults;
- get its own security review before release.

## 8. Related

- Bearer authentication: `api/README.md` → "Authenticated API clients" (0.3.0+).
- Production cookie/CSRF guidance for same-origin apps: `docs/production-security.md`.
- RFC 0002 — the earlier decision not to ship a separate auth package.

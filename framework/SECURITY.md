# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ |
| < 1.0 (pre-release) | ❌ |

Security fixes land on the latest `1.x` line.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub's [Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" on the repo's Security tab), or email the maintainers
at `security@zoijs.dev`.

We aim to acknowledge within **72 hours** and to ship a fix or mitigation for
confirmed issues promptly, crediting reporters who wish to be named.

## Security model

Zoijs is **secure by default**; the full model is documented in
[`docs/security.md`](docs/security.md). In brief:

- Dynamic text renders as **inert** Text nodes (XSS-safe).
- `html` compiles only tagged-template literals — your static markup, never runtime
  strings (`html([...])` throws `ZJS010`).
- URL attributes use a scheme allowlist (control-char resistant); `data:` is
  restricted to raster images. Bound `srcset`, meta-refresh `content` and SVG
  animation values are URL-checked, a bound `<base>` is refused, and
  `target="_blank"` always gets `rel="noopener noreferrer"`.
- Event handlers must be function references; `on*` and `srcdoc` are blocked
  from data.
- No `eval` / `new Function`. Works under a strict script CSP and enforced Trusted
  Types, with documented allowances (see [`docs/production-security.md`](docs/production-security.md)).
- Untrusted HTML has one supported path, `@zoijs/sanitize`. Trusted raw HTML has one
  explicit, greppable opt-in, `unsafeHTML()` from `@zoijs/core/unsafe`,
  which **bypasses escaping and every guard above** by design.

When evaluating a report, the key question is whether **untrusted data** can
become script, markup, a handler, or a dangerous URL through a **documented,
supported** API. Out of scope: bypasses that require the developer to hand untrusted
data to `innerHTML` themselves (outside Zoijs), or to `unsafeHTML()` — whose contract is
that the caller has established the markup as trusted (including any `<script>` it
contains, which executes when server-rendered). A way to reach `unsafeHTML`'s behavior
*without* calling it is in scope.

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
at `security@zoijs.com` (replace before launch).

We aim to acknowledge within **72 hours** and to ship a fix or mitigation for
confirmed issues promptly, crediting reporters who wish to be named.

## Security model

Zoijs is **secure by default**; the full model is documented in
[`docs/security.md`](docs/security.md). In brief:

- Dynamic text renders as **inert** Text nodes (XSS-safe).
- URL attributes use a scheme allowlist (control-char resistant); `data:` is
  restricted to raster images.
- Event handlers must be function references; `on*` and `srcdoc` are blocked
  from data.
- No `eval` / `new Function`; CSP- and Trusted-Types-friendly.
- There is **no raw-HTML rendering API**.

When evaluating a report, the key question is whether **untrusted data** can
become script, markup, a handler, or a dangerous URL through a **documented,
supported** API. Bypasses that require the developer to hand untrusted data to
`innerHTML` themselves (outside Zoijs) are out of scope.

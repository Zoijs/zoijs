# Contributing to Zoijs

Thanks for your interest! Zoijs is small on purpose — contributions that keep it
small, clear, and beginner-friendly are the most welcome.

## Principles (read first)

Zoijs has a deliberate identity. PRs are evaluated against it:

- **No build step**, no JSX, no Virtual DOM.
- **Small API** — the seven-function surface is frozen (see `VERSIONING.md`).
- **Native HTML/CSS/JS** and **secure by default**.
- **Readable source** — a junior developer should be able to follow it.

If a change adds an export, changes a signature, or alters documented behavior,
it needs an **RFC** (open an issue using the "API change / RFC" template) before
a PR. We say no to most additions on purpose.

## Project setup

No build step. You need Node 18+.

```bash
git clone <repo> && cd easy/framework
npm install
npx playwright install chromium firefox webkit   # for browser tests (once)
```

## Running the checks

```bash
npm test            # unit + DOM tests (jsdom)
npm run test:unit   # pure-logic tests only (no DOM)
npm run test:types  # TypeScript type-check (tsc --noEmit)
npm run test:browser # real browsers: Chromium, Firefox, WebKit (Playwright)
npm run dev         # serve examples at http://localhost:3000/examples/<name>/
```

A PR should keep **all** of `npm test`, `npm run test:types`, and
`npm run test:browser` green.

## Code style

- Plain JavaScript, ES modules, `.js` files. No TypeScript source (types live in
  `src/index.d.ts`).
- Match the surrounding style: small functions, clear names, comments that
  explain *why*. No new dependencies in the runtime (`src/`) — ever.
- Every bug fix or feature needs a test. DOM behavior gets a jsdom test and,
  where it touches browser semantics (parsing, events, focus), a Playwright test.

## Pull request process

1. Open an issue first for anything non-trivial (and always for API changes).
2. Branch from `main`; keep PRs focused.
3. Add tests; update docs in `docs/` and `CHANGELOG.md` (Unreleased section).
4. Ensure all checks pass locally.
5. PRs are reviewed for correctness, scope-fit (does it belong in the core?),
   and clarity.

## Commit messages

Conventional-style prefixes are appreciated: `fix:`, `feat:`, `docs:`,
`test:`, `perf:`, `refactor:`, `chore:`. Keep the subject under ~72 chars.

## Where things live

```
src/            runtime (no deps, no build)
  core/         html(), mount(), renderer, each()
  reactivity/   state, computed, effect, scheduler, owner, env
  utils/        dom, security
tests/          jsdom/unit tests (npm test)
browser-tests/  Playwright specs (npm run test:browser)
examples/       runnable example apps
docs/           the documentation site
```

## Reporting security issues

Please do **not** open public issues for vulnerabilities — see `SECURITY.md`.

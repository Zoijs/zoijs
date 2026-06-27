# Changelog

All notable changes to `@zoijs/eslint-plugin` are documented here. This project
follows [Semantic Versioning](https://semver.org).

## 0.1.0

Initial release.

- **`require-reactive-binding`** — flags a reactive `.get()` read inside an `html`
  template that is not wrapped in an arrow function, so it would be read once
  during setup and never update. Auto-fixable (`eslint --fix` wraps it in
  `() => …`). Narrow by design: only zero-argument `.get()` calls inside `html`
  templates, never `.peek()`, never reads deferred behind a nested function.
- `recommended` (flat config) and `legacy-recommended` (`.eslintrc`) shareable
  configs.
- Zero runtime dependencies; ESLint is the only (peer-style) requirement.

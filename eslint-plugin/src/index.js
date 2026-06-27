// @zoijs/eslint-plugin — lint rules for Zoijs.
//
// One small plugin that enforces Zoijs's single rule ("setup runs once; wrap
// reactive reads in `() =>`"). Zero runtime dependencies, no build step — the
// same plain-ESM, plain-web discipline as the rest of the ecosystem.
//
// It ships a `recommended` config for flat config (ESLint 9+, the default) and a
// `legacy-recommended` config for the old `.eslintrc` format. See the README.

import requireReactiveBinding from "./rules/require-reactive-binding.js";

const plugin = {
  meta: {
    name: "@zoijs/eslint-plugin",
    version: "0.1.0",
  },
  rules: {
    "require-reactive-binding": requireReactiveBinding,
  },
  configs: {},
};

// Flat config (eslint.config.js, ESLint 9+):
//
//   import zoijs from "@zoijs/eslint-plugin";
//   export default [ zoijs.configs.recommended ];
plugin.configs.recommended = {
  name: "zoijs/recommended",
  plugins: { zoijs: plugin },
  rules: {
    "zoijs/require-reactive-binding": "error",
  },
};

// Legacy config (.eslintrc.*):
//
//   { "extends": ["plugin:@zoijs/legacy-recommended"] }
plugin.configs["legacy-recommended"] = {
  plugins: ["@zoijs"],
  rules: {
    "@zoijs/require-reactive-binding": "error",
  },
};

export default plugin;

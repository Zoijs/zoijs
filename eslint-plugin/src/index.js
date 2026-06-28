// @zoijs/eslint-plugin — lint rules for Zoijs.
//
// A small plugin with two jobs: enforce Zoijs's one reactivity rule ("setup runs
// once; wrap reactive reads in `() =>`"), and catch a few high-value accessibility
// mistakes in `html\`…\`` templates. Zero runtime dependencies, no build step — the
// same plain-ESM, plain-web discipline as the rest of the ecosystem.
//
// It ships a `recommended` config for flat config (ESLint 9+, the default) and a
// `legacy-recommended` config for the old `.eslintrc` format. See the README.

import requireReactiveBinding from "./rules/require-reactive-binding.js";
import altText from "./rules/alt-text.js";
import noPositiveTabindex from "./rules/no-positive-tabindex.js";
import noStaticElementInteractions from "./rules/no-static-element-interactions.js";

const plugin = {
  meta: {
    name: "@zoijs/eslint-plugin",
    version: "0.2.0",
  },
  rules: {
    "require-reactive-binding": requireReactiveBinding,
    "alt-text": altText,
    "no-positive-tabindex": noPositiveTabindex,
    "no-static-element-interactions": noStaticElementInteractions,
  },
  configs: {},
};

// The rule levels shared by both config formats. The reactivity rule and the two
// unambiguous a11y rules are errors; the static-element-interactions rule has more
// legitimate exceptions, so it's a warning.
const LEVELS = {
  "require-reactive-binding": "error",
  "alt-text": "error",
  "no-positive-tabindex": "error",
  "no-static-element-interactions": "warn",
};

const withPrefix = (prefix) =>
  Object.fromEntries(Object.entries(LEVELS).map(([name, level]) => [`${prefix}/${name}`, level]));

// Flat config (eslint.config.js, ESLint 9+):
//
//   import zoijs from "@zoijs/eslint-plugin";
//   export default [ zoijs.configs.recommended ];
plugin.configs.recommended = {
  name: "zoijs/recommended",
  plugins: { zoijs: plugin },
  rules: withPrefix("zoijs"),
};

// Legacy config (.eslintrc.*):
//
//   { "extends": ["plugin:@zoijs/legacy-recommended"] }
plugin.configs["legacy-recommended"] = {
  plugins: ["@zoijs"],
  rules: withPrefix("@zoijs"),
};

export default plugin;

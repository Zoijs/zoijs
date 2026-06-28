// Type definitions for @zoijs/eslint-plugin.
//
// Hand-rolled and self-contained so the package keeps ZERO dependencies — it does
// not pull in `@types/eslint`. The shapes are structural; ESLint's own richer types
// are assignable to them, so `zoijs.configs.recommended` drops into a typed
// `eslint.config.js` without friction.

/** An ESLint rule module (structural — see the note above on staying dependency-free). */
export interface ZoijsRuleModule {
  meta: {
    type?: "problem" | "suggestion" | "layout";
    docs?: { description?: string; recommended?: boolean; url?: string };
    fixable?: "code" | "whitespace";
    schema?: unknown[];
    messages?: Record<string, string>;
  };
  create(context: any): Record<string, (node: any) => void>;
}

/** A shareable config (flat or legacy). Left loose so both formats fit. */
export type ZoijsConfig = Record<string, unknown>;

/** The plugin object: rule registry plus the `recommended` / `legacy-recommended` configs. */
export interface ZoijsEslintPlugin {
  meta: { name: string; version: string };
  rules: {
    "require-reactive-binding": ZoijsRuleModule;
    "alt-text": ZoijsRuleModule;
    "no-positive-tabindex": ZoijsRuleModule;
    "no-static-element-interactions": ZoijsRuleModule;
  };
  configs: {
    /** Flat config (ESLint 9+): `export default [ zoijs.configs.recommended ]`. */
    recommended: ZoijsConfig;
    /** Legacy `.eslintrc`: `"extends": ["plugin:@zoijs/legacy-recommended"]`. */
    "legacy-recommended": ZoijsConfig;
  };
}

declare const plugin: ZoijsEslintPlugin;
export default plugin;

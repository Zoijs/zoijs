// Type definitions for @zoijs/forms.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

// Source State from @zoijs/core (re-exported for convenience) so the raw
// values/errors/touched shape can never drift from `createState`. Other packages
// import core types the same way (e.g. @zoijs/router imports TemplateResult).
import type { State } from "@zoijs/core";
export type { State };

/** A single field rule: return a message when invalid, or a falsy value when valid. */
export type Rule<V = any, Values = Record<string, any>> = (
  value: V,
  values: Values
) => string | null | undefined | false;

/** A map of field name → rule. */
export type Rules<V> = { [K in keyof V]?: Rule<V[K], V> };

/** Options for {@link form}. */
export interface FormOptions<V> {
  /** Default rules used by `validate()` and when no rules are passed. */
  validate?: Rules<V>;
}

/** A tiny reactive form helper created by {@link form}. */
export interface Form<V extends Record<string, any>> {
  // --- values ---
  /** All values (reactive). Reader-style, like `data()` / `loading()`. */
  all(): V;
  /** Read one field's value (reactive). */
  value<K extends keyof V>(name: K): V[K];
  /** Update one field's value. */
  set<K extends keyof V>(name: K, value: V[K]): void;

  // --- errors ---
  /** All errors keyed by field name (reactive). */
  allErrors(): Partial<Record<keyof V, string>>;
  /** Read one field's error (reactive), or `undefined`. */
  error(name: keyof V): string | undefined;
  /** Set one field's error message. */
  setError(name: keyof V, message: string): void;
  /** Clear one field's error. */
  clearError(name: keyof V): void;

  // --- touched ---
  /** All touched flags keyed by field name (reactive). */
  allTouched(): Partial<Record<keyof V, boolean>>;
  /** Whether one field has been touched (reactive). */
  isTouched(name: keyof V): boolean;
  /** Mark a field touched (e.g. on blur). */
  touch(name: keyof V): void;

  // --- lifecycle ---
  /** Restore initial values and clear errors + touched. */
  reset(): void;
  /** Run rules (or the option rules), set errors, and return whether valid. */
  validate(rules?: Rules<V>): boolean;
  /** Wrap a submit handler: prevents the default reload and calls `fn(values)`. */
  handleSubmit(fn: (values: V, event?: Event) => unknown): (event?: Event) => unknown;

  // --- raw reactive state (advanced / backward-compatible) ---
  // Prefer all() / allErrors() / allTouched() above. These remain for direct
  // state access (e.g. `values.peek()`), and won't be removed in 0.x.
  /** Raw values state. Advanced — prefer {@link Form.all}. */
  values: State<V>;
  /** Raw errors state. Advanced — prefer {@link Form.allErrors}. */
  errors: State<Partial<Record<keyof V, string>>>;
  /** Raw touched state. Advanced — prefer {@link Form.allTouched}. */
  touched: State<Partial<Record<keyof V, boolean>>>;
}

/**
 * Create a tiny reactive form helper. Native-forms first: you write ordinary
 * `<input>`s and submit with `@zoijs/action` — forms only holds values, errors,
 * and touched state.
 *
 * ```ts
 * const login = form({ email: "", password: "" });
 * login.value("email");          // string
 * login.set("email", "a@b.com");
 * login.error("email");          // string | undefined
 * login.touch("email");
 * login.reset();
 * ```
 */
export function form<V extends Record<string, any>>(initialValues: V, options?: FormOptions<V>): Form<V>;

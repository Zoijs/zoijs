// Type definitions for @zoijs/forms.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/** A reactive value (same shape as core's createState). */
export interface State<T> {
  get(): T;
  set(value: T): void;
  peek(): T;
}

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
  /** All values (reactive). `values.get()` returns the whole object. */
  values: State<V>;
  /** Read one field's value (reactive). */
  value<K extends keyof V>(name: K): V[K];
  /** Update one field's value. */
  set<K extends keyof V>(name: K, value: V[K]): void;
  /** All errors keyed by field name (reactive). */
  errors: State<Partial<Record<keyof V, string>>>;
  /** Read one field's error (reactive), or `undefined`. */
  error(name: keyof V): string | undefined;
  /** Set one field's error message. */
  setError(name: keyof V, message: string): void;
  /** Clear one field's error. */
  clearError(name: keyof V): void;
  /** Which fields have been touched (reactive). */
  touched: State<Partial<Record<keyof V, boolean>>>;
  /** Mark a field touched (e.g. on blur). */
  touch(name: keyof V): void;
  /** Restore initial values and clear errors + touched. */
  reset(): void;
  /** Run rules (or the option rules), set errors, and return whether valid. */
  validate(rules?: Rules<V>): boolean;
  /** Wrap a submit handler: prevents the default reload and calls `fn(values)`. */
  handleSubmit(fn: (values: V, event?: Event) => unknown): (event?: Event) => unknown;
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

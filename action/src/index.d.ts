// Type definitions for @zoijs/action.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/** Reactive write state created by {@link action}. */
export interface Action<TArgs extends unknown[], TResult> {
  /**
   * Run the wrapped function. Sets `pending()` while it runs, then `done()` +
   * `result()` on success, or `error()` on failure. Never rejects — it resolves
   * with the result on success, or `undefined` on failure.
   */
  run(...args: TArgs): Promise<TResult | undefined>;
  /**
   * `true` while a run is in flight (reactive). Named `pending` because an action
   * *writes* (a mutation is pending); the read-side counterpart is
   * `@zoijs/resource`'s `loading()`. (Intentional design language — read = load,
   * write = pending.)
   */
  pending(): boolean;
  /** The thrown/rejected error, or `null` when there is none (reactive). */
  error(): unknown;
  /** `true` after a successful run; reset to `false` when a new run starts (reactive). */
  done(): boolean;
  /** The latest successful result, or `undefined` (reactive). */
  result(): TResult | undefined;
  /** Clear pending, error, done, and result. */
  reset(): void;
}

/**
 * Wrap a write function (submit / save / delete / mutation) in reactive
 * pending / error / done / result state. Nothing runs until you call `run()`.
 *
 * ```ts
 * const save = action(async (name: string) => {
 *   const r = await fetch("/api/users", { method: "POST", body: name });
 *   if (!r.ok) throw new Error("Could not save");
 *   return r.json();
 * });
 * save.run("Ada");
 * ```
 */
export function action<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  options?: ActionOptions
): Action<TArgs, TResult>;

/** Options for {@link action}. */
export interface ActionOptions {
  /**
   * For non-idempotent writes: while a run is pending, `run()` doesn't call `fn` again — it
   * returns the pending run's promise (its arguments are ignored). The lock is released when
   * that run succeeds or fails, or on `reset()`. Default `false`. It prevents overlapping runs
   * in this page; it doesn't stop server-side replays or retries — make the endpoint idempotent
   * (e.g. an idempotency key) for that.
   */
  exclusive?: boolean;
}

// Type definitions for @zoijs/resource.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/** Reactive async state created by {@link resource}. */
export interface Resource<T> {
  /** The latest loaded value, or `undefined` before the first success (reactive). */
  data(): T | undefined;
  /** `true` while a load is in flight (reactive). */
  loading(): boolean;
  /** The thrown/rejected error, or `null` when there is none (reactive). */
  error(): unknown;
  /** Load again. Keeps the current data until the new load succeeds. */
  refresh(): void;
}

/**
 * Wrap an async fetcher in reactive loading / data / error state. Loads once
 * immediately.
 *
 * ```ts
 * const user = resource(() => fetch("/api/user").then((r) => r.json()));
 * user.loading(); // boolean
 * user.data();    // the value, or undefined
 * user.error();   // the error, or null
 * user.refresh(); // load again
 * ```
 */
export function resource<T>(fetcher: () => T | Promise<T>): Resource<T>;

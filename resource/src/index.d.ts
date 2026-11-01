// Type definitions for @zoijs/resource.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/** Reactive async state created by {@link resource}. */
export interface Resource<T> {
  /** The latest loaded value, or `undefined` before the first success (reactive). */
  data(): T | undefined;
  /**
   * `true` while a load is in flight (reactive). Named `loading` because a
   * resource *reads* data; the write-side counterpart is `@zoijs/action`'s
   * `pending()`. (Intentional design language — read = load, write = pending.)
   */
  loading(): boolean;
  /** The thrown/rejected error, or `null` when there is none (reactive). */
  error(): unknown;
  /** Load again. Keeps the current data until the new load succeeds. */
  refresh(): void;
}

/** Options for {@link resource}. */
export interface ResourceOptions<T> {
  /**
   * Start already-settled with this value instead of auto-loading. This is how a
   * server-rendered resource hands its data to the client: render with the value,
   * serialize it (see `@zoijs/ssr`'s `serialize`), and re-create the resource on
   * hydration with the same `initial` — it keeps the data and does NOT refetch.
   * `refresh()` still loads on demand.
   */
  initial?: T;
}

/**
 * Wrap an async fetcher in reactive loading / data / error state. Loads once
 * immediately — unless `{ initial }` is given, in which case it starts settled with
 * that value and does not auto-load.
 *
 * ```ts
 * const user = resource(() => fetch("/api/user").then((r) => r.json()));
 * user.loading(); // boolean
 * user.data();    // the value, or undefined
 * user.error();   // the error, or null
 * user.refresh(); // load again
 *
 * // hydration: seed with server data, no refetch
 * const seeded = resource(fetchUser, { initial: serverData.user });
 * ```
 */
export function resource<T>(fetcher: () => T | Promise<T>, options?: ResourceOptions<T>): Resource<T>;

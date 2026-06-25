// Type definitions for @zoijs/storage.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/** A persistent, reactive value created by {@link storage}. Same shape as core's state. */
export interface PersistentState<T> {
  /** Read the current value; subscribes the running binding (reactive). */
  get(): T;
  /** Set the value: updates the reactive value and writes JSON to localStorage. */
  set(value: T): void;
  /** Read the current value without subscribing. */
  peek(): T;
}

/**
 * A localStorage-backed reactive value — a drop-in, persistent `createState`.
 *
 * Reads the key on creation (JSON-parsed; falls back to `initialValue` if the
 * key is missing or the stored JSON is corrupt) and writes on every `set`. If
 * localStorage is unavailable it degrades to in-memory state and never throws.
 *
 * ```ts
 * const theme = storage("theme", "light");
 * theme.get();        // "light" | "dark"
 * theme.set("dark");  // updates the value and persists it
 * theme.peek();       // read without subscribing
 * ```
 */
export function storage<T>(key: string, initialValue: T): PersistentState<T>;

// Type definitions for @zoijs/storage.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

import type { State } from "@zoijs/core";

/**
 * A persistent, reactive value created by {@link storage}. Structurally identical
 * to core's {@link State} (`get` / `set` / `peek`) — sourced from @zoijs/core so
 * the shape can never drift — the only behavioral difference being that `set()`
 * also writes the value (as JSON) to localStorage.
 */
export interface PersistentState<T> extends State<T> {}

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

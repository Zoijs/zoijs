// Type definitions for {{APP_NAME}}.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript. Core types are imported
// from @zoijs/core so shapes never drift.

import type { State } from "@zoijs/core";

/** A reactive counter created by {@link counter}. */
export interface Counter {
  /** The current value (reactive inside a binding). */
  value(): number;
  /** Add `by` (default 1). */
  increment(by?: number): void;
  /** Subtract `by` (default 1). */
  decrement(by?: number): void;
  /** Reset to the initial value. */
  reset(): void;
  /** The underlying reactive cell — advanced / direct access. */
  state: State<number>;
}

/** Create a reactive counter built on `@zoijs/core`. */
export function counter(initial?: number): Counter;

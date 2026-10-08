// Type definitions for @zoijs/api.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

import type { Resource } from "@zoijs/resource";

/** What went wrong: an HTTP status outside 2xx, a network failure, a blocked URL, or invalid JSON. */
export type ApiErrorType = "http" | "network" | "security" | "parse";

/**
 * A failed {@link api} request. Its message carries only the method, the status and (for a blocked
 * cross-origin URL) the target origin — never the URL path, query string, fragment, credentials,
 * headers or response body — so it is safe to log. `url` keeps origin + path for debugging.
 */
export class ApiError extends Error {
  constructor(message: string, details: { type: ApiErrorType; status?: number | null; statusText?: string; url?: string | null });
  readonly name: "ApiError";
  readonly type: ApiErrorType;
  /** The HTTP status for `"http"` (and `"parse"`) errors, otherwise `null`. */
  readonly status: number | null;
  /** The HTTP status text, or `""` (HTTP/2 responses have none). */
  readonly statusText: string;
  /** Always `"GET"` in this version. */
  readonly method: "GET";
  /** The request's origin + path (no query string or fragment), or `null` when it couldn't be parsed. */
  readonly url: string | null;
}

/** The resource returned by {@link api}: `error()` is always an {@link ApiError} or `null`. */
export interface ApiResource<T> extends Resource<T> {
  /** The failure, or `null` when there is none (reactive). */
  error(): ApiError | null;
}

/**
 * GET a same-origin URL as a resource. Loads once immediately; `refresh()` loads again.
 * Non-2xx statuses become an {@link ApiError}; JSON is parsed; 204 is `null`; other bodies are strings.
 * Cross-origin URLs are refused with an `ApiError` of type `"security"`.
 *
 * ```ts
 * const tasks = api<Task[]>("/api/tasks");
 * tasks.data();    // Task[] | undefined
 * tasks.loading(); // boolean
 * tasks.error();   // ApiError | null
 * tasks.refresh(); // load again
 * ```
 */
export function api<T = unknown>(url: string): ApiResource<T>;

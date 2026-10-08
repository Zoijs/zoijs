// Type definitions for @zoijs/api.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

import type { Resource } from "@zoijs/resource";

/**
 * What went wrong: an HTTP status outside 2xx, a network failure, a blocked URL, invalid JSON, or
 * (`"config"`) a reactive query that produced an unsupported value or a secret-looking key.
 */
export type ApiErrorType = "http" | "network" | "security" | "parse" | "config";

/**
 * A failed {@link api} request. Its message carries only the method, the status and (for a blocked
 * cross-origin URL) the target origin — never the URL path, query string, fragment, credentials,
 * headers or response body — so it is safe to log. `url` keeps origin + path for debugging.
 */
export class ApiError extends Error {
  constructor(message: string, details: { type: ApiErrorType; status?: number | null; statusText?: string; url?: string | null; cause?: unknown });
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

/** A value that fills one `:name` path segment — encoded once, as exactly one segment. */
export type ApiParamValue = string | number | bigint | boolean;

/** A query value. `null` / `undefined` leave the key out; everything else is sent as text. */
export type ApiQueryValue = string | number | bigint | boolean | null | undefined;

/** Query parameters, by key. Secret-looking keys (`token`, `password`, `api_key`, …) are refused. */
export type ApiQuery = { readonly [key: string]: ApiQueryValue };

/** The only options {@link api} accepts. Anything else is refused. */
export interface ApiOptions {
  /** Values for the URL's `/:name` segments. Every placeholder needs one; every param must be used. Read once. */
  readonly params?: { readonly [name: string]: ApiParamValue };
  /**
   * Query parameters: an object (read once), or a function returning one. A function is
   * reactive — read state inside it and the request is sent again when that state changes.
   */
  readonly query?: ApiQuery | (() => ApiQuery);
}

/**
 * GET a same-origin URL as a resource. Loads once immediately; `refresh()` loads again.
 * Non-2xx statuses become an {@link ApiError}; JSON is parsed; 204 is `null`; other bodies are strings.
 * Cross-origin URLs are refused with an `ApiError` of type `"security"`.
 *
 * ```ts
 * const task = api<Task>("/api/tasks/:id", { params: { id } });
 * const results = api<Hit[]>("/api/search", { query: () => ({ q: search.get() }) }); // refetches on change
 * ```
 *
 * Throws a `TypeError` immediately for an unsupported option, placeholder, param or static query
 * value, a missing or unused param, or a secret-looking query key.
 */
export function api<T = unknown>(url: string, options?: ApiOptions): ApiResource<T>;

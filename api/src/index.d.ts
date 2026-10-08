// Type definitions for @zoijs/api.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

import type { Resource } from "@zoijs/resource";

/**
 * What went wrong: an HTTP status outside 2xx, a network failure, a blocked URL, invalid JSON, or
 * (`"config"`) a mistake in the calling code — a reactive params/query function that produced an
 * unsupported value or a secret-looking key, or `refresh()` after `dispose()`.
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
  /**
   * Load again now, with the current params/query — never debounced. Cancels a pending debounced
   * refetch. Throws an `ApiError` of type `"config"` after {@link dispose}.
   */
  refresh(): void;
  /**
   * Stop for good: aborts the in-flight request (the resource keeps its last data and stops
   * loading), cancels a pending debounced refetch and removes the reactive tracking. Idempotent.
   * Runs automatically when the component that called `api()` unmounts — call it yourself only for
   * an `api()` created outside a component.
   */
  dispose(): void;
}

/** A value that fills one `:name` path segment — encoded once, as exactly one segment. */
export type ApiParamValue = string | number | bigint | boolean;

/** Path parameters, by placeholder name. */
export type ApiParams = { readonly [name: string]: ApiParamValue };

/** One query value. `null` / `undefined` contribute nothing; everything else is sent as text. */
export type ApiQueryScalar = string | number | bigint | boolean | null | undefined;

/**
 * A query value: a scalar, or a one-level array sent as repeated keys (`tag=a&tag=b`).
 * In an array, `null` / `undefined` elements are skipped; `[]` removes the key.
 */
export type ApiQueryValue = ApiQueryScalar | readonly ApiQueryScalar[];

/** Query parameters, by key. Secret-looking keys (`token`, `password`, `api_key`, …) are refused. */
export type ApiQuery = { readonly [key: string]: ApiQueryValue };

/** The only options {@link api} accepts. Anything else is refused. */
export interface ApiOptions {
  /**
   * Values for the URL's `/:name` segments — an object (read once), or a function returning one
   * (reactive: read state inside it and the request is sent again when it changes). Every
   * placeholder needs a param and every param must be used.
   */
  readonly params?: ApiParams | (() => ApiParams);
  /**
   * Query parameters — an object (read once), or a function returning one (reactive, like `params`).
   */
  readonly query?: ApiQuery | (() => ApiQuery);
  /**
   * Milliseconds to wait for reactive params/query to stop changing before refetching
   * (0 to 2147483647; default 0). The first load and `refresh()` are never debounced. No effect,
   * and no timers, when neither `params` nor `query` is a function.
   */
  readonly debounce?: number;
}

/**
 * GET a same-origin URL as a resource. Loads once immediately; `refresh()` loads again.
 * Non-2xx statuses become an {@link ApiError}; JSON is parsed; 204 is `null`; other bodies are strings.
 * Cross-origin URLs are refused with an `ApiError` of type `"security"`.
 *
 * ```ts
 * const task = api<Task>("/api/tasks/:id", { params: { id } });
 * const results = api<Hit[]>("/api/search", { query: () => ({ q: search.get(), tag: tags.get() }), debounce: 250 });
 * const user = api<User>("/api/users/:id", { params: () => ({ id: id.get() }) }); // refetches on change
 * ```
 *
 * Throws a `TypeError` immediately for an unsupported option, invalid `debounce`, unsupported
 * placeholder, a static param or query value it can't send, a missing or unused static param, or
 * a secret-looking query key. Reactive functions report the same mistakes as a `"config"` error().
 */
export function api<T = unknown>(url: string, options?: ApiOptions): ApiResource<T>;

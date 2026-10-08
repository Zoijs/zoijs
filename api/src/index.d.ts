// Type definitions for @zoijs/api.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

import type { Resource } from "@zoijs/resource";
import type { Action } from "@zoijs/action";

/** The methods `api()` (GET) and `api.post/put/patch/delete` send. */
export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * What went wrong: an HTTP status outside 2xx, a network failure, a blocked URL, invalid JSON, or
 * (`"config"`) a mistake in the calling code — a reactive params/query function that produced an
 * unsupported value or a secret-looking key, `refresh()` after `dispose()`, or a mutation `run()`
 * whose input or JSON body can't be sent.
 */
export type ApiErrorType = "http" | "network" | "security" | "parse" | "config";

/**
 * A failed {@link api} request. Its message carries only the method, the status and (for a blocked
 * cross-origin URL) the target origin — never the URL path, query string, fragment, credentials,
 * headers or response body — so it is safe to log. `url` keeps origin + path for debugging.
 */
export class ApiError extends Error {
  constructor(message: string, details: { type: ApiErrorType; status?: number | null; statusText?: string; method?: ApiMethod; url?: string | null; cause?: unknown });
  readonly name: "ApiError";
  readonly type: ApiErrorType;
  /** The HTTP status for `"http"` (and `"parse"`) errors, otherwise `null`. */
  readonly status: number | null;
  /** The HTTP status text, or `""` (HTTP/2 responses have none). */
  readonly statusText: string;
  /** The request's method. */
  readonly method: ApiMethod;
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

/** A JSON value a mutation can send. Objects are plain objects; `undefined` properties are left out. */
export type ApiJson = string | number | boolean | null | readonly ApiJson[] | { readonly [key: string]: ApiJson | undefined };

/** `run()`'s argument when the mutation URL has `/:name` placeholders. */
export interface ApiRouteInput<TBody> {
  readonly params: ApiParams;
  readonly body?: TBody;
}

/** `run()`'s argument for `api.delete()` with `/:name` placeholders (DELETE sends no body). */
export interface ApiDeleteInput {
  readonly params: ApiParams;
}

/** The only options a mutation factory accepts. Anything else (headers, method, credentials, …) is refused. */
export interface ApiMutationOptions {
  /** Static query parameters, with the same rules (and secret-key refusal) as `api()`. */
  readonly query?: ApiQuery;
  /**
   * `api()` resources to refresh after a successful request. Refreshed after the action's success
   * state is set; `run()` doesn't wait for them, and their failures stay theirs. Disposed ones are skipped.
   */
  readonly invalidate?: ApiResource<unknown> | readonly ApiResource<unknown>[];
  /** While a run is pending, `run()` returns that run's promise instead of sending again. Default `false`, like `@zoijs/action`. */
  readonly exclusive?: boolean;
}

/**
 * A mutation: `@zoijs/action`'s reactive `pending()` / `error()` / `done()` / `result()` / `reset()`.
 * `run()` never rejects — it resolves with the parsed response, or `undefined` on failure.
 */
export interface ApiMutation<TResponse, TInput> extends Omit<Action<[TInput?], TResponse>, "error" | "run"> {
  /** Send the request. With no `/:name` placeholders in the URL the argument is the JSON body; with them it is `{ params, body? }`. */
  run(input?: TInput): Promise<TResponse | undefined>;
  /** The failure, or `null` (reactive). */
  error(): ApiError | null;
}

/** `api()` and its mutation factories. */
export interface Api {
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
  <T = unknown>(url: string, options?: ApiOptions): ApiResource<T>;
  /**
   * POST JSON. `run(body)`, or `run({ params, body? })` when the URL has `/:name` placeholders.
   *
   * ```ts
   * const addTask = api.post<Task, NewTask>("/api/tasks", { invalidate: tasks, exclusive: true });
   * await addTask.run({ title: "Learn Zoijs" });
   * ```
   */
  post<TResponse = unknown, TBody = ApiJson>(url: string, options?: ApiMutationOptions): ApiMutation<TResponse, TBody | ApiRouteInput<TBody>>;
  /** PUT JSON. `run(body)`, or `run({ params, body? })` when the URL has `/:name` placeholders. */
  put<TResponse = unknown, TBody = ApiJson>(url: string, options?: ApiMutationOptions): ApiMutation<TResponse, TBody | ApiRouteInput<TBody>>;
  /** PATCH JSON. `run(body)`, or `run({ params, body? })` when the URL has `/:name` placeholders. */
  patch<TResponse = unknown, TBody = ApiJson>(url: string, options?: ApiMutationOptions): ApiMutation<TResponse, TBody | ApiRouteInput<TBody>>;
  /** DELETE, with no body. `run()`, or `run({ params })` when the URL has `/:name` placeholders. */
  delete<TResponse = unknown>(url: string, options?: ApiMutationOptions): ApiMutation<TResponse, ApiDeleteInput>;
}

/** Same-origin reads (`api(url)`) and writes (`api.post/put/patch/delete`). */
export declare const api: Api;

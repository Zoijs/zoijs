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
 * whose input or JSON body can't be sent; `"timeout"` the `timeout` option elapsed (for a
 * mutation, the server may still have acted on it); `"auth"` a {@link createApi} client's `auth`
 * provider threw, rejected, exceeded `authTimeout` or returned an invalid token — the request was
 * not sent.
 */
export type ApiErrorType = "http" | "network" | "security" | "parse" | "config" | "timeout" | "auth";

/**
 * RFC 9457 problem details from an `application/problem+json` error response — only with the
 * `problemDetails` option. Only these members, only with these types; extensions are ignored.
 * Server-supplied and untrusted: render as text, never as HTML or a URL you follow automatically.
 */
export interface ApiProblem {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
}

/**
 * A failed {@link api} request. Its message carries only the method, the status and (for a blocked
 * cross-origin URL) the target origin — never the URL path, query string, fragment, credentials,
 * headers or response body — so it is safe to log. `url` keeps origin + path for debugging.
 */
export class ApiError extends Error {
  constructor(message: string, details: { type: ApiErrorType; status?: number | null; statusText?: string; method?: ApiMethod; url?: string | null; cause?: unknown; problem?: ApiProblem | null });
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
  /** Normalized problem details (`"http"` errors with `problemDetails: true` only), otherwise `null`. Never in `message`. */
  readonly problem: ApiProblem | null;
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

/**
 * The `:name` placeholders of a URL template, as a union of names — `never` when it has none.
 * Only the path counts (a query string or fragment is ignored), as at runtime.
 *
 * ```ts
 * type N = ApiPathParamNames<"/api/users/:id/posts/:postId">; // "id" | "postId"
 * ```
 */
export type ApiPathParamNames<Url extends string> = Url extends `${infer Path}?${string}`
  ? ApiPathParamNames<Path>
  : Url extends `${infer Path}#${string}`
    ? ApiPathParamNames<Path>
    : Url extends `:${infer Rest}`
      ? ApiPathParamSegment<Rest>
      : Url extends `${string}/:${infer Rest}`
        ? ApiPathParamSegment<Rest>
        : never;
type ApiPathParamSegment<Rest extends string> = Rest extends `${infer Name}/${infer Tail}` ? Name | ApiPathParamNames<`/${Tail}`> : Rest;

/**
 * The `params` a URL template takes. For a string-literal URL with placeholders, its names — so
 * a misspelled or unknown name (`{ userId }` for `"/users/:id"`) is a type error in your editor,
 * not only at runtime. Names are optional here so that existing code passing a value typed as
 * {@link ApiParams} keeps compiling; a *missing* param is still refused when the request is built.
 * Any {@link ApiParams} for a URL known only as `string`, or one without placeholders.
 */
export type ApiPathParams<Url extends string = string> = string extends Url
  ? ApiParams
  : [ApiPathParamNames<Url>] extends [never]
    ? ApiParams
    : { readonly [K in ApiPathParamNames<Url>]?: ApiParamValue };

/** One query value. `null` / `undefined` contribute nothing; everything else is sent as text. */
export type ApiQueryScalar = string | number | bigint | boolean | null | undefined;

/**
 * A query value: a scalar, or a one-level array sent as repeated keys (`tag=a&tag=b`).
 * In an array, `null` / `undefined` elements are skipped; `[]` removes the key.
 */
export type ApiQueryValue = ApiQueryScalar | readonly ApiQueryScalar[];

/** Query parameters, by key. Secret-looking keys (`token`, `password`, `api_key`, …) are refused. */
export type ApiQuery = { readonly [key: string]: ApiQueryValue };

/** Options every {@link api} resource accepts. `Url` (a string-literal URL) types `params`. */
export interface ApiBaseOptions<T = unknown, Url extends string = string> {
  /**
   * Values for the URL's `/:name` segments — an object (read once), or a function returning one
   * (reactive: read state inside it and the request is sent again when it changes). Every
   * placeholder needs a param and every param must be used.
   */
  readonly params?: ApiPathParams<Url> | (() => ApiPathParams<Url>);
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
  /**
   * Milliseconds (0 to 2147483647) from the moment a request starts — after any debounce — until
   * it is aborted and fails with type `"timeout"`. `0` (the default) means no timeout.
   */
  readonly timeout?: number;
  /**
   * Seed data (e.g. from server rendering): `data()` starts as this value, `loading()` false, and
   * the first request is skipped. Later reactive changes and `refresh()` fetch normally. The key's
   * presence counts — `initial: undefined` seeds too. Kept as given, never cloned.
   */
  readonly initial?: T;
  /** Attach normalized `application/problem+json` details to HTTP errors as `error.problem`. Default `false`. */
  readonly problemDetails?: boolean;
}

/**
 * The only options {@link api} accepts. Anything else (including the mutation-only
 * `idempotencyKey`, `exclusive`, `invalidate`) is refused. `retryDelay` requires `retry`.
 */
export type ApiOptions<T = unknown, Url extends string = string> = ApiBaseOptions<T, Url> &
  (
    | {
        /** No retries (the default). */
        readonly retry?: 0;
        readonly retryDelay?: never;
      }
    | {
        /**
         * Extra attempts after the first, per logical load. Only network errors, timeouts and HTTP
         * 408, 425, 429, 500, 502, 503, 504 are retried, replaying the same URL; a reactive change
         * or `refresh()` starts a new load instead. Servers must not attach side effects to GETs.
         */
        readonly retry: ApiRetryCount;
        /** Base backoff in ms (default 250): ~`retryDelay × 2^(n-1)` ±20 % jitter, at most 30 s. */
        readonly retryDelay?: number;
      }
  );

/** A JSON value a mutation can send. Objects are plain objects; `undefined` properties are left out. */
export type ApiJson = string | number | boolean | null | readonly ApiJson[] | { readonly [key: string]: ApiJson | undefined };

/** `run()`'s argument when the mutation URL has `/:name` placeholders. */
export interface ApiRouteInput<TBody, Url extends string = string> {
  readonly params: ApiPathParams<Url>;
  readonly body?: TBody | FormData;
}

/** `run()`'s argument for `api.delete()` with `/:name` placeholders (DELETE sends no body). */
export interface ApiDeleteInput<Url extends string = string> {
  readonly params: ApiPathParams<Url>;
}

/**
 * What a POST/PUT/PATCH `run()` takes, decided by the URL as at runtime: for a string-literal URL
 * without placeholders, the body (JSON or `FormData`); with placeholders, `{ params, body? }`.
 * For a URL only known as `string`, either.
 */
export type ApiMutationInput<TBody, Url extends string = string> = string extends Url
  ? TBody | FormData | ApiRouteInput<TBody>
  : [ApiPathParamNames<Url>] extends [never]
    ? TBody | FormData
    : ApiRouteInput<TBody, Url>;

/** What a DELETE `run()` takes: nothing, or `{ params }` when the URL has placeholders. */
export type ApiDeleteRunInput<Url extends string = string> = string extends Url
  ? ApiDeleteInput
  : [ApiPathParamNames<Url>] extends [never]
    ? never
    : ApiDeleteInput<Url>;

/** Options every mutation factory accepts. */
export interface ApiMutationBaseOptions {
  /** Static query parameters, with the same rules (and secret-key refusal) as `api()`. */
  readonly query?: ApiQuery;
  /**
   * `api()` resources to refresh after a successful request. Refreshed after the action's success
   * state is set; `run()` doesn't wait for them, and their failures stay theirs. Disposed ones are skipped.
   */
  readonly invalidate?: ApiResource<unknown> | readonly ApiResource<unknown>[];
  /** While a run is pending, `run()` returns that run's promise instead of sending again. Default `false`, like `@zoijs/action`. */
  readonly exclusive?: boolean;
  /**
   * Milliseconds (0 to 2147483647; 0 = none) before an attempt is aborted and fails with type
   * `"timeout"` — a fresh window per attempt. It only stops the browser waiting: the server may
   * still complete the mutation.
   */
  readonly timeout?: number;
  /** Attach normalized `application/problem+json` details to HTTP errors as `error.problem`. Default `false`. */
  readonly problemDetails?: boolean;
}

/**
 * Where a mutation's `Idempotency-Key` comes from: `true` — a fresh cryptographically random UUID
 * per `run()`; or a function called once per `run()` that returns 1–255 visible ASCII characters
 * (`!`–`~`, no spaces). A fixed string isn't accepted: it would be reused for every run.
 * Sending the header doesn't make an endpoint idempotent — the server must store and enforce it.
 */
export type ApiIdempotencyKey = true | (() => string);

/** How many extra attempts a mutation may make (`retry: 2` = at most 3 requests). */
export type ApiRetryCount = 1 | 2 | 3 | 4 | 5;

/**
 * The only options a mutation factory accepts. Anything else (headers, method, credentials, …) is
 * refused. `retry` (and `retryDelay`) require an idempotency key — checked here and at runtime.
 */
export type ApiMutationOptions = ApiMutationBaseOptions &
  (
    | {
        /** Send an `Idempotency-Key`, or not (`false`, the default). */
        readonly idempotencyKey?: boolean | (() => string);
        /** No retries (the default). */
        readonly retry?: 0;
        readonly retryDelay?: never;
      }
    | {
        /** Required with `retry`: every retry of a run reuses its key. */
        readonly idempotencyKey: ApiIdempotencyKey;
        /**
         * Extra attempts after the first. Only network errors, timeouts and HTTP 408, 425, 429,
         * 500, 502, 503, 504 are retried. A FormData body is replayed as the same FormData (its
         * multipart boundary may differ between attempts).
         */
        readonly retry: ApiRetryCount;
        /** Base backoff in ms (default 250): retry n waits ~`retryDelay × 2^(n-1)` ±20 % jitter, at most 30 s. */
        readonly retryDelay?: number;
      }
  );

/**
 * A mutation: `@zoijs/action`'s reactive `pending()` / `error()` / `done()` / `result()` / `reset()`.
 * `run()` never rejects — it resolves with the parsed response, or `undefined` on failure.
 */
export interface ApiMutation<TResponse, TInput> extends Omit<Action<[TInput?], TResponse>, "error" | "run"> {
  /** Send the request. With no `/:name` placeholders in the URL the argument is the JSON body; with them it is `{ params, body? }`. */
  run(input?: TInput): Promise<TResponse | undefined>;
  /** The failure, or `null` (reactive). */
  error(): ApiError | null;
  /**
   * The attempt in flight, or the last attempt of the latest run (reactive): 0 when idle or after
   * `reset()`, 1 during the first request, 2 during the first retry, … During a backoff wait it
   * stays at the attempt that just failed. Kept after the run ends, until the next run or `reset()`.
   */
  attempt(): number;
  /** `true` from the latest run's first retryable failure until the run ends (reactive). Always `false` without `retry`. */
  retrying(): boolean;
}

/**
 * The request surface — a callable GET plus mutation factories — shared by {@link api} (same-origin)
 * and every {@link createApi} client (one trusted origin). Same options, same behavior; only the
 * URLs it accepts differ.
 */
export interface Api {
  /**
   * GET a URL as a resource — for `api`, a same-origin URL; for a client, a path under its `baseURL`. Loads once immediately; `refresh()` loads again.
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
  <T = unknown, Url extends string = string>(url: Url, options?: ApiOptions<T, Url>): ApiResource<T>;
  /**
   * POST JSON or FormData. `run(body)`, or `run({ params, body? })` when the URL has `/:name` placeholders.
   *
   * ```ts
   * const addTask = api.post<Task, NewTask>("/api/tasks", { invalidate: tasks, exclusive: true });
   * await addTask.run({ title: "Learn Zoijs" });
   * ```
   */
  post<TResponse = unknown, TBody = ApiJson, Url extends string = string>(url: Url, options?: ApiMutationOptions): ApiMutation<TResponse, ApiMutationInput<TBody, Url>>;
  /** PUT JSON or FormData. `run(body)`, or `run({ params, body? })` when the URL has `/:name` placeholders. */
  put<TResponse = unknown, TBody = ApiJson, Url extends string = string>(url: Url, options?: ApiMutationOptions): ApiMutation<TResponse, ApiMutationInput<TBody, Url>>;
  /** PATCH JSON or FormData. `run(body)`, or `run({ params, body? })` when the URL has `/:name` placeholders. */
  patch<TResponse = unknown, TBody = ApiJson, Url extends string = string>(url: Url, options?: ApiMutationOptions): ApiMutation<TResponse, ApiMutationInput<TBody, Url>>;
  /** DELETE, with no body. `run()`, or `run({ params })` when the URL has `/:name` placeholders. */
  delete<TResponse = unknown, Url extends string = string>(url: Url, options?: ApiMutationOptions): ApiMutation<TResponse, ApiDeleteRunInput<Url>>;
}

/** Same-origin reads (`api(url)`) and writes (`api.post/put/patch/delete`). Not configurable. */
export declare const api: Api;

/** What a {@link createApi} client's `auth` provider is given for one call. */
export interface ApiAuthContext {
  /**
   * Aborts when the request no longer needs a token — superseded (a reactive change or
   * `refresh()`), disposed, unmounted or `reset()` — or when the client's `authTimeout` elapses
   * (then `signal.reason` is a `"TimeoutError"`). Pass it on to your own token fetch to stop that
   * work too; the request itself stops waiting either way.
   */
  readonly signal: AbortSignal;
}

/**
 * Supplies a {@link createApi} client's Bearer access token: called once per logical request
 * (each load, `refresh()` or `run()` — never per retry, never at creation), so it can return the
 * current token from your own session state. Return the token itself — Zoijs sends
 * `Authorization: Bearer <token>` — or `null`/`undefined` to send the request without one.
 * A token must use RFC 6750 characters (`A–Z a–z 0–9 - . _ ~ + /`, then optional `=`), at most
 * 8192 of them; anything else (including a `"Bearer …"` prefix or an empty string), a throw, a
 * rejection or exceeding `authTimeout` fails the request as type `"auth"` without sending it.
 * It receives an {@link ApiAuthContext} with an `AbortSignal`; providers that ignore it still work.
 */
export type ApiAuthProvider = (context: ApiAuthContext) => string | null | undefined | PromiseLike<string | null | undefined>;

/**
 * The only options {@link createApi} accepts. Headers and credentials are refused.
 */
export interface CreateApiOptions {
  /**
   * The trusted API's absolute `https:` URL (plain `http:` only for loopback hosts), optionally with
   * a base path: `"https://api.example.com/v1/"`. No credentials, query string, fragment,
   * backslashes or `.`/`..` segments. Requests resolve under its path: `"/users"` →
   * `https://api.example.com/v1/users`.
   */
  readonly baseURL: string;
  /**
   * Optional Bearer authentication: a function returning the access token (never the token
   * itself). Sent only to this client's origin; cookies stay omitted. See {@link ApiAuthProvider}.
   */
  readonly auth?: ApiAuthProvider;
  /**
   * Milliseconds (0 to 2147483647; 0 or absent = no limit) the `auth` provider may take per
   * request. When it elapses, the provider's signal aborts and the request fails with type
   * `"auth"` — nothing is sent, nothing is retried. Requires `auth`. Unrelated to `timeout`,
   * which times each network attempt.
   */
  readonly authTimeout?: number;
}

/**
 * A request surface locked to one explicitly trusted origin. Its URLs are paths starting with `/`,
 * resolved under `baseURL`'s path; full URLs, `//host`, backslashes and `.`/`..` segments are
 * refused. Requests use CORS (the server must allow the page's origin), send no cookies, and never
 * follow redirects; with `auth`, they carry a Bearer token. Frozen: neither the boundary nor the
 * provider can be changed after creation, and neither is exposed.
 */
export interface ApiClient extends Api {
  /** The normalized base URL (always ending in `/`), read-only. */
  readonly baseURL: string;
}

/**
 * Create a client for ONE external origin. `api()` stays same-origin-only; nothing global changes.
 *
 * ```ts
 * const github = createApi({ baseURL: "https://api.github.com" });
 * const repos = github<Repo[]>("/users/:user/repos", { params: { user } });
 * ```
 *
 * Throws a `TypeError` for a missing, relative, non-https (non-loopback), credentialed or
 * otherwise unsafe `baseURL`, and for any other option.
 */
export declare function createApi(options: CreateApiOptions): ApiClient;

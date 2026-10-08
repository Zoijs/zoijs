// @zoijs/api — same-origin GET requests as a Zoijs resource.
//
//   import { api } from "@zoijs/api";
//
//   const tasks = api("/api/tasks");
//   tasks.data(); tasks.loading(); tasks.error(); tasks.refresh();
//
// api(url) is resource(() => <a secure GET of url>): the loading/data/error/refresh lifecycle,
// latest-request-wins, cleanup on dispose and configure({ onError }) reporting all come from
// @zoijs/resource, unchanged. This package only adds the request layer:
//   - the URL is resolved with the platform URL API and must be same-origin http(s) as the page;
//   - the request is always GET, with mode "same-origin" and credentials "same-origin", so the
//     browser itself refuses cross-origin requests and cross-origin redirects;
//   - non-2xx statuses, network failures, policy violations and malformed JSON become an ApiError;
//   - JSON (any `…/json` or `…+json` type) is parsed, 204/205 or an empty body is null, anything
//     else is returned as a plain string — never interpreted as HTML or script;
//   - a superseded request is aborted on refresh(), and the in-flight one when the owner is disposed.
//
// Dynamic URLs (options, all optional — nothing else is accepted):
//   - params: `:name` path placeholders, each filled with exactly one encoded path segment;
//   - query: a plain object of primitives, or a function returning one. A function is evaluated in
//     a core computed(), so reading state in it (`() => ({ q: search.get() })`) refetches when that
//     state changes; an effect owned by the component drives refresh(), and dies with it.
// The URL is built (params → URL API → query) and THEN goes through the same origin/scheme/
// credential checks as any other URL. Secret-looking query keys (token, password, …) are refused.
//
// Error messages carry only the method, the status and (for a blocked cross-origin URL) the
// target origin — never the URL path, query string, fragment, credentials, request headers or the
// response body — so they are safe to log. The `url` field keeps origin + path for debugging. Client-side checks never replace server-side authentication and authorization.

import { onCleanup, computed, effect } from "@zoijs/core";
import { resource } from "@zoijs/resource";

const METHOD = "GET";
// `type/json`, `type/anything+json`, with optional parameters (`; charset=utf-8`).
const JSON_TYPE = /^[^/\s;]+\/(?:[^/\s;]+\+)?json$/;

/** A failed api() request. `type`: "http" | "network" | "security" | "parse" | "config". */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ type: string, status?: number | null, statusText?: string, url?: string | null, cause?: unknown }} details
   */
  constructor(message, details) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = "ApiError";
    this.type = details.type;
    this.status = details.status ?? null;
    this.statusText = details.statusText ?? "";
    this.method = METHOD;
    this.url = details.url ?? null;
  }
}

// The page's URL, or null when there is no origin to compare against (no `location`, or an opaque
// "null" origin such as a sandboxed iframe or a file:// page).
function pageLocation() {
  const loc = globalThis.location;
  if (!loc || typeof loc.href !== "string") return null;
  try {
    const page = new URL(loc.href);
    return page.origin !== "null" && isHttp(page) ? page : null;
  } catch {
    return null;
  }
}

// Relative URLs resolve the way fetch() resolves them: against the document's base URL.
const baseHref = (page) => (globalThis.document && typeof globalThis.document.baseURI === "string" ? globalThis.document.baseURI : page.href);

// Resolve `input` against the page, apply the query entries, then check the FINAL URL against the
// page origin. Returns the URL, or throws a security/config ApiError.
function resolveSameOrigin(input, entries) {
  const page = pageLocation();
  if (!page) throw new ApiError(`${METHOD} blocked: api() needs an http(s) page origin to check the URL against`, { type: "security" });
  let target;
  try {
    target = new URL(input, baseHref(page));
  } catch {
    // Don't echo the raw input: it may be what the developer considers secret.
    throw new ApiError(`${METHOD} blocked: invalid URL`, { type: "security" });
  }
  // URLSearchParams.set: replaces any value the template already had for that key.
  for (const [key, value] of entries) target.searchParams.set(key, value);
  target.hash = ""; // never part of an HTTP request
  for (const key of target.searchParams.keys()) {
    if (isSensitiveKey(key)) throw new ApiError(sensitiveMessage(key), { type: "config", url: safeUrl(target) });
  }
  if (target.username || target.password) {
    throw new ApiError(`${METHOD} blocked: credentials in the URL are not allowed`, { type: "security", url: safeUrl(target) });
  }
  // Same origin AND an http(s) URL: a blob: URL inherits the page's origin but isn't an API request.
  if (!isHttp(target) || target.origin !== page.origin) {
    throw new ApiError(`${METHOD} blocked: ${isHttp(target) ? target.origin : target.protocol} is not the page's origin (api() allows same-origin URLs only)`, { type: "security", url: safeUrl(target) });
  }
  return target;
}

const isHttp = (u) => u.protocol === "https:" || u.protocol === "http:";
// The `url` field of an error: origin + path. No credentials, query string or fragment.
const safeUrl = (u) => (isHttp(u) ? u.origin + u.pathname : u.protocol);

async function request(input, entries, signal) {
  const target = resolveSameOrigin(input, entries);
  const where = safeUrl(target);
  let res;
  try {
    res = await globalThis.fetch(target.href, {
      method: METHOD,
      mode: "same-origin",
      credentials: "same-origin",
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
      signal,
    });
  } catch {
    // The platform's message can include the full URL; ours carries none of it.
    throw new ApiError(`${METHOD} request failed: network error`, { type: "network", url: where });
  }
  // Defense in depth for fetch implementations that don't enforce mode "same-origin".
  if (res.redirected && res.url && !sameOrigin(res.url, target.origin)) {
    discard(res);
    throw new ApiError(`${METHOD} request blocked: redirected to another origin`, { type: "security", url: where });
  }
  if (!res.ok) {
    discard(res);
    const statusText = typeof res.statusText === "string" ? res.statusText : "";
    throw new ApiError(`${METHOD} request failed: ${res.status}${statusText ? " " + statusText : ""}`, { type: "http", status: res.status, statusText, url: where });
  }
  if (res.status === 204 || res.status === 205) {
    discard(res);
    return null;
  }
  const mediaType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  let text;
  try {
    text = await res.text();
  } catch {
    throw new ApiError(`${METHOD} request failed: network error while reading the response`, { type: "network", status: res.status, url: where });
  }
  if (!JSON_TYPE.test(mediaType)) return text;
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(`${METHOD} request failed: the response is not valid JSON`, { type: "parse", status: res.status, url: where });
  }
}

function sameOrigin(href, origin) {
  try {
    return new URL(href).origin === origin;
  } catch {
    return false;
  }
}

// Release an unread body (we never expose it) so the connection isn't held open.
function discard(res) {
  try {
    const p = res.body && res.body.cancel();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* already consumed or unsupported */
  }
}


// ---- dynamic URLs: options, params, query ---------------------------------------------------

// A mistake in the code calling api() (bad option, placeholder, value or key). Thrown as a
// TypeError when api() is called; a reactive query's mistakes become an ApiError of type "config".
class ConfigError extends TypeError {}
const configError = (detail) => new ConfigError(`api(): ${detail}`);

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Query keys that name a credential. Matched EXACTLY after lowercasing and dropping everything but
// letters and digits ("Access-Token", "access_token" and "accessToken" all become "accesstoken"),
// so pagination keys like pageToken or a "tokenizer" filter are not caught.
const SENSITIVE_KEYS = new Set([
  "token", "accesstoken", "refreshtoken", "idtoken", "authtoken", "sessiontoken", "bearer", "jwt",
  "password", "passwd", "pwd", "secret", "clientsecret", "apisecret", "apikey", "xapikey",
  "authorization", "auth", "session", "sessionid", "credential", "credentials", "privatekey",
]);
const isSensitiveKey = (key) => SENSITIVE_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
const sensitiveMessage = (key) =>
  `the query key "${key}" names a secret — URLs end up in browser history, server and proxy logs, analytics and monitoring; send it in a header or a request body instead`;

const describe = (v) => (v === null ? "null" : Array.isArray(v) ? "an array" : typeof v);

// [key, value] for each own enumerable string key — every value read exactly once (getters run
// once, like any property access). Nothing is merged into or copied onto another object.
function ownEntries(obj, what) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) throw configError(`${what} must be a plain object, got ${describe(obj)}`);
  return Object.keys(obj).map((key) => [key, obj[key]]);
}

// The text form of a param/query value. Values themselves never appear in messages.
function toText(value, label, nullable) {
  const t = typeof value;
  if (t === "string") return value;
  if (t === "bigint" || t === "boolean" || (t === "number" && Number.isFinite(value))) return String(value);
  if (nullable && value == null) return null;
  const hint = t === "object" || t === "function" ? " (for a reactive value, pass query: () => ({ … }) and read the state inside it)" : "";
  throw configError(`${label} must be a string, number, bigint${nullable ? ", boolean, null or undefined" : " or boolean"}, got ${t === "number" ? "a non-finite number" : describe(value)}${nullable ? hint : ""}`);
}

// One path segment, encoded once: "/", "?", "#", "%", ":" and "@" can't change the URL's shape.
// "." and ".." can't be encoded away (the URL standard treats "%2e" as a dot too), so they — and
// "", which would add an empty segment — are refused.
function encodeSegment(name, value) {
  const text = toText(value, `params.${name}`, false);
  if (text === "" || text === "." || text === "..") throw configError(`params.${name} can't be empty, "." or ".." — it must be exactly one path segment`);
  try {
    return encodeURIComponent(text);
  } catch {
    throw configError(`params.${name} is not valid Unicode (a lone surrogate)`);
  }
}

// Fill every `/:name` path segment of the template. Strict: each placeholder needs a param, each
// param must be used, and anything that isn't exactly `:name` (`:id?`, `:id*`, `:{id}`) is refused.
function applyParams(template, params) {
  const cut = template.search(/[?#]/);
  const path = cut < 0 ? template : template.slice(0, cut);
  const rest = cut < 0 ? "" : template.slice(cut);
  const values = new Map(params === undefined ? [] : ownEntries(params, "params")); // a Map: "__proto__" is just a key
  const used = new Set();
  const built = path.replace(/(^|\/):([^/]*)/g, (_, slash, name) => {
    if (!PARAM_NAME.test(name)) throw configError("unsupported placeholder in the URL — use whole /:name segments (letters, digits, _)");
    if (!values.has(name)) throw configError(`the URL has :${name} but params.${name} is missing`);
    used.add(name);
    return slash + encodeSegment(name, values.get(name));
  });
  if (/(^|\/):[^/]*$/.test(path) && /^\?(#|$)/.test(rest)) throw configError("unsupported placeholder in the URL — optional params (:name?) aren't supported");
  for (const name of values.keys()) {
    if (!used.has(name)) throw configError(`params.${name} isn't used by the URL — check for a typo`);
  }
  for (const key of new URLSearchParams(rest.split("#")[0]).keys()) {
    if (isSensitiveKey(key)) throw configError(sensitiveMessage(key));
  }
  return built + rest;
}

// Validated [key, text] pairs; null/undefined values are left out.
function queryEntries(query) {
  const out = [];
  for (const [key, value] of ownEntries(query, "query")) {
    if (isSensitiveKey(key)) throw configError(sensitiveMessage(key));
    const text = toText(value, `query.${key}`, true);
    if (text !== null) out.push([key, text]);
  }
  return out;
}

// A reactive query function's current result: { key, entries } or { key, error }. Never throws, so
// the computed/effect around it can't fail (and report) on their own.
function evaluateQuery(fn) {
  let value;
  try {
    value = fn();
  } catch (err) {
    return failed(new ApiError(`${METHOD} request not sent: the query function threw`, { type: "config", cause: err }));
  }
  try {
    const entries = queryEntries(value);
    return { key: JSON.stringify(entries), entries };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    return failed(new ApiError(`${METHOD} request not sent: ${err.message.slice("api(): ".length)}`, { type: "config" }));
  }
}
const failed = (error) => ({ key: "!" + error.message, error });

/**
 * GET a same-origin URL as a resource: reactive data() / loading() / error() / refresh().
 * @param {string} url  a same-origin URL; `/:name` segments are filled from `params`
 * @param {{ params?: object, query?: object | (() => object) }} [options]
 */
export function api(url, options) {
  if (typeof url !== "string" || url.trim() === "") throw new TypeError("api(url): url must be a non-empty string");
  if (arguments.length > 2) throw new TypeError("api(url, options): too many arguments — api() always performs a GET");

  let params, query;
  if (options !== undefined) {
    for (const [key, value] of ownEntries(options, "options")) {
      if (key === "params") params = value;
      else if (key === "query") query = value;
      else throw configError(`unsupported option "${key}" — only params and query are accepted (api() always performs a GET)`);
    }
  }
  const path = applyParams(url, params); // static: checked once, now

  // Static query: validated once, now. A query function is read through a core computed(): it
  // tracks the state the function reads, and an effect refreshes when the built query changes.
  let read, current;
  if (typeof query === "function") {
    current = computed(() => evaluateQuery(query));
    read = () => current.peek(); // current values, even before the batched effect runs
  } else {
    const fixed = { key: "", entries: query === undefined ? [] : queryEntries(query) };
    read = () => fixed;
  }

  let controller = null;
  let lastKey; // the query the latest request was built from
  onCleanup(() => controller && controller.abort());

  const result = resource(() => {
    // A newer load supersedes the old one: resource() already ignores its result; abort it too.
    if (controller) controller.abort();
    controller = null;
    const q = read();
    lastKey = q.key;
    if (q.error) return Promise.reject(q.error);
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    controller = ac;
    return request(path, q.entries, ac ? ac.signal : undefined)
      .catch((err) => {
        // error() is always an ApiError: anything unexpected becomes a generic one, without its message.
        throw err instanceof ApiError ? err : new ApiError(`${METHOD} request failed`, { type: "network" });
      })
      .finally(() => {
        if (controller === ac) controller = null;
      });
  });

  // Refetch when the query changes. Effects are microtask-batched, so several state changes in one
  // synchronous block make one request; a refresh() that already used the new query is not repeated.
  // Owned by the calling component: disposed with it, so later state changes request nothing.
  if (current) {
    effect(() => {
      if (current.get().key !== lastKey) result.refresh();
    });
  }
  return result;
}

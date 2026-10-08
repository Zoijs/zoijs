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
//   - query: scalars or shallow arrays of scalars (repeated keys);
//   - either may be a function returning the object. Functions are evaluated in a core computed(),
//     so reading state in them (`() => ({ q: search.get() })`) refetches when that state changes;
//     a tracking effect drives refresh(), optionally `debounce`d. Both live in one scope effect, so
//     component unmount or dispose() removes them from the reactive graph.
// The URL is built (params → URL API → query) and THEN goes through the same origin/scheme/
// credential checks as any other URL. Secret-looking query keys (token, password, …) are refused.
//
// Error messages carry only the method, the status and (for a blocked cross-origin URL) the
// target origin — never the URL path, query string, fragment, credentials, request headers or the
// response body — so they are safe to log. The `url` field keeps origin + path for debugging. Client-side checks never replace server-side authentication and authorization.

import { onCleanup, computed, effect } from "@zoijs/core";
import { resource } from "@zoijs/resource";
import { action } from "@zoijs/action";

// Every object api() returns, mapped to its internals. Module-private, so it can't be forged: an
// object that merely has a refresh() method is not an api() resource (invalidation checks this).
const RESOURCES = new WeakMap();

const METHOD = "GET";
// `type/json`, `type/anything+json`, with optional parameters (`; charset=utf-8`).
const JSON_TYPE = /^[^/\s;]+\/(?:[^/\s;]+\+)?json$/;
const ACCEPT = "application/json, text/plain;q=0.9, */*;q=0.8";

/** A failed api() request. `type`: "http" | "network" | "security" | "parse" | "config". */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ type: string, status?: number | null, statusText?: string, method?: string, url?: string | null, cause?: unknown }} details
   */
  constructor(message, details) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = "ApiError";
    this.type = details.type;
    this.status = details.status ?? null;
    this.statusText = details.statusText ?? "";
    this.method = details.method ?? METHOD;
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
function resolveSameOrigin(input, entries, method) {
  const page = pageLocation();
  if (!page) throw new ApiError(`${method} blocked: api() needs an http(s) page origin to check the URL against`, { type: "security", method });
  let target;
  try {
    target = new URL(input, baseHref(page));
  } catch {
    // Don't echo the raw input: it may be what the developer considers secret.
    throw new ApiError(`${method} blocked: invalid URL`, { type: "security", method });
  }
  // An option key replaces every value the template had for it: delete, then append each value.
  for (const [key, values] of entries) {
    target.searchParams.delete(key);
    for (const value of values) target.searchParams.append(key, value);
  }
  target.hash = ""; // never part of an HTTP request
  for (const key of target.searchParams.keys()) {
    if (isSensitiveKey(key)) throw new ApiError(sensitiveMessage(key), { type: "config", method, url: safeUrl(target) });
  }
  if (target.username || target.password) {
    throw new ApiError(`${method} blocked: credentials in the URL are not allowed`, { type: "security", method, url: safeUrl(target) });
  }
  // Same origin AND an http(s) URL: a blob: URL inherits the page's origin but isn't an API request.
  if (!isHttp(target) || target.origin !== page.origin) {
    throw new ApiError(`${method} blocked: ${isHttp(target) ? target.origin : target.protocol} is not the page's origin (api() allows same-origin URLs only)`, { type: "security", method, url: safeUrl(target) });
  }
  return target;
}

const isHttp = (u) => u.protocol === "https:" || u.protocol === "http:";
// The `url` field of an error: origin + path. No credentials, query string or fragment.
const safeUrl = (u) => (isHttp(u) ? u.origin + u.pathname : u.protocol);

// The one transport for every method. `body` is an already-serialized JSON string, or undefined
// for no body (and then no Content-Type). Responses are parsed the same way for every method.
async function request(input, entries, signal, method = METHOD, body) {
  const target = resolveSameOrigin(input, entries, method);
  const where = safeUrl(target);
  let res;
  try {
    res = await globalThis.fetch(target.href, {
      method,
      mode: "same-origin",
      credentials: "same-origin",
      headers: body === undefined ? { Accept: ACCEPT } : { Accept: ACCEPT, "Content-Type": "application/json" },
      body,
      signal,
    });
  } catch {
    // The platform's message can include the full URL; ours carries none of it.
    throw new ApiError(`${method} request failed: network error`, { type: "network", method, url: where });
  }
  // Defense in depth for fetch implementations that don't enforce mode "same-origin".
  if (res.redirected && res.url && !sameOrigin(res.url, target.origin)) {
    discard(res);
    throw new ApiError(`${method} request blocked: redirected to another origin`, { type: "security", method, url: where });
  }
  if (!res.ok) {
    discard(res);
    const statusText = typeof res.statusText === "string" ? res.statusText : "";
    throw new ApiError(`${method} request failed: ${res.status}${statusText ? " " + statusText : ""}`, { type: "http", method, status: res.status, statusText, url: where });
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
    throw new ApiError(`${method} request failed: network error while reading the response`, { type: "network", method, status: res.status, url: where });
  }
  if (!JSON_TYPE.test(mediaType)) return text;
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(`${method} request failed: the response is not valid JSON`, { type: "parse", method, status: res.status, url: where });
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
// TypeError when api() is called; reactive params/query mistakes become an ApiError of type "config".
class ConfigError extends TypeError {}
const configError = (detail) => new ConfigError(`api(): ${detail}`);

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_DEBOUNCE = 2147483647; // setTimeout's limit; longer delays would fire immediately
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

// The text form of a scalar param/query value. Values themselves never appear in messages.
function toText(value, label, nullable) {
  const t = typeof value;
  if (t === "string") return value;
  if (t === "bigint" || t === "boolean" || (t === "number" && Number.isFinite(value))) return String(value);
  if (nullable && value == null) return null;
  const hint = t === "object" || t === "function" ? " (for a reactive value, pass a function: () => ({ … }), and read the state inside it)" : "";
  throw configError(`${label} must be a string, number, bigint${nullable ? ", boolean, null or undefined" : " or boolean"}, got ${t === "number" ? "a non-finite number" : describe(value)}${hint}`);
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

// Split the template once: literal path pieces and `/:name` placeholders, then the rest (`?…#…`).
// Anything that isn't exactly `:name` (`:id?`, `:id*`, `:{id}`) is refused, as is a secret-looking
// key in the template's own query string.
function parseTemplate(template) {
  const cut = template.search(/[?#]/);
  const path = cut < 0 ? template : template.slice(0, cut);
  const rest = cut < 0 ? "" : template.slice(cut);
  const pieces = []; // strings, and { name } for a placeholder
  const names = new Set();
  let at = 0;
  for (const m of path.matchAll(/(^|\/):([^/]*)/g)) {
    const name = m[2];
    if (!PARAM_NAME.test(name)) throw configError("unsupported placeholder in the URL — use whole /:name segments (letters, digits, _)");
    const start = m.index + m[1].length;
    pieces.push(path.slice(at, start), { name });
    names.add(name);
    at = start + 1 + name.length;
  }
  pieces.push(path.slice(at));
  if (names.size && /(^|\/):[^/]*$/.test(path) && /^\?(#|$)/.test(rest)) throw configError("unsupported placeholder in the URL — optional params (:name?) aren't supported");
  for (const key of new URLSearchParams(rest.split("#")[0]).keys()) {
    if (isSensitiveKey(key)) throw configError(sensitiveMessage(key));
  }
  return { pieces, names, rest };
}

// The template's path with every placeholder filled. Strict: each placeholder needs a param and
// each param must be used — so `params: { userId }` for `:id` is caught.
function fillParams(tpl, params) {
  const values = new Map(params === undefined ? [] : ownEntries(params, "params")); // a Map: "__proto__" is just a key
  for (const name of tpl.names) if (!values.has(name)) throw configError(`the URL has :${name} but params.${name} is missing`);
  for (const name of values.keys()) if (!tpl.names.has(name)) throw configError(`params.${name} isn't used by the URL — check for a typo`);
  let out = "";
  for (const piece of tpl.pieces) out += typeof piece === "string" ? piece : encodeSegment(piece.name, values.get(piece.name));
  return out + tpl.rest;
}

// Validated [key, texts[]] pairs. A scalar is one value; an array is repeated keys (null/undefined
// elements left out, [] clears the key); a null/undefined value contributes nothing at all.
function queryEntries(query) {
  const out = [];
  for (const [key, value] of ownEntries(query, "query")) {
    if (isSensitiveKey(key)) throw configError(sensitiveMessage(key));
    if (Array.isArray(value)) {
      const texts = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (Array.isArray(item)) throw configError(`query.${key}[${i}] is an array — query arrays are one level deep`);
        const text = toText(item, `query.${key}[${i}]`, true);
        if (text !== null) texts.push(text);
      }
      out.push([key, texts]);
    } else {
      const text = toText(value, `query.${key}`, true);
      if (text !== null) out.push([key, [text]]);
    }
  }
  return out;
}

// Call a params/query function. A throw becomes a config ApiError carrying it as `cause`.
function call(fn, what) {
  try {
    return { value: fn() };
  } catch (err) {
    return { error: new ApiError(`${METHOD} request not sent: the ${what} function threw`, { type: "config", cause: err }) };
  }
}

// The current request: { key, path, entries } or { key, error }. Never throws, so the computed and
// effect around it can't fail (and report) on their own; the error reaches error() via the fetcher.
function evaluate(tpl, staticPath, params, staticEntries, query) {
  let path = staticPath;
  let entries = staticEntries;
  try {
    if (typeof params === "function") {
      const got = call(params, "params");
      if (got.error) return failed(got.error);
      path = fillParams(tpl, got.value);
    }
    if (typeof query === "function") {
      const got = call(query, "query");
      if (got.error) return failed(got.error);
      entries = queryEntries(got.value);
    }
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    return failed(new ApiError(`${METHOD} request not sent: ${err.message.slice("api(): ".length)}`, { type: "config" }));
  }
  return { key: JSON.stringify([path, entries]), path, entries };
}
const failed = (error) => ({ key: "!" + error.message, error });

/**
 * GET a same-origin URL as a resource: reactive data() / loading() / error() / refresh(), plus
 * dispose() for one created outside a component.
 * @param {string} url  a same-origin URL; `/:name` segments are filled from `params`
 * @param {{ params?: object | (() => object), query?: object | (() => object), debounce?: number }} [options]
 */
export function api(url, options) {
  if (typeof url !== "string" || url.trim() === "") throw new TypeError("api(url): url must be a non-empty string");
  if (arguments.length > 2) throw new TypeError("api(url, options): too many arguments — api() always performs a GET");

  let params, query, debounce = 0;
  if (options !== undefined) {
    for (const [key, value] of ownEntries(options, "options")) {
      if (key === "params") params = value;
      else if (key === "query") query = value;
      else if (key === "debounce") {
        if (value === undefined) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_DEBOUNCE) {
          throw configError(`debounce must be a finite number of milliseconds from 0 to ${MAX_DEBOUNCE}`);
        }
        debounce = value;
      } else throw configError(`unsupported option "${key}" — only params, query and debounce are accepted (api() always performs a GET)`);
    }
  }

  // Static parts are checked once, now, and throw a TypeError. Functions are checked on every run.
  const tpl = parseTemplate(url);
  const staticPath = typeof params === "function" ? null : fillParams(tpl, params);
  const staticEntries = typeof query === "function" ? [] : query === undefined ? [] : queryEntries(query);

  let disposed = false;
  let controller = null; // the in-flight request's AbortController
  let timer = null; // a pending debounced refetch
  let lastKey; // the request the latest load was built from
  let current = null; // computed() of evaluate(), when params or query is a function
  let scope = null; // the effect that owns `current` and the tracker
  let inner = null; // the resource

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    if (controller) controller.abort();
    controller = null;
    if (scope) scope.dispose(); // disposes the computed and the tracker with it
    scope = current = null;
    params = query = null; // release the caller's functions and objects
  };
  onCleanup(dispose); // owned by a component → disposed on unmount

  const fixed = staticPath === null ? null : { key: JSON.stringify([staticPath, staticEntries]), path: staticPath, entries: staticEntries };
  if (!fixed || typeof query === "function") {
    // One effect, run once: it reads nothing itself, and owns the computed + tracker created in it,
    // so disposing it takes both out of the reactive graph. Created only for reactive options.
    scope = effect(() => {
      const p = params, q = query;
      current = computed(() => evaluate(tpl, staticPath, p, staticEntries, q));
      const cur = current;
      effect(() => {
        const key = cur.get().key; // tracks exactly what params()/query() read
        if (!inner) return; // the first run only subscribes; resource() does the initial load
        clearTimer();
        if (key === lastKey) return; // back to what was requested (or a refresh() already sent it)
        if (debounce > 0) {
          timer = setTimeout(() => {
            timer = null;
            if (!disposed) inner.refresh();
          }, debounce);
        } else inner.refresh();
      });
    });
  }

  inner = resource(() => {
    clearTimer(); // whatever triggered this load supersedes a pending debounced one
    // A newer load supersedes the old one: resource() already ignores its result; abort it too.
    if (controller) controller.abort();
    controller = null;
    const req = current ? current.peek() : fixed; // current values, even before the batched effect runs
    lastKey = req.key;
    if (req.error) return Promise.reject(req.error);
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    controller = ac;
    return request(req.path, req.entries, ac ? ac.signal : undefined).then(
      // Disposed mid-flight: settle with the data already held — nothing changes, loading ends.
      (value) => (disposed ? inner.data() : value),
      (err) => {
        if (disposed) return inner.data();
        // error() is always an ApiError: anything unexpected becomes a generic one, without its message.
        throw err instanceof ApiError ? err : new ApiError(`${METHOD} request failed`, { type: "network" });
      },
    ).finally(() => {
      if (controller === ac) controller = null;
    });
  });

  const handle = {
    data: inner.data,
    loading: inner.loading,
    error: inner.error,
    refresh() {
      if (disposed) throw new ApiError(`${METHOD} request not sent: refresh() was called after dispose()`, { type: "config" });
      inner.refresh();
    },
    dispose,
  };
  // For invalidation: refresh only while alive — a disposed/unmounted target is skipped quietly.
  RESOURCES.set(handle, () => {
    if (!disposed) inner.refresh();
  });
  return handle;
}

// ---- mutations: api.post / api.put / api.patch / api.delete ------------------------------------

// The run() argument. Without `/:name` placeholders in the URL, it IS the body (`run(body)`); with
// them, it must be `{ params, body? }`. The rule depends only on the URL, never on the argument's
// shape, so a body that happens to have a `params` key is still just a body.
function readRunInput(tpl, method, args) {
  if (args.length > 1) throw configError("run() takes one argument");
  const input = args[0];
  if (!tpl.names.size) {
    if (method === "DELETE" && input !== undefined) throw configError("DELETE sends no body — call run() with no argument");
    return { params: undefined, body: input };
  }
  const allowed = method === "DELETE" ? "{ params }" : "{ params, body }";
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw configError(`the URL has /:name placeholders, so run() takes ${allowed}`);
  let params, body;
  for (const [key, value] of ownEntries(input, "run()'s argument")) {
    if (key === "params") params = value;
    else if (key === "body" && method !== "DELETE") body = value;
    else throw configError(`run() takes ${allowed}, not "${key}"${method === "DELETE" && key === "body" ? " (DELETE sends no body)" : ""}`);
  }
  return { params, body };
}

// JSON.stringify, but refusing what it would silently change: functions and symbols (dropped),
// non-finite numbers (become null), non-plain objects such as Map/Set/class instances (become {}),
// and bigint (not JSON). Cycles throw on their own. Values with toJSON (e.g. Date) are sent as their toJSON.
// `undefined` means no body; inside an object an undefined property is left out, as JSON does.
function serializeBody(body) {
  if (body === undefined) return undefined;
  let text;
  try {
    text = JSON.stringify(body, (_key, value) => {
      const t = typeof value;
      if (t === "function" || t === "symbol") throw new ConfigError("a function or symbol");
      if (t === "bigint") throw new ConfigError("a bigint"); // never coerced
      if (t === "number" && !Number.isFinite(value)) throw new ConfigError("a non-finite number");
      if (t === "object" && value !== null && !Array.isArray(value)) {
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) throw new ConfigError("an object that isn't a plain object or array");
      }
      return value;
    });
  } catch (err) {
    // Never the body, a key path, or the platform's message (it can quote property names).
    const what = err instanceof ConfigError ? err.message : "a cycle or a getter/toJSON that threw";
    throw configError(`the request body can't be sent as JSON: it contains ${what}`);
  }
  return text;
}

function mutation(method, url, options) {
  if (typeof url !== "string" || url.trim() === "") throw new TypeError(`api.${method.toLowerCase()}(url): url must be a non-empty string`);
  let query, invalidate = [], exclusive = false;
  if (options !== undefined) {
    for (const [key, value] of ownEntries(options, "options")) {
      if (key === "query") {
        if (typeof value === "function") throw configError("a mutation's query is static — pass an object (per-call values go in the URL's params)");
        query = value;
      } else if (key === "invalidate") invalidate = readTargets(value);
      else if (key === "exclusive") {
        if (value !== undefined && typeof value !== "boolean") throw configError("exclusive must be true or false");
        exclusive = !!value;
      } else throw configError(`unsupported option "${key}" — a mutation accepts only query, invalidate and exclusive`);
    }
  }
  const tpl = parseTemplate(url);
  const entries = query === undefined ? [] : queryEntries(query);

  // The action's fn: build, serialize, send. Anything wrong becomes error() — run() never rejects.
  let lastCall = null;
  const send = (...args) => {
    const call = { ok: false };
    lastCall = call;
    try {
      const { params, body } = readRunInput(tpl, method, args);
      const path = fillParams(tpl, params);
      const text = serializeBody(body);
      return request(path, entries, undefined, method, text).then(
        (value) => {
          call.ok = true;
          return value;
        },
        (err) => {
          throw err instanceof ApiError ? err : new ApiError(`${method} request failed`, { type: "network", method });
        },
      );
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      return Promise.reject(new ApiError(`${method} request not sent: ${err.message.slice("api(): ".length)}`, { type: "config", method }));
    }
  };
  const act = action(send, { exclusive });

  return {
    // Invalidate after the action has settled, only when THIS call's request succeeded on the
    // server. A call that joined an exclusive run (send wasn't called) doesn't invalidate twice.
    run(...args) {
      const before = lastCall;
      const pending = act.run(...args);
      const call = lastCall !== before ? lastCall : null;
      return pending.then((value) => {
        if (call && call.ok) for (const refresh of invalidate) refresh();
        return value;
      });
    },
    pending: act.pending,
    error: act.error,
    done: act.done,
    result: act.result,
    reset: act.reset,
  };
}

// invalidate: one api() resource or an array of them → their (deduplicated) refreshers. Only real
// api() resources are accepted; the caller's array is read, not kept or mutated.
function readTargets(value) {
  const list = Array.isArray(value) ? value : [value];
  const out = new Set();
  for (let i = 0; i < list.length; i++) {
    const refresh = list[i] !== null && typeof list[i] === "object" ? RESOURCES.get(list[i]) : undefined;
    if (!refresh) throw configError(`invalidate${Array.isArray(value) ? `[${i}]` : ""} must be a resource returned by api()`);
    out.add(refresh);
  }
  return [...out];
}

/** POST a JSON body. `run(body)`, or `run({ params, body })` when the URL has `/:name` segments. */
api.post = (url, options) => mutation("POST", url, options);
/** PUT a JSON body. `run(body)`, or `run({ params, body })` when the URL has `/:name` segments. */
api.put = (url, options) => mutation("PUT", url, options);
/** PATCH a JSON body. `run(body)`, or `run({ params, body })` when the URL has `/:name` segments. */
api.patch = (url, options) => mutation("PATCH", url, options);
/** DELETE, with no body. `run()`, or `run({ params })` when the URL has `/:name` segments. */
api.delete = (url, options) => mutation("DELETE", url, options);

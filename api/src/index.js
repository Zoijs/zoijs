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

import { onCleanup, computed, effect, createState } from "@zoijs/core";
import { resource } from "@zoijs/resource";
import { action } from "@zoijs/action";

// Every object api() returns, mapped to its internals. Module-private, so it can't be forged: an
// object that merely has a refresh() method is not an api() resource (invalidation checks this).
const RESOURCES = new WeakMap();

const METHOD = "GET";
// `type/json`, `type/anything+json`, with optional parameters (`; charset=utf-8`).
const JSON_TYPE = /^[^/\s;]+\/(?:[^/\s;]+\+)?json$/;
const ACCEPT = "application/json, text/plain;q=0.9, */*;q=0.8";

/** A failed api() request. `type`: "http" | "network" | "security" | "parse" | "config" | "timeout". */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ type: string, status?: number | null, statusText?: string, method?: string, url?: string | null, cause?: unknown, problem?: object | null }} details
   */
  constructor(message, details) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = "ApiError";
    this.type = details.type;
    this.status = details.status ?? null;
    this.statusText = details.statusText ?? "";
    this.method = details.method ?? METHOD;
    this.url = details.url ?? null;
    // Normalized problem details — only with the problemDetails option, else always null.
    this.problem = details.problem ?? null;
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

// The one transport for every method.
//   payload: undefined (no body, no Content-Type) | { json: string } | { form: FormData } — FormData
//            goes to fetch as-is with no Content-Type, so the browser writes the multipart boundary;
//   signal:  aborts the request when api() replaces or disposes it — never reported as a timeout;
//   opts.timeout: ms (0 = none) from the moment fetch starts, covering the response body too. It
//            aborts the real request (no race left running) and fails with type "timeout";
//   opts.problemDetails: on a non-2xx application/problem+json answer, attach error.problem —
//            a boolean, or (internally) a function of the status, so a retried attempt skips it;
//   opts.idempotencyKey: sent as the Idempotency-Key header — the only header a caller can cause,
//            and never copied into an error, URL or body.
// Responses are parsed the same way for every method.
async function request(input, entries, signal, method = METHOD, payload, opts = NO_OPTS) {
  const target = resolveSameOrigin(input, entries, method);
  const where = safeUrl(target);
  const timeout = opts.timeout || 0;
  let timedOut = false;
  let timer = null;
  let ctl = null; // our controller, when there's a timeout: aborted by the timer or by `signal`
  const forward = () => ctl.abort();
  if (timeout > 0) {
    ctl = new AbortController();
    if (signal) {
      if (signal.aborted) ctl.abort();
      else signal.addEventListener("abort", forward, { once: true });
    }
    timer = setTimeout(() => {
      if (ctl.signal.aborted) return; // replaced/disposed first: that abort isn't a timeout
      timedOut = true;
      ctl.abort();
    }, timeout);
  }
  const fail = (what, extra) =>
    timedOut
      ? new ApiError(`${method} request timed out`, { type: "timeout", method, url: where })
      : new ApiError(`${method} request failed: ${what}`, { type: "network", method, url: where, ...extra });
  try {
    let res;
    try {
      res = await globalThis.fetch(target.href, {
        method,
        mode: "same-origin",
        credentials: "same-origin",
        headers: headersFor(payload, opts.idempotencyKey),
        body: payload ? (payload.json !== undefined ? payload.json : payload.form) : undefined,
        signal: ctl ? ctl.signal : signal,
      });
    } catch {
      // The platform's message can include the full URL; ours carries none of it.
      throw fail("network error");
    }
    // Defense in depth for fetch implementations that don't enforce mode "same-origin".
    if (res.redirected && res.url && !sameOrigin(res.url, target.origin)) {
      discard(res);
      throw new ApiError(`${method} request blocked: redirected to another origin`, { type: "security", method, url: where });
    }
    const mediaType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!res.ok) {
      const statusText = typeof res.statusText === "string" ? res.statusText : "";
      // The body stays private unless the caller opted in AND it's problem+json; even then only
      // the known fields, never in the message, and a bad body never changes this HTTP error.
      const want = typeof opts.problemDetails === "function" ? opts.problemDetails(res.status) : opts.problemDetails;
      const problem = want && mediaType === "application/problem+json" ? await readProblem(res) : (discard(res), null);
      const err = new ApiError(`${method} request failed: ${res.status}${statusText ? " " + statusText : ""}`, { type: "http", method, status: res.status, statusText, url: where, problem });
      if (res.status === 429 || res.status === 503) {
        const wait = retryAfterMs(res.headers.get("retry-after"));
        if (wait !== null) RETRY_AFTER.set(err, wait); // private: never on the error object itself
      }
      throw err;
    }
    if (res.status === 204 || res.status === 205) {
      discard(res);
      return null;
    }
    let text;
    try {
      text = await res.text();
    } catch {
      throw fail("network error while reading the response", { status: res.status });
    }
    if (!JSON_TYPE.test(mediaType)) return text;
    if (text === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(`${method} request failed: the response is not valid JSON`, { type: "parse", method, status: res.status, url: where });
    }
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (ctl && signal) signal.removeEventListener("abort", forward);
  }
}
const NO_OPTS = {};

function headersFor(payload, idempotencyKey) {
  const headers = { Accept: ACCEPT };
  if (payload && payload.json !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
}

// Retry-After (RFC 9110) in milliseconds from now: delta-seconds ("5") or an HTTP-date. null when
// absent or unparseable. Kept off the ApiError (in a WeakMap) — it only steers the retry wait.
const RETRY_AFTER = new WeakMap();
function retryAfterMs(value) {
  if (typeof value !== "string" || (value = value.trim()) === "") return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

// Problem details (RFC 9457) from an error response, or null. At most MAX_PROBLEM_BYTES are read —
// a larger (declared or actual) body is dropped unread past the limit — and only the five standard
// members with the expected primitive types are kept. Extension members are ignored.
const MAX_PROBLEM_BYTES = 64 * 1024;
async function readProblem(res) {
  try {
    const declared = Number(res.headers.get("content-length"));
    if (declared > MAX_PROBLEM_BYTES) return discard(res), null;
    let text;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PROBLEM_BYTES) {
          reader.cancel().catch(() => {});
          return null;
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) bytes.set(c, (at += c.byteLength) - c.byteLength);
      text = new TextDecoder().decode(bytes);
    } else {
      text = await res.text();
      if (text.length > MAX_PROBLEM_BYTES) return null;
    }
    const raw = JSON.parse(text);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const own = (k) => Object.prototype.hasOwnProperty.call(raw, k);
    const problem = {};
    for (const k of ["type", "title", "detail", "instance"]) if (own(k) && typeof raw[k] === "string") problem[k] = raw[k];
    if (own("status") && Number.isInteger(raw.status)) problem.status = raw.status;
    return Object.freeze(problem);
  } catch {
    return null; // unreadable, aborted (e.g. timed out) or not JSON: the HTTP error stands alone
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
const MAX_MS = 2147483647; // setTimeout's limit; longer delays would fire immediately

// debounce / timeout: a finite number of milliseconds within the timer range (never a function).
function readMs(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_MS) {
    throw configError(`${name} must be a finite number of milliseconds from 0 to ${MAX_MS}`);
  }
  return value;
}
function readFlag(value, name) {
  if (value !== undefined && typeof value !== "boolean") throw configError(`${name} must be true or false`);
  return !!value;
}

// FormData, checked by the platform's own brand check (not instanceof): a FormData from another
// realm (an iframe) passes, while Object.create(FormData.prototype) or an object that merely has
// append()/entries() doesn't — calling a FormData method on those throws.
function isFormData(value) {
  if (typeof FormData !== "function" || value === null || typeof value !== "object") return false;
  try {
    FormData.prototype.has.call(value, "");
    return true;
  } catch {
    return false;
  }
}
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

  let params, query, debounce = 0, timeout = 0, problemDetails = false, retry = 0, retryDelay;
  let seeded = false, initial; // `initial` counts when the key is PRESENT, even as undefined
  if (options !== undefined) {
    for (const [key, value] of ownEntries(options, "options")) {
      if (key === "params") params = value;
      else if (key === "query") query = value;
      else if (key === "debounce") debounce = value === undefined ? 0 : readMs(value, "debounce");
      else if (key === "timeout") timeout = value === undefined ? 0 : readMs(value, "timeout");
      else if (key === "problemDetails") problemDetails = readFlag(value, "problemDetails");
      else if (key === "retry") retry = readRetry(value);
      else if (key === "retryDelay") retryDelay = value === undefined ? undefined : readMs(value, "retryDelay");
      else if (key === "initial") {
        seeded = true;
        initial = value; // kept as given: not cloned, sanitized or merged
      } else throw configError(`unsupported option "${key}" — api() accepts params, query, debounce, timeout, initial, problemDetails, retry and retryDelay (it always performs a GET)`);
    }
  }
  if (retryDelay !== undefined && retry === 0) throw configError("retryDelay has no effect without retry");
  if (retryDelay === undefined) retryDelay = DEFAULT_RETRY_DELAY;

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
  let load = null; // the current logical load (its retries stop when another one starts)
  const waits = waiter(); // its retry backoff

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    waits.cancel();
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

  // Seeded: the first request is skipped (resource() starts settled with `initial`); later reactive
  // changes still fetch. The seed stands for the URL as it is now, so record it as requested.
  if (seeded) lastKey = (current ? current.peek() : fixed).key;

  inner = resource(() => {
    clearTimer(); // whatever triggered this load supersedes a pending debounced one
    waits.cancel(); // …and the previous load's scheduled retry: it must not fire for an old URL
    // A newer load supersedes the old one: resource() already ignores its result; abort it too.
    if (controller) controller.abort();
    controller = null;
    const req = current ? current.peek() : fixed; // current values, even before the batched effect runs
    lastKey = req.key;
    const mine = (load = {});
    if (req.error) return Promise.reject(req.error);
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    controller = ac;
    // One logical load: every retry replays THIS url; a reactive change or refresh() starts a new one.
    const attemptOnce = (left) =>
      request(req.path, req.entries, ac ? ac.signal : undefined, METHOD, undefined, { timeout, problemDetails: problemFor(problemDetails, left) }).catch((err) => {
        throw err instanceof ApiError ? err : new ApiError(`${METHOD} request failed`, { type: "network" });
      });
    return withRetries(attemptOnce, retry, retryDelay, () => !disposed && load === mine, waits.sleep).then(
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
  }, seeded ? { initial } : undefined);

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
// The request payload: undefined (no body), { form } for a FormData (sent as-is, multipart), or
// { json } for anything else JSON can send faithfully. Other body types (Blob, ArrayBuffer,
// URLSearchParams, streams, a FormData nested inside an object) are refused like any non-plain object.
function toPayload(body) {
  if (body === undefined) return undefined;
  if (isFormData(body)) return { form: body };
  return { json: serializeBody(body) };
}

function serializeBody(body) {
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

// ---- retries (GET loads and mutation runs share this) --------------------------------------------
// Off by default. Mutations opt in only together with an idempotency key; GETs just with `retry`.
// Only failures that may pass on another attempt are retried; everything else ends at once.
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const isRetryable = (e) => e.type === "network" || e.type === "timeout" || (e.type === "http" && RETRY_STATUS.has(e.status));
const MAX_RETRIES = 5; // at most 6 attempts — no retry storms
const MAX_RETRY_WAIT = 30_000; // a cap on every wait; a longer Retry-After ends the retries instead
const DEFAULT_RETRY_DELAY = 250; // retry n waits ~retryDelay × 2^(n-1): 250, 500, 1000, … (±20 %)

function readRetry(value) {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_RETRIES) throw configError(`retry must be a whole number from 0 to ${MAX_RETRIES} (extra attempts after the first)`);
  return value;
}

// Cancellable backoff waits: sleep(ms) resolves true when the time is up, false if cancel() ran.
function waiter() {
  const waits = new Set();
  return {
    sleep: (ms) =>
      new Promise((resolve) => {
        const w = { resolve, id: setTimeout(() => (waits.delete(w), resolve(true)), ms) };
        waits.add(w);
      }),
    cancel() {
      for (const w of waits) {
        clearTimeout(w.id);
        w.resolve(false);
      }
      waits.clear();
    },
  };
}

// How long to wait before retry n+1 (n = attempts already failed − 1), or null to stop.
//   - A usable Retry-After (429/503) wins and is never shortened: the wait is at least what the
//     server asked (and at least the plain backoff). Intentional: when it asks for longer than
//     MAX_RETRY_WAIT we stop rather than retry EARLIER than asked — respecting the server matters
//     more than one more attempt.
//   - Otherwise exponential backoff with ±20 % jitter (factor 0.8–1.2), so clients that failed
//     together don't all retry together; capped at MAX_RETRY_WAIT. Math.random is fine here:
//     this is timing, not an identifier or a secret.
function retryWait(err, n, base) {
  const backoff = base * 2 ** n;
  const after = RETRY_AFTER.get(err);
  if (after !== undefined) return after > MAX_RETRY_WAIT ? null : Math.max(after, Math.min(backoff, MAX_RETRY_WAIT));
  return Math.min(backoff * (0.8 + 0.4 * Math.random()), MAX_RETRY_WAIT);
}

// Run attemptOnce(attemptsLeftAfterThis) until it succeeds, a failure isn't retryable, retries run
// out, alive() turns false (superseded, disposed, unmounted, reset) or a wait is cancelled. Only
// the final outcome leaves here — intermediate failures are never surfaced or reported.
// show(attempt, retrying) reports progress (mutations' attempt()/retrying()).
async function withRetries(attemptOnce, retry, retryDelay, alive, sleep, show) {
  for (let n = 0; ; n++) {
    if (show) show(n + 1, n > 0);
    try {
      const value = await attemptOnce(retry - n);
      if (show) show(n + 1, false);
      return value;
    } catch (err) {
      const wait = n < retry && alive() && isRetryable(err) ? retryWait(err, n, retryDelay) : null;
      if (wait === null || (show && show(n + 1, true), !(await sleep(wait)))) {
        if (show) show(n + 1, false);
        throw err;
      }
    }
  }
}

// With retries left, a retryable status isn't the final error: don't read its problem body.
const problemFor = (problemDetails, left) => (problemDetails && left > 0 ? (status) => !RETRY_STATUS.has(status) : problemDetails);

// A caller's key (from an idempotencyKey function): 1–255 visible ASCII characters (! to ~). No
// spaces, control characters (so no CR/LF/NUL header injection) or non-ASCII, and no
// normalization — what's accepted is sent byte for byte.
const KEY_FORMAT = /^[\x21-\x7e]{1,255}$/;

// A v4 UUID from the platform's CSPRNG — randomUUID, or getRandomValues where randomUUID isn't
// available (insecure contexts). null when neither exists: never weaker randomness.
function newIdempotencyKey() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* fall through */
    }
  }
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return null;
}

function mutation(method, url, options) {
  if (typeof url !== "string" || url.trim() === "") throw new TypeError(`api.${method.toLowerCase()}(url): url must be a non-empty string`);
  let query, invalidate = [], exclusive = false, timeout = 0, problemDetails = false;
  let idempotent = false, keyFn = null, retry = 0, retryDelay;
  if (options !== undefined) {
    for (const [key, value] of ownEntries(options, "options")) {
      if (key === "query") {
        if (typeof value === "function") throw configError("a mutation's query is static — pass an object (per-call values go in the URL's params)");
        query = value;
      } else if (key === "invalidate") invalidate = readTargets(value);
      else if (key === "exclusive") exclusive = readFlag(value, "exclusive");
      else if (key === "timeout") timeout = value === undefined ? 0 : readMs(value, "timeout");
      else if (key === "problemDetails") problemDetails = readFlag(value, "problemDetails");
      else if (key === "idempotencyKey") {
        // A fixed string is refused on purpose: it would be reused by EVERY run() of this mutation,
        // so a second, different order would be deduplicated into the first. A function gives
        // one key per logical run.
        if (typeof value === "string") throw configError("idempotencyKey can't be a fixed string — it would be reused for every run(); pass () => key, evaluated once per run");
        if (value !== undefined && typeof value !== "boolean" && typeof value !== "function") throw configError("idempotencyKey must be true (a generated key) or a function returning one key per run()");
        idempotent = !!value;
        if (typeof value === "function") keyFn = value;
      } else if (key === "retry") retry = readRetry(value);
      else if (key === "retryDelay") retryDelay = value === undefined ? undefined : readMs(value, "retryDelay");
      else if (key === "initial") throw configError("initial is for api() resources — a mutation has no data until it runs");
      else throw configError(`unsupported option "${key}" — a mutation accepts query, invalidate, exclusive, timeout, problemDetails, idempotencyKey, retry and retryDelay`);
    }
  }
  if (retry > 0 && !idempotent) throw configError("retry needs idempotencyKey: true — a mutation is only retried with an idempotency key, so the server can recognize the repeat");
  if (retryDelay !== undefined && retry === 0) throw configError("retryDelay has no effect without retry");
  if (retryDelay === undefined) retryDelay = DEFAULT_RETRY_DELAY;
  const tpl = parseTemplate(url);
  const entries = query === undefined ? [] : queryEntries(query);

  // Backoff waits, cancelled when the owning component goes away (or on reset()): an attempt
  // already sent may finish, but no NEW attempt starts for a UI that's gone.
  let torn = false;
  const waits = waiter();
  onCleanup(() => {
    torn = true;
    waits.cancel();
  });

  // Retry observability, alongside (not instead of) the action's own state. attempt(): 0 idle, then
  // the number of the attempt in flight or last finished — kept after the run ends, until the next
  // run or reset(). retrying(): true from the first retryable failure until the run ends. Only the
  // newest run writes them (a superseded run's attempts aren't shown); exclusive joiners share it.
  const attempt = createState(0);
  const retrying = createState(false);
  let owner = null; // the call whose status is shown

  // The action's fn: build, serialize and key ONCE per logical run, then send — replaying the same
  // request on a retryable failure. Only the final outcome reaches the action (one pending → done
  // or error, one onError report). Anything wrong before sending becomes a config error().
  let lastCall = null;
  const send = (...args) => {
    const call = { ok: false };
    lastCall = call;
    owner = call;
    attempt.set(0);
    retrying.set(false);
    const show = (n, isRetrying) => {
      if (owner !== call) return;
      attempt.set(n);
      retrying.set(isRetrying);
    };
    let path, payload, key;
    try {
      const { params, body } = readRunInput(tpl, method, args);
      path = fillParams(tpl, params);
      payload = toPayload(body);
      if (retry > 0 && payload && payload.form) throw configError("a FormData body can't be retried — use retry: 0 for uploads (the idempotency key is still sent)");
      if (keyFn) key = callerKey(keyFn);
      else if (idempotent && (key = newIdempotencyKey()) === null) throw configError("idempotencyKey needs crypto.randomUUID or crypto.getRandomValues, and this environment has neither");
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      return Promise.reject(new ApiError(`${method} request not sent: ${err.message.slice("api(): ".length)}`, { type: "config", method }));
    }
    const attemptOnce = (left) =>
      request(path, entries, undefined, method, payload, {
        timeout, // a fresh window per attempt
        idempotencyKey: key,
        problemDetails: problemFor(problemDetails, left),
      }).catch((err) => {
        throw err instanceof ApiError ? err : new ApiError(`${method} request failed`, { type: "network", method });
      });
    // While waiting, attempt() stays at the attempt that just failed. A torn-down, reset or
    // superseded run stops: nobody is waiting for it, so it sends nothing more.
    return withRetries(attemptOnce, retry, retryDelay, () => !torn && owner === call, waits.sleep, show).then((value) => {
      call.ok = true;
      return value;
    });
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
    /** The attempt in flight, or the last one of the latest run; 0 when idle or after reset(). */
    attempt: () => attempt.get(),
    /** True while the latest run is waiting to retry or retrying. */
    retrying: () => retrying.get(),
    // The action's reset() (it already stops the in-flight run from settling), plus: the retry
    // status clears, and a retry still waiting to be sent is cancelled — nobody is waiting for it.
    reset() {
      owner = null;
      waits.cancel();
      act.reset();
      attempt.set(0);
      retrying.set(false);
    },
  };
}

// Evaluate the caller's key function once for a logical run and validate what it returns. Neither
// a thrown error's message nor the bad value is echoed: either may be secret.
function callerKey(fn) {
  let value;
  try {
    value = fn();
  } catch {
    throw configError("the idempotencyKey function threw");
  }
  if (typeof value !== "string" || !KEY_FORMAT.test(value)) {
    throw configError("the idempotencyKey function must return 1–255 visible ASCII characters (no spaces or control characters)");
  }
  return value;
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

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
// Error messages carry only the method, the status and (for a blocked cross-origin URL) the
// target origin — never the URL path, query string, fragment, credentials, request headers or the
// response body — so they are safe to log. The `url` field keeps origin + path for debugging. Client-side checks never replace server-side authentication and authorization.

import { onCleanup } from "@zoijs/core";
import { resource } from "@zoijs/resource";

const METHOD = "GET";
// `type/json`, `type/anything+json`, with optional parameters (`; charset=utf-8`).
const JSON_TYPE = /^[^/\s;]+\/(?:[^/\s;]+\+)?json$/;

/** A failed api() request. `type`: "http" | "network" | "security" | "parse". */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ type: string, status?: number | null, statusText?: string, url?: string | null }} details
   */
  constructor(message, details) {
    super(message);
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

// Resolve and check `input` against the page origin. Returns the URL, or throws a security ApiError.
function resolveSameOrigin(input) {
  const page = pageLocation();
  if (!page) throw new ApiError(`${METHOD} blocked: api() needs an http(s) page origin to check the URL against`, { type: "security" });
  let target;
  try {
    target = new URL(input, baseHref(page));
  } catch {
    // Don't echo the raw input: it may be what the developer considers secret.
    throw new ApiError(`${METHOD} blocked: invalid URL`, { type: "security" });
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

async function request(input, signal) {
  const target = resolveSameOrigin(input);
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

/**
 * GET a same-origin URL as a resource: reactive data() / loading() / error() / refresh().
 * @param {string} url
 */
export function api(url) {
  if (typeof url !== "string" || url.trim() === "") throw new TypeError("api(url): url must be a non-empty string");
  if (arguments.length > 1) throw new TypeError("api(url): takes only a URL — it always performs a GET");

  let controller = null;
  onCleanup(() => controller && controller.abort());

  return resource(() => {
    // A newer load supersedes the old one: resource() already ignores its result; abort it too.
    if (controller) controller.abort();
    const current = typeof AbortController === "function" ? new AbortController() : null;
    controller = current;
    return request(url, current ? current.signal : undefined)
      .catch((err) => {
        // error() is always an ApiError: anything unexpected becomes a generic one, without its message.
        throw err instanceof ApiError ? err : new ApiError(`${METHOD} request failed`, { type: "network" });
      })
      .finally(() => {
        if (controller === current) controller = null;
      });
  });
}

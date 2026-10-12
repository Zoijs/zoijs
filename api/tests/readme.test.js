// README as tests (Phase 13): the examples marked `<!-- doctest: name -->` are extracted and RUN
// against the real package — so a renamed option, a wrong import or an unbounded 401 loop in the
// docs fails here — plus light static checks across every code block (exports, createApi options,
// the options table, anchors, token logging, cookie-auth and redaction claims). The checks look at
// facts, not wording, so rephrasing the prose doesn't break them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@zoijs/core";
import * as apiModule from "../src/index.js";
import * as testing from "../../testing/src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const README = readFileSync(join(HERE, "..", "README.md"), "utf8");
const DTS = readFileSync(join(HERE, "..", "src", "index.d.ts"), "utf8");
const SRC = readFileSync(join(HERE, "..", "src", "index.js"), "utf8");

// ---- extraction --------------------------------------------------------------------------------

const DOCTESTS = new Map();
for (const m of README.matchAll(/<!-- doctest: ([\w-]+) -->\n```js\n([\s\S]*?)```/g)) {
  assert.ok(!DOCTESTS.has(m[1]), `duplicate doctest name ${m[1]}`);
  DOCTESTS.set(m[1], m[2]);
}
const CODE_BLOCKS = [...README.matchAll(/```(js|ts|html)\n([\s\S]*?)```/g)].map((m) => m[2]);
const doctest = (name) => {
  assert.ok(DOCTESTS.has(name), `README has no <!-- doctest: ${name} --> block`);
  return DOCTESTS.get(name);
};

// `import { a, b as c } from "x"` / `import d from "x"` → lookups in `modules` (blocks are ESM).
const MODULES = { "@zoijs/core": core, "@zoijs/api": apiModule, "@zoijs/testing": testing, "node:assert/strict": { default: assert } };
function toFunctionBody(code) {
  return code.replace(/^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*"([^"]+)";?$/gm, (_, def, named, from) => {
    const out = [];
    if (def) out.push(`const ${def} = __import(${JSON.stringify(from)}).default;`);
    if (named) out.push(`const { ${named.replace(/\b(\w+)\s+as\s+(\w+)/g, "$1: $2")} } = __import(${JSON.stringify(from)});`);
    return out.join(" ");
  });
}
const AsyncFunction = (async () => {}).constructor;
/**
 * Run a doctest with `env` in scope; returns the named top-level bindings it declares.
 * `extraModules` adds or overrides imports (e.g. a fake node:test).
 */
async function run(name, { env = {}, returns = [], extraModules = {}, prelude = "" } = {}) {
  const modules = { ...MODULES, ...extraModules };
  const __import = (from) => {
    assert.ok(from in modules, `doctest ${name} imports ${from}, which isn't available`);
    return modules[from];
  };
  const body = prelude + toFunctionBody(doctest(name)) + `\n;return { ${returns.join(", ")} };`;
  return new AsyncFunction("__import", ...Object.keys(env), body)(__import, ...Object.values(env));
}

// ---- a stubbed network ----------------------------------------------------------------------------

const realFetch = globalThis.fetch;
let requests = [];
function respond(handler) {
  requests = [];
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init.method, headers: init.headers, body: init.body, signal: init.signal };
    requests.push(req);
    return handler(new URL(url), init, req);
  };
}
const json = (body, status = 200, type = "application/json") => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": type } });
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};
// Wait (in real time — retries use timers) until cond() holds; fails after ~2 s.
async function until(cond, what = "condition") {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
}
test.afterEach(() => {
  testing.cleanup();
  globalThis.fetch = realFetch;
  document.body.innerHTML = "";
  core.configure({ onError: null });
});
const app = () => {
  const el = document.createElement("div");
  el.id = "app";
  document.body.append(el);
  return el;
};

// ---- the Quick start ------------------------------------------------------------------------------

test("doctest quick-read: loading, data, empty and error-with-retry states", async () => {
  const el = app();
  let answer;
  respond(() => new Promise((resolve) => (answer = resolve)));
  await run("quick-read");
  await settle();
  assert.equal(el.querySelector("[role=status]").textContent, "Loading tasks…");
  answer(json([{ id: 1, title: "Learn Zoijs" }]));
  await settle();
  assert.deepEqual([...el.querySelectorAll("li")].map((li) => li.textContent), ["Learn Zoijs"]);
  assert.equal(requests[0].url, "https://app.example.com/api/tasks");

  document.body.innerHTML = "";
  const el2 = app();
  respond(() => json([]));
  await run("quick-read");
  await settle();
  assert.equal(el2.textContent.trim(), "No tasks yet.");

  document.body.innerHTML = "";
  const el3 = app();
  respond(() => json({}, 500));
  await run("quick-read");
  await settle();
  assert.match(el3.querySelector("[role=alert]").textContent, /Couldn't load tasks: GET request failed: 500/);
  respond(() => json([{ id: 2, title: "Retried" }]));
  el3.querySelector("button").click();
  await settle();
  assert.equal(el3.querySelector("li").textContent, "Retried");
});

test("doctest quick-write: a labelled form posts JSON once, resets, and the list reloads", async () => {
  respond((url, init) => (init.method === "POST" ? json({ id: 9 }, 201) : json([])));
  const { NewTask } = await run("quick-write", { env: { FormData: window.FormData }, returns: ["NewTask"] }); // the DOM's FormData
  const tasks = apiModule.api("/api/tasks");
  await settle();
  const view = testing.render(() => NewTask({ tasks }));
  const input = view.getByLabelText("New task");
  input.value = "Write docs";
  const form = input.closest("form");
  form.requestSubmit();
  form.requestSubmit(); // a double submit: exclusive sends once
  await settle();
  const posts = requests.filter((r) => r.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body, JSON.stringify({ title: "Write docs" }));
  assert.equal(input.value, "", "the form resets after success");
  assert.equal(requests.filter((r) => r.method === "GET").length, 2, "invalidate reloaded the list");
  assert.equal(view.getByRole("alert").textContent, "");
  tasks.dispose();
});

test("doctest quick-external and quick-auth: one origin, Bearer token, the signal reaches the provider", async () => {
  respond(() => json([]));
  const { repos } = await run("quick-external", { returns: ["repos"] });
  await settle();
  assert.equal(requests[0].url, "https://api.github.com/users/zoijs/repos");
  assert.equal(requests[0].headers.Authorization, undefined);
  repos.dispose();

  const signals = [];
  respond(() => json({ ok: true }));
  const { profile, save } = await run("quick-auth", {
    env: { createApi: apiModule.createApi, getAccessToken: async ({ signal }) => (signals.push(signal), "tok.123") },
    returns: ["profile", "save"],
  });
  await settle();
  assert.equal(requests[0].url, "https://api.example.com/profile");
  assert.equal(requests[0].headers.Authorization, "Bearer tok.123");
  assert.ok(signals[0] instanceof AbortSignal);
  await save.run({ total: 1 });
  assert.equal(requests[1].method, "POST");
  assert.ok(requests[1].headers["Idempotency-Key"]);
  profile.dispose();
});

// ---- Handling errors ---------------------------------------------------------------------------------

const err = (type, extra = {}) => new apiModule.ApiError("x", { type, ...extra });

test("doctest errors-describe: a message for every error type, never the raw error", async () => {
  const { describe } = await run("errors-describe", { returns: ["describe"] });
  const types = DTS.match(/export type ApiErrorType = ([^;]+);/)[1].match(/"(\w+)"/g).map((t) => t.slice(1, -1));
  for (const type of types) assert.equal(typeof describe(err(type)), "string", type);
  assert.equal(describe(err("http", { status: 404 })), "We couldn't find that.");
  assert.equal(describe(err("http", { status: 422, problem: { detail: "Enter a valid email address." } })), "Enter a valid email address.");
  assert.equal(describe(err("http", { status: 422 })), "Please check what you entered.");
  assert.equal(describe(err("http", { status: 503 })), "The server had a problem. Try again in a moment.");
  assert.notEqual(describe(err("timeout")), describe(err("auth")), "a network timeout and an auth failure read differently");
});

test("doctest errors-404: a not-found state, distinct from other failures", async () => {
  const { describe } = await run("errors-describe", { returns: ["describe"] });
  const { UserPage } = await run("errors-404", { env: { describe, html: core.html, api: apiModule.api }, returns: ["UserPage"] });
  respond(() => json({}, 404));
  const notFound = testing.render(() => UserPage({ id: 7 }));
  await settle();
  assert.equal(notFound.getByRole("heading").textContent, "No such user");
  assert.equal(requests[0].url, "https://app.example.com/api/users/7");
  testing.cleanup();
  respond(() => json({}, 500));
  const failed = testing.render(() => UserPage({ id: 7 }));
  await settle();
  assert.equal(failed.getByRole("alert").textContent, "The server had a problem. Try again in a moment.");
});

test("doctest errors-422: problem details reach the form, as text", async () => {
  const shown = [];
  respond(() => json({ type: "about:blank", title: "Invalid user", status: 422, detail: "Enter a valid email address.", fields: { email: "x" } }, 422, "application/problem+json"));
  await run("errors-422", { env: { api: apiModule.api, showFormError: (m) => shown.push(m) } });
  assert.deepEqual(shown, ["Enter a valid email address."]);
  assert.equal(requests.length, 1);
});

test("doctest debug-monitoring: one safe report per final failure", async () => {
  const captured = [];
  await run("debug-monitoring", { env: { monitoring: { capture: (e) => captured.push(e) } } });
  respond(() => json({}, 503));
  const client = apiModule.createApi({ baseURL: "https://api.example.com", auth: () => "tok.SECRET-42" });
  const r = client("/orders", { retry: 2, retryDelay: 0 });
  try {
    await until(() => !r.loading(), "the retries to finish");
    assert.equal(requests.length, 3);
    assert.deepEqual(captured, [{ kind: "resource", type: "http", status: 503, method: "GET", message: "GET request failed: 503" }]);
    assert.ok(!JSON.stringify(captured).includes("tok.SECRET-42"));
  } finally {
    r.dispose();
  }
});

// ---- 401 recovery --------------------------------------------------------------------------------

test("doctest recover-401: bounded — one refresh per failure streak, even when every request is a 401", async () => {
  let refreshes = 0;
  const session = { accessToken: "t1", refreshAccessToken: async () => ((session.accessToken = `t${++refreshes + 1}`), true) };
  const statuses = [401, 401, 401, 200, 401, 401]; // the GETs, in order
  const postStatuses = [401, 201]; // the block's POST: refused, then the one re-run succeeds
  let i = 0;
  let p = 0;
  respond((url, init) => {
    const status = init.method === "POST" ? postStatuses[Math.min(p++, 1)] : statuses[Math.min(i++, statuses.length - 1)];
    return status === 401 ? new Response("", { status }) : json({}, status);
  });
  const backend = apiModule.createApi({ baseURL: "https://api.example.com", auth: () => session.accessToken });
  const gets = () => requests.filter((r) => r.method === "GET");
  // The block also re-runs one POST after a 401; give it a server answer for that.
  const { profile } = await run("recover-401", { env: { backend, session, order: { total: 1 } }, returns: ["profile"] });
  await settle();
  assert.equal(gets().length, 2, "first 401 → one refresh → the second 401 is shown, not retried");
  const posts = requests.filter((r) => r.method === "POST");
  assert.equal(posts.length, 2, "the POST after a 401: exactly one new run");
  assert.notEqual(posts[0].headers["Idempotency-Key"], posts[1].headers["Idempotency-Key"], "…with a new idempotency key");
  const afterFirst = refreshes;
  const [first, second] = gets().map((r) => r.headers.Authorization);
  assert.equal(first, "Bearer t1");
  assert.notEqual(second, first, "the reload asked the provider again and got the refreshed token");
  assert.equal(profile.error().status, 401);
  for (let n = 0; n < 5; n++) await settle();
  assert.equal(gets().length, 2, "no loop: nothing more is sent by itself");
  profile.refresh(); // the same streak: still no recovery
  await settle();
  assert.equal(refreshes, afterFirst);
  profile.refresh(); // 200 ends the streak…
  await settle();
  profile.refresh(); // …so the next 401 recovers once more
  await settle();
  assert.equal(refreshes, afterFirst + 1);
  profile.dispose();
});

// ---- the testing guide -------------------------------------------------------------------------------

test("doctest testing-unit: the testing guide's own tests pass", async () => {
  const tests = [];
  const afterEach = [];
  const fakeTest = Object.assign((title, fn) => tests.push({ title, fn }), { afterEach: (fn) => afterEach.push(fn) });
  await run("testing-unit", { extraModules: { "node:test": { default: fakeTest } } });
  assert.ok(tests.length >= 7, "the guide shows its tests");
  for (const t of tests) {
    try {
      await t.fn();
    } finally {
      for (const fn of afterEach) await fn();
    }
  }
});

// ---- static checks across every README code block ------------------------------------------------------

test("every name imported from @zoijs/api in the README is a real export", () => {
  const typeExports = new Set([...DTS.matchAll(/export (?:declare )?(?:type|interface|class|function|const) (\w+)/g)].map((m) => m[1]));
  for (const code of CODE_BLOCKS) {
    for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"@zoijs\/api"/g)) {
      for (const raw of m[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
        if (name) assert.ok(name in apiModule || typeExports.has(name), `README imports ${name} from @zoijs/api, which doesn't export it`);
      }
    }
  }
});

// The top-level keys of an object literal's source (nested objects, calls and strings removed).
function topKeys(inner) {
  let text = inner.replace(/`[^`]*`|"[^"]*"|'[^']*'/g, '""');
  for (let prev; prev !== text; ) {
    prev = text;
    text = text.replace(/\{[^{}]*\}|\([^()]*\)|\[[^[\]]*\]/g, "0");
  }
  return [...text.matchAll(/(?:^|,)\s*(?:\/\/[^\n]*\n\s*)*(\w+)\s*:/g)].map((m) => m[1]);
}

const accepted = (re) => SRC.match(re)[1].split(/,\s*|\s+and\s+/).map((s) => s.trim());
const GET_OPTIONS = accepted(/api\(\) accepts ([\w, ]+?) \(it always/);
const MUTATION_OPTIONS = accepted(/a mutation accepts ([\w, ]+?)`/);
const CLIENT_OPTIONS = accepted(/createApi\(\) accepts ([\w, ]+?) \(no headers/);

test("README code only passes options the runtime accepts (createApi, and the options table)", () => {
  assert.deepEqual(CLIENT_OPTIONS, ["baseURL", "auth", "authTimeout"]);
  for (const code of CODE_BLOCKS) {
    for (const m of code.matchAll(/createApi\(\{([\s\S]*?)\}\)/g)) {
      // Only balanced literals: a match that swallowed a nested `})` is skipped.
      if ((m[1].match(/\{/g) || []).length !== (m[1].match(/\}/g) || []).length) continue;
      for (const key of topKeys(m[1])) assert.ok(CLIENT_OPTIONS.includes(key), `README calls createApi() with "${key}"`);
    }
  }
  const section = README.slice(README.indexOf("## Options at a glance"), README.indexOf("## Debugging"));
  const tableOptions = new Set([...section.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]));
  const runtimeOptions = new Set([...GET_OPTIONS, ...MUTATION_OPTIONS, ...CLIENT_OPTIONS]);
  assert.deepEqual([...tableOptions].sort(), [...runtimeOptions].sort(), "the options table lists exactly what the runtime accepts");
});

// GitHub's heading slugs: lowercase, drop punctuation except "-" and "_", spaces → "-".
const slug = (heading) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");

test("README links resolve: every #anchor names a heading, every relative path exists", () => {
  const anchors = new Set();
  for (const m of README.matchAll(/^#{1,6} (.+)$/gm)) {
    let s = slug(m[1]);
    for (let n = 1; anchors.has(s); n++) s = `${slug(m[1])}-${n}`;
    anchors.add(s);
  }
  for (const m of README.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(anchors.has(m[1]), `README links to #${m[1]}, which isn't a heading`);
  for (const m of README.matchAll(/\]\((\.{1,2}\/[^)#\s]+|examples\/[^)#\s]+)(?:#[^)]*)?\)/g)) {
    assert.ok(existsSync(join(HERE, "..", m[1])), `README links to ${m[1]}, which doesn't exist`);
  }
});

test("README code never logs, stores or exposes tokens", () => {
  for (const code of CODE_BLOCKS) {
    for (const line of code.split("\n")) {
      if (/console\.(log|info|debug|warn|error)\(/.test(line)) assert.doesNotMatch(line, /token|authorization|bearer/i, `README logs a credential: ${line.trim()}`);
      assert.doesNotMatch(line, /(localStorage|sessionStorage)\.setItem\([^)]*token/i, `README persists a token: ${line.trim()}`);
      assert.doesNotMatch(line, /headers\s*:\s*\{[^}]*Authorization/i, `README writes an Authorization header: ${line.trim()}`);
    }
  }
});

test("README never claims cookie auth or complete redaction", () => {
  for (const code of CODE_BLOCKS) assert.doesNotMatch(code, /credentials\s*:\s*["']include["']/, "README code uses credentials: \"include\"");
  assert.match(README, /cookies\s+across\s+origins\*\*\s+are\s+deliberately\s+not\s+supported/i, "README must say cross-origin cookie auth isn't supported");
  // Every paragraph that talks about redaction must say it's exact-match only, or link to where that's said.
  for (const para of README.split(/\n\s*\n/)) {
    if (!/redact/i.test(para) || /^\s*(\||```)/.test(para)) continue;
    for (const sentence of para.replace(/\s+/g, " ").split(/(?<=[.:])\s/)) {
      if (/\b(no|not|isn't|aren't|can't|cannot|never)\b/i.test(sentence)) continue; // a disclaimer
      assert.doesNotMatch(sentence, /\b(all|every|any) (transformed|encoded|forms?|transformations?|encodings?)\b/i, `README overclaims redaction: ${sentence}`);
    }
  }
  assert.match(README, /Only \*\*exact\*\* occurrences/, "README must state that redaction is exact-match only");
});

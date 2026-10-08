// SEC-6 — the scaffolded dev server (app / basic / typescript / minimal templates).
//
// Spawns the real dev-server.mjs in a throwaway project and talks to it over raw
// TCP (so paths reach the server exactly as written, unnormalized). Verifies it
// binds to loopback, never serves dotfiles or anything outside the project
// (including via symlinks), answers malformed URLs with 400 and keeps running.

import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const templates = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
const SERVER_TEMPLATES = ["app", "basic", "typescript", "minimal"];

test("every template ships the same (hardened) dev server", () => {
  const [first, ...rest] = SERVER_TEMPLATES.map((t) => readFileSync(join(templates, t, "dev-server.mjs"), "utf8"));
  for (const other of rest) assert.equal(other, first);
  assert.match(first, /process\.env\.ZOIJS_HOST \|\| "127\.0\.0\.1"/, "loopback is the default host");
  assert.match(first, /server\.listen\(PORTS\[i\], HOST\)/);
});

// A throwaway project: real files, secrets, and escape routes.
function fixture(template) {
  const base = mkdtempSync(join(os.tmpdir(), "zoijs-devserver-"));
  const proj = join(base, "proj");
  for (const d of ["src", ".git", "nested", "node_modules/.bin", "assets"]) mkdirSync(join(proj, d), { recursive: true });
  mkdirSync(join(base, "proj-secrets"), { recursive: true }); // sibling sharing the "proj" prefix
  mkdirSync(join(base, "linked-pkg"), { recursive: true });
  const files = {
    "index.html": "<h1>ok</h1>", "src/app.js": "export const a = 1;", "src/mod.mjs": "export {};",
    "src/style.css": "p{}", "data.json": "{}", "assets/logo.svg": "<svg/>", "assets/x.png": "png", "assets/f.woff2": "w",
    ".env": "SECRET=1", ".env.local": "SECRET=2", ".npmrc": "//registry/:_authToken=x", ".DS_Store": "x",
    ".git/config": "[core]", ".git/HEAD": "ref", "nested/.secret": "s", "node_modules/.bin/tool": "#!",
  };
  for (const [p, c] of Object.entries(files)) writeFileSync(join(proj, p), c);
  writeFileSync(join(base, "outside.txt"), "OUTSIDE");
  writeFileSync(join(base, "proj-secrets", "key.txt"), "SIBLING");
  writeFileSync(join(base, "linked-pkg", "index.js"), "export const linked = true;");
  symlinkSync(join(base, "outside.txt"), join(proj, "src", "escape.txt")); // must NOT be served
  symlinkSync(base, join(proj, "src", "escape-dir")); // must NOT be served
  symlinkSync(join(base, "linked-pkg"), join(proj, "node_modules", "linked-pkg")); // `npm link`: allowed
  copyFileSync(join(templates, template, "dev-server.mjs"), join(proj, "dev-server.mjs"));
  return { base, proj };
}

function startServer(cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dev-server.mjs"], { cwd, env: { ...process.env, ZOIJS_HOST: "", ...env } });
    let out = "";
    const timer = setTimeout(() => reject(new Error("server did not start: " + out)), 5000);
    child.stdout.on("data", (c) => {
      out += c;
      const m = /localhost:(\d+)/.exec(out);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]), out: () => out }); }
    });
    child.stderr.on("data", (c) => (out += c));
  });
}

// Raw HTTP/1.1 request; returns { status, headers, body } or { error }.
function raw(port, path, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.connect(port, host, () => s.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    let data = "";
    s.on("data", (c) => (data += c));
    s.on("end", () => {
      const [head, ...rest] = data.split("\r\n\r\n");
      const [statusLine, ...lines] = head.split("\r\n");
      const headers = Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf(":")).toLowerCase(), l.slice(l.indexOf(":") + 1).trim()]));
      resolve({ status: Number(statusLine.split(" ")[1]), headers, body: rest.join("\r\n\r\n") });
    });
    s.on("error", (e) => resolve({ error: e.code }));
    s.setTimeout(3000, () => { s.destroy(); resolve({ error: "TIMEOUT" }); });
  });
}

const lanAddress = () =>
  Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;

for (const template of SERVER_TEMPLATES) {
  test(`dev server (${template}): safe defaults`, async (t) => {
    const { base, proj } = fixture(template);
    const { child, port } = await startServer(proj);
    t.after(() => { child.kill(); rmSync(base, { recursive: true, force: true }); });

    // -- normal development behavior --------------------------------------------------
    const index = await raw(port, "/");
    assert.equal(index.status, 200);
    assert.match(index.body, /<h1>ok<\/h1>/);
    assert.equal((await raw(port, "/src/app.js?v=123")).status, 200, "query strings don't affect the file");
    const types = {
      "/index.html": "text/html", "/src/app.js": "text/javascript", "/src/mod.mjs": "text/javascript",
      "/src/style.css": "text/css", "/data.json": "application/json", "/assets/logo.svg": "image/svg+xml",
      "/assets/x.png": "image/png", "/assets/f.woff2": "font/woff2",
    };
    for (const [p, type] of Object.entries(types)) {
      const r = await raw(port, p);
      assert.equal(r.status, 200, p);
      assert.ok(r.headers["content-type"].startsWith(type), `${p}: ${r.headers["content-type"]}`);
    }
    assert.equal(index.headers["x-content-type-options"], "nosniff");
    assert.equal(index.headers["cache-control"], "no-store");
    assert.equal((await raw(port, "/node_modules/linked-pkg/index.js")).status, 200, "npm-link style symlinks in node_modules work");

    // -- dotfiles: never served ---------------------------------------------------------
    for (const p of ["/.env", "/.env.local", "/.npmrc", "/.DS_Store", "/.git/config", "/.git/HEAD",
      "/nested/.secret", "/node_modules/.bin/tool", "/%2eenv", "/src/../.env", "/.git%2fconfig"]) {
      const r = await raw(port, p);
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.body, /SECRET|core|authToken/, p);
    }

    // -- traversal & symlink escapes: never outside the project ---------------------------
    for (const p of ["/../outside.txt", "/%2e%2e/outside.txt", "/src/../../outside.txt", "/src/%2e%2e/%2e%2e/outside.txt",
      "/%2e%2e%2foutside.txt", "/src%2f..%2f..%2foutside.txt", "/..%5c..%5coutside.txt", "/%2e%2e/proj-secrets/key.txt",
      "/%2e%2e%2fproj-secrets%2fkey.txt", "/src/escape.txt", "/src/escape-dir/outside.txt", "//etc/passwd", "/C:/Windows/win.ini"]) {
      const r = await raw(port, p);
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.body, /OUTSIDE|SIBLING|root:/, p);
    }

    // -- directories are not listed; no SPA fallback (that's DX-3) ------------------------
    assert.equal((await raw(port, "/src/")).status, 404);
    assert.equal((await raw(port, "/users/42")).status, 404);

    // -- malformed requests: 400, and the server keeps running ----------------------------
    for (const p of ["/%E0", "/%", "/%zz", "/a%E0b.js", "/%00", "/index.html%00.js"]) {
      const r = await raw(port, p);
      assert.equal(r.status, 400, p);
      assert.doesNotMatch(r.body, new RegExp(proj.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "no filesystem path echoed");
    }
    assert.equal(child.exitCode, null, "process still running");
    assert.equal((await raw(port, "/src/app.js")).status, 200, "valid requests still succeed afterwards");
  });
}

test("dev server binds to loopback only by default; ZOIJS_HOST opts into the LAN", { skip: lanAddress() ? false : "no non-loopback IPv4 interface" }, async (t) => {
  const lan = lanAddress();
  const { base, proj } = fixture("app");
  const local = await startServer(proj);
  t.after(() => { local.child.kill(); rmSync(base, { recursive: true, force: true }); });
  assert.equal((await raw(local.port, "/", "127.0.0.1")).status, 200);
  const fromLan = await raw(local.port, "/", lan);
  assert.ok(fromLan.error, `default server must not answer on ${lan} (got ${fromLan.status})`);
  local.child.kill();

  const exposed = await startServer(proj, { ZOIJS_HOST: "0.0.0.0" });
  t.after(() => exposed.child.kill());
  assert.equal((await raw(exposed.port, "/", lan)).status, 200, "explicit opt-in is reachable on the LAN");
  assert.match(exposed.out(), /Listening on 0\.0\.0\.0/, "and prints a warning");
  assert.equal((await raw(exposed.port, "/.env", lan)).status, 404, "dotfiles stay blocked even when exposed");
});

// The generated minimal app, end to end: scaffold it, run the server its `dev` script names,
// and fetch what the browser would — nothing to install, nothing downloaded.
test("generated minimal app: `npm run dev`'s server serves the app and its pinned import map", async (t) => {
  const { scaffold } = await import("../bin/create-zoijs.js");
  const base = mkdtempSync(join(os.tmpdir(), "zoijs-minimal-"));
  const proj = join(base, "tiny");
  scaffold({ name: "tiny", template: "minimal", targetDir: proj });
  const pkg = JSON.parse(readFileSync(join(proj, "package.json"), "utf8"));
  assert.equal(pkg.scripts.dev, "node dev-server.mjs");
  const { child, port } = await startServer(proj);
  t.after(() => { child.kill(); rmSync(base, { recursive: true, force: true }); });

  const index = await raw(port, "/");
  assert.equal(index.status, 200);
  assert.ok(index.headers["content-type"].startsWith("text/html"));
  const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(index.body)[1]);
  const core = map.imports["@zoijs/core"];
  assert.match(core, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@zoijs\/core@\d+\.\d+\.\d+\/src\/index\.js$/, "exact version");
  assert.match(map.integrity[core], /^sha384-/, "the entry is integrity-pinned");
  for (const url of Object.keys(map.integrity)) assert.ok(url.startsWith(core.slice(0, core.indexOf("/src/") + 5)), url);
  assert.match(index.body, /src="\.\/app\.js"/);

  const app = await raw(port, "/app.js");
  assert.equal(app.status, 200);
  assert.ok(app.headers["content-type"].startsWith("text/javascript"));
  assert.match(app.body, /from "@zoijs\/core"/);
  assert.equal((await raw(port, "/package.json")).status, 200);

  // Production guidance still points at the production entry.
  assert.match(readFileSync(join(proj, "README.md"), "utf8"), /prod\.js/);
});

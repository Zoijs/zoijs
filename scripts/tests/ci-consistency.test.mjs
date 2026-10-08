// CI wiring that release safety depends on (release-blocker bundle 2). This can't check GitHub's
// branch-protection settings — those are external (docs/releasing.md → "Merge gate") — but it
// keeps the repository side honest:
//   - publish.yml runs the full CI workflow and the publish job needs it;
//   - ci.yml has a real-browser job and one aggregate "CI passed" check over unit + browser;
//   - every Playwright suite runs in CI, through the in-repo test server (never `npx serve`),
//     on its own port.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const ci = read(".github/workflows/ci.yml");
const publish = read(".github/workflows/publish.yml");
const rootPkg = JSON.parse(read("package.json"));

// Every directory with a Playwright config is a browser suite.
const SUITES = ["framework", "router", "resource", "head", "action", "storage", "forms", "sanitize", "api", "examples/task-board", "examples/admin", "examples/contacts"];
const job = (yaml, name) => {
  const m = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][\\w-]*:\\n|$)`).exec(yaml);
  return m ? m[1] : null;
};

test("publish.yml runs the full CI workflow, and publishing needs it", () => {
  assert.match(job(publish, "ci"), /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(job(publish, "publish"), /needs: \[ci, verify\]/);
  assert.match(ci, /\n  workflow_call:/, "ci.yml is reusable by publish.yml");
});

test("ci.yml has the real-browser job and the aggregate 'CI passed' gate over unit + browser", () => {
  const browser = job(ci, "browser");
  assert.ok(browser, "browser job");
  assert.match(browser, /run: npm run test:browser/);
  const gate = job(ci, "gate");
  assert.ok(gate, "gate job");
  assert.match(gate, /name: CI passed/);
  assert.match(gate, /if: \$\{\{ always\(\) \}\}/, "runs (and fails) even when a needed job failed");
  assert.match(gate, /needs: \[unit, browser\]/);
  assert.match(gate, /needs\.unit\.result \}\}" = "success"/);
  assert.match(gate, /needs\.browser\.result \}\}" = "success"/);
  assert.match(job(ci, "unit"), /name: Unit \+ Types/);
  assert.match(browser, /name: Browser \(Chromium \/ Firefox \/ WebKit\)/);
});

test("every browser suite runs in CI: test:browser and the browser-binary install cover them all", () => {
  for (const s of SUITES) assert.ok(existsSync(join(repo, s, "playwright.config.js")), s);
  const testBrowser = rootPkg.scripts["test:browser"];
  for (const s of SUITES) {
    const viaPrefix = testBrowser.includes(`--prefix ${s} run test:browser`);
    const viaScript = s.startsWith("examples/") && Object.entries(rootPkg.scripts).some(([k, v]) => testBrowser.includes(`npm run ${k}`) && v.includes(`--prefix ${s} run test:browser`));
    assert.ok(viaPrefix || viaScript, `root test:browser runs ${s}`);
  }
  const install = job(ci, "browser");
  for (const s of SUITES) assert.ok(install.includes(s), `browser job installs binaries for ${s}`);
});

test("browser suites use the in-repo test server — no npx, no mutable downloads — on unique ports", () => {
  const ports = new Map();
  for (const s of SUITES) {
    const cfg = read(`${s}/playwright.config.js`);
    assert.doesNotMatch(cfg, /\bnpx\b/, `${s}: no npx`);
    const m = /command: "node (?:\.\.\/)+scripts\/test-server\.mjs (\S+) (\d+)"/.exec(cfg);
    assert.ok(m, `${s}: webServer runs scripts/test-server.mjs`);
    const port = Number(m[2]);
    assert.match(cfg, new RegExp(`baseURL: "http://127\\.0\\.0\\.1:${port}"`), `${s}: baseURL is 127.0.0.1:${port}`);
    assert.match(cfg, new RegExp(`url: "http://127\\.0\\.0\\.1:${port}/__ready"`), `${s}: webServer waits on the server's /__ready`);
    assert.ok(!ports.has(port), `${s} and ${ports.get(port)} both use port ${port}`);
    ports.set(port, s);
  }
  assert.equal(ports.size, SUITES.length);
  for (const s of SUITES) {
    const scripts = JSON.parse(read(`${s}/package.json`)).scripts || {};
    for (const [k, v] of Object.entries(scripts)) assert.doesNotMatch(v, /\bnpx\b/, `${s} script ${k}`);
  }
});

// SEC-11 — the production security checklist stays complete, consistent, and findable.
//
// docs/production-security.md is the ONE canonical deployment-security page. These checks
// keep it from silently losing a required topic, keep every host recipe on the same CSP as
// the canonical baseline (so a later generator can emit exactly that policy), make sure
// package docs link to it instead of drifting copies, and run the documented import-map
// hash command so it can't rot. Small targeted assertions — no snapshots.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const PAGE = "framework/docs/production-security.md";
const page = read(PAGE);

const directives = (policy) =>
  new Map(
    policy
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values];
      })
  );

const baselineText = /<!-- csp-baseline:start -->\s*```\s*\n([^\n]+)\n```\s*<!-- csp-baseline:end -->/.exec(page)?.[1];
const baseline = baselineText && directives(baselineText);

test("the canonical page covers every required topic", () => {
  const required = {
    "object-src": /object-src 'none'/,
    "base-uri": /base-uri 'none'/,
    "form-action": /form-action 'self'/,
    "frame-ancestors": /frame-ancestors 'none'/,
    CSRF: /CSRF/,
    credentials: /credentials: "include"/,
    "server authorization": /not authorization/i,
    serialize: /serialize\(\)/,
    "serialize placement": /Do not move[\s>]+the serialized string into HTML attributes, raw HTML, URLs, `<style>` blocks/,
    sanitize: /@zoijs\/sanitize/,
    "DOM clobbering": /clobber/i,
    "route params": /Treat router parameters as data/,
    "encoded slash": /\.\.%2Fadmin[^\n]*"\.\.\/admin"/,
    "production mode": /@zoijs\/core\/prod/,
    onError: /configure\(\{\s*onError/,
    "exact versions": /exact version/i,
    integrity: /integrity/,
    "import map + CSP": /Import maps and CSP/,
    "self-hosted vs CDN": /CDN vs self-hosted/,
    secrets: /Anything shipped to the browser is public/,
    "dev server": /Never deploy the development server/,
    HTTPS: /Serve over HTTPS/,
    "Trusted Types limits": /Trusted Types/,
    "decodeSlash (SEC-10)": /decodeSlash: false/,
    "trusted raw HTML (SEC-3)": /`unsafeHTML\(\)` from `@zoijs\/core\/unsafe`[^\n]*\*\*bypasses escaping\*\*/,
  };
  for (const [topic, re] of Object.entries(required)) assert.ok(re.test(page), `missing: ${topic} (${re})`);
});

test("the baseline CSP is strict and complete", () => {
  assert.ok(baseline, "baseline block between csp-baseline markers");
  const expect = {
    "default-src": ["'self'"],
    "style-src": ["'self'"],
    "img-src": ["'self'"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  for (const [name, values] of Object.entries(expect)) assert.deepEqual(baseline.get(name), values, name);
  assert.deepEqual(baseline.get("script-src")[0], "'self'");
  assert.doesNotMatch(baselineText, /unsafe-inline|unsafe-eval|\*/, "no unsafe-* or wildcards in the baseline");
});

test("every host recipe uses exactly the canonical baseline", () => {
  const policies = [...page.matchAll(/(default-src 'self';[^"\n]*?)(?="|\n|$)/g)].map((m) => m[1].trim());
  assert.ok(policies.length >= 6, `baseline + host recipes (found ${policies.length})`);
  for (const p of policies) {
    const d = directives(p);
    const isMeta = !d.has("frame-ancestors");
    for (const [name, values] of baseline) {
      if (isMeta && name === "frame-ancestors") continue; // ignored in <meta>; the page says so
      assert.deepEqual(d.get(name), values, `${name} in: ${p}`);
    }
    assert.equal(d.size, baseline.size - (isMeta ? 1 : 0), `no extra directives in: ${p}`);
  }
  assert.match(page, /ignore `frame-ancestors` in a `<meta>` policy/);
});

test("no fabricated hash values — only the obvious placeholder", () => {
  assert.doesNotMatch(page, /'sha256-[A-Za-z0-9+/]{43}='/, "a real-looking hash would be wrong for every app");
  assert.match(page, /REPLACE_WITH_YOUR_IMPORT_MAP_HASH/);
});

test("the documented import-map hash command produces the CSP hash of the map's exact contents", () => {
  const cmd = /```bash\n\s*(node -e '[^\n]+')\n\s*```/.exec(page.slice(page.indexOf("### Import maps and CSP")))?.[1];
  assert.ok(cmd, "the hash command is in the import-map section");
  const script = /^node -e '(.*)'$/.exec(cmd)[1];
  const map = `\n      { "imports": { "@zoijs/core": "./vendor/zoijs/core/prod.js" } }\n    `;
  const dir = mkdtempSync(join(tmpdir(), "zoijs-csp-"));
  try {
    writeFileSync(join(dir, "index.html"), `<head><script type="importmap">${map}</script></head>`);
    const out = execFileSync(process.execPath, ["-e", script], { cwd: dir, encoding: "utf8" }).trim();
    assert.equal(out, "sha256-" + createHash("sha256").update(map).digest("base64"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("future features are not documented as present", () => {
  for (const name of ["ZOIJS_PUBLIC_"]) assert.ok(!page.includes(name), name);
});

test("package and deployment docs link to the canonical page instead of copying it", () => {
  const linkers = [
    "README.md",
    "framework/docs/README.md",
    "framework/docs/security.md",
    "framework/docs/deployment.md",
    "framework/docs/installation.md",
    "framework/docs/concepts/production-mode.md",
    "router/README.md",
    "resource/README.md",
    "action/README.md",
    "ssr/README.md",
    "sanitize/README.md",
    "storage/README.md",
    "create/templates/app/README.md",
    "create/templates/basic/README.md",
    "create/templates/typescript/README.md",
    "create/templates/minimal/README.md",
  ];
  for (const f of linkers) assert.match(read(f), /production-security/, `${f} links to the checklist`);
});

test("no other doc presents a CSP baseline that lacks the required directives", () => {
  for (const f of ["framework/docs/security.md", "framework/docs/deployment.md", "framework/docs/installation.md"]) {
    for (const line of read(f).split("\n").filter((l) => /default-src/.test(l))) {
      for (const d of ["object-src", "base-uri", "form-action", "frame-ancestors"]) {
        assert.ok(line.includes(d), `${f}: a policy with default-src but no ${d}: ${line.trim()}`);
      }
    }
  }
});

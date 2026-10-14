// audit-deps.mjs — npm vulnerability gate over every committed package-lock.json.
//
// Runs `npm audit --package-lock-only` (no install, direct AND transitive) in each lockfile's
// directory and fails on ANY advisory, of any severity, that isn't a reviewed, unexpired exception
// in scripts/dependency-policy.json → audit.exceptions. Nothing is ignored silently:
//   - an advisory that is accepted is still listed, with its reason and expiry date;
//   - an expired exception, or one that no longer matches an advisory, fails;
//   - a registry/network error is retried, then fails (an audit that couldn't run never passes).
// The report names the lockfile, package, severity, direct/transitive and the advisory URL, plus
// whether `npm audit fix` has a fix. It never changes a lockfile: upgrades go through review.
//
// Run with `node scripts/audit-deps.mjs` (needs the npm registry; CI job "Dependencies").

import { readFileSync, appendFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { lockfileDirs } from "./check-licenses.mjs";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEVERITY = ["info", "low", "moderate", "high", "critical"];

async function audit(dir, attempts = 3) {
  for (let i = 1; ; i++) {
    let stdout = "";
    try {
      ({ stdout } = await run("npm", ["audit", "--package-lock-only", "--json"], { cwd: join(root, dir), maxBuffer: 64 << 20 }));
    } catch (e) {
      stdout = e.stdout ?? ""; // npm audit exits 1 when it finds something; the JSON is still on stdout
    }
    try {
      const report = JSON.parse(stdout);
      if (report.metadata?.vulnerabilities) return report;
      throw new Error(report.error?.summary ?? "unexpected npm audit output");
    } catch (e) {
      if (i >= attempts) throw new Error(`${dir}: npm audit failed after ${attempts} attempts — ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

/** Flatten an npm audit v2 report into one finding per advisory. */
export function findings(dir, report) {
  const out = [];
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    for (const via of v.via) {
      if (typeof via !== "object") continue; // a string `via` points at another package's advisory
      out.push({
        lockfile: dir,
        package: v.name,
        severity: via.severity ?? v.severity,
        direct: !!v.isDirect,
        advisory: via.url ?? String(via.source),
        title: via.title ?? "",
        range: via.range ?? v.range,
        fix: v.fixAvailable === true ? "npm audit fix" : v.fixAvailable ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? " (major)" : ""}` : "none yet",
      });
    }
  }
  return out;
}

/** Split findings into accepted / failing, and report unusable exceptions. */
export function judge(all, exceptions, today = new Date().toISOString().slice(0, 10)) {
  const used = new Set();
  const accepted = [];
  const failing = [];
  for (const f of all) {
    const i = exceptions.findIndex((x) => x.lockfile === f.lockfile && x.package === f.package && x.advisory === f.advisory);
    if (i >= 0) used.add(i);
    if (i >= 0 && exceptions[i].expires >= today) {
      accepted.push({ ...f, reason: exceptions[i].reason, expires: exceptions[i].expires });
    } else failing.push(i >= 0 ? { ...f, note: `exception expired ${exceptions[i].expires}` } : f);
  }
  const stale = exceptions.filter((x, i) => !used.has(i)); // matches no current advisory: remove it
  return { accepted, failing, stale };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const policy = JSON.parse(readFileSync(join(root, "scripts", "dependency-policy.json"), "utf8")).audit;
  const dirs = lockfileDirs();
  const all = [];
  for (const dir of dirs) all.push(...findings(dir, await audit(dir))); // sequential: gentle on the registry
  const { accepted, failing, stale } = judge(all, policy.exceptions);
  const row = (f) => `| ${f.lockfile} | ${f.package} | ${f.severity} | ${f.direct ? "direct" : "transitive"} | ${f.advisory} | ${f.fix} | ${f.note ?? f.reason ?? ""} |`;
  const lines = [
    `### npm audit: ${dirs.length} lockfiles`,
    failing.length || accepted.length ? "| Lockfile | Package | Severity | Dependency | Advisory | Fix | Note |\n|---|---|---|---|---|---|---|" : "No known vulnerabilities.",
    ...failing.sort((a, b) => SEVERITY.indexOf(b.severity) - SEVERITY.indexOf(a.severity)).map(row),
    ...accepted.map(row),
    ...stale.map((x) => `- stale exception (matches no advisory, remove it): ${x.lockfile} ${x.package} ${x.advisory}`),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  if (failing.length || stale.length) {
    console.error(`✖ ${failing.length} unaccepted advisory finding(s), ${stale.length} stale exception(s). Upgrade (after reviewing compatibility) or record a reviewed, expiring exception in scripts/dependency-policy.json.`);
    process.exit(1);
  }
  console.log(`✔ audit: no unaccepted advisories (${accepted.length} accepted)`);
}

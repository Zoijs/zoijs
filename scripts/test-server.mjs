// test-server.mjs — the static server the Playwright browser suites (and each package's
// `npm run dev` example viewer) run against. Repository tooling — not a production server, and
// not the scaffolded apps' dev server (create-zoijs ships its own).
//
//   node scripts/test-server.mjs <root> <port>
//
// Replaces `npx serve`, which resolved (and could download) a mutable package version at test
// time, outside the lockfiles. Node built-ins only: no install, no network, deterministic.
// Serves files under <root> on 127.0.0.1 with correct MIME types and `Cache-Control: no-store`;
// a directory serves its index.html; anything else (missing, outside <root>, or a dotfile /
// dot-directory such as .git/ or .env) is a 404.
// GET /__ready answers 200 — Playwright's webServer.url waits on it (most roots have no index).
//
// Every suite has its own port so suites can run concurrently (enforced by
// scripts/tests/ci-consistency.test.mjs):
//   framework 7310 · router 3100 · resource 3200 · head 3300 · action 3400 · storage 3600 ·
//   forms 3700 · sanitize 3800 · api 3900 · examples/task-board 3500 · examples/admin 3520 · examples/contacts 3530

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname, join } from "node:path";

const [rootArg, portArg] = process.argv.slice(2);
const ROOT = resolve(rootArg || ".");
const PORT = Number(portArg);
if (!Number.isInteger(PORT) || PORT <= 0) {
  console.error("usage: node scripts/test-server.mjs <root> <port>");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const inside = (p) => {
  const rel = relative(ROOT, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
const send = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    if (pathname === "/__ready") return send(res, 200, "ok");
    let file = resolve(ROOT, "." + pathname);
    const dotSegment = pathname.split(/[\\/]+/).some((s) => s.startsWith("."));
    if (pathname.includes("\0") || dotSegment || !inside(file)) return send(res, 404, "Not found");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    send(res, 200, await readFile(file), TYPES[extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found");
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`test-server: ${ROOT} on http://127.0.0.1:${PORT}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));

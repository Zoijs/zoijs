// dev-server.mjs — a tiny static file server for this Zoijs app. DEVELOPMENT ONLY.
//
// Zero dependencies (Node built-ins only), no build step, no bundler. It serves
// the project files — index.html, your modules, and whatever its import map points
// at inside this folder (node_modules/, if you installed). Tries port 7310, then
// 7311 / 7312 / 7313 if one is busy. The same file ships in every Zoijs template.
//
//   node dev-server.mjs      (this is what `npm run dev` runs)
//
// Safe defaults for a dev server:
//   - listens on 127.0.0.1 only — other devices on your network can't reach it.
//     To test from a phone on your LAN, opt in explicitly: ZOIJS_HOST=0.0.0.0 npm run dev
//     (anyone on that network can then read your project files while it runs).
//   - never serves dotfiles or dot-directories (.env, .git/, .npmrc, …);
//   - never serves anything outside this folder (no `..`, no symlinks pointing out —
//     except package-manager links inside node_modules/);
//   - answers malformed URLs with 400 instead of crashing.
// It is not a production server: deploy the static files to a real host.

import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve, relative, isAbsolute, sep } from "node:path";

const PORTS = [7310, 7311, 7312, 7313];
const HOST = process.env.ZOIJS_HOST || "127.0.0.1";
const ROOT = resolve(process.cwd());

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const HEADERS = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

// Is `path` ROOT itself or inside it? (relative() handles separators, case and
// sibling folders like `app-secrets` correctly — unlike a string-prefix check.)
const inside = (base, path) => {
  const rel = relative(base, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { ...HEADERS, "Content-Type": type });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    let pathname;
    try {
      // Only the path (never the query string) maps to a file.
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      return send(res, 400, "Bad request");
    }
    if (pathname.includes("\0")) return send(res, 400, "Bad request");
    if (pathname === "/") pathname = "/index.html";

    const segments = pathname.split(/[\\/]+/).filter(Boolean);
    // Hidden files and folders (.env, .git/, .npmrc, node_modules/.bin, …) are never
    // served. 404, not 403, so it doesn't reveal whether they exist.
    if (segments.some((s) => s.startsWith("."))) return send(res, 404, "Not found");

    const filePath = resolve(ROOT, ...segments);
    if (!inside(ROOT, filePath)) return send(res, 404, "Not found");

    // Don't follow symlinks out of the project. Package managers (npm link, pnpm)
    // legitimately link packages into node_modules/, so links there are allowed.
    let real;
    try {
      real = await realpath(filePath);
    } catch {
      return send(res, 404, "Not found");
    }
    if (!inside(ROOT, real) && segments[0] !== "node_modules") return send(res, 404, "Not found");

    const body = await readFile(real);
    send(res, 200, body, TYPES[extname(filePath)] || "application/octet-stream");
  } catch {
    // Directories, permission errors, files deleted mid-request: a generic answer
    // that never echoes a filesystem path.
    if (!res.headersSent) send(res, 404, "Not found");
    else res.destroy();
  }
});

function start(i = 0) {
  if (i >= PORTS.length) {
    console.error(`\nAll dev ports are busy (${PORTS.join(", ")}). Free one and try again.\n`);
    process.exit(1);
  }
  // Paired once-listeners: each attempt removes its sibling so a failed bind
  // can't leave a stale "listening" handler that prints the wrong port later.
  const onError = (err) => {
    server.removeListener("listening", onListening);
    if (err.code === "EADDRINUSE") start(i + 1);
    else {
      console.error(err);
      process.exit(1);
    }
  };
  const onListening = () => {
    server.removeListener("error", onError);
    const lines = ["", "  Zoijs dev server", "", `  - Local:  http://localhost:${PORTS[i]}`];
    if (i > 0) lines.push(`  (ports ${PORTS.slice(0, i).join(", ")} were busy)`);
    if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") {
      lines.push(`  ⚠ Listening on ${HOST} (ZOIJS_HOST): other devices on your network can read`, `    this project's files while the server runs. Development only.`);
    }
    lines.push("");
    console.log(lines.join("\n"));
  };
  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(PORTS[i], HOST);
}

start();

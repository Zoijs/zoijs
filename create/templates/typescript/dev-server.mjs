// dev-server.mjs — a tiny static file server for this Zoijs app.
//
// Zero dependencies (Node built-ins only), no build step, no bundler. It serves
// the project files so the import map in index.html can load @zoijs/core from
// node_modules. Tries port 7310, then 7311 / 7312 / 7313 if one is busy.
//
//   node dev-server.mjs      (this is what `npm run dev` runs)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORTS = [7310, 7311, 7312, 7313];
const ROOT = process.cwd();

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

const server = createServer(async (req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (pathname === "/") pathname = "/index.html";

  // Resolve inside ROOT and refuse anything that climbs out of it.
  const filePath = join(ROOT, normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": TYPES[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
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
    lines.push("");
    console.log(lines.join("\n"));
  };
  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(PORTS[i]);
}

start();

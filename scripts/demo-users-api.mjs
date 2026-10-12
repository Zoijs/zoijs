// demo-users-api.mjs — the deterministic, in-memory "external API" behind api/examples/users.
// Repository tooling for the example and its browser tests — not a production server.
//
// Served by test-server.mjs under /__demo/<workspace>/ on its cross-origin port, with CORS for the
// main origin only. Every <workspace> (a random id the page picks) gets its own seeded data, so
// parallel tests never share state. Node built-ins only.
//
//   POST   /session            → 200 { accessToken } — the demo "sign-in" (no password: a demo)
//   GET    /users              → 200 [user]                         (Bearer token required)
//   POST   /users              → 201 user | 422 problem             (Idempotency-Key honored)
//   PATCH  /users/:id          → 200 user | 404 | 422 problem
//   DELETE /users/:id          → 204 | 404
//   ?simulate=unavailable      → 503 problem (a GET retried by the page fails again)
//   ?simulate=drop             → the connection is dropped (a network error in the browser)
//   ?simulate=slow             → answers after 3 s (longer than the example's timeout)
// A missing or unknown token → 401 problem. Tokens are random and per workspace; nothing persists.

import { randomUUID } from "node:crypto";

const WORKSPACE = /^\/__demo\/([A-Za-z0-9-]{1,64})(\/.*)$/;
const MAX_WORKSPACES = 1000;
const MAX_BODY = 16 * 1024;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const workspaces = new Map();

function workspace(id) {
  let ws = workspaces.get(id);
  if (!ws) {
    if (workspaces.size >= MAX_WORKSPACES) workspaces.delete(workspaces.keys().next().value); // oldest first
    ws = {
      tokens: new Set(),
      nextId: 3,
      users: [
        { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
        { id: 2, name: "Alan Turing", email: "alan@example.com" },
      ],
      replies: new Map(), // Idempotency-Key → the reply it got
    };
    workspaces.set(id, ws);
  }
  return ws;
}

const problem = (status, title, detail) => ({ type: "about:blank", title, status, ...(detail ? { detail } : {}) });

// The validation problem for a user body, or null when it's valid.
function invalid(ws, body, id) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "Send a JSON object with name and email.";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!name) return "Enter a name.";
  if (name.length > 100) return "Use a name of at most 100 characters.";
  if (!EMAIL.test(email)) return "Enter a valid email address, like name@example.com.";
  if (ws.users.some((u) => u.id !== id && u.email.toLowerCase() === email.toLowerCase())) return "That email address is already used by another user.";
  return null;
}

/** Handle one /__demo/… request. `allowedOrigin` is the only origin CORS lets read responses. */
export function demoUsers(req, res, url, allowedOrigin) {
  const headers = { "Cache-Control": "no-store", Vary: "Origin" };
  if (req.headers.origin === allowedOrigin) {
    Object.assign(headers, { "Access-Control-Allow-Origin": allowedOrigin });
  }
  const reply = (status, body) => {
    if (res.destroyed) return;
    const json = body === undefined ? "" : JSON.stringify(body);
    const type = status >= 400 ? "application/problem+json" : "application/json; charset=utf-8";
    res.writeHead(status, { ...headers, ...(json ? { "Content-Type": type } : {}) });
    res.end(json);
  };
  if (req.method === "OPTIONS") {
    if (headers["Access-Control-Allow-Origin"]) {
      Object.assign(headers, { "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE", "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key", "Access-Control-Max-Age": "600" });
    }
    res.writeHead(204, headers);
    return res.end();
  }
  const m = WORKSPACE.exec(url.pathname);
  if (!m) return reply(404, problem(404, "Not found"));
  const ws = workspace(m[1]);
  const route = m[2];

  const simulate = url.searchParams.get("simulate");
  if (simulate === "drop") return req.socket.destroy();

  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size <= MAX_BODY) chunks.push(c);
  });
  req.on("end", () => {
    if (size > MAX_BODY) return reply(413, problem(413, "Too large"));
    let body = null;
    if (chunks.length) {
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return reply(400, problem(400, "Bad request", "The body isn't valid JSON."));
      }
    }
    const answer = () => handle(ws, req.method, route, body, req.headers, simulate);
    const [status, out] = answer();
    if (simulate === "slow") setTimeout(() => reply(status, out), 3000);
    else reply(status, out);
  });
}

function handle(ws, method, route, body, reqHeaders, simulate) {
  if (method === "POST" && route === "/session") {
    const token = "demo-" + randomUUID();
    ws.tokens.add(token);
    return [200, { accessToken: token }];
  }
  const auth = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/.exec(reqHeaders.authorization || "");
  if (!auth || !ws.tokens.has(auth[1])) return [401, problem(401, "Sign-in required", "Your session has expired. Sign in again.")];
  if (simulate === "unavailable") return [503, problem(503, "Service unavailable", "The demo API is pretending to be down.")];

  if (route === "/users") {
    if (method === "GET") return [200, ws.users];
    if (method === "POST") {
      const key = reqHeaders["idempotency-key"];
      if (key && ws.replies.has(key)) return ws.replies.get(key); // a retried POST creates nothing new
      const why = invalid(ws, body);
      const result = why ? [422, problem(422, "Invalid user", why)] : [201, add(ws, body)];
      if (key && ws.replies.size < 1000) ws.replies.set(key, result);
      return result;
    }
    return [405, problem(405, "Method not allowed")];
  }
  const one = /^\/users\/(\d{1,9})$/.exec(route);
  if (one) {
    const id = Number(one[1]);
    const at = ws.users.findIndex((u) => u.id === id);
    if (at < 0) return [404, problem(404, "Not found", "That user doesn't exist (any more).")];
    if (method === "DELETE") {
      ws.users.splice(at, 1);
      return [204, undefined];
    }
    if (method === "PATCH") {
      const merged = { ...ws.users[at], ...(body && typeof body === "object" ? body : {}) };
      const why = invalid(ws, merged, id);
      if (why) return [422, problem(422, "Invalid user", why)];
      ws.users[at] = { id, name: merged.name.trim(), email: merged.email.trim() };
      return [200, ws.users[at]];
    }
    return [405, problem(405, "Method not allowed")];
  }
  return [404, problem(404, "Not found")];
}

function add(ws, body) {
  const user = { id: ws.nextId++, name: body.name.trim(), email: body.email.trim() };
  ws.users.push(user);
  return user;
}

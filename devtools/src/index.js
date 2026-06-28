// @zoijs/devtools — a reactive-graph inspector for Zoijs.
//
// It reveals the one idea Zoijs is built on: fine-grained reactivity. Attach it
// and you can watch a single `state.set(...)` wake exactly one effect and update
// exactly one DOM node — no re-render, no diff. There is no time travel and no
// render replay, because Zoijs has no re-render to replay; the panel shows the
// live graph as it actually is.
//
//   import { inspect } from "@zoijs/devtools";
//   inspect(); // floating panel, dev-only
//
// Built entirely on the public, read-only core hook (`@zoijs/core/devtools`).
// It is dev-only (a no-op under configure({ dev:false })) and never mutates the
// graph it observes. The panel itself uses plain DOM — no Zoijs reactivity — so
// it can't pollute the very graph it is inspecting.

import { attachInspector } from "@zoijs/core/devtools";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ---- headless model ---------------------------------------------------------
// createInspector() builds a live model of the graph and lets you subscribe to
// changes. inspect() layers the panel on top. Use this directly to build a
// custom UI, drive an extension, or assert on the graph in a test.

/**
 * Build a graph model + a read-only inspector. Nothing is observed until you
 * call `attach()`; `detach()` stops observing (the model keeps its last state).
 */
export function createInspector() {
  const byNode = new Map(); // node -> record
  const order = []; // records, in creation order
  const listeners = new Set();
  let detach = null;
  let idSeq = 0;

  const notify = (change) => {
    for (const fn of listeners) fn(change, model);
  };

  const record = (node, kind, label) => {
    let rec = byNode.get(node);
    if (rec) return rec;
    rec = {
      id: ++idSeq,
      kind,
      label: label || null,
      node,
      runs: 0,
      writes: 0,
      alive: true,
      lastActive: 0,
    };
    byNode.set(node, rec);
    order.push(rec);
    return rec;
  };

  // Resolve a node's edges (sources / observers) to records, on demand. The raw
  // Sets live on the node; reading them here is how the inspector shows the graph
  // without ever instrumenting `.get()`.
  const edges = (rec, field) => {
    const set = rec.node[field];
    if (!set) return [];
    const out = [];
    for (const n of set) {
      const r = byNode.get(n);
      if (r) out.push(r);
    }
    return out;
  };

  const inspector = {
    onCreate(node, kind, label) {
      notify({ type: "create", rec: record(node, kind, label) });
    },
    onRun(node) {
      const rec = byNode.get(node) || record(node, node.fn ? "computed" : "effect");
      rec.runs++;
      rec.lastActive = now();
      notify({ type: "run", rec });
    },
    onWrite(node) {
      const rec = byNode.get(node) || record(node, "state");
      rec.writes++;
      rec.lastActive = now();
      notify({ type: "write", rec });
    },
    onDispose(node) {
      const rec = byNode.get(node);
      if (!rec) return;
      rec.alive = false;
      notify({ type: "dispose", rec });
    },
  };

  const model = {
    /** All records in creation order. */
    nodes: () => order.slice(),
    /** The record for a raw node, or null. */
    get: (node) => byNode.get(node) || null,
    /** Records this node reads from (its dependencies). */
    sources: (rec) => edges(rec, "sources"),
    /** Records that depend on this node. */
    observers: (rec) => edges(rec, "observers"),
    /** A live count by kind plus totals. */
    stats() {
      let states = 0,
        computeds = 0,
        effects = 0,
        alive = 0,
        runs = 0,
        writes = 0;
      for (const r of order) {
        if (r.kind === "state") states++;
        else if (r.kind === "computed") computeds++;
        else effects++;
        if (r.alive) alive++;
        runs += r.runs;
        writes += r.writes;
      }
      return { states, computeds, effects, alive, total: order.length, runs, writes };
    },
  };

  return {
    model,
    /** Subscribe to graph changes; returns an unsubscribe function. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Start observing the running app. Idempotent. */
    attach() {
      if (!detach) detach = attachInspector(inspector);
      return this;
    },
    /** Stop observing. The model retains its last snapshot. */
    detach() {
      if (detach) {
        detach();
        detach = null;
      }
    },
  };
}

// ---- the panel --------------------------------------------------------------

const KIND_COLOR = { state: "#22c55e", computed: "#38bdf8", effect: "#f59e0b" };

/** Resolve a label's node up to its nearest Element (a text anchor is a comment). */
function asElement(node) {
  while (node && node.nodeType !== 1) node = node.parentNode;
  return node;
}

function describeLabel(label) {
  if (!label) return "";
  const el = asElement(label.el);
  const tag = el ? el.tagName.toLowerCase() : "?";
  if (label.kind === "attr") return `<${tag} ${label.name}=…>`;
  if (label.kind === "list") return `<${tag}> list`;
  return `<${tag}> text`;
}

function preview(rec) {
  if (rec.kind === "effect") return "";
  let v;
  try {
    v = rec.node.value;
  } catch {
    return "";
  }
  let s;
  if (typeof v === "string") s = JSON.stringify(v);
  else if (typeof v === "function") s = "ƒ";
  else if (v && typeof v === "object") s = Array.isArray(v) ? `Array(${v.length})` : "{…}";
  else s = String(v);
  return s.length > 24 ? s.slice(0, 23) + "…" : s;
}

/**
 * Attach an inspector and mount a floating panel into the page. Dev-only; a no-op
 * (returns an inert handle) without a document or in production mode. Returns
 * `{ inspector, model, close }`.
 */
export function inspect(options = {}) {
  const ins = createInspector().attach();
  if (typeof document === "undefined") return { ...ins, close() {} };

  const root = document.createElement("div");
  root.setAttribute("data-zoijs-devtools", "");
  root.style.cssText = `
    position:fixed; ${options.corner === "bottom-left" ? "left" : "right"}:12px; bottom:12px;
    width:300px; max-height:50vh; display:flex; flex-direction:column; z-index:2147483647;
    font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; color:#e5e7eb;
    background:#0b1020; border:1px solid #1f2937; border-radius:10px; overflow:hidden;
    box-shadow:0 10px 30px rgba(0,0,0,.45);`;

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex; align-items:center; gap:8px; padding:8px 10px; background:#111827; border-bottom:1px solid #1f2937;";
  const title = document.createElement("strong");
  title.textContent = "Zoijs devtools";
  title.style.cssText = "font-weight:600; letter-spacing:.2px;";
  const stats = document.createElement("span");
  stats.style.cssText = "margin-left:auto; color:#9ca3af; font-size:11px;";
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close Zoijs devtools");
  close.style.cssText =
    "border:0; background:transparent; color:#9ca3af; cursor:pointer; font:inherit; padding:0 2px;";
  header.append(title, stats, close);

  const list = document.createElement("div");
  list.style.cssText = "overflow:auto; padding:4px;";

  root.append(header, list);
  document.body.appendChild(root);

  const rows = new Map(); // id -> { el, kind, name, value, meter }
  let highlighted = null; // { el, prev } currently outlined on the page

  function outline(rec, on) {
    if (highlighted) {
      highlighted.el.style.outline = highlighted.prev;
      highlighted = null;
    }
    if (!on || !rec.label) return;
    const el = asElement(rec.label.el);
    if (!el || !el.style) return;
    highlighted = { el, prev: el.style.outline };
    el.style.outline = "2px solid #38bdf8";
    el.style.outlineOffset = "1px";
  }

  function buildRow(rec) {
    const el = document.createElement("div");
    el.style.cssText =
      "display:flex; align-items:center; gap:6px; padding:3px 6px; border-radius:6px; cursor:default;";
    const badge = document.createElement("span");
    badge.textContent = rec.kind[0].toUpperCase();
    badge.title = rec.kind;
    badge.style.cssText = `flex:0 0 auto; width:16px; height:16px; border-radius:4px; text-align:center;
      font-size:10px; line-height:16px; color:#0b1020; font-weight:700; background:${KIND_COLOR[rec.kind]};`;
    const name = document.createElement("span");
    name.style.cssText = "flex:1 1 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#cbd5e1;";
    const value = document.createElement("span");
    value.style.cssText = "flex:0 0 auto; color:#9ca3af; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
    const meter = document.createElement("span");
    meter.style.cssText = "flex:0 0 auto; color:#6b7280; font-size:10px;";
    el.append(badge, name, value, meter);
    // Hover a node → outline the one DOM node its binding updates.
    el.addEventListener("mouseenter", () => outline(rec, true));
    el.addEventListener("mouseleave", () => outline(rec, false));
    list.appendChild(el);
    const row = { el, name, value, meter };
    rows.set(rec.id, row);
    return row;
  }

  let frame = null;
  function schedule() {
    if (frame != null) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    frame = raf(render);
  }

  function render() {
    frame = null;
    const t = now();
    let glowing = false;
    for (const rec of ins.model.nodes()) {
      const row = rows.get(rec.id) || buildRow(rec);
      const label = describeLabel(rec.label);
      row.name.textContent = label || (rec.kind === "state" ? "state" : rec.kind);
      row.value.textContent = preview(rec);
      row.meter.textContent = rec.runs ? `×${rec.runs}` : rec.writes ? `↑${rec.writes}` : "";
      // Activity glow that decays over ~600ms; dim disposed nodes.
      const age = t - rec.lastActive;
      const glow = rec.lastActive && age < 600 ? 1 - age / 600 : 0;
      if (glow > 0) glowing = true;
      row.el.style.background = glow > 0 ? `rgba(56,189,248,${(glow * 0.35).toFixed(3)})` : "transparent";
      row.el.style.opacity = rec.alive ? "1" : "0.4";
    }
    const s = ins.model.stats();
    stats.textContent = `${s.states}s · ${s.computeds}c · ${s.effects}e · ${s.runs}▶`;
    if (glowing) schedule(); // keep decaying until everything settles
  }

  const unsubscribe = ins.subscribe(schedule);
  render();

  function shutdown() {
    unsubscribe();
    ins.detach();
    outline(null, false);
    root.remove();
  }
  close.addEventListener("click", shutdown);

  return { inspector: ins, model: ins.model, close: shutdown };
}

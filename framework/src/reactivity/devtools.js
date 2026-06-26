// devtools.js — read-only inspection hook for the reactive graph (RFC 0005).
//
// This is the ONE seam between the engine and an external inspector
// (@zoijs/devtools, or a browser extension). It is, by construction:
//
//   • Off by default. Until something attaches, every report below is a single
//     `if (!inspector) return` — so an un-inspected app (every production app)
//     pays no measurable cost and exposes nothing.
//   • Read-light. The HOT path — readNode, run on every `.get()` — is NOT
//     instrumented. Only lifecycle points are (create / run / write / dispose).
//     The inspector reads a node's `sources` / `observers` on demand for the
//     graph view, so even an *attached* inspector adds no per-read cost.
//   • Dev-only. attachInspector() is a no-op under configure({ dev:false }), so
//     an inspector can never run against an app shipped in production mode.
//   • Read-only. The engine hands the inspector raw nodes to OBSERVE; it never
//     reads a value back from the inspector or lets it mutate the graph.
//
// Not part of the learnable nine-function surface — reached through the dedicated
// subpath `@zoijs/core/devtools`, by tooling, never by application code.

import { isDev } from "./env.js";

let inspector = null;

// A small stack lets the renderer tag the node(s) created while it wires a DOM
// binding with the DOM they update (e.g. { kind:"text", el }); see labelNext.
const labels = [];

/**
 * Attach a read-only inspector and start receiving reports. Returns a detach
 * function. No-op (returns a no-op) in production mode or with a falsy inspector.
 */
export function attachInspector(next) {
  if (!isDev() || !next) return () => {};
  inspector = next;
  if (inspector.onAttach) inspector.onAttach();
  return () => {
    if (inspector === next) inspector = null;
  };
}

/** True while an inspector is attached — a cheap guard for optional extra work. */
export function inspecting() {
  return inspector !== null;
}

// ---- engine-side reports — each a no-op unless an inspector is attached -------

export function reportCreate(node, kind) {
  if (!inspector) return;
  inspector.onCreate(node, kind, labels.length ? labels[labels.length - 1] : undefined);
}
export function reportRun(node) {
  if (inspector) inspector.onRun(node);
}
export function reportWrite(node) {
  if (inspector) inspector.onWrite(node);
}
export function reportDispose(node) {
  if (inspector) inspector.onDispose(node);
}

/**
 * Tag the node(s) created while `run` executes with `label` — used by the
 * renderer to attribute a binding effect to the DOM node it updates. The label is
 * only ever read inside reportCreate, so this costs one null-check when no
 * inspector is attached.
 */
export function labelNext(label, run) {
  if (!inspector) return run();
  labels.push(label);
  try {
    return run();
  } finally {
    labels.pop();
  }
}

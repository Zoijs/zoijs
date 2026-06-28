// Type surface for `@zoijs/core/devtools` — the read-only reactive-graph
// inspection hook (RFC 0005). This is dev-tooling, NOT part of the stable
// nine-function API; it lives behind its own subpath so the learnable surface
// stays frozen. See `src/reactivity/devtools.js`.

/** What a node is. */
export type NodeKind = "state" | "computed" | "effect";

/**
 * A reactive graph node. Treat it as an opaque identity with a few read-only
 * fields — never mutate it. `sources` / `observers` let an inspector walk the
 * graph on demand (so reads stay un-instrumented). `fn` is present on
 * computeds/effects, absent on states.
 */
export interface ReactiveNode {
  readonly value?: unknown;
  readonly fn?: Function | null;
  readonly sources?: ReadonlySet<ReactiveNode>;
  readonly observers: ReadonlySet<ReactiveNode>;
  readonly disposed?: boolean;
}

/**
 * A tag the renderer attaches to a binding node, naming the DOM it updates:
 * a text slot, an attribute, or a keyed list. Lets an inspector show *which DOM
 * node each signal updates*.
 */
export interface NodeLabel {
  kind: "text" | "attr" | "list";
  el: Node;
  name?: string;
}

/**
 * Implement this to observe the reactive graph. Every callback is read-only and
 * fires only in dev mode while attached. `onCreate` is called once per node;
 * `onRun` each time a computed/effect recomputes; `onWrite` each time a state
 * actually changes; `onDispose` when a computed/effect leaves the graph.
 */
export interface Inspector {
  onAttach?(): void;
  onCreate(node: ReactiveNode, kind: NodeKind, label?: NodeLabel): void;
  onRun(node: ReactiveNode): void;
  onWrite(node: ReactiveNode): void;
  onDispose(node: ReactiveNode): void;
}

/**
 * Attach a read-only inspector; returns a detach function. A no-op (returns a
 * no-op) under `configure({ dev: false })`, so an inspector can never run
 * against an app shipped in production mode.
 */
export function attachInspector(inspector: Inspector): () => void;

/** True while an inspector is attached. */
export function inspecting(): boolean;

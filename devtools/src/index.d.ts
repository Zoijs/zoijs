// @zoijs/devtools — a reactive-graph inspector for Zoijs.

export type NodeKind = "state" | "computed" | "effect";

/** A tag naming the DOM a binding effect updates (text slot, attribute, list). */
export interface NodeLabel {
  kind: "text" | "attr" | "list";
  el: Node;
  name?: string;
}

/** A node in the model: a state, computed, or effect, with live activity counts. */
export interface NodeRecord {
  readonly id: number;
  readonly kind: NodeKind;
  readonly label: NodeLabel | null;
  /** The raw reactive node (opaque identity; do not mutate). */
  readonly node: unknown;
  runs: number;
  writes: number;
  alive: boolean;
  /** Timestamp of the last run/write (for activity highlighting). */
  lastActive: number;
}

export interface GraphStats {
  states: number;
  computeds: number;
  effects: number;
  alive: number;
  total: number;
  runs: number;
  writes: number;
}

/** A live, read-only model of the reactive graph. */
export interface GraphModel {
  nodes(): NodeRecord[];
  get(node: unknown): NodeRecord | null;
  sources(rec: NodeRecord): NodeRecord[];
  observers(rec: NodeRecord): NodeRecord[];
  stats(): GraphStats;
}

export type GraphChange =
  | { type: "create"; rec: NodeRecord }
  | { type: "run"; rec: NodeRecord }
  | { type: "write"; rec: NodeRecord }
  | { type: "dispose"; rec: NodeRecord };

export interface Inspector {
  readonly model: GraphModel;
  subscribe(fn: (change: GraphChange, model: GraphModel) => void): () => void;
  attach(): Inspector;
  detach(): void;
}

/**
 * Build a headless graph model + inspector. Nothing is observed until `attach()`.
 * Use this to drive a custom UI, an extension, or graph assertions in a test.
 */
export function createInspector(): Inspector;

export interface InspectOptions {
  /** Which corner to dock the panel in. Default `"bottom-right"`. */
  corner?: "bottom-right" | "bottom-left";
}

export interface InspectHandle {
  inspector: Inspector;
  model: GraphModel;
  /** Detach the inspector and remove the panel. */
  close(): void;
}

/**
 * Attach an inspector and mount a floating panel. Dev-only — a no-op (inert
 * handle) without a document or under `configure({ dev: false })`.
 */
export function inspect(options?: InspectOptions): InspectHandle;

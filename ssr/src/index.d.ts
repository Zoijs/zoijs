// @zoijs/ssr — render Zoijs components to an HTML string, on the server.

/** A component: a function returning an `html\`…\`` result, or a result itself. */
export type Component = (() => unknown) | object;

/** Options for {@link renderToString}. */
export interface RenderOptions {
  /**
   * Keep the markers the client needs to {@link hydrate} this DOM in place. Default
   * `false` — omit it for clean static output (SSG) you don't hydrate.
   */
  hydratable?: boolean;
}

/**
 * Render a component to an HTML string with no DOM and zero dependencies. Reactive
 * values are read once; text is escaped, URL attributes are scheme-checked, and
 * event handlers / refs are dropped (they are wired on the client). Place the
 * returned markup in your HTML shell and serve it.
 *
 * Pass `{ hydratable: true }` to keep the markers {@link hydrate} needs; otherwise
 * the client takes over with a plain `mount()`.
 */
export function renderToString(component: Component, options?: RenderOptions): string;

/**
 * Hydrate a server-rendered page on the client: run `component` and adopt the
 * existing DOM inside `target` (produced by `renderToString(c, { hydratable: true })`)
 * instead of re-creating it — elements are reused and events/reactivity are attached
 * in place, with no full re-render and no flash. Returns an `unmount()`.
 */
export function hydrate(component: Component, target: Element | string): () => void;

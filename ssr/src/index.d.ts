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

/** How a {@link hydrate} call went (same shape as `@zoijs/core`'s `HydrationResult`). */
export interface HydrationResult {
  /** "hydrated": all adopted · "recovered": some parts re-rendered · "client-rendered": the whole target re-rendered. */
  readonly status: "hydrated" | "recovered" | "client-rendered";
  /** How many parts were rendered on the client instead of adopted. */
  readonly mismatches: number;
}

/**
 * Hydrate a server-rendered page on the client: run `component` and adopt the
 * existing DOM inside `target` (produced by `renderToString(c, { hydratable: true })`)
 * instead of re-creating it — elements are reused and events/reactivity are attached
 * in place, with no full re-render and no flash. A part that doesn't match the server HTML
 * is rendered on the client instead (never a crash); `unmount.hydration` says what happened.
 * (`hydration` needs the core release that adds hydration recovery — *(next release)*.)
 */
export function hydrate(component: Component, target: Element | string): (() => void) & { readonly hydration?: HydrationResult };

/**
 * Serialize a value to a JSON string that is SAFE to embed inside a `<script>` tag
 * (escapes `<`, `>`, `&`, and the U+2028/U+2029 line terminators). Use it to pass
 * server-fetched data to the client so a `@zoijs/resource` started with `{ initial }`
 * doesn't refetch:
 *
 * ```js
 * `<script type="application/json" id="app-data">${serialize(data)}</script>`
 * // client: JSON.parse(document.getElementById("app-data").textContent)
 * ```
 *
 * Only for a `<script>` element's body — quotes are NOT escaped, so never place the
 * output in an HTML attribute, raw HTML, a URL, or a `<style>` block.
 */
export function serialize(value: unknown): string;

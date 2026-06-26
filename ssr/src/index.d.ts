// @zoijs/ssr — render Zoijs components to an HTML string, on the server.

/** A component: a function returning an `html\`…\`` result, or a result itself. */
export type Component = (() => unknown) | object;

/**
 * Render a component to an HTML string with no DOM and zero dependencies. Reactive
 * values are read once; text is escaped, URL attributes are scheme-checked, and
 * event handlers / refs are dropped (they are wired on the client). Place the
 * returned markup in your HTML shell and serve it; on the client, `mount()` takes
 * over.
 */
export function renderToString(component: Component): string;

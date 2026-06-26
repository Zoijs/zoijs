// Type definitions for Zoijs.
//
// Zoijs is authored in plain JavaScript; these declarations add editor
// autocomplete and optional type-checking WITHOUT converting the project to
// TypeScript. Using them is entirely opt-in — JS users are unaffected.

/** A reactive value created by {@link createState}. */
export interface State<T> {
  /** Read the current value. Inside a binding/effect this subscribes to it. */
  get(): T;
  /** Write a new value. Dependents update only if the value actually changed. */
  set(next: T): void;
  /** Read the current value WITHOUT subscribing. */
  peek(): T;
}

/** A lazy, cached, value-gated derived value created by {@link computed}. */
export interface Computed<T> {
  /** Read the current value. Recomputes only if a dependency changed. */
  get(): T;
  /** Read without subscribing. */
  peek(): T;
}

declare const templateBrand: unique symbol;
/**
 * The result of an `html` template. Pass it to {@link mount}, return it from a
 * component, or place it in another template. Treat it as opaque.
 */
export interface TemplateResult {
  readonly [templateBrand]: true;
}

declare const eachBrand: unique symbol;
/** The result of {@link each}. Place it in a template's child position. */
export interface EachResult {
  readonly [eachBrand]: true;
}

/** A component is a function that returns an `html` template. */
export type Component = () => TemplateResult;

/**
 * A callback ref. Place it on an element as `ref=${fn}`; it receives the real DOM
 * element once the surrounding render has been inserted (deferred one microtask,
 * so `focus()` / `scrollIntoView()` / `getBoundingClientRect()` work). It may
 * return a cleanup function, which runs on unmount or list-item removal. It runs
 * once and is not reactive.
 *
 * ```ts
 * html`<input ref=${(el: HTMLInputElement) => el.focus()} />`
 * html`<div ref=${(el) => { const c = chart(el); return () => c.destroy(); }}></div>`
 * ```
 */
export type Ref<E extends Element = Element> = (element: E) => void | (() => void);

/**
 * Tagged-template function — write your markup as HTML.
 *
 * ```js
 * html`<button onclick=${() => count.set(count.get() + 1)}>${() => count.get()}</button>`
 * ```
 *
 * To reach the rendered DOM element, add a callback `ref` (see {@link Ref}):
 * `html\`<input ref=${(el) => el.focus()} />\``.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;

/**
 * Render a component (or a template) into a DOM element or CSS selector.
 * Returns an `unmount()` that detaches the DOM and disposes all reactivity.
 */
export function mount(component: Component | TemplateResult, target: Element | string): () => void;

/**
 * Create a reactive value.
 *
 * ```ts
 * const count = createState(0);        // State<number>
 * const name = createState<string>(""); // explicit
 * ```
 */
export function createState<T>(initial: T, equals?: (a: T, b: T) => boolean): State<T>;

/**
 * Create a lazy, cached derived value.
 *
 * ```ts
 * const fullName = computed(() => `${first.get()} ${last.get()}`); // Computed<string>
 * ```
 */
export function computed<T>(fn: () => T, equals?: (a: T, b: T) => boolean): Computed<T>;

/** A disposable handle returned by {@link effect}. */
export interface EffectHandle {
  /** Dispose the effect now. It also auto-disposes with its owner (component/list item). */
  dispose(): void;
}

/**
 * Run a side effect that re-runs whenever a reactive value it reads changes.
 * Runs once immediately, then again (batched on a microtask) on any change.
 * Dependencies are tracked automatically — there is no dependency array.
 *
 * The function may return a cleanup function (same convention as a `ref`); it
 * runs **before the next run** and **on dispose**. Use the return value for
 * per-run teardown — `onCleanup` is component-scoped (fires on unmount), not
 * per-run.
 *
 * Created inside a component or list item, it auto-disposes with that scope;
 * created at module top level, it lives until you call `dispose()`.
 *
 * ```ts
 * // persist on change
 * effect(() => localStorage.setItem("theme", theme.get()));
 *
 * // per-run cleanup
 * effect(() => {
 *   const id = setInterval(() => poll(query.get()), 1000);
 *   return () => clearInterval(id);
 * });
 * ```
 *
 * For reactive *content on screen*, use a binding (`${() => …}`), not an effect.
 */
export function effect(fn: () => void | (() => void)): EffectHandle;

/**
 * Keyed list rendering. `items` may be a reactive function or a plain array;
 * `keyFn` returns a stable unique key; `renderFn` returns the template for one item.
 *
 * ```ts
 * each(() => todos.get(), (t) => t.id, (t) => html`<li>${() => t.text}</li>`)
 * ```
 */
export function each<T>(
  items: () => readonly T[],
  keyFn: (item: T) => unknown,
  renderFn: (item: T) => TemplateResult
): EachResult;
export function each<T>(
  items: readonly T[],
  keyFn: (item: T) => unknown,
  renderFn: (item: T) => TemplateResult
): EachResult;

/** Toggle development warnings (default: `dev` is `true`). */
export function configure(options: { dev?: boolean }): void;

/**
 * Register a teardown function for the current component or list item. It runs
 * when that component is unmounted or that list item is removed. Use it for
 * timers, subscriptions, or third-party widgets created during setup.
 *
 * ```ts
 * function Clock() {
 *   const now = createState(Date.now());
 *   const id = setInterval(() => now.set(Date.now()), 1000);
 *   onCleanup(() => clearInterval(id));
 *   return html`<time>${() => now.get()}</time>`;
 * }
 * ```
 */
export function onCleanup(fn: () => void): void;

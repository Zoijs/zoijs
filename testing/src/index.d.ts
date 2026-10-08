// Type definitions for @zoijs/testing.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/** A DOM matcher: an exact string, or a RegExp. */
export type Matcher = string | RegExp;

export interface TextOptions {
  /** Exact match (default `true`); when `false`, a case-insensitive substring. */
  exact?: boolean;
}
export interface RoleOptions {
  /** Filter by accessible name (aria-label, associated `<label>`, alt, or text). */
  name?: Matcher;
}
export interface WaitForOptions {
  /** Give up after this many ms (default 1000). */
  timeout?: number;
  /** Retry every this many ms (default 20). */
  interval?: number;
}

/** The get/query/getAll/queryAll/find/findAll family, bound to a root element. */
export interface BoundQueries {
  getByText(text: Matcher, options?: TextOptions): Element;
  queryByText(text: Matcher, options?: TextOptions): Element | null;
  getAllByText(text: Matcher, options?: TextOptions): Element[];
  queryAllByText(text: Matcher, options?: TextOptions): Element[];
  findByText(text: Matcher, options?: TextOptions): Promise<Element>;
  findAllByText(text: Matcher, options?: TextOptions): Promise<Element[]>;

  getByTestId(id: string): Element;
  queryByTestId(id: string): Element | null;
  getAllByTestId(id: string): Element[];
  queryAllByTestId(id: string): Element[];
  findByTestId(id: string): Promise<Element>;
  findAllByTestId(id: string): Promise<Element[]>;

  getByRole(role: string, options?: RoleOptions): Element;
  queryByRole(role: string, options?: RoleOptions): Element | null;
  getAllByRole(role: string, options?: RoleOptions): Element[];
  queryAllByRole(role: string, options?: RoleOptions): Element[];
  findByRole(role: string, options?: RoleOptions): Promise<Element>;
  findAllByRole(role: string, options?: RoleOptions): Promise<Element[]>;

  getByLabelText(text: Matcher, options?: TextOptions): Element;
  queryByLabelText(text: Matcher, options?: TextOptions): Element | null;
  getAllByLabelText(text: Matcher, options?: TextOptions): Element[];
  queryAllByLabelText(text: Matcher, options?: TextOptions): Element[];
  findByLabelText(text: Matcher, options?: TextOptions): Promise<Element>;
  findAllByLabelText(text: Matcher, options?: TextOptions): Promise<Element[]>;
}

export interface RenderOptions {
  /** Render into this element instead of a fresh container (it isn't removed). */
  container?: Element;
  /** The page element a fresh container is appended to (default `document.body`). */
  baseElement?: Element;
}

export interface RenderResult extends BoundQueries {
  /** The element the component was mounted into. */
  container: Element;
  baseElement: Element;
  /** Unmount and remove the container (also done by {@link cleanup}). */
  unmount(): void;
  /** Log a node's `innerHTML` (defaults to the container). */
  debug(node?: Element): void;
}

/** Mount a component (or template) into a fresh container and return queries + unmount. */
export function render(component: unknown, options?: RenderOptions): RenderResult;

/** Unmount everything {@link render} created and remove its containers. */
export function cleanup(): void;

/** Queries bound to `document.body`. */
export const screen: BoundQueries;

/** Bind the query family to a root element (or a function returning one). */
export function bindQueries(root: Element | (() => Element)): BoundQueries;

/** Resolve after Zoijs's queued reactive flush has run. */
export const tick: () => Promise<void>;

/** Retry `fn` until it stops throwing, or reject with its last error on timeout. */
export function waitFor<T>(fn: () => T | Promise<T>, options?: WaitForOptions): Promise<T>;

/** Optional event init; pass `{ target: { value } }` to set a property first. */
export interface FireEventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  target?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Dispatch a real DOM event, then resolve once Zoijs's batched update applied. */
export interface FireEvent {
  (el: Element, type: string, init?: FireEventInit): Promise<void>;
  click(el: Element, init?: FireEventInit): Promise<void>;
  input(el: Element, init?: FireEventInit): Promise<void>;
  change(el: Element, init?: FireEventInit): Promise<void>;
  submit(el: Element, init?: FireEventInit): Promise<void>;
  keydown(el: Element, init?: FireEventInit): Promise<void>;
  keyup(el: Element, init?: FireEventInit): Promise<void>;
  focus(el: Element, init?: FireEventInit): Promise<void>;
  blur(el: Element, init?: FireEventInit): Promise<void>;
}
export const fireEvent: FireEvent;

/** A controllable stand-in for an `@zoijs/router` instance. */
export interface MockRouter {
  view(): Element;
  link(to: string, text: string): unknown;
  go(to: string): void;
  path(): string;
  query(): Record<string, string>;
  destroy(): void;
  /** Test control: set the current path (reactive). */
  setPath(path: string): void;
  /** Test control: set the current query (reactive). */
  setQuery(query: Record<string, string>): void;
}
export function mockRouter(init?: { path?: string; query?: Record<string, string> }): MockRouter;

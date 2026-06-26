// Type surface for `@zoijs/core/server` — DOM-free building blocks for server
// rendering (@zoijs/ssr). Server tooling, not part of the stable nine-function API.

/** Coerce a value to a string (null/undefined → ""). */
export function toText(value: unknown): string;
/** Escape a value for insertion as HTML text content. */
export function escapeText(value: unknown): string;
/** Escape a value for inside a double-quoted attribute value. */
export function escapeAttr(value: unknown): string;
/** Is this URL safe for a URL-bearing attribute (scheme allowlist)? */
export function isSafeUrl(url: string): boolean;
/** Is this attribute name allowed to be bound from data (blocks on*, srcdoc)? */
export function isSafeAttributeName(name: string): boolean;
/** Attribute names whose values carry a URL (scheme-checked). */
export const URL_ATTRS: ReadonlySet<string>;

/** A part descriptor: a child slot, or a dynamic element with attribute parts. */
export type Part =
  | { type: "child"; hole: number }
  | { type: "element"; attrs: AttrPart[] };

/** A dynamic attribute descriptor. */
export interface AttrPart {
  name: string;
  strings: string[];
  holes: number[];
  event: boolean;
  whole: boolean;
}

/** An `html\`…\`` result, viewed without its DOM template. */
export interface TemplateResult {
  __zoijsTemplate: true;
  __staticHTML: string;
  parts: Part[];
  values: unknown[];
  hasElements: boolean;
}

/** An `each(...)` list marker. */
export interface EachMarker {
  __zoijsEach: true;
  items: unknown;
  keyFn: (item: unknown) => unknown;
  renderFn: (item: unknown) => unknown;
}

/** True for an `html\`…\`` result (does not build the DOM template). */
export function isTemplateResult(value: unknown): value is TemplateResult;
/** True for an `each(...)` list marker. */
export function isEachMarker(value: unknown): value is EachMarker;
/** The static HTML skeleton of a template result. */
export function templateHTML(result: TemplateResult): string;

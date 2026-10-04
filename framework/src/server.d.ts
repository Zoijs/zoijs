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
/**
 * The URL-safety decision for a bound attribute value (URL attributes, srcset, and the
 * compiler-flagged meta-refresh / SVG-animation contexts). Shared with the client renderer.
 */
export function isSafeAttributeValue(lname: string, value: unknown, check?: "refresh" | "anim"): boolean;
/** The rel a link needs: for target="_blank", the app's rel plus noopener + noreferrer. */
export function openerRel(target: unknown, rel: unknown): unknown;
/** Attribute names whose values carry a URL (scheme-checked). */
export const URL_ATTRS: ReadonlySet<string>;
/** Build an inline-style string from a plain object, safely (injection-proof). */
export function styleObjectToCss(obj: Record<string, unknown>): string;

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
  /** Compiler-flagged URL context: meta-refresh content or an SVG animation value. */
  check?: "refresh" | "anim";
  /** A target/rel pair merged into one part (opener protection on a/area/form). */
  opener?: boolean;
  target?: AttrPart;
  rel?: AttrPart | null;
}

/**
 * An `html\`…\`` result, viewed without its DOM template. Identity is a runtime
 * Symbol brand, not a field — use {@link isTemplateResult}; an object merely shaped
 * like this is NOT a template result.
 */
export interface TemplateResult {
  __staticHTML: string;
  parts: Part[];
  values: unknown[];
  hasElements: boolean;
}

/** An `each(...)` list marker. */
export interface EachMarker {
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

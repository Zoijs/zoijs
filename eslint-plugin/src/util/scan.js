// Shared helpers for the accessibility rules.
//
// The a11y rules need to look at the STATIC HTML inside an `html\`…\`` template, not
// just its AST. This reconstructs that markup from the template's quasis, replacing
// each `${…}` interpolation with an opaque placeholder (a private-use char that can't
// appear in real source), then offers small tag/attribute tests against it.
//
// This is a deliberately tiny, targeted scanner — NOT a full HTML parser. It's enough
// for the narrow checks the rules make (does this tag have this attribute?), and each
// rule uses its own focused regex on top of it.

/** Stands in for each `${…}` interpolation in the reconstructed template text. */
export const HOLE = "\uE000"; // U+E000 (private-use): cannot appear in real source

/** Is `node` an `html\`…\`` tagged template? (Matches the literal tag name `html`.) */
export function isHtmlTemplate(node) {
  return node.tag && node.tag.type === "Identifier" && node.tag.name === "html";
}

/** The template's static text, with every interpolation replaced by {@link HOLE}. */
export function templateText(node) {
  const qs = node.quasi.quasis;
  let s = qs[0].value.cooked ?? qs[0].value.raw;
  for (let i = 1; i < qs.length; i++) s += HOLE + (qs[i].value.cooked ?? qs[i].value.raw);
  return s;
}

/**
 * Does an opening tag's attribute string contain the attribute `name`, in any value
 * form (`name`, `name="x"`, `name='x'`, or the dynamic `name=${…}`)? Quoted values are
 * stripped first so a value can't masquerade as an attribute name.
 */
export function hasAttr(attrs, name) {
  const stripped = attrs.replace(/=\s*"[^"]*"/g, "=").replace(/=\s*'[^']*'/g, "=");
  return new RegExp("(^|\\s)" + name + "(?=[\\s=/>" + HOLE + "]|$)", "i").test(stripped);
}

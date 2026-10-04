// no-unsafe-html — flags every use of the raw-HTML escape hatch from `@zoijs/core/unsafe`:
// the import (static, dynamic, or re-export) and every unsafeHTML(…) call, including
// renamed imports and namespace access. unsafeHTML() renders its argument as live markup
// without escaping, so each use should be a reviewed, documented decision: after review,
// keep it with `// eslint-disable-next-line zoijs/no-unsafe-html -- <why it's trusted>`.
// It is a warning, not an error — the API is supported; it must just never be unnoticed.

const SUBPATH = "@zoijs/core/unsafe";

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Flag every use of unsafeHTML (raw HTML that bypasses escaping) so it gets reviewed",
      recommended: true,
      url: "https://zoijs.dev/security",
    },
    schema: [],
    messages: {
      importUnsafe: "Import from @zoijs/core/unsafe: raw HTML that bypasses escaping. Review it; for untrusted HTML use @zoijs/sanitize.",
      callUnsafe: "unsafeHTML() renders raw HTML without escaping. Only pass content established as trusted; mark the reviewed use with `// eslint-disable-next-line zoijs/no-unsafe-html -- <reason>`.",
    },
  },

  create(context) {
    const aliases = new Set(["unsafeHTML"]); // local names bound to unsafeHTML (renamed imports)
    const fromUnsafe = (node) => node.source && node.source.type === "Literal" && node.source.value === SUBPATH;
    return {
      ImportDeclaration(node) {
        if (!fromUnsafe(node)) return;
        for (const s of node.specifiers) if (s.type !== "ImportNamespaceSpecifier") aliases.add(s.local.name);
        context.report({ node, messageId: "importUnsafe" });
      },
      ImportExpression(node) {
        if (fromUnsafe(node)) context.report({ node, messageId: "importUnsafe" });
      },
      ExportNamedDeclaration(node) {
        if (fromUnsafe(node)) context.report({ node, messageId: "importUnsafe" });
      },
      ExportAllDeclaration(node) {
        if (fromUnsafe(node)) context.report({ node, messageId: "importUnsafe" });
      },
      CallExpression(node) {
        const c = node.callee;
        const named = c.type === "Identifier" && aliases.has(c.name);
        const member = c.type === "MemberExpression" && !c.computed && c.property.name === "unsafeHTML"; // ns.unsafeHTML(…)
        if (named || member) context.report({ node, messageId: "callUnsafe" });
      },
    };
  },
};

export default rule;

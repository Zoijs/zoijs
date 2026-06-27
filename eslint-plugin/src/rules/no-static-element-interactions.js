// no-static-element-interactions — a click handler on a non-interactive element
// (`<div>` / `<span>`) is invisible to keyboard and screen-reader users: it isn't
// focusable and has no role, so it can't be tabbed to or activated with the keyboard.
// This is the exact "div pretending to be a button" anti-pattern the accessibility
// guide warns about — use a real `<button>` (or `<a href>`).
//
// Narrow by design: only `<div>`/`<span>` with an `onclick` and NO `role` are flagged.
// If you genuinely need it (a custom widget), add `role` + `tabindex` + key handling and
// the rule steps aside.

import { isHtmlTemplate, templateText, hasAttr } from "../util/scan.js";

const STATIC_TAG = /<(div|span)\b((?:"[^"]*"|'[^']*'|[^>])*)>/gi;

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow click handlers on non-interactive `<div>`/`<span>` without a role",
      recommended: true,
      url: "https://zoijs.dev/accessibility",
    },
    schema: [],
    messages: {
      staticInteraction:
        "`<{{tag}}>` has an onclick handler but no role, so keyboard and screen-reader users can't use it. Use a `<button>` (or `<a href>`), or add `role` + `tabindex` + key handling.",
    },
  },

  create(context) {
    return {
      TaggedTemplateExpression(node) {
        if (!isHtmlTemplate(node)) return;
        const text = templateText(node);
        STATIC_TAG.lastIndex = 0;
        let m;
        while ((m = STATIC_TAG.exec(text))) {
          const attrs = m[2];
          if (hasAttr(attrs, "onclick") && !hasAttr(attrs, "role")) {
            context.report({ node, messageId: "staticInteraction", data: { tag: m[1].toLowerCase() } });
          }
        }
      },
    };
  },
};

export default rule;

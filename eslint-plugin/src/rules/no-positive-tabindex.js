// no-positive-tabindex — a `tabindex` greater than 0 forces a custom tab order that
// overrides the natural DOM order, which is confusing and fragile. Use `0` (focusable
// in natural order) or `-1` (focusable only via script, e.g. a route-change focus
// target). Only literal positive values are flagged; a dynamic `tabindex=${…}` is left
// alone (its value isn't known statically).

import { isHtmlTemplate, templateText } from "../util/scan.js";

const TABINDEX = /\btabindex\s*=\s*(["'])(\d+)\1/gi;

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow a positive `tabindex` in `html` templates",
      recommended: true,
      url: "https://zoijs.dev/accessibility",
    },
    schema: [],
    messages: {
      positiveTabindex:
        "Avoid a positive tabindex ({{value}}); it forces a confusing tab order. Use `0` (natural order) or `-1` (programmatic focus only).",
    },
  },

  create(context) {
    return {
      TaggedTemplateExpression(node) {
        if (!isHtmlTemplate(node)) return;
        const text = templateText(node);
        TABINDEX.lastIndex = 0;
        let m;
        while ((m = TABINDEX.exec(text))) {
          if (Number(m[2]) > 0) context.report({ node, messageId: "positiveTabindex", data: { value: m[2] } });
        }
      },
    };
  },
};

export default rule;

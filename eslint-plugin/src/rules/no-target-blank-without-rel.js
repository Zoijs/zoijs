// no-target-blank-without-rel — a link that opens a new tab with `target="_blank"`
// but no `rel="noopener"` is a reverse-tabnabbing risk: the opened page can reach back
// through `window.opener` and navigate the original tab to a phishing copy.
//
// Modern engines imply `noopener` for `target="_blank"`, but not all of Zoijs's
// supported browsers do (Firefox only since 79; Zoijs supports 78), so the explicit
// `rel` is real defense-in-depth. Add `rel="noopener"` (or `rel="noopener noreferrer"`).
//
// Narrow by design: only a *static* `target="_blank"` on `<a>`/`<area>` is flagged.
// A dynamic `target=${…}` or `rel=${…}` is left alone — it can't be judged statically,
// and a dynamic `rel` is assumed to carry the right value.

import { isHtmlTemplate, templateText, HOLE } from "../util/scan.js";

const LINK_TAG = /<(a|area)\b((?:"[^"]*"|'[^']*'|[^>])*)>/gi;
const TARGET_BLANK = new RegExp('(^|\\s)target\\s*=\\s*("_blank"|\'_blank\'|_blank)(?=[\\s/>' + HOLE + ']|$)', "i");
// A `rel` attribute and its value (double-quoted, single-quoted, or a dynamic hole).
const REL = new RegExp("(^|\\s)rel\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|(" + HOLE + "))", "i");
const SAFE_REL = /\bno(opener|referrer)\b/i;

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require `rel=\"noopener\"` on links with `target=\"_blank\"` (reverse-tabnabbing)",
      recommended: true,
      url: "https://zoijs.dev/security",
    },
    schema: [],
    messages: {
      missingRel:
        "`target=\"_blank\"` without `rel=\"noopener\"` lets the opened page control this tab via `window.opener`. Add `rel=\"noopener\"` (or `rel=\"noopener noreferrer\"`).",
    },
  },

  create(context) {
    return {
      TaggedTemplateExpression(node) {
        if (!isHtmlTemplate(node)) return;
        const text = templateText(node);
        LINK_TAG.lastIndex = 0;
        let m;
        while ((m = LINK_TAG.exec(text))) {
          const attrs = m[2];
          if (!TARGET_BLANK.test(attrs)) continue;
          const rel = REL.exec(attrs);
          // No rel at all → unsafe. A dynamic rel=${…} (group 4) is assumed handled.
          // A static rel must contain noopener/noreferrer.
          if (rel && (rel[4] || SAFE_REL.test(rel[2] ?? rel[3] ?? ""))) continue;
          context.report({ node, messageId: "missingRel" });
        }
      },
    };
  },
};

export default rule;

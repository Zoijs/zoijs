// alt-text — every `<img>` in an `html` template needs an `alt` attribute.
//
// A missing `alt` leaves screen-reader users with no idea what an image is (or, worse,
// hears the file name). `alt=""` is the correct choice for a purely decorative image —
// so this only flags a *missing* attribute, never an empty one.

import { isHtmlTemplate, templateText, hasAttr } from "../util/scan.js";

const IMG = /<img\b((?:"[^"]*"|'[^']*'|[^>])*)>/gi;

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require an `alt` attribute on `<img>` elements in `html` templates",
      recommended: true,
      url: "https://zoijs.dev/accessibility",
    },
    schema: [],
    messages: {
      missingAlt:
        "`<img>` is missing an `alt` attribute. Add descriptive `alt` text, or `alt=\"\"` if the image is purely decorative.",
    },
  },

  create(context) {
    return {
      TaggedTemplateExpression(node) {
        if (!isHtmlTemplate(node)) return;
        const text = templateText(node);
        IMG.lastIndex = 0;
        let m;
        while ((m = IMG.exec(text))) {
          if (!hasAttr(m[1], "alt")) context.report({ node, messageId: "missingAlt" });
        }
      },
    };
  },
};

export default rule;

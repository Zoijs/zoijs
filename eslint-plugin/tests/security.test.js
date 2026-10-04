// Tests for the security rules, via ESLint's RuleTester wired into node:test.

import { RuleTester } from "eslint";
import { describe, it } from "node:test";
import noTargetBlankWithoutRel from "../src/rules/no-target-blank-without-rel.js";
import noDynamicStyle from "../src/rules/no-dynamic-style.js";
import noHtmlCall from "../src/rules/no-html-call.js";
import noUnsafeHtml from "../src/rules/no-unsafe-html.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-target-blank-without-rel", noTargetBlankWithoutRel, {
  valid: [
    'html`<a href="/x" target="_blank" rel="noopener">x</a>`',
    'html`<a href="/x" target="_blank" rel="noopener noreferrer">x</a>`',
    'html`<a href="/x" target="_blank" rel="noreferrer">x</a>`', // noreferrer implies noopener
    'html`<a href="/x">same tab</a>`', // no _blank
    'html`<a href="/x" target="_self">x</a>`',
    "html`<a href=${u} target=${t}>x</a>`", // dynamic target — not statically known
    "html`<a href=${u} target=\"_blank\" rel=${r}>x</a>`", // dynamic rel — assumed handled
    'html`<area href="/x" target="_blank" rel="noopener" />`',
    'other`<a target="_blank">x</a>`', // not an html template
  ],
  invalid: [
    { code: 'html`<a href="/x" target="_blank">x</a>`', errors: [{ messageId: "missingRel" }] },
    { code: "html`<a href=${u} target=\"_blank\">x</a>`", errors: [{ messageId: "missingRel" }] },
    { code: "html`<a href=\"/x\" target='_blank'>x</a>`", errors: [{ messageId: "missingRel" }] },
    // rel present but without noopener/noreferrer is still unsafe
    { code: 'html`<a href="/x" target="_blank" rel="nofollow">x</a>`', errors: [{ messageId: "missingRel" }] },
    { code: 'html`<area href="/x" target="_blank" />`', errors: [{ messageId: "missingRel" }] },
  ],
});

ruleTester.run("no-dynamic-style", noDynamicStyle, {
  valid: [
    'html`<div style="color:red">x</div>`', // fully static
    "html`<div class=${cls}>x</div>`", // class binding is the recommended path
    'html`<div data-style=${s}>x</div>`', // not the real style attribute
    "html`<p>${text}</p>`",
    "other`<div style=${s}>x</div>`", // not an html template
  ],
  invalid: [
    { code: "html`<div style=${s}>x</div>`", errors: [{ messageId: "dynamicStyle" }] },
    { code: "html`<div style=\"${s}\">x</div>`", errors: [{ messageId: "dynamicStyle" }] },
    { code: "html`<div style=\"width:${pct}%\">x</div>`", errors: [{ messageId: "dynamicStyle" }] },
    { code: "html`<span style='color:${c}'>x</span>`", errors: [{ messageId: "dynamicStyle" }] },
  ],
});

ruleTester.run("no-html-call", noHtmlCall, {
  valid: [
    "html`<p>${value}</p>`",
    "html`<div>${() => count.get()}</div>`",
    "other(['<b>x</b>'])", // not html
    "obj.html(x)", // a different html (member of another object)
    "const t = html; ", // referenced, not called
  ],
  invalid: [
    { code: "html(['<img src=x onerror=alert(1)>'])", errors: [{ messageId: "directCall" }] },
    { code: "html(strings)", errors: [{ messageId: "directCall" }] },
    { code: "html(userInput.split('|'))", errors: [{ messageId: "directCall" }] },
    { code: "html.call(null, ['<b>x</b>'])", errors: [{ messageId: "directCall" }] },
    { code: "html.apply(null, [['<b>x</b>']])", errors: [{ messageId: "directCall" }] },
    { code: "Reflect.apply(html, null, [['<b>x</b>']])", errors: [{ messageId: "directCall" }] },
  ],
});

ruleTester.run("no-unsafe-html", noUnsafeHtml, {
  valid: [
    "html`<p>${value}</p>`",
    'import { html } from "@zoijs/core"; html`<div>${sanitize(body)}</div>`',
    'import { sanitize } from "@zoijs/sanitize";',
    "const unsafe = 1; unsafe(x)", // a different name
    'import x from "@zoijs/core/unsafe-ish";', // a different module
  ],
  invalid: [
    {
      code: 'import { unsafeHTML } from "@zoijs/core/unsafe"; html`<article>${unsafeHTML(trusted)}</article>`',
      errors: [{ messageId: "importUnsafe" }, { messageId: "callUnsafe" }],
    },
    {
      code: 'import { unsafeHTML as raw } from "@zoijs/core/unsafe"; raw(x);',
      errors: [{ messageId: "importUnsafe" }, { messageId: "callUnsafe" }],
    },
    {
      code: 'import * as U from "@zoijs/core/unsafe"; U.unsafeHTML(x);',
      errors: [{ messageId: "importUnsafe" }, { messageId: "callUnsafe" }],
    },
    { code: 'const m = await import("@zoijs/core/unsafe");', errors: [{ messageId: "importUnsafe" }] },
    { code: 'export { unsafeHTML } from "@zoijs/core/unsafe";', errors: [{ messageId: "importUnsafe" }] },
    { code: 'export * from "@zoijs/core/unsafe";', errors: [{ messageId: "importUnsafe" }] },
    { code: "unsafeHTML(markup)", errors: [{ messageId: "callUnsafe" }] }, // e.g. via a re-export
  ],
});

// Tests for the security rules, via ESLint's RuleTester wired into node:test.

import { RuleTester } from "eslint";
import { describe, it } from "node:test";
import noTargetBlankWithoutRel from "../src/rules/no-target-blank-without-rel.js";
import noDynamicStyle from "../src/rules/no-dynamic-style.js";

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

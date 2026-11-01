// Tests for the accessibility rules, via ESLint's RuleTester wired into node:test.

import { RuleTester } from "eslint";
import { describe, it } from "node:test";
import altText from "../src/rules/alt-text.js";
import noPositiveTabindex from "../src/rules/no-positive-tabindex.js";
import noStaticElementInteractions from "../src/rules/no-static-element-interactions.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("alt-text", altText, {
  valid: [
    "html`<img src=\"/logo.png\" alt=\"Acme logo\" />`",
    "html`<img src=${src} alt=${label} />`",
    'html`<img src="/spacer.gif" alt="" />`', // decorative: empty alt is correct
    "html`<p>no image here</p>`",
    "html`<picture><img src=${s} alt=\"x\" /></picture>`",
    "other`<img src=\"/x.png\" />`", // not an html template
  ],
  invalid: [
    { code: "html`<img src=\"/logo.png\" />`", errors: [{ messageId: "missingAlt" }] },
    { code: "html`<img src=${src} />`", errors: [{ messageId: "missingAlt" }] },
    // alt must be the real attribute, not a substring of another (data-alt isn't alt)
    { code: "html`<img src=${s} data-alt=\"x\" />`", errors: [{ messageId: "missingAlt" }] },
    { code: "html`<div><img src=\"a\"><img src=\"b\" alt=\"ok\"></div>`", errors: [{ messageId: "missingAlt" }] },
  ],
});

ruleTester.run("no-positive-tabindex", noPositiveTabindex, {
  valid: [
    'html`<div tabindex="0">x</div>`',
    'html`<main tabindex="-1">x</main>`',
    "html`<div tabindex=${n}>x</div>`", // dynamic — not statically known
    "html`<button>x</button>`",
  ],
  invalid: [
    { code: 'html`<div tabindex="1">x</div>`', errors: [{ messageId: "positiveTabindex" }] },
    { code: "html`<span tabindex='3'>x</span>`", errors: [{ messageId: "positiveTabindex" }] },
  ],
});

ruleTester.run("no-static-element-interactions", noStaticElementInteractions, {
  valid: [
    "html`<button onclick=${f}>Go</button>`",
    "html`<a href=${href} onclick=${f}>Go</a>`",
    'html`<div role="button" tabindex="0" onclick=${f}>Go</div>`', // opted in with a role
    "html`<div class=\"card\">${content}</div>`", // no handler
    "html`<span>${label}</span>`",
  ],
  invalid: [
    { code: "html`<div onclick=${f}>Go</div>`", errors: [{ messageId: "staticInteraction" }] },
    { code: "html`<span onclick=${f}>Go</span>`", errors: [{ messageId: "staticInteraction" }] },
  ],
});

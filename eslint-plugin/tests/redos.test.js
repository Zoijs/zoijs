// ReDoS regression (CodeQL js/redos + js/polynomial-redos): the tag scanners of the template rules
// must stay linear on hostile input. With the old `[^>]` catch-all, an unclosed tag holding 24
// pairs of quotes took ~50 s and every extra pair ~4× longer; these inputs (1–2k quotes) would
// never finish.

import { Linter } from "eslint";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import altText from "../src/rules/alt-text.js";
import noDynamicStyle from "../src/rules/no-dynamic-style.js";
import noStaticElementInteractions from "../src/rules/no-static-element-interactions.js";
import noTargetBlankWithoutRel from "../src/rules/no-target-blank-without-rel.js";

const RULES = {
  "alt-text": altText,
  "no-dynamic-style": noDynamicStyle,
  "no-static-element-interactions": noStaticElementInteractions,
  "no-target-blank-without-rel": noTargetBlankWithoutRel,
};
const TAG = { "alt-text": "img", "no-dynamic-style": "p", "no-static-element-interactions": "div", "no-target-blank-without-rel": "a" };

const HOSTILE = process.argv[2] === "--hostile"; // child-process mode (below): no tests registered
const it = HOSTILE ? () => {} : test;
const linter = new Linter({ configType: "flat" });
const lint = (name, code) =>
  linter.verify(code, [{ languageOptions: { ecmaVersion: 2022, sourceType: "module" }, plugins: { z: { rules: RULES } }, rules: { [`z/${name}`]: "error" } }]);

// Template text is a JS template literal: escape backticks/backslashes/${ for embedding.
const tpl = (html) => "html`" + html.replace(/[`\\]/g, "\\$&").replace(/\$\{/g, "\\${") + "`";

// Catastrophic backtracking blocks the event loop, so node:test's own timeout can't stop it: the
// hostile inputs run in a child process that is killed after HARD_LIMIT_MS. A regression then
// fails fast and clearly instead of hanging CI.
// Generous for a slow, busy CI machine: the fixed scanners finish in well under a second here,
// while the vulnerable pattern grows exponentially (48 quotes already took ~50 s) and never does.
const HARD_LIMIT_MS = 10_000;
const BODIES = [`"`.repeat(2000), `""`.repeat(1000), `''`.repeat(1000), `"'`.repeat(1000), ` a="x"`.repeat(500) + ` "`, `='`.repeat(1000)];

// One child for all four rules (loading ESLint is the slow part); it prints each rule's name once
// that rule is done, so a hang still names the rule that hung.
it("every template-rule tag scanner is linear on unclosed tags full of quotes", () => {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--hostile"], { timeout: HARD_LIMIT_MS, encoding: "utf8" });
  const done = child.stdout.split("\n").filter(Boolean);
  const hung = Object.keys(RULES).find((name) => !done.includes(name));
  assert.notEqual(child.signal, "SIGTERM", `${hung} didn't finish within ${HARD_LIMIT_MS} ms on hostile input — catastrophic regex backtracking`);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(done, Object.keys(RULES));
});

it("quoted values may still contain '>' and the other quote", () => {
  assert.equal(lint("alt-text", tpl(`<img src="/a.png" alt="a > b" />`)).length, 0);
  assert.equal(lint("alt-text", tpl(`<img alt='it"s' src=x>`)).length, 0);
  assert.equal(lint("alt-text", tpl(`<img src="x>y" />`)).length, 1, "a '>' inside a value doesn't end the tag");
  assert.equal(lint("no-target-blank-without-rel", tpl(`<a href="/x" title="a > b" target="_blank">x</a>`)).length, 1);
  assert.equal(lint("no-target-blank-without-rel", tpl(`<a href="/x" title='a > "b"' target="_blank" rel="noopener">x</a>`)).length, 0);
  assert.equal(lint("no-static-element-interactions", tpl(`<div title="a > b" onclick=${"$"}{f}>x</div>`)).length, 1);
});

it("a tag with a stray (unbalanced) quote is invalid HTML and is skipped, never hangs", () => {
  // Unquoted attribute values can't contain quotes, so this tag can't be read reliably.
  assert.equal(lint("alt-text", tpl(`<img src=it's.png>`)).length, 0);
  // …and the scanner moves on: a later, well-formed tag is still checked.
  assert.equal(lint("alt-text", tpl(`<img src=it's.png> <p>x</p> <img src="b.png">`)).length, 1);
});

// Child-process mode: lint every hostile input with each rule, printing each rule's name when done.
if (HOSTILE) {
  for (const name of Object.keys(RULES)) {
    const t = TAG[name];
    for (const body of BODIES) {
      lint(name, tpl(`<${t} ${body}`));
      lint(name, tpl(`<${t} ${body}`.repeat(3) + `>`));
    }
    console.log(name);
  }
}

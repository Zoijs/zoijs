// Tests for the require-reactive-binding rule, via ESLint's RuleTester wired into
// node:test (so `node --test` reports each valid/invalid case as a test).

import { RuleTester } from "eslint";
import { describe, it } from "node:test";
import rule from "../src/rules/require-reactive-binding.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("require-reactive-binding", rule, {
  valid: [
    // The correct idiom: the read is deferred behind an arrow.
    "html`<p>${() => count.get()}</p>`",
    // .peek() is the sanctioned one-time read.
    "html`<p>${count.peek()}</p>`",
    // Inside an event handler — deferred, so reactive-safe.
    "html`<button onclick=${() => count.set(count.get() + 1)}>x</button>`",
    // Inside each/effect/computed callbacks — all deferred.
    "html`<ul>${each(() => list.get(), (x) => x.id, (x) => html`<li>${() => x.name}</li>`)}</ul>`",
    // Map/params-style .get(key) takes an argument — not a Zoijs reactive read.
    "html`<p>${config.get('title')}</p>`",
    // A bare member access, not a call.
    "html`<p>${obj.get}</p>`",
    // A plain static value.
    "html`<p>${greeting}</p>`",
    // .get() outside any template is not this rule's concern.
    "const x = count.get();",
    // A different tag is ignored.
    "other`<p>${count.get()}</p>`",
  ],
  invalid: [
    {
      // The textbook footgun: static read in a child slot.
      code: "html`<p>${count.get()}</p>`",
      output: "html`<p>${() => count.get()}</p>`",
      errors: [{ messageId: "staticRead" }],
    },
    {
      // Reached through a member chain — still eager.
      code: "html`<h1>${user.get().name}</h1>`",
      output: "html`<h1>${() => user.get().name}</h1>`",
      errors: [{ messageId: "staticRead" }],
    },
    {
      // In an attribute position, inside a larger expression.
      code: "html`<p class=${active.get() ? 'on' : 'off'}>x</p>`",
      output: "html`<p class=${() => active.get() ? 'on' : 'off'}>x</p>`",
      errors: [{ messageId: "staticRead" }],
    },
    {
      // Multiple eager reads in one interpolation → one report, one wrap.
      code: "html`<p>${a.get() + b.get()}</p>`",
      output: "html`<p>${() => a.get() + b.get()}</p>`",
      errors: [{ messageId: "staticRead" }],
    },
    {
      // A nested template's static read is nudged toward a fine-grained binding.
      code: "const f = () => html`<span>${inner.get()}</span>`;",
      output: "const f = () => html`<span>${() => inner.get()}</span>`;",
      errors: [{ messageId: "staticRead" }],
    },
  ],
});

// Type tests for @zoijs/sanitize's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { sanitize } from "../src/index.js";

// sanitize() returns an array of DOM nodes.
const nodes: Node[] = sanitize("<b>hi</b>");

// It accepts unknown input (a string is the common case, but it coerces).
sanitize("<p>ok</p>");
sanitize(null);
sanitize(undefined);
sanitize(42);

// @ts-expect-error — the result is Node[], not a string
const asString: string = sanitize("<b>hi</b>");

// @ts-expect-error — sanitize needs an argument
sanitize();

void [nodes, asString];

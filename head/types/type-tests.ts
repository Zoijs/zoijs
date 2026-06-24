// Type tests for @zoijs/head's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { title, description, meta } from "../src/index.js";

title("Home | Zoijs App");
description("A page description.");
meta("keywords", "zoijs, frontend");

// @ts-expect-error — title needs a string
title();

// @ts-expect-error — title takes a string, not a number
title(123);

// @ts-expect-error — meta needs content
meta("author");

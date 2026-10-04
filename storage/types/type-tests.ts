// Type tests for @zoijs/storage's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { storage } from "../src/index.js";
import type { PersistentState } from "../src/index.js";

const theme: PersistentState<string> = storage("theme", "light");
const t: string = theme.get();
const p: string = theme.peek();
theme.set("dark");

const count: PersistentState<number> = storage("count", 0);
const n: number = count.get();
count.set(5);

interface Prefs {
  lang: string;
  compact: boolean;
}
const prefs: PersistentState<Prefs> = storage<Prefs>("prefs", { lang: "en", compact: false });
const lang: string = prefs.get().lang;

// @ts-expect-error — storage needs a key and an initial value
storage();

// @ts-expect-error — set() takes the same type T (number), not a string
count.set("nope");

// @ts-expect-error — peek() takes no arguments
theme.peek("x");

void [theme, t, p, count, n, prefs, lang];

// ---- SEC-10: validate ---------------------------------------------------------------
const validated = storage("theme", "light", { validate: (v) => v === "light" || v === "dark" });
const themeValue: string = validated.get();
// @ts-expect-error — validate must return a boolean
storage("theme", "light", { validate: (v: unknown) => v });

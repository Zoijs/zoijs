// Type tests for @zoijs/action's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { action } from "../src/index.js";
import type { Action } from "../src/index.js";

interface User {
  id: number;
  name: string;
}

const save: Action<[string], User> = action(async (name: string) => ({ id: 1, name }));

const p: Promise<User | undefined> = save.run("Ada");
const pending: boolean = save.pending();
const err: unknown = save.error();
const done: boolean = save.done();
const result: User | undefined = save.result();
const name: string = save.result()?.name ?? "";
save.reset();

// a synchronous fn is allowed (TResult | Promise<TResult>)
const inc = action((n: number) => n + 1);
const r: Promise<number | undefined> = inc.run(2);

// @ts-expect-error — wrong argument type
save.run(123);

// @ts-expect-error — action needs a function
action();

void [save, p, pending, err, done, result, name, inc, r];

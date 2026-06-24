// Type tests for @zoijs/resource's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { resource } from "../src/index.js";
import type { Resource } from "../src/index.js";

interface User {
  name: string;
}

const user: Resource<User> = resource(() =>
  Promise.resolve({ name: "Ada" })
);

const loading: boolean = user.loading();
const err: unknown = user.error();
const data: User | undefined = user.data();
const name: string = user.data()?.name ?? "";
user.refresh();

// a synchronous fetcher is allowed (T | Promise<T>)
const count: Resource<number> = resource(() => 42);
const n: number | undefined = count.data();

// @ts-expect-error — resource needs a fetcher
resource();

// @ts-expect-error — data() takes no arguments
user.data("x");

void [user, loading, err, data, name, count, n];

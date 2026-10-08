// Type tests for @zoijs/api's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { api, ApiError } from "../src/index.js";
import type { ApiResource, ApiErrorType } from "../src/index.js";
import type { Resource } from "@zoijs/resource";

interface Task {
  id: string;
  title: string;
}

const tasks: ApiResource<Task[]> = api<Task[]>("/api/tasks");
const asResource: Resource<Task[]> = tasks; // still a resource
const loading: boolean = tasks.loading();
const data: Task[] | undefined = tasks.data();
const first: string = tasks.data()?.[0]?.title ?? "";
tasks.refresh();

const err: ApiError | null = tasks.error();
const status: number | null | undefined = tasks.error()?.status;
const type: ApiErrorType | undefined = tasks.error()?.type;
const method: "GET" | undefined = tasks.error()?.method;

// the default data type is unknown — narrow it before use
const raw = api("/api/raw");
const rawData: unknown = raw.data();
// @ts-expect-error — unknown data can't be used without narrowing
raw.data().length;

const e = new ApiError("x", { type: "http", status: 404 });
const isError: Error = e;

// @ts-expect-error — the URL must be a string
api(new URL("https://app.example.com/api"));

// @ts-expect-error — no options: api() always performs a GET
api("/api/tasks", { method: "POST" });

// @ts-expect-error — not a known error type
new ApiError("x", { type: "timeout" });

void [asResource, loading, data, first, err, status, type, method, rawData, isError];

// ---- Phase 2: params / query --------------------------------------------------------------------
import type { ApiOptions, ApiParamValue, ApiQueryValue } from "../src/index.js";

declare const id: string;
declare const search: { get(): string };
declare const page: { get(): number };

const task: ApiResource<Task> = api<Task>("/api/tasks/:id", { params: { id } });
api("/api/users/:id", { params: { id: 1 } });
api("/api/users/:id", { params: { id: 1n } });
api("/api/flags/:on", { params: { on: true } });
api("/api/search", { query: { q: "zoijs", page: 2, big: 3n, exact: true, missing: null, other: undefined } });
api("/api/search", { query: () => ({ q: search.get(), page: page.get() }) });
api("/api/search", { params: {}, query: {} });
const opts: ApiOptions = { query: { q: "x" } };
api("/x", opts);
const pv: ApiParamValue = "x";
const qv: ApiQueryValue = null;
const configType: ApiErrorType = "config";

// @ts-expect-error — no method option: api() is GET-only
api("/users", { method: "POST" });
// @ts-expect-error — no headers option
api("/users", { headers: {} });
// @ts-expect-error — params can't be null
api("/users/:id", { params: { id: null } });
// @ts-expect-error — params can't be objects
api("/users/:id", { params: { id: { nested: 1 } } });
// @ts-expect-error — query values can't be objects
api("/search", { query: { filter: { active: true } } });
// @ts-expect-error — query values can't be arrays (not supported yet)
api("/search", { query: { tags: ["a", "b"] } });
// @ts-expect-error — pass a function, not a state object
api("/search", { query: { q: search } });
// @ts-expect-error — the query function must return an object of query values
api("/search", { query: () => ({ q: { deep: 1 } }) });
// @ts-expect-error — at most two arguments
api("/search", {}, {});

void [task, pv, qv, configType];

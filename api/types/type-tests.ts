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
const method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | undefined = tasks.error()?.method;

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
new ApiError("x", { type: "teapot" });

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
api("/search", { query: { tags: ["a", "b"] } }); // arrays are repeated keys (Phase 3)
// @ts-expect-error — pass a function, not a state object
api("/search", { query: { q: search } });
// @ts-expect-error — the query function must return an object of query values
api("/search", { query: () => ({ q: { deep: 1 } }) });
// @ts-expect-error — at most two arguments
api("/search", {}, {});

void [task, pv, qv, configType];

// ---- Phase 3: dispose, debounce, reactive params, query arrays ----------------------------------
import type { ApiParams, ApiQueryScalar } from "../src/index.js";

declare const tags: { get(): readonly string[] };
declare const userId: { get(): string };

const live = api<Task>("/api/users/:id", { params: () => ({ id: userId.get() }), debounce: 250 });
live.dispose();
const disposeFn: () => void = live.dispose;
api("/products", { query: { tag: ["new", "featured"], n: [1, 2], b: [true, null, undefined], big: [1n] } });
const frozenTags: readonly string[] = Object.freeze(["a", "b"]);
api("/products", { query: { tag: frozenTags } });
api("/search/:scope", { params: () => ({ scope: "docs" }), query: () => ({ q: search.get(), tag: tags.get() }), debounce: 250 });
const p3: ApiParams = { id: 1 };
const s3: ApiQueryScalar = undefined;

// @ts-expect-error — nested arrays aren't supported
api("/p", { query: { filter: [["a"]] } });
// @ts-expect-error — no objects inside arrays
api("/p", { query: { filter: [{ name: "a" }] } });
// @ts-expect-error — debounce is a number of milliseconds
api("/p", { query: () => ({}), debounce: "250" });
// @ts-expect-error — params functions return param values, not arrays
api("/u/:id", { params: () => ({ id: ["1"] }) });
// @ts-expect-error — params functions can't return null values
api("/u/:id", { params: () => ({ id: null }) });

void [disposeFn, p3, s3];

// ---- Phase 4: mutations ---------------------------------------------------------------------------
import type { ApiMutation, ApiJson, ApiMethod } from "../src/index.js";

interface NewTask { title: string }
const taskList = api<Task[]>("/api/tasks");
const addTask = api.post<Task, NewTask>("/api/tasks", { invalidate: taskList, exclusive: true });
addTask.run({ title: "Learn Zoijs" });
const added: Promise<Task | undefined> = addTask.run({ title: "x" });
const pendingNow: boolean = addTask.pending();
const doneNow: boolean = addTask.done();
const lastTask: Task | undefined = addTask.result();
const mErr: ApiError | null = addTask.error();
const mMethod: ApiMethod | undefined = addTask.error()?.method;
addTask.reset();

const updateTask = api.put<Task, Partial<Task>>("/api/tasks/:id");
updateTask.run({ params: { id: 1 }, body: { title: "Updated" } });
api.patch("/api/tasks/:id").run({ params: { id: "a" }, body: { completed: true } });
api.patch("/api/tasks/:id").run({ params: { id: "a" } });
const removeTask: ApiMutation<unknown, { readonly params: { readonly [n: string]: string | number | bigint | boolean } }> = api.delete("/api/tasks/:id", { invalidate: [taskList], query: { hard: true } });
removeTask.run({ params: { id: 42 } });
api.delete("/api/tasks").run();
api.post("/api/x").run();
api.post("/api/x").run([1, "a", null, { nested: true }]);
const jsonBody: ApiJson = { a: [1, { b: null }], c: undefined };

// @ts-expect-error — mutation factories don't take headers
api.post("/x", { headers: {} });
// @ts-expect-error — nor a method
api.post("/x", { method: "PUT" });
// @ts-expect-error — mutation queries are static
api.delete("/x", { query: () => ({}) });
// @ts-expect-error — invalidate takes api() resources
api.post("/x", { invalidate: { refresh() {} } });
// @ts-expect-error — exclusive is a boolean
api.post("/x", { exclusive: "yes" });
// @ts-expect-error — DELETE sends no body
api.delete("/tasks/:id").run({ params: { id: 1 }, body: {} });
// @ts-expect-error — bigint isn't JSON
api.post("/x").run({ amount: 10n });
// @ts-expect-error — functions aren't JSON
api.post("/x").run({ fn: () => 1 });
// @ts-expect-error — the typed body is enforced
addTask.run({ nope: 1 });
// @ts-expect-error — api.get doesn't exist: api(url) is the GET
api.get("/x");

void [added, pendingNow, doneNow, lastTask, mErr, mMethod, jsonBody];

// ---- Phase 5: timeout, problem details, initial, FormData -----------------------------------------
import type { ApiProblem } from "../src/index.js";

const timed = api<Task[]>("/api/tasks", { timeout: 10_000, problemDetails: true, initial: [] });
const seededData: Task[] | undefined = timed.data();
const prob: ApiProblem | null | undefined = timed.error()?.problem;
const detail: string | undefined = timed.error()?.problem?.detail;
const timeoutType: ApiErrorType = "timeout";
api<Task>("/api/tasks/:id", { initial: undefined, params: () => ({ id: "1" }) });
const upload = api.post("/upload", { timeout: 15_000, problemDetails: true, exclusive: true });
upload.run(new FormData());
api.post("/users/:id/photo").run({ params: { id: 1 }, body: new FormData() });
addTask.run(new FormData()); // typed JSON body, or a FormData
const typedUpdate = api.patch<Task, Partial<Task>>("/api/tasks/:id");
typedUpdate.run({ params: { id: 1 }, body: { title: "x" } });
typedUpdate.run({ params: { id: 1 }, body: new FormData() });

// @ts-expect-error — the seed must match the resource's type
api<Task[]>("/api/tasks", { initial: "nope" });
// @ts-expect-error — mutations have no initial
api.post("/x", { initial: {} });
// @ts-expect-error — timeout is milliseconds
api("/x", { timeout: "10s" });
// @ts-expect-error — problemDetails is a boolean
api.post("/x", { problemDetails: 1 });
// @ts-expect-error — no reactive timeout
api("/x", { timeout: () => 1000 });
// @ts-expect-error — Blob bodies aren't supported
api.post("/x").run(new Blob(["x"]));
// @ts-expect-error — URLSearchParams bodies aren't supported
api.post("/x").run(new URLSearchParams());
// @ts-expect-error — DELETE still sends no body
api.delete("/x/:id").run({ params: { id: 1 }, body: new FormData() });
// @ts-expect-error — problem members are read-only
timed.error()!.problem!.detail = "x";

void [seededData, prob, detail, timeoutType];

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

// ---- Phase 6: idempotency keys and retries ---------------------------------------------------------
const createOrder = api.post<{ id: number }, { sku: string; quantity: number }>("/orders", { idempotencyKey: true, retry: 2, retryDelay: 500, timeout: 10_000, exclusive: true });
createOrder.run({ sku: "ABC-123", quantity: 1 });
api.delete("/orders/:id", { idempotencyKey: true, retry: 5 });
api.patch("/x", { idempotencyKey: false, retry: 0 });

// @ts-expect-error — retry is 0–5
api.post("/x", { idempotencyKey: true, retry: 6 });
// @ts-expect-error — retry is a whole number
api.post("/x", { idempotencyKey: true, retry: 1.5 });
// @ts-expect-error — idempotencyKey is a boolean (custom keys aren't supported yet)
api.post("/x", { idempotencyKey: "my-key" });
// @ts-expect-error — retryDelay is milliseconds
api.post("/x", { idempotencyKey: true, retry: 1, retryDelay: "250" });
api("/x", { retry: 1 }); // GET retries are allowed since Phase 8 (no idempotency key needed)
// @ts-expect-error — nor take idempotency keys
api("/x", { idempotencyKey: true });

// ---- Phase 7: key functions, retry status, invalid combinations -----------------------------------------
import type { ApiMutationOptions, ApiIdempotencyKey, ApiRetryCount } from "../src/index.js";

const keyed = api.post<{ id: number }, { sku: string }>("/orders", { idempotencyKey: () => "op-1", retry: 2 });
const att: number = keyed.attempt();
const rtr: boolean = keyed.retrying();
api.post("/orders", { idempotencyKey: () => "op-1" });
api.post("/orders", { idempotencyKey: true, retry: 5, retryDelay: 100 });
api.post("/orders", { idempotencyKey: false });
api.post("/orders", { retry: 0 });
api.post("/orders", {});
const okOpts: ApiMutationOptions = { idempotencyKey: true, retry: 1, timeout: 1000, exclusive: true };
const k: ApiIdempotencyKey = () => "x";
const rc: ApiRetryCount = 3;

// @ts-expect-error — retry without an idempotency key
api.post("/orders", { retry: 2 });
// @ts-expect-error — retry with idempotencyKey: false
api.post("/orders", { idempotencyKey: false, retry: 2 });
// @ts-expect-error — retryDelay without retry
api.post("/orders", { idempotencyKey: true, retryDelay: 100 });
// @ts-expect-error — retryDelay with retry: 0
api.post("/orders", { idempotencyKey: true, retry: 0, retryDelay: 100 });
// @ts-expect-error — a fixed string key would be reused for every run()
api.post("/orders", { idempotencyKey: "checkout-abc" });
// @ts-expect-error — the key function returns a string
api.post("/orders", { idempotencyKey: () => 42 });
// @ts-expect-error — retry counts are 1–5 literals, not any number
api.post("/orders", { idempotencyKey: true, retry: 7 });
declare const someNumber: number;
// @ts-expect-error — a plain number could be anything: pass a literal 1–5
api.post("/orders", { idempotencyKey: true, retry: someNumber });
// @ts-expect-error — attempt() takes no arguments
keyed.attempt(1);

void [att, rtr, okOpts, k, rc];

// ---- Phase 8: GET retries ---------------------------------------------------------------------------------
const retried = api<Task[]>("/api/tasks", { retry: 2, retryDelay: 100, timeout: 5000, problemDetails: true });
const retriedData: Task[] | undefined = retried.data();
api("/api/tasks", { retry: 0 });
api("/api/tasks", { retry: 5, query: () => ({ q: "x" }), debounce: 250, initial: [] });

// @ts-expect-error — retryDelay needs retry
api("/api/tasks", { retryDelay: 100 });
// @ts-expect-error — retry 0 takes no retryDelay
api("/api/tasks", { retry: 0, retryDelay: 100 });
// @ts-expect-error — GET retry counts are 1–5 literals too
api("/api/tasks", { retry: 6 });
// @ts-expect-error — no idempotency keys on GET
api("/api/tasks", { retry: 1, idempotencyKey: true });
// @ts-expect-error — no exclusive on GET
api("/api/tasks", { exclusive: true });
// @ts-expect-error — the seed still has to match T
api<Task[]>("/api/tasks", { retry: 1, initial: 1 });

void [retriedData];

// ---- Phase 10: createApi() ------------------------------------------------------------------------
import { createApi } from "../src/index.js";
import type { Api, ApiClient, CreateApiOptions } from "../src/index.js";

const billingOptions: CreateApiOptions = { baseURL: "https://billing.example.com/v1/" };
const billing: ApiClient = createApi(billingOptions);
const sameSurface: Api = billing; // a client is the same request surface as api
const base: string = billing.baseURL;
const invoices: ApiResource<{ id: string }[]> = billing<{ id: string }[]>("/invoices", { query: { page: 1 }, retry: 2, timeout: 5000 });
const invoice = billing<{ id: string }>("/invoices/:id", { params: () => ({ id }), debounce: 100, problemDetails: true });
const pay = billing.post<{ ok: boolean }, { amount: number }>("/payments", { idempotencyKey: true, retry: 3, invalidate: [invoices, tasks] });
pay.run({ amount: 5 });
billing.put("/invoices/:id").run({ params: { id }, body: { paid: true } });
billing.patch("/invoices/:id", { exclusive: true }).run({ params: { id }, body: new FormData() });
billing.delete("/invoices/:id").run({ params: { id } });
// a mutation from api() can invalidate a client resource, and vice versa
api.post("/api/sync", { invalidate: invoice });

// @ts-expect-error — baseURL is required
createApi({});
// @ts-expect-error — no headers (a Bearer token goes through `auth`)
createApi({ baseURL: "https://api.example.com", headers: { Authorization: "Bearer x" } });
// @ts-expect-error — credentials can't be configured
createApi({ baseURL: "https://api.example.com", credentials: "include" });
// @ts-expect-error — baseURL is a string, not a URL object
createApi({ baseURL: new URL("https://api.example.com") });
// @ts-expect-error — the boundary is read-only
billing.baseURL = "https://evil.example";
// @ts-expect-error — retry still needs an idempotency key on a client
billing.post("/payments", { retry: 1 });
// @ts-expect-error — the default api has no client configuration
api.baseURL;

void [sameSurface, base];

// ---- Phase 11: Bearer authentication --------------------------------------------------------------
import type { ApiAuthProvider } from "../src/index.js";

declare function currentToken(): string | null;
declare function fetchToken(): Promise<string | undefined>;
const syncAuth: ApiAuthProvider = () => currentToken();
const asyncAuth: ApiAuthProvider = fetchToken;
const authed: ApiClient = createApi({ baseURL: "https://api.example.com", auth: syncAuth });
createApi({ baseURL: "https://api.example.com", auth: asyncAuth });
createApi({ baseURL: "https://api.example.com", auth: () => null });
createApi({ baseURL: "https://api.example.com", auth: async () => undefined });
createApi({ baseURL: "https://api.example.com", auth: undefined });
authed<{ id: string }>("/me", { retry: 2 }).refresh();
authed.post("/orders", { idempotencyKey: true, retry: 2 }).run({ total: 1 });
const authType: ApiErrorType = "auth";

// @ts-expect-error — the token itself is not accepted, only a provider
createApi({ baseURL: "https://api.example.com", auth: "my-token" });
// @ts-expect-error — a provider must return a string, null or undefined
createApi({ baseURL: "https://api.example.com", auth: () => 42 });
// @ts-expect-error — a provider takes no arguments
createApi({ baseURL: "https://api.example.com", auth: (scope: string) => scope });
// @ts-expect-error — arbitrary headers stay unsupported
createApi({ baseURL: "https://api.example.com", headers: { Authorization: "Bearer x" } });
// @ts-expect-error — the provider is private
authed.auth;
// @ts-expect-error — and there's no token property
authed.token;

void [authType];

// ---- Phase 12: abortable providers, authTimeout ------------------------------------------------------
import type { ApiAuthContext } from "../src/index.js";

declare function fetchTokenWith(init: { signal: AbortSignal }): Promise<string>;
const abortable: ApiAuthProvider = ({ signal }) => fetchTokenWith({ signal });
const usesContext = (ctx: ApiAuthContext): string => (ctx.signal.aborted ? "" : "t");
createApi({ baseURL: "https://api.example.com", auth: abortable, authTimeout: 10_000 });
createApi({ baseURL: "https://api.example.com", auth: usesContext });
createApi({ baseURL: "https://api.example.com", auth: () => "still fine without the context" });

// @ts-expect-error — authTimeout is a number of milliseconds
createApi({ baseURL: "https://api.example.com", auth: abortable, authTimeout: "10s" });
// @ts-expect-error — the context is read-only
const readonlySignal: ApiAuthProvider = (ctx) => ((ctx.signal = new AbortController().signal), "t");
// @ts-expect-error — and the client exposes no authTimeout
createApi({ baseURL: "https://api.example.com" }).authTimeout;

void [readonlySignal];

// ---- Phase 13: URL-typed params ---------------------------------------------------------------------

import type { ApiPathParamNames, ApiPathParams, ApiMutationInput, ApiDeleteRunInput, ApiDeleteInput } from "../src/index.js";
type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>() => {};
assertType<Equal<ApiPathParamNames<"/api/users/:id/posts/:postId">, "id" | "postId">>();
assertType<Equal<ApiPathParamNames<"/api/users/:id?tab=1#top">, "id">>();
assertType<Equal<ApiPathParamNames<":id/x">, "id">>();
assertType<Equal<ApiPathParamNames<"./data/tasks/:file">, "file">>();
assertType<Equal<ApiPathParamNames<"/api/users">, never>>();
assertType<Equal<ApiPathParams<string>, ApiParams>>();

// A literal URL checks param names — in objects and in reactive functions…
api("/api/users/:id/posts/:postId", { params: { id: 1, postId: "a" } });
api("/api/users/:id", { params: () => ({ id: search.get() }) });
// @ts-expect-error — misspelled param name
api("/api/users/:id", { params: { userId: 1 } });
// @ts-expect-error — misspelled in a reactive function too
api("/api/users/:id", { params: () => ({ userid: 1 }) });
// @ts-expect-error — an extra name next to a valid one, in an object
api("/api/users/:id", { params: { id: 1, extra: 2 } });
// @ts-expect-error — values are still ApiParamValue
api("/api/users/:id", { params: { id: {} } });
// …while code written against the loose types keeps compiling
declare const looseParams: ApiParams;
api("/api/users/:id", { params: looseParams });
declare const someUrl: string;
api(someUrl, { params: { anything: 1 } });
api<Task>("/api/tasks/:taskId", { params: { taskId: 1 } }); // explicit T: the URL isn't inferred, loose

// Mutations: the URL decides what run() takes, as at runtime
const create = api.post<Task, NewTask>("/api/tasks");
create.run({ title: "x" });
const createTyped = api.post("/api/tasks");
createTyped.run({ title: "x" });
createTyped.run(new FormData());
const rename = api.patch("/api/tasks/:id");
rename.run({ params: { id: 1 }, body: { title: "x" } });
// @ts-expect-error — with placeholders, run() takes { params, body }, not the body itself
rename.run({ title: "x" });
// @ts-expect-error — misspelled param name in run()
rename.run({ params: { taskId: 1 } });
const removeOne = api.delete("/api/tasks/:id");
removeOne.run({ params: { id: 1 } });
const signOut = api.delete("/api/session");
signOut.run();
// @ts-expect-error — DELETE without placeholders takes no argument
signOut.run({ params: { id: 1 } });
assertType<Equal<ApiMutationInput<NewTask, "/api/tasks">, NewTask | FormData>>();
assertType<Equal<ApiDeleteRunInput<"/api/session">, never>>();
assertType<Equal<ApiDeleteRunInput<string>, ApiDeleteInput>>();
void [create, createTyped, rename, removeOne, signOut];

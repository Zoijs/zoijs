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

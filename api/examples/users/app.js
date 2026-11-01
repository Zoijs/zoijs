// @zoijs/api example — user management against an authenticated external API.
//
// Everything here is the public @zoijs/api surface: one createApi() client with a Bearer `auth`
// provider, a reactive list (api resource), create/update/delete mutations with invalidation,
// 422 validation problems, retries with an idempotency key, timeouts, simulated outages and an
// explicit, bounded 401 recovery. The "external API" is a deterministic demo server on another
// origin (scripts/demo-users-api.mjs) — no real credentials, no network beyond 127.0.0.1.

import { html, mount, each, createState, effect } from "@zoijs/core";
import { createApi } from "@zoijs/api";

// ---- the external API: another origin; every visit gets its own seeded data ---------------------
const API_ORIGIN = `${location.protocol}//${location.hostname}:3901`;
const BASE = `${API_ORIGIN}/__demo/${crypto.randomUUID()}/`;

// ---- your session layer: Zoijs never stores, caches or refreshes tokens -------------------------
const session = { token: null }; // in memory only — never localStorage
const signIn = createApi({ baseURL: BASE }).post("/session"); // the demo's password-less "sign-in"

async function refreshAccessToken() {
  const reply = await signIn.run(); // run() never rejects: undefined on failure
  session.token = reply?.accessToken ?? null;
  return session.token !== null;
}

// ---- the authenticated client --------------------------------------------------------------------
const backend = createApi({
  baseURL: BASE,
  auth: () => session.token, // asked once per request, so it always sends the CURRENT token
  authTimeout: 10_000, // give up on the provider after 10 s (an "auth" error, nothing sent)
});

// One place that turns an ApiError into words for people (see "Handling errors" in the README).
// Never shows tokens or server internals: messages are safe to log, problem details are opt-in.
function describe(error) {
  if (error.type === "http") {
    if (error.status === 401) return "Your session has expired. Sign in again.";
    if (error.status === 404) return "That user doesn't exist any more.";
    if (error.status === 422) return error.problem?.detail ?? "Check the form and try again.";
    if (error.status >= 500) return "The server had a problem. Try again in a moment.";
    return `The server refused the request (${error.status}).`;
  }
  if (error.type === "timeout") return "The server took too long to answer.";
  if (error.type === "network") return "Can't reach the server. Check your connection and try again.";
  if (error.type === "auth") return "Couldn't get your sign-in token. Reload the page.";
  return "Something went wrong.";
}

// A mutation that failed with 401: refresh the session once, then send ONE new run (with a new
// idempotency key). Safe here because this API checks the token before doing anything else.
async function runWithSession(mutation, input) {
  const result = await mutation.run(input);
  if (mutation.error()?.status === 401 && (await refreshAccessToken())) return mutation.run(input);
  return result;
}

let focusForm = false; // move focus into the form the next time it renders

function UserForm({ user, mutation, saved, cancel }) {
  let nameInput;
  const invalid = () => (mutation.error()?.status === 422 ? "true" : "false");

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget; // read it now: it's null once the handler has awaited
    const data = new FormData(form);
    const body = { name: String(data.get("name")), email: String(data.get("email")) };
    const result = await runWithSession(mutation, user ? { params: { id: user.id }, body } : body);
    if (result) saved(result, form);
    if (nameInput.isConnected) nameInput.focus(); // ready for the next one — or to fix the error, which is announced
  }

  // novalidate: the demo lets the SERVER validate, so you can see a 422. A real form would also
  // validate in the browser — the server must validate either way.
  return html`
    <form class="card" onsubmit=${submit} aria-labelledby="form-title" novalidate>
      <h2 id="form-title">${user ? `Edit ${user.name}` : "Add a user"}</h2>
      <p>
        <label for="user-name">Name</label><br />
        <input id="user-name" name="name" autocomplete="name" required value=${user ? user.name : ""}
          aria-invalid=${invalid} aria-describedby="form-error"
          ref=${(el) => {
            nameInput = el;
            if (focusForm) el.focus();
            focusForm = false;
          }} />
      </p>
      <p>
        <label for="user-email">Email</label><br />
        <input id="user-email" name="email" type="email" autocomplete="email" required value=${user ? user.email : ""}
          aria-invalid=${invalid} aria-describedby="form-error" />
      </p>
      <p id="form-error" class="err" role="alert">${() => (mutation.error() ? describe(mutation.error()) : "")}</p>
      <button type="submit" disabled=${() => mutation.pending()} aria-busy=${() => (mutation.pending() ? "true" : "false")}>
        ${() => (mutation.pending() ? "Saving…" : user ? "Save changes" : "Add user")}
      </button>
      ${user ? html`<button type="button" onclick=${cancel}>Cancel</button>` : null}
    </form>
  `;
}

function UserList({ users, remove, edit, removeUser }) {
  return html`
    <section aria-labelledby="list-title" aria-busy=${() => (users.loading() ? "true" : "false")}>
      <h2 id="list-title">Users</h2>
      <button type="button" onclick=${() => users.refresh()} disabled=${() => users.loading()}>Refresh list</button>
      ${() => {
        if (users.loading() && users.data() === undefined) return html`<p role="status">Loading users…</p>`;
        if (users.error()) {
          return html`<div role="alert">
            <p class="err">${describe(users.error())}</p>
            <button type="button" onclick=${() => users.refresh()}>Try again</button>
          </div>`;
        }
        if (!users.data().length) return html`<p>No users yet — add the first one above.</p>`;
        return html`<table>
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            ${each(() => users.data() ?? [], (u) => u.id, (u) => html`<tr>
              <td>${u.name}</td>
              <td>${u.email}</td>
              <td>
                <button type="button" aria-label=${`Edit ${u.name}`} onclick=${() => edit(u)}>Edit</button>
                <button type="button" aria-label=${`Delete ${u.name}`} disabled=${() => remove.pending()} onclick=${() => removeUser(u)}>Delete</button>
              </td>
            </tr>`)}
          </tbody>
        </table>`;
      }}
    </section>
  `;
}

function App() {
  const simulate = createState("none"); // demo control: what the server pretends
  const users = backend("/users", {
    query: () => ({ simulate: simulate.get() === "none" ? null : simulate.get() }),
    retry: 1, // a GET may be retried freely: one extra attempt for network errors, timeouts, 5xx
    retryDelay: 200,
    timeout: 2000,
  });
  const create = backend.post("/users", { invalidate: users, exclusive: true, idempotencyKey: true, retry: 2, problemDetails: true });
  const update = backend.patch("/users/:id", { invalidate: users, exclusive: true, problemDetails: true });
  const remove = backend.delete("/users/:id", { invalidate: users });
  const editing = createState(null); // the user being edited, or null to add one
  const status = createState(""); // polite announcements

  // Explicit, bounded 401 recovery: at most once until a load succeeds — never a loop.
  let recovered = false;
  effect(() => {
    if (users.loading()) return;
    const e = users.error();
    if (!e) recovered = false;
    else if (e.type === "http" && e.status === 401 && !recovered) {
      recovered = true;
      refreshAccessToken().then((ok) => ok && users.refresh());
    }
  });

  function edit(user) {
    create.reset();
    update.reset();
    focusForm = true;
    editing.set(user);
  }
  function stopEditing() {
    update.reset();
    focusForm = true;
    editing.set(null);
  }
  function saved(user, form) {
    status.set(editing.peek() ? `Saved changes to ${user.name}.` : `Added ${user.name}.`);
    form.reset();
    stopEditing();
  }
  async function removeUser(user) {
    await runWithSession(remove, { params: { id: user.id } });
    status.set(remove.error() ? `Couldn't delete ${user.name}: ${describe(remove.error())}` : `Deleted ${user.name}.`);
    if (!remove.error() && editing.peek()?.id === user.id) stopEditing();
  }

  return html`
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <h1>Users</h1>
      <p class="muted">A demo of <code>@zoijs/api</code> against an authenticated API on another origin.</p>
      <p role="status" aria-live="polite" id="announcer">${() => status.get()}</p>
      ${() => {
        const user = editing.get();
        return () => UserForm({ user, mutation: user ? update : create, saved, cancel: stopEditing });
      }}
      ${UserList({ users, remove, edit, removeUser })}
      <fieldset class="card">
        <legend>Try a failure</legend>
        ${[["none", "Normal"], ["unavailable", "Server error (503)"], ["drop", "Network failure"], ["slow", "Slow server (timeout)"]].map(
          ([value, label]) => html`<label><input type="radio" name="simulate" value=${value} checked=${simulate.peek() === value}
            onchange=${() => simulate.set(value)} /> ${label}</label><br />`,
        )}
        <button type="button" onclick=${() => {
          session.token = "demo-expired-token"; // as if it had expired on the server: the next request gets a 401
          status.set("Your token has expired. The next request will refresh it once.");
        }}>Expire my token</button>
      </fieldset>
    </main>
  `;
}

await refreshAccessToken();
mount(App, "#app");

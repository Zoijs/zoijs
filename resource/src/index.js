// @zoijs/resource — the simplest possible async-data helper for Zoijs.
//
// A "resource" wraps a fetcher function and gives you three reactive readers
// plus a refresh. That's the whole idea — loading / success / error, without
// rebuilding the same pattern in every component.
//
//   import { html } from "@zoijs/core";
//   import { resource } from "@zoijs/resource";
//
//   const user = resource(() => fetch("/api/user").then((r) => r.json()));
//
//   html`
//     ${() =>
//       user.loading() ? html`<p>Loading…</p>`
//       : user.error() ? html`<p>Something went wrong</p>`
//       : html`<h1>${user.data().name}</h1>`}
//   `;
//
// No cache, no query client, no providers, no hooks, no suspense. It is built
// entirely on the core's public API (createState, onCleanup) — the core is
// unchanged.

import { createState, onCleanup } from "@zoijs/core";

/**
 * Wrap an async fetcher in reactive loading / data / error state.
 * Loads once immediately; call refresh() to load again.
 * @param {() => any | Promise<any>} fetcher
 */
export function resource(fetcher) {
  const data = createState(undefined);
  const error = createState(null);
  const loading = createState(false);

  let runId = 0; // only the most recent load() is allowed to settle
  let disposed = false;

  const load = () => {
    if (disposed) return;
    const id = ++runId;
    loading.set(true);
    error.set(null); // a fresh attempt clears the previous error (keeps old data)

    let promise;
    try {
      promise = Promise.resolve(fetcher());
    } catch (err) {
      settle(id, () => error.set(err)); // fetcher threw synchronously
      return;
    }
    promise.then(
      (value) => settle(id, () => data.set(value)),
      (err) => settle(id, () => error.set(err))
    );
  };

  // Ignore results from disposed resources or from a load that has been
  // superseded by a newer one — so a slow request can't clobber a newer result.
  const settle = (id, apply) => {
    if (disposed || id !== runId) return;
    apply();
    loading.set(false);
  };

  // When the owning component/list-item is disposed, stop accepting results.
  onCleanup(() => {
    disposed = true;
  });

  load(); // automatic initial load

  return {
    data: () => data.get(),
    loading: () => loading.get(),
    error: () => error.get(),
    refresh: load,
  };
}

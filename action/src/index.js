// @zoijs/action — the simplest helper for user-triggered writes (submits, saves,
// deletes, mutations). It is the write-side companion to @zoijs/resource:
//
//   @zoijs/resource = read data (loads automatically)
//   @zoijs/action   = write data (runs when you call run())
//
//   import { html } from "@zoijs/core";
//   import { action } from "@zoijs/action";
//
//   const save = action((formData) =>
//     fetch("/api/users", { method: "POST", body: formData }).then((r) => {
//       if (!r.ok) throw new Error("Could not save");
//       return r.json();
//     })
//   );
//
//   html`
//     <button disabled=${() => save.pending()} onclick=${() => save.run(data)}>
//       ${() => (save.pending() ? "Saving…" : "Save")}
//     </button>
//     ${() => (save.error() ? html`<p role="alert">${save.error().message}</p>` : null)}
//   `;
//
// No form library, no cache, no providers, no retries. Built entirely on the
// core's public API (createState, onCleanup) — the core is unchanged.

import { createState, onCleanup } from "@zoijs/core";

/**
 * Wrap a write function in reactive pending / error / done / result state.
 * Nothing runs until you call run().
 * @param {(...args: any[]) => any | Promise<any>} fn
 */
export function action(fn) {
  const pending = createState(false);
  const error = createState(null);
  const done = createState(false);
  const result = createState(undefined);

  let runId = 0; // only the most recent run() is allowed to settle
  let disposed = false;

  // run() never rejects — failures land in error(). It resolves with the result
  // on success, or undefined on failure, so `await save.run(...)` is always safe.
  const run = async (...args) => {
    if (disposed) return undefined;
    const id = ++runId;
    pending.set(true);
    error.set(null);
    done.set(false);

    try {
      const value = await fn(...args);
      if (disposed || id !== runId) return value; // superseded — don't touch state
      result.set(value);
      done.set(true);
      pending.set(false);
      return value;
    } catch (err) {
      if (disposed || id !== runId) return undefined;
      error.set(err);
      pending.set(false);
      return undefined;
    }
  };

  const reset = () => {
    runId++; // invalidate any in-flight run so it can't settle after a reset
    pending.set(false);
    error.set(null);
    done.set(false);
    result.set(undefined);
  };

  // After the owning component unmounts, stop accepting results.
  onCleanup(() => {
    disposed = true;
  });

  return {
    run,
    pending: () => pending.get(),
    error: () => error.get(),
    done: () => done.get(),
    result: () => result.get(),
    reset,
  };
}

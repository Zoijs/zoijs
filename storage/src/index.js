// @zoijs/storage — a tiny, optional persistence helper for Zoijs.
//
// storage(key, initialValue) is a drop-in, persistent createState: it has the
// same { get, set, peek } shape, but the value is read from localStorage on
// creation and written back (as JSON) on every set(). If storage is unavailable
// or throws, it silently degrades to an in-memory createState — it never crashes.
//
//   import { storage } from "@zoijs/storage";
//
//   const theme = storage("theme", "light");
//   theme.get();        // read  (reactive inside a binding)
//   theme.set("dark");  // write (updates the value AND localStorage)
//   theme.peek();       // read without subscribing
//
// No global store, no provider, no cross-tab sync, no TTL, no custom serializer,
// no schema. Built entirely on the core's public API (createState) — the core is
// unchanged.

import { createState } from "@zoijs/core";

// Safely obtain the localStorage object. Merely *accessing* window.localStorage
// can throw (sandboxed iframes, some privacy modes), so this is wrapped too.
function getStore() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    /* access denied → no persistence */
  }
  return null;
}

/**
 * A persistent, reactive value backed by localStorage. Behaves like
 * createState, but reads its initial value from storage and writes on every set.
 * @param {string} key            the localStorage key
 * @param {any}    initialValue   used when the key is missing or unreadable
 */
export function storage(key, initialValue) {
  let store = getStore();
  let initial = initialValue;

  if (store) {
    try {
      const raw = store.getItem(key);
      if (raw !== null && raw !== undefined) {
        try {
          initial = JSON.parse(raw);
        } catch {
          initial = initialValue; // corrupt JSON → fall back, never throw
        }
      }
    } catch {
      store = null; // reading threw → disable persistence, keep working in memory
    }
  }

  const state = createState(initial);

  const set = (value) => {
    state.set(value); // reactive update first, so it always happens
    if (!store) return; // persistence disabled — stay in-memory
    try {
      store.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded / private mode / non-serializable → skip persisting */
    }
  };

  return {
    get: state.get,
    set,
    peek: state.peek,
  };
}

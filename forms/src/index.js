// @zoijs/forms — a tiny, optional form helper for Zoijs.
//
// form(initialValues, options?) keeps a form's values, errors, and touched state
// in plain Zoijs reactive state, with small per-field helpers. It is native-forms
// first: you still write ordinary <input>s and read e.target.value yourself, and
// you still submit with @zoijs/action — forms never touches the network.
//
//   import { form } from "@zoijs/forms";
//
//   const login = form({ email: "", password: "" });
//   login.value("email");               // read one field (reactive)
//   login.set("email", "a@b.com");      // update one field
//   login.error("email");               // read one field's error (reactive)
//   login.setError("email", "Required"); login.clearError("email");
//   login.touch("email");               // mark touched (e.g. on blur)
//   login.reset();                      // restore initial values, clear errors+touched
//
// No provider, no field registration, no context, no schema, no resolver, no
// async-validation engine. Built entirely on the core's public API (createState)
// — the core is unchanged.

import { createState } from "@zoijs/core";

/**
 * Create a tiny reactive form helper.
 * @param {Record<string, any>} initialValues
 * @param {{ validate?: Record<string, (value:any, values:any)=>(string|null|undefined)> }} [options]
 */
export function form(initialValues = {}, options = {}) {
  const initial = { ...initialValues };
  const values = createState({ ...initial });
  const errors = createState({});
  const touched = createState({});

  const value = (name) => values.get()[name];

  const set = (name, val) => {
    values.set({ ...values.get(), [name]: val });
  };

  const error = (name) => errors.get()[name];

  const setError = (name, message) => {
    errors.set({ ...errors.get(), [name]: message });
  };

  const clearError = (name) => {
    const next = { ...errors.get() };
    delete next[name];
    errors.set(next);
  };

  const touch = (name) => {
    if (touched.get()[name]) return; // already touched — no needless update
    touched.set({ ...touched.get(), [name]: true });
  };

  const reset = () => {
    values.set({ ...initial });
    errors.set({});
    touched.set({});
  };

  // Run each rule against its field's current value. A rule returns a message
  // string when invalid, or a falsy value when valid. Sets errors and returns
  // whether the whole form is valid. Rules default to options.validate.
  const validate = (rules) => {
    const useRules = rules || options.validate || {};
    const vals = values.get();
    const next = {};
    let valid = true;
    for (const name in useRules) {
      const message = useRules[name](vals[name], vals);
      if (message) {
        next[name] = message;
        valid = false;
      }
    }
    errors.set(next);
    return valid;
  };

  // A thin submit wrapper: prevent the default page reload and call fn with the
  // current values. Validation and the network call stay yours (use validate()
  // and @zoijs/action) — forms never submits anything itself.
  const handleSubmit = (fn) => (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    return fn(values.get(), event);
  };

  // Reader-style accessors for whole-form state, matching the rest of the
  // ecosystem (data(), loading(), value(name), …). Reactive inside a binding.
  const all = () => values.get();
  const allErrors = () => errors.get();
  const allTouched = () => touched.get();
  const isTouched = (name) => !!touched.get()[name];

  return {
    // values
    all,
    value,
    set,
    // errors
    allErrors,
    error,
    setError,
    clearError,
    // touched
    allTouched,
    isTouched,
    touch,
    // lifecycle
    reset,
    validate,
    handleSubmit,
    // raw reactive state — advanced / backward-compatible. Prefer all() /
    // allErrors() / allTouched() above; these stay for direct state access.
    values,
    errors,
    touched,
  };
}

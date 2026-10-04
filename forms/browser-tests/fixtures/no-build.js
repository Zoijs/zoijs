// Drives core + resource + action + forms through the plain import map above and records
// what happened for import-map.spec.js — including configure({ onError }) reports, which
// resource/action deliver through the core's shared runtime.
window.__r = { loaded: false, reports: [], error: null };
try {
  const { html, mount, configure } = await import("@zoijs/core");
  const { resource } = await import("@zoijs/resource");
  const { action } = await import("@zoijs/action");
  const { form } = await import("@zoijs/forms");
  window.__r.loaded = true;
  configure({ onError: (error, info) => window.__r.reports.push(`${info.kind}:${error.message}`) });

  const user = resource(() => Promise.resolve({ name: "Ada" }));
  const broken = resource(() => Promise.reject(new Error("resource down")));
  const save = action(async (values) => `saved ${values.email}`);
  const fail = action(async () => { throw new Error("action down"); });
  const login = form({ email: "ada@example.com" });

  mount(
    () => html`
      <p id="user">${() => (user.loading() ? "loading" : user.data().name)}</p>
      <p id="broken">${() => (broken.error() ? broken.error().message : "")}</p>
      <form id="f" onsubmit=${login.handleSubmit((values) => save.run(values))}>
        <button id="submit">Save</button>
      </form>
      <p id="result">${() => save.result() || ""}</p>
      <button id="fail" onclick=${() => fail.run()}>Fail</button>
      <p id="fail-error">${() => (fail.error() ? fail.error().message : "")}</p>
    `,
    "#app"
  );
} catch (err) {
  window.__r.error = String((err && err.message) || err);
}

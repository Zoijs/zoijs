// Admin Dashboard — a fuller app that puts most of the Zoijs ecosystem to work,
// built entirely from plain functions returning html. No build step, no global
// store, no providers. Read it top to bottom.
//
//   @zoijs/core      html / mount / each / computed / createState / effect
//   @zoijs/router    sidebar pages, active links, params, programmatic nav
//   @zoijs/resource  load stats / users (reads)
//   @zoijs/action    toggle / delete / save (writes)
//   @zoijs/head      per-page <title> + meta
//   @zoijs/storage   persisted theme + language (survive reloads)
//   @zoijs/forms     the settings form: values, errors, touched, validation
//   @zoijs/i18n      a reactive locale (English / French) with Intl formatting

import { html, mount, each, computed, createState, effect } from "@zoijs/core";
import { createRouter } from "@zoijs/router";
import { resource } from "@zoijs/resource";
import { action } from "@zoijs/action";
import { title, description } from "@zoijs/head";
import { storage } from "@zoijs/storage";
import { form } from "@zoijs/forms";
import { createI18n } from "@zoijs/i18n";
import * as api from "./fake-api.js";

// ---- persisted preferences + i18n -------------------------------------------

const theme = storage("admin.theme", "light"); // "light" | "dark"
const lang = storage("admin.lang", "en"); // "en" | "fr"

const i18n = createI18n({
  locale: lang.peek(),
  fallback: "en",
  messages: {
    en: {
      app: "Acme Admin",
      nav: { overview: "Overview", users: "Users", settings: "Settings" },
      stats: { total: "Total users", active: "Active", admins: "Admins", signups: "Signups" },
      users: { search: "Search users…", none: "No users match.", active: "Active", inactive: "Inactive" },
      saved: "Settings saved.",
    },
    fr: {
      app: "Acme Admin",
      nav: { overview: "Aperçu", users: "Utilisateurs", settings: "Réglages" },
      stats: { total: "Utilisateurs", active: "Actifs", admins: "Admins", signups: "Inscriptions" },
      users: { search: "Rechercher…", none: "Aucun utilisateur.", active: "Actif", inactive: "Inactif" },
      saved: "Réglages enregistrés.",
    },
  },
});
const t = (key, vars) => i18n.t(key, vars); // shorthand used in views

// Keep the document theme attribute and the i18n locale in sync with the stored
// prefs. effect() runs now and re-runs whenever the value it reads changes.
effect(() => (document.documentElement.dataset.theme = theme.get()));
effect(() => i18n.setLocale(lang.get()));

// ---- pages -------------------------------------------------------------------

function Overview() {
  title(`${t("nav.overview")} · ${t("app")}`);
  description("Key metrics at a glance.");

  const stats = resource(() => api.getStats());

  const card = (labelKey, value) => html`
    <div class="card">
      <div class="card-value">${value}</div>
      <div class="card-label">${() => t(labelKey)}</div>
    </div>
  `;

  return html`
    <h1>${() => t("nav.overview")}</h1>
    ${() => (stats.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() => (stats.error() ? html`<p role="alert">${stats.error().message}</p>` : null)}
    ${() => {
      const s = stats.data();
      if (!s) return null;
      return html`<div class="cards">
        ${card("stats.total", () => i18n.n(s.total))} ${card("stats.active", () => i18n.n(s.active))}
        ${card("stats.admins", () => i18n.n(s.admins))} ${card("stats.signups", () => i18n.n(s.signups))}
      </div>`;
    }}
    <p>${router.link("/users", `${t("nav.users")} →`)}</p>
  `;
}

function Users() {
  title(`${t("nav.users")} · ${t("app")}`);
  description("Browse and manage users.");

  const users = resource(() => api.listUsers());
  const setActive = action(api.setUserActive);
  const query = createState("");

  const all = () => users.data() ?? [];
  const visible = computed(() => {
    const q = query.get().trim().toLowerCase();
    const rows = all();
    if (!q) return rows;
    return rows.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  });

  const onToggle = async (u) => {
    await setActive.run(u.id, !u.active);
    users.refresh();
  };

  return html`
    <h1>${() => t("nav.users")}</h1>

    <input
      class="search"
      type="search"
      value=${() => query.get()}
      oninput=${(e) => query.set(e.target.value)}
      placeholder=${() => t("users.search")}
      aria-label=${() => t("users.search")}
    />

    ${() => (users.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() => (users.error() ? html`<p role="alert">${users.error().message}</p>` : null)}

    <table class="users">
      <thead>
        <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${each(
          () => visible.get(),
          (u) => u.id,
          (u) => html`<tr>
            <td>${router.link("/users/" + u.id, u.name)}</td>
            <td class="muted">${u.email}</td>
            <td><span class="badge">${u.role}</span></td>
            <td>
              <span class=${() => (u.active ? "status on" : "status off")}>
                ${() => (u.active ? t("users.active") : t("users.inactive"))}
              </span>
            </td>
            <td>
              <button class="link-btn" disabled=${() => setActive.pending()} onclick=${() => onToggle(u)}>
                ${() => (u.active ? "Deactivate" : "Activate")}
              </button>
            </td>
          </tr>`
        )}
      </tbody>
    </table>

    ${() => (visible.get().length === 0 && !users.loading() ? html`<p class="muted">${() => t("users.none")}</p>` : null)}
  `;
}

function UserDetail(params) {
  title(`User ${params.id} · ${t("app")}`);
  description("User details.");

  const user = resource(() => api.getUser(params.id));
  const setActive = action(api.setUserActive);
  const remove = action(api.deleteUser);

  const onToggle = async (u) => {
    await setActive.run(u.id, !u.active);
    user.refresh();
  };
  const onDelete = async () => {
    const ok = await remove.run(params.id);
    if (ok != null) router.go("/users");
  };

  return html`
    ${() => (user.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() =>
      user.error()
        ? html`<div><p role="alert">${user.error().message}</p>${router.link("/users", "← Back")}</div>`
        : null}
    ${() => {
      const u = user.data();
      if (!u) return null;
      return html`
        <p>${router.link("/users", "← " + t("nav.users"))}</p>
        <h1>${u.name}</h1>
        <p class="muted">${u.email}</p>
        <dl class="detail">
          <dt>Role</dt><dd><span class="badge">${u.role}</span></dd>
          <dt>Status</dt><dd>${u.active ? t("users.active") : t("users.inactive")}</dd>
          <dt>${t("stats.signups")}</dt><dd>${() => i18n.n(u.signups)}</dd>
        </dl>
        <p class="row">
          <button onclick=${() => onToggle(u)} disabled=${() => setActive.pending()}>
            ${u.active ? "Deactivate" : "Activate"}
          </button>
          <button class="danger" onclick=${onDelete} disabled=${() => remove.pending()}>
            ${() => (remove.pending() ? "Deleting…" : "Delete")}
          </button>
        </p>
      `;
    }}
  `;
}

function Settings() {
  title(`${t("nav.settings")} · ${t("app")}`);
  description("Update your profile and preferences.");

  const initial = resource(() => api.getSettings());
  const save = action(api.saveSettings);
  const saved = createState(false);

  // The form is created once the initial values have loaded.
  let f = null;
  const buildForm = (values) =>
    form(values, {
      validate: {
        displayName: (v) => (!v || !v.trim() ? "A display name is required." : null),
        email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v || "") ? null : "Enter a valid email."),
      },
    });

  const onSubmit = (values) =>
    save.run(values).then((ok) => {
      if (ok) {
        saved.set(true);
        setTimeout(() => saved.set(false), 2000);
      }
    });

  const field = (name, label, type = "text") => html`
    <label class="field">
      <span>${label}</span>
      <input
        type=${type}
        value=${() => f.value(name)}
        oninput=${(e) => {
          f.set(name, e.target.value);
          f.validate(); // keep errors live; display is gated by isTouched below
        }}
        onblur=${() => f.touch(name)}
        aria-invalid=${() => (f.isTouched(name) && f.error(name) ? "true" : "false")}
      />
      ${() => (f.isTouched(name) && f.error(name) ? html`<small role="alert">${f.error(name)}</small>` : null)}
    </label>
  `;

  return html`
    <h1>${() => t("nav.settings")}</h1>
    ${() => (initial.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() => {
      const values = initial.data();
      if (!values) return null;
      if (!f) f = buildForm(values);
      return html`
        <form
          class="settings"
          onsubmit=${f.handleSubmit((v) => {
            if (f.validate()) onSubmit(v);
          })}
        >
          ${field("displayName", "Display name")} ${field("email", "Email", "email")}
          <label class="check">
            <input
              type="checkbox"
              checked=${() => f.value("weeklyDigest")}
              onchange=${(e) => f.set("weeklyDigest", e.target.checked)}
            />
            Send me the weekly digest
          </label>
          <div class="row">
            <button disabled=${() => save.pending()}>${() => (save.pending() ? "Saving…" : "Save")}</button>
            ${() => (saved.get() ? html`<span class="ok" role="status">${t("saved")}</span>` : null)}
            ${() => (save.error() ? html`<span role="alert">${save.error().message}</span>` : null)}
          </div>
        </form>
      `;
    }}
  `;
}

function NotFound() {
  title(`Not found · ${t("app")}`);
  return html`<h1>Page not found</h1>
    <p>${router.link("/", "Go to overview")}</p>`;
}

// ---- router + shell ----------------------------------------------------------

const router = createRouter(
  {
    "/": Overview,
    "/users": Users,
    "/users/:id": UserDetail,
    "/settings": Settings,
    "*": NotFound,
  },
  { base: "/examples/admin" }
);

function Shell() {
  const navItem = (path, labelKey) =>
    html`<a
      href=${"/examples/admin" + path}
      class=${() => (router.path() === path ? "nav-link active" : "nav-link")}
      onclick=${(e) => {
        e.preventDefault();
        router.go(path);
      }}
      >${() => t(labelKey)}</a
    >`;

  return html`
    <aside class="sidebar">
      <div class="brand">${() => t("app")}</div>
      <nav>
        ${navItem("/", "nav.overview")} ${navItem("/users", "nav.users")} ${navItem("/settings", "nav.settings")}
      </nav>
    </aside>
    <div class="content">
      <header class="topbar">
        <select aria-label="Language" onchange=${(e) => lang.set(e.target.value)}>
          <option value="en" selected=${() => lang.get() === "en"}>English</option>
          <option value="fr" selected=${() => lang.get() === "fr"}>Français</option>
        </select>
        <button class="theme" onclick=${() => theme.set(theme.get() === "dark" ? "light" : "dark")}>
          ${() => (theme.get() === "dark" ? "☀ Light" : "☾ Dark")}
        </button>
      </header>
      <main>${router.view()}</main>
    </div>
  `;
}

mount(Shell, "#app");

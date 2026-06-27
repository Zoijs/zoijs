// Contacts — a small CRM that shows the full create / read / update / delete shape
// in Zoijs, built from plain functions returning html. No build step, no store.
//
//   @zoijs/core      html / mount / each / computed / createState
//   @zoijs/router    list / new / detail / edit pages, :id params, navigation
//   @zoijs/resource  load the list and one contact (reads)
//   @zoijs/action    create / update / delete (writes)
//   @zoijs/forms     the contact form — values, errors, touched, validation
//   @zoijs/head      per-page <title>

import { html, mount, each, computed, createState } from "@zoijs/core";
import { createRouter } from "@zoijs/router";
import { resource } from "@zoijs/resource";
import { action } from "@zoijs/action";
import { form } from "@zoijs/forms";
import { title } from "@zoijs/head";
import * as api from "./fake-api.js";

const rules = {
  name: (v) => (!v || !v.trim() ? "A name is required." : null),
  email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v || "") ? null : "Enter a valid email."),
};

// A reusable contact form (create + edit share it). It owns a forms instance and
// calls onSubmit(values) only when the fields validate.
function ContactForm({ initial, submitLabel, pending, error, onSubmit, cancelHref }) {
  const f = form(initial, { validate: rules });

  const field = (name, label, type = "text") => html`
    <label class="field">
      <span>${label}</span>
      <input
        type=${type}
        value=${() => f.value(name)}
        oninput=${(e) => {
          f.set(name, e.target.value);
          f.validate();
        }}
        onblur=${() => f.touch(name)}
        aria-invalid=${() => (f.isTouched(name) && f.error(name) ? "true" : "false")}
      />
      ${() => (f.isTouched(name) && f.error(name) ? html`<small role="alert">${f.error(name)}</small>` : null)}
    </label>
  `;

  return html`
    <form
      class="contact-form"
      onsubmit=${f.handleSubmit((values) => {
        if (f.validate()) onSubmit(values);
      })}
    >
      ${field("name", "Name")} ${field("email", "Email", "email")} ${field("company", "Company")}
      <div class="row">
        <button disabled=${() => pending()}>${() => (pending() ? "Saving…" : submitLabel)}</button>
        ${router.link(cancelHref, "Cancel")}
      </div>
      ${() => (error() ? html`<p role="alert">${error().message}</p>` : null)}
    </form>
  `;
}

// ---- pages -------------------------------------------------------------------

function List() {
  title("Contacts");
  const contacts = resource(() => api.listContacts());
  const query = createState("");

  const visible = computed(() => {
    const q = query.get().trim().toLowerCase();
    const rows = contacts.data() ?? [];
    if (!q) return rows;
    return rows.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.company.toLowerCase().includes(q)
    );
  });

  return html`
    <div class="row between">
      <h1>Contacts</h1>
      ${router.link("/new", "+ New contact")}
    </div>

    <input
      class="search"
      type="search"
      value=${() => query.get()}
      oninput=${(e) => query.set(e.target.value)}
      placeholder="Search by name, email, or company…"
      aria-label="Search contacts"
    />

    ${() => (contacts.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() => (contacts.error() ? html`<p role="alert">${contacts.error().message}</p>` : null)}

    <ul class="contacts">
      ${each(
        () => visible.get(),
        (c) => c.id,
        (c) => html`<li>
          <span class="fav" aria-hidden="true">${() => (c.favorite ? "★" : "☆")}</span>
          ${router.link("/" + c.id, c.name)}
          <span class="muted">${c.company}</span>
        </li>`
      )}
    </ul>

    ${() => (visible.get().length === 0 && !contacts.loading() ? html`<p class="muted">No contacts match.</p>` : null)}
  `;
}

function NewContact() {
  title("New contact · Contacts");
  const create = action(api.createContact);
  return html`
    <p>${router.link("/", "← Contacts")}</p>
    <h1>New contact</h1>
    ${ContactForm({
      initial: { name: "", email: "", company: "" },
      submitLabel: "Create",
      pending: () => create.pending(),
      error: () => create.error(),
      cancelHref: "/",
      onSubmit: (values) => create.run(values).then((c) => c && router.go("/" + c.id)),
    })}
  `;
}

function ContactDetail(params) {
  title("Contact · Contacts");
  const contact = resource(() => api.getContact(params.id));
  const remove = action(api.deleteContact);

  const onDelete = async () => {
    const ok = await remove.run(params.id);
    if (ok != null) router.go("/");
  };

  return html`
    <p>${router.link("/", "← Contacts")}</p>
    ${() => (contact.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() => (contact.error() ? html`<p role="alert">${contact.error().message}</p>` : null)}
    ${() => {
      const c = contact.data();
      if (!c) return null;
      return html`
        <h1>${c.favorite ? "★ " : ""}${c.name}</h1>
        <dl class="detail">
          <dt>Email</dt><dd><a href=${"mailto:" + c.email}>${c.email}</a></dd>
          <dt>Company</dt><dd>${c.company || "—"}</dd>
        </dl>
        <p class="row">
          ${router.link("/" + c.id + "/edit", "Edit")}
          <button class="danger" onclick=${onDelete} disabled=${() => remove.pending()}>
            ${() => (remove.pending() ? "Deleting…" : "Delete")}
          </button>
        </p>
      `;
    }}
  `;
}

function EditContact(params) {
  title("Edit contact · Contacts");
  const contact = resource(() => api.getContact(params.id));
  const update = action((values) => api.updateContact(params.id, values));

  return html`
    <p>${router.link("/" + params.id, "← Cancel")}</p>
    <h1>Edit contact</h1>
    ${() => (contact.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() => (contact.error() ? html`<p role="alert">${contact.error().message}</p>` : null)}
    ${() => {
      const c = contact.data();
      if (!c) return null;
      return ContactForm({
        initial: { name: c.name, email: c.email, company: c.company },
        submitLabel: "Save changes",
        pending: () => update.pending(),
        error: () => update.error(),
        cancelHref: "/" + params.id,
        onSubmit: (values) => update.run(values).then((ok) => ok && router.go("/" + params.id)),
      });
    }}
  `;
}

function NotFound() {
  title("Not found · Contacts");
  return html`<h1>Page not found</h1>
    <p>${router.link("/", "← Contacts")}</p>`;
}

// ---- router + shell ----------------------------------------------------------

const router = createRouter(
  {
    "/": List,
    "/new": NewContact, // static — wins over "/:id"
    "/:id/edit": EditContact,
    "/:id": ContactDetail,
    "*": NotFound,
  },
  { base: "/examples/contacts" }
);

function App() {
  return html`
    <header><strong>Contacts</strong> <span class="muted">· a Zoijs CRM demo</span></header>
    <main>${router.view()}</main>
  `;
}

mount(App, "#app");

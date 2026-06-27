// A fake in-memory API for the Contacts CRM demo. No backend, no build — just an
// array and small delays so loading / pending states are real. Swap for fetch().

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (o) => ({ ...o });

let contacts = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines", favorite: true },
  { id: 2, name: "Alan Turing", email: "alan@example.com", company: "Bletchley Park", favorite: false },
  { id: 3, name: "Grace Hopper", email: "grace@example.com", company: "US Navy", favorite: true },
  { id: 4, name: "Katherine Johnson", email: "katherine@example.com", company: "NASA", favorite: false },
];
let nextId = 5;

export async function listContacts() {
  await delay(400);
  return contacts.map(clone);
}

export async function getContact(id) {
  await delay(300);
  const c = contacts.find((x) => String(x.id) === String(id));
  if (!c) throw new Error(`Contact ${id} was not found.`);
  return clone(c);
}

export async function createContact(values) {
  await delay(450);
  const c = { id: nextId++, favorite: false, ...normalize(values) };
  contacts.push(c);
  return clone(c);
}

export async function updateContact(id, values) {
  await delay(450);
  const c = contacts.find((x) => String(x.id) === String(id));
  if (!c) throw new Error(`Contact ${id} was not found.`);
  Object.assign(c, normalize(values));
  return clone(c);
}

export async function deleteContact(id) {
  await delay(350);
  contacts = contacts.filter((x) => String(x.id) !== String(id));
  return id;
}

function normalize(v) {
  const email = String(v.email || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Server rejected an invalid email.");
  return { name: String(v.name || "").trim(), email, company: String(v.company || "").trim() };
}

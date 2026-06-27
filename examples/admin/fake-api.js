// A fake in-memory API for the Admin dashboard. No backend, no build — just data
// and small setTimeout delays so loading / pending states are real. Swap these for
// fetch() calls in your own app; the components don't change.

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (o) => JSON.parse(JSON.stringify(o));

let users = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com", role: "admin", active: true, signups: 142 },
  { id: 2, name: "Alan Turing", email: "alan@example.com", role: "editor", active: true, signups: 98 },
  { id: 3, name: "Grace Hopper", email: "grace@example.com", role: "admin", active: false, signups: 211 },
  { id: 4, name: "Katherine Johnson", email: "katherine@example.com", role: "viewer", active: true, signups: 64 },
  { id: 5, name: "Edsger Dijkstra", email: "edsger@example.com", role: "editor", active: true, signups: 37 },
  { id: 6, name: "Barbara Liskov", email: "barbara@example.com", role: "viewer", active: false, signups: 19 },
];

let settings = { displayName: "Ada Lovelace", email: "ada@example.com", weeklyDigest: true };

export async function listUsers() {
  await delay(450);
  return users.map(clone);
}

export async function getUser(id) {
  await delay(350);
  const u = users.find((x) => String(x.id) === String(id));
  if (!u) throw new Error(`User ${id} was not found.`);
  return clone(u);
}

export async function setUserActive(id, active) {
  await delay(300);
  const u = users.find((x) => String(x.id) === String(id));
  if (!u) throw new Error(`User ${id} was not found.`);
  u.active = active;
  return clone(u);
}

export async function deleteUser(id) {
  await delay(350);
  users = users.filter((x) => String(x.id) !== String(id));
  return id;
}

export async function getStats() {
  await delay(400);
  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === "admin").length,
    signups: users.reduce((n, u) => n + u.signups, 0),
  };
}

export async function getSettings() {
  await delay(300);
  return clone(settings);
}

export async function saveSettings(next) {
  await delay(500);
  const email = String(next.email || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Server rejected an invalid email.");
  settings = { ...settings, ...next };
  return clone(settings);
}

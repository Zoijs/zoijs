// Router + head — each page sets its own title and description, and they update
// as you navigate (the router unmounts the old page, reverting its head, then
// renders the new one).

import { html, mount } from "@zoijs/core";
import { createRouter } from "@zoijs/router";
import { title, description } from "@zoijs/head";

function Home() {
  title("Home | Zoijs Head Demo");
  description("The home page of the head + router demo.");
  return html`<h1>Home</h1>
    <p>Watch the browser-tab title change as you navigate.</p>`;
}

function About() {
  title("About | Zoijs Head Demo");
  description("The about page of the head + router demo.");
  return html`<h1>About</h1>
    <p>This page set its own title and description.</p>`;
}

const router = createRouter({
  "/": Home,
  "/about": About,
  "*": () => html`<h1>Not Found</h1>`,
});

function App() {
  return html`
    <nav>
      ${router.link("/", "Home")}
      ${router.link("/about", "About")}
    </nav>
    <main>${router.view()}</main>
    <p class="peek">
      Current path: <code>${() => router.path()}</code> — the tab title updates with it.
    </p>
  `;
}

mount(App, "#app");

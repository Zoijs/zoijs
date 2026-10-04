// Basic router app — built with @zoijs/core + @zoijs/router.
//
// A route is just `pattern: component`. A component is a function that returns
// an html template and receives the matched params as a plain object.

import { html, mount } from "@zoijs/core";
import { createRouter } from "@zoijs/router";

function Home() {
  return html`
    <h1>Home</h1>
    <p>Welcome to the Zoijs router demo.</p>
    <p>Try a user page: ${router.link("/users/42", "User 42")}</p>
    <!-- A PLAIN anchor (not router.link). With { interceptLinks: true } it still
         navigates client-side — as a link inside rendered content would. -->
    <p><a href="/about">About (plain link)</a></p>
  `;
}

function About() {
  return html`
    <h1>About</h1>
    <p>A tiny router: routes are a plain object, links are plain anchors.</p>
  `;
}

function UserPage(params) {
  return html`
    <h1>User ${params.id}</h1>
    <p>The <code>:id</code> segment was <strong>${params.id}</strong>.</p>
    <p>${router.link("/", "← Back home")}</p>
  `;
}

function NotFound() {
  return html`
    <h1>Not Found</h1>
    <p>No route matched. ${router.link("/", "Go home")}</p>
  `;
}

const router = createRouter(
  {
    "/": Home,
    "/about": About,
    "/users/:id": UserPage,
    "*": NotFound,
  },
  { interceptLinks: true } // plain internal <a> links navigate client-side too
);

function App() {
  return html`
    <nav>
      ${router.link("/", "Home")}
      ${router.link("/about", "About")}
      ${router.link("/users/7", "User 7")}
      ${router.link("/missing", "Broken link")}
    </nav>
    <main>${router.view()}</main>
  `;
}

mount(App, "#app");

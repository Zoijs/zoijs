// Description — set <meta name="description"> from a component, and show that it
// really landed in the document head.

import { html, mount } from "@zoijs/core";
import { description } from "@zoijs/head";

function Page() {
  description("A tiny demo of @zoijs/head setting the page description.");

  const current = document.head.querySelector('meta[name="description"]').getAttribute("content");

  return html`
    <h1>Description</h1>
    <p>This page set a meta description. Here's what's in the document head now:</p>
    <p class="peek"><code>&lt;meta name="description" content="${current}"&gt;</code></p>
  `;
}

mount(Page, "#app");

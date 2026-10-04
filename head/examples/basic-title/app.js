// Basic title — set the browser-tab title from a component.

import { html, mount } from "@zoijs/core";
import { title } from "@zoijs/head";

function Page() {
  title("Welcome | Zoijs App");

  return html`
    <h1>Basic title</h1>
    <p>Look at the browser tab — it now reads "Welcome | Zoijs App".</p>
    <p class="peek">This page called <code>title("Welcome | Zoijs App")</code>.</p>
  `;
}

mount(Page, "#app");

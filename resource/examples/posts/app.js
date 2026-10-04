// Posts list — a resource whose data is an array, rendered with each().

import { html, mount, each } from "@zoijs/core";
import { resource } from "@zoijs/resource";
import { delay, samplePosts } from "../fake-api.js";

function Posts() {
  const posts = resource(() => delay(samplePosts));

  return html`
    <h1>Posts</h1>
    ${() => (posts.loading() ? html`<p class="muted">Loading…</p>` : null)}
    ${() => (posts.error() ? html`<p class="err">${posts.error().message}</p>` : null)}
    <ul>
      ${each(
        () => posts.data() ?? [], // undefined until loaded → render nothing
        (post) => post.id,
        (post) => html`<li>
          <strong>${() => post.title}</strong>
          <span>${() => post.body}</span>
        </li>`
      )}
    </ul>
  `;
}

mount(Posts, "#app");

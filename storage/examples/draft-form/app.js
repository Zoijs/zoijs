// Draft form — text is saved to localStorage as you type and restored on reload.

import { html, mount } from "@zoijs/core";
import { storage } from "@zoijs/storage";

const draft = storage("demo-draft", "");

function App() {
  // The textarea's initial value is set once from the saved draft (peek = no
  // reactive overwrite, so the cursor never jumps while you type).
  return html`
    <h1>Draft form</h1>
    <p>Start typing — your draft is saved automatically. Reload and it's still here.</p>
    <textarea
      placeholder="Write something…"
      value=${draft.peek()}
      oninput=${(e) => draft.set(e.target.value)}
    ></textarea>
    <p class="status"><strong data-testid="count">${() => draft.get().length} characters saved</strong></p>
  `;
}

mount(App, "#app");

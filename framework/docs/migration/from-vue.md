# Coming from Vue

Vue and Zoijs both have reactivity and a friendly mental model. Zoijs trades Vue's SFCs/compiler and template directives for plain HTML in tagged templates with **no build step**.

## Concept map

| Vue | Zoijs |
|---|---|
| `ref(0)` → `count.value` | `createState(0)` → `count.get()` / `count.set()` |
| `computed(() => ...)` | `computed(() => ...)` (same idea) |
| `{{ count }}` in template | `${() => count.get()}` |
| `:class="x"` | `class=${() => x.get()}` |
| `@click="fn"` | `onclick=${fn}` |
| `v-for="i in items" :key="i.id"` | `each(() => items.get(), i => i.id, i => html\`...\`)` |
| `v-if` | a ternary returning `html` or `null` |
| `.vue` SFC (needs a build) | a `.js` file with `html\`...\`` (no build) |

## Example

```vue
<!-- Vue SFC -->
<template>
  <button @click="count++">{{ count }}</button>
</template>
<script setup>
import { ref } from "vue";
const count = ref(0);
</script>
```

```js
// Zoijs — no build, no SFC
function Counter() {
  const count = createState(0);
  return html`<button onclick=${() => count.set(count.get() + 1)}>${() => count.get()}</button>`;
}
```

## Differences to note

- **Explicit `.get()/.set()`** instead of `.value` with auto-unwrapping. Reading is `count.get()`; writing is `count.set(...)`.
- **Wrap reactive reads in `() =>`** in templates (Vue's `{{ }}` is implicitly reactive; Zoijs's `${}` needs the arrow to be live).
- **No directives** (`v-if`, `v-for`, `v-model`) — use plain JS: ternaries for conditionals, `each` for lists, an `oninput` handler for two-way input.
- **No build step or SFC compiler** — it's a plain module.

## Reactivity feels similar

`createState`/`computed` map closely to `ref`/`computed`. The main adjustment is the explicit `get/set` and the `() =>` rule in templates.

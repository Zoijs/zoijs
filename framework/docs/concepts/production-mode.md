# Production mode — `configure`

Zoijs runs in **development mode by default**, which prints helpful warnings:

- duplicate `each` keys,
- self-triggering effects (state written from a binding that reads it),
- runaway update loops.

For production, silence them:

```js
import { configure } from "./src/index.js";

configure({ dev: false });
```

Call it **once, before mounting**. There's no build step involved — it's just a runtime flag.

```js
import { configure, mount } from "./src/index.js";
import { App } from "./app.js";

configure({ dev: false });
mount(App, "#app");
```

## What changes

| | Development (default) | Production (`dev: false`) |
|---|---|---|
| Helpful warnings | shown | silenced |
| Behavior / safety | identical | identical |

**Safety is always on.** Loop protection and error containment work in both modes — production just skips the console noise.

## Recommendation

Keep dev mode on while building (the warnings catch real bugs early), and flip to `dev: false` when you deploy.

---

Back to the [docs home](../README.md), or jump to a [tutorial](../README.md#tutorials-build-something).

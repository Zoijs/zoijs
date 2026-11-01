// Playwright global setup: a SECOND PHYSICAL COPY of the core for the two-copies Trusted Types
// gate (csp.spec.js). Same files, different URLs → separate module instances, exactly like a CDN
// copy next to a bundled one. Generated each run; gitignored.

import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const src = fileURLToPath(new URL("../src/", import.meta.url));
  const dest = fileURLToPath(new URL("./fixtures/core-copy/", import.meta.url));
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

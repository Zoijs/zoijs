// brand.js — how Zoijs recognizes its own html`…` results and each() markers.
// Symbol branding prevents JSON/application data from impersonating internal
// Zoijs results (a forged template's HTML would be emitted as raw markup): JSON
// can only produce string keys. Symbol.for, so compatible copies of the core on
// one page still recognize each other's results. Internal — never exported.

export const TEMPLATE = Symbol.for("zoijs.template");
export const EACH = Symbol.for("zoijs.each");
export const UNSAFE_HTML = Symbol.for("zoijs.unsafe-html");

export const isTemplateResult = (v) => v != null && typeof v === "object" && v[TEMPLATE] === true;
export const isEachResult = (v) => v != null && typeof v === "object" && v[EACH] === true;
export const isUnsafeHTML = (v) => v != null && typeof v === "object" && v[UNSAFE_HTML] === true;

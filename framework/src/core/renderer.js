// renderer.js — fine-grained rendering engine.
//
// Turns an html() result into live DOM and wires each dynamic slot to a live
// binding. No Virtual DOM, no component re-execution.
//
//   - A FUNCTION value is reactive (runs in an effect): text updates a Text node
//     in place; attributes update in place.
//   - An each() marker becomes a keyed LIST binding (reuse / move / remove).
//   - A non-function value is static (set once, no effect).
//   - An EVENT slot's value is the handler (addEventListener; never a string).
//
// Cleanup is owned: render() creates an owner scope; every effect, listener, and
// nested render registers into it, so disposing the owner tears everything down.

import { effect, untrack } from "../reactivity/effect.js";
import { createState } from "../reactivity/state.js";
import { createOwner, runWithOwner, disposeOwner, onCleanup } from "../reactivity/owner.js";
import { isDev } from "../reactivity/env.js";
import { toText, isSafeUrl, isSafeAttributeName } from "../utils/security.js";

const XLINK_NS = "http://www.w3.org/1999/xlink";
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "ping", "xlink:href"]);
const noop = () => {};

/**
 * @param {{ template: HTMLTemplateElement, parts: object[], values: any[] }} result
 * @returns {{ node: DocumentFragment, dispose: Function }}
 */
export function render(result) {
  const owner = createOwner(); // nested under the active owner
  const fragment = result.template.content.cloneNode(true);
  const { parts, values } = result;

  // Collect every part's target node on the PRISTINE clone first (document
  // order), so a binding that inserts children can't shadow a later part.
  const nodes = collectNodes(fragment, parts, result.hasElements);

  runWithOwner(owner, () => {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const node = nodes[i];
      if (!node) continue;

      if (part.type === "child") {
        bindChild(node, values[part.hole]);
      } else {
        node.removeAttribute("data-zoijs-bind");
        for (const attr of part.attrs) bindAttribute(node, attr, values);
      }
    }
  });

  return { node: fragment, dispose: () => disposeOwner(owner) };
}

// Match parts to nodes by document order: a child part ↔ the next marker comment,
// an element part ↔ the next element carrying data-zoijs-bind. Unique markers make
// this collision-proof across nested templates and list items.
function collectNodes(fragment, parts, hasElements) {
  const nodes = new Array(parts.length);
  if (!parts.length) return nodes;
  // Child-only templates (common for list items) can walk comments only.
  const filter = hasElements ? NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT : NodeFilter.SHOW_COMMENT;
  const walker = document.createTreeWalker(fragment, filter);
  let p = 0;
  let node;
  while (p < parts.length && (node = walker.nextNode())) {
    const isChildMarker = node.nodeType === 8 && node.data === "zoijs";
    const isElementMarker = node.nodeType === 1 && node.hasAttribute("data-zoijs-bind");
    if (isChildMarker || isElementMarker) {
      nodes[p] = node;
      p++;
    }
  }
  return nodes;
}

function bindChild(anchor, value) {
  if (isEach(value)) setupKeyedList(anchor, value);
  else if (typeof value === "function") bindReactiveContent(anchor, value);
  else insertStaticContent(anchor, value);
}

function bindAttribute(el, attr, values) {
  if (attr.event) {
    const handler = values[attr.holes[0]];
    // Only real functions are accepted as handlers — a string/object is ignored,
    // so an inline-handler string can never be wired up or executed.
    if (typeof handler !== "function") {
      if (isDev()) console.warn(`Zoijs: ignoring non-function event handler for "${attr.name}"`);
      return;
    }
    const eventName = attr.name.slice(2).toLowerCase();
    el.addEventListener(eventName, handler);
    onCleanup(() => el.removeEventListener(eventName, handler));
    return;
  }

  if (attr.whole) {
    // A single ${} as the whole value → pass the raw value (preserves booleans,
    // numbers, property types for value/checked).
    const raw = values[attr.holes[0]];
    if (typeof raw === "function") effect(() => applyAttribute(el, attr.name, raw()));
    else applyAttribute(el, attr.name, raw);
    return;
  }

  // Multi-part value (static text + one or more holes) → always a joined string.
  const compute = () => {
    let result = attr.strings[0];
    for (let i = 0; i < attr.holes.length; i++) {
      const hv = values[attr.holes[i]];
      result += (typeof hv === "function" ? hv() : hv) + attr.strings[i + 1];
    }
    return result;
  };
  const reactive = attr.holes.some((h) => typeof values[h] === "function");
  if (reactive) effect(() => applyAttribute(el, attr.name, compute()));
  else applyAttribute(el, attr.name, compute());
}

// ---- text / content bindings -------------------------------------------------

function bindReactiveContent(anchor, getValue) {
  let mode = null; // "text" | "nodes"
  let textNode = null;
  let items = []; // [{ nodes, dispose }]

  const clearNodes = () => {
    for (const it of items) {
      it.dispose();
      for (const n of it.nodes) n.remove();
    }
    items = [];
  };
  const clearText = () => {
    if (textNode) {
      textNode.remove();
      textNode = null;
    }
  };

  effect(() => {
    const value = getValue();
    const t = typeof value;
    // null/undefined/booleans render NOTHING (matches the `cond && html\`...\``
    // idiom); numbers/strings render as text; everything else is node content.
    const asText = value == null || t === "boolean" || t === "number" || t === "string" || t === "bigint";
    if (asText) {
      if (mode !== "text") {
        clearNodes();
        textNode = document.createTextNode("");
        anchor.parentNode.insertBefore(textNode, anchor);
        mode = "text";
      }
      textNode.data = value == null || t === "boolean" ? "" : toText(value); // in-place update
    } else {
      if (mode === "text") clearText();
      else clearNodes();
      mode = "nodes";
      insertItems(anchor, value, items);
    }
  });

  onCleanup(() => {
    clearNodes();
    clearText();
  });
}

function insertStaticContent(anchor, value) {
  if (value == null) return;
  const items = [];
  insertItems(anchor, value, items);
  onCleanup(() => {
    for (const it of items) {
      it.dispose();
      for (const n of it.nodes) n.remove();
    }
  });
}

function insertItems(anchor, value, items) {
  const parent = anchor.parentNode;
  const list = Array.isArray(value) ? value : [value];
  for (const v of list) {
    const item = renderChild(v);
    for (const n of item.nodes) parent.insertBefore(n, anchor);
    items.push(item);
  }
}

function renderChild(value) {
  if (value == null || value === false || value === true) return { nodes: [], dispose: noop };
  if (value instanceof Node) return { nodes: [value], dispose: noop };
  if (isHtmlResult(value)) {
    const r = render(value);
    return { nodes: [...r.node.childNodes], dispose: r.dispose };
  }
  return { nodes: [document.createTextNode(toText(value))], dispose: noop };
}

// ---- keyed list binding ------------------------------------------------------

function isEach(v) {
  return v != null && typeof v === "object" && v.__easyEach === true;
}

function setupKeyedList(anchor, marker) {
  const { items, keyFn, renderFn } = marker;
  const listOwner = createOwner(); // item subtrees nest here
  let records = new Map();
  let currentList = [];

  const readItems = () => {
    const raw = typeof items === "function" ? items() : items;
    return raw == null ? [] : raw;
  };

  // Build one item. The item is a reactive proxy over a state cell, so reusing a
  // node later (itemCell.set) refreshes only its own bindings. render() opens a
  // child owner (nested in listOwner) so the whole item subtree disposes together.
  const createRecord = (key, item) => {
    const isObj = item !== null && typeof item === "object";
    const itemCell = isObj ? createState(item) : null;
    const arg = isObj ? makeItemProxy(itemCell) : item;
    // Run renderFn inside this item's own owner scope, so any onCleanup() it
    // registers fires when the item is removed (not only on full unmount).
    const itemOwner = createOwner();
    let nodes;
    untrack(() =>
      runWithOwner(itemOwner, () => {
        const r = render(renderFn(arg));
        nodes = [...r.node.childNodes];
      })
    );
    return { key, item, itemCell, nodes, dispose: () => disposeOwner(itemOwner) };
  };

  const reconcile = (newItems) => {
    const parent = anchor.parentNode;
    const oldRecords = records;
    const newRecords = new Map();
    const ordered = [];
    const seen = isDev() ? new Set() : null;

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const key = keyFn(item);
      if (isDev()) {
        if (seen.has(key)) {
          console.warn(`Zoijs each(): duplicate key ${stringifyKey(key)} — keys must be unique; DOM for duplicates may be unstable.`);
        }
        seen.add(key);
      }
      let rec = oldRecords.get(key);
      if (rec) {
        oldRecords.delete(key);
        if (rec.itemCell) rec.itemCell.set(item); // refresh this item's bindings only
        rec.item = item;
      } else {
        rec = createRecord(key, item);
      }
      newRecords.set(key, rec);
      ordered.push(rec);
    }

    // Removed keys: dispose their owner scope (effects/listeners) + remove nodes.
    for (const rec of oldRecords.values()) {
      rec.dispose();
      for (const n of rec.nodes) n.remove();
    }

    // Place nodes in order before the anchor, moving only those out of position.
    let cursor = anchor;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const rec = ordered[i];
      let ref = cursor;
      for (let j = rec.nodes.length - 1; j >= 0; j--) {
        const node = rec.nodes[j];
        if (node.nextSibling !== ref) parent.insertBefore(node, ref);
        ref = node;
      }
      cursor = rec.nodes[0] || cursor;
    }

    records = newRecords;
    currentList = ordered;
  };

  effect(() => {
    const newItems = readItems(); // tracked: subscribe to the list state
    runWithOwner(listOwner, () => reconcile(newItems));
  });

  onCleanup(() => {
    for (const rec of currentList) {
      rec.dispose();
      for (const n of rec.nodes) n.remove();
    }
  });
}

function makeItemProxy(itemCell) {
  return new Proxy(
    {},
    {
      get(_, prop) {
        const item = itemCell.get();
        if (item == null) return undefined;
        const v = item[prop];
        return typeof v === "function" ? v.bind(item) : v;
      },
      has(_, prop) {
        const item = itemCell.get();
        return item != null && prop in Object(item);
      },
    }
  );
}

function stringifyKey(key) {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

// ---- attribute binding -------------------------------------------------------

function applyAttribute(el, name, value) {
  if (!isSafeAttributeName(name)) {
    if (isDev()) console.warn(`Zoijs: refusing to bind unsafe attribute "${name}"`);
    return;
  }
  if (URL_ATTRS.has(name) && !isSafeUrl(toText(value))) {
    if (isDev()) console.warn(`Zoijs: refusing unsafe URL in "${name}": ${value}`);
    return;
  }
  if (name === "value" || name === "checked") {
    el[name] = value; // form-control state lives on the property
    return;
  }
  if (name.startsWith("xlink:")) {
    // SVG namespaced attribute (e.g. xlink:href).
    if (value === false || value == null) el.removeAttributeNS(XLINK_NS, name.slice(6));
    else el.setAttributeNS(XLINK_NS, name, toText(value));
    return;
  }
  if (value === false || value == null) {
    el.removeAttribute(name);
  } else if (value === true) {
    el.setAttribute(name, "");
  } else {
    el.setAttribute(name, toText(value));
  }
}

// ---- helpers -----------------------------------------------------------------

function isHtmlResult(v) {
  return v && typeof v === "object" && v.template && Array.isArray(v.parts);
}

// html() — the template function.
//
//   html`<button onclick=${handler}>${() => count.get()}</button>`
//
// Parses the STATIC structure once (cached), tracking real HTML lexical context
// with a small state machine — so it knows whether each ${} falls in text, an
// attribute value, an event, etc. Dynamic values are kept in a separate channel
// from the static HTML; a value can never change the template's structure.
//
// Output of the parse (cached per `strings`):
//   template : a <template> element with unique markers
//   parts    : ordered list of binding descriptors
//      { type: "child" }                          ← a comment-marker anchor
//      { type: "element", attrs: [AttrPart] }     ← element carrying data-zoijs-bind
//   AttrPart : { name, strings, holes, event, whole }
//
// Matching is by DOCUMENT ORDER (renderer walks the clone), so markers can never
// collide across nested templates or list items.

import { createTemplate } from "../utils/dom.js";

const cache = new WeakMap();

/**
 * @param {TemplateStringsArray} strings  static HTML chunks (author-controlled)
 * @param {...any} values                 dynamic values, one per slot
 * @returns {{ template: HTMLTemplateElement, parts: object[], values: any[] }}
 */
export function html(strings, ...values) {
  let compiled = cache.get(strings);
  if (!compiled) {
    compiled = compile(strings);
    cache.set(strings, compiled);
  }
  return { template: compiled.template, parts: compiled.parts, hasElements: compiled.hasElements, values };
}

// ---- scanner ----------------------------------------------------------------

const TEXT = 0;
const TAGNAME = 1;
const BEFORE_ATTR = 2;
const ATTR_NAME = 3;
const AFTER_NAME = 4;
const BEFORE_VAL = 5;
const VAL_DQ = 6;
const VAL_SQ = 7;
const VAL_UQ = 8;
const CLOSE_TAG = 9;
const COMMENT = 10;
const RAWTEXT = 11;

const RAWTEXT_TAGS = new Set(["script", "style", "textarea", "title"]);
const isWS = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
const isLetter = (c) => c >= "a" && c <= "z" || c >= "A" && c <= "Z";

function unsupported(message) {
  throw new Error(`Zoijs template: ${message}`);
}

function compile(strings) {
  let out = "";
  const parts = [];
  let state = TEXT;

  // current tag / attribute being built
  let tagName = "";
  let dynAttrs = [];
  let selfClose = false;
  let rawtextTag = "";
  let attrStart = 0; // index in `out` where the current attribute's name starts
  let attrName = "";
  let dynamic = false; // current attribute value contains a hole
  let strs = null; // static fragments of the current dynamic attribute value
  let holes = null; // hole indices of the current dynamic attribute value
  let frag = ""; // running static fragment of the current attribute value

  const finalizeAttr = () => {
    if (dynamic) {
      strs.push(frag);
      const whole = strs.length === 2 && strs[0] === "" && strs[1] === "";
      let event = false;
      if (/^on/i.test(attrName)) {
        if (!whole) unsupported(`event handler "${attrName}" must be a single \${} value`);
        event = true;
      }
      dynAttrs.push({ name: attrName, strings: strs, holes, event, whole });
    }
    dynamic = false;
    strs = null;
    holes = null;
    frag = "";
    attrName = "";
  };

  const finalizeTag = () => {
    if (dynAttrs.length) {
      out += " data-zoijs-bind";
      parts.push({ type: "element", attrs: dynAttrs });
    }
    out += selfClose ? "/>" : ">";
    const lower = tagName.toLowerCase();
    if (RAWTEXT_TAGS.has(lower)) {
      state = RAWTEXT;
      rawtextTag = lower;
    } else {
      state = TEXT;
    }
    tagName = "";
    dynAttrs = [];
    selfClose = false;
  };

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];

    for (let k = 0; k < s.length; k++) {
      const c = s[k];

      switch (state) {
        case TEXT:
          if (c === "<") {
            const nx = s[k + 1];
            if (nx === "/") { out += "<"; state = CLOSE_TAG; }
            else if (nx === "!") { out += "<"; state = s.substr(k + 1, 3) === "!--" ? COMMENT : CLOSE_TAG; }
            else if (nx && isLetter(nx)) { out += "<"; state = TAGNAME; tagName = ""; dynAttrs = []; }
            else if (nx === undefined && i < strings.length - 1) { out += "<"; state = TAGNAME; tagName = ""; dynAttrs = []; } // "<${tag}>" → clear error at the hole
            else out += "<"; // a literal "<" in text (e.g. "a < b")
          } else out += c;
          break;

        case TAGNAME:
          if (isWS(c)) { out += c; state = BEFORE_ATTR; }
          else if (c === ">") finalizeTag();
          else if (c === "/") selfClose = true;
          else { tagName += c; out += c; }
          break;

        case BEFORE_ATTR:
          if (isWS(c)) out += c;
          else if (c === ">") finalizeTag();
          else if (c === "/") selfClose = true;
          else { state = ATTR_NAME; attrName = c; attrStart = out.length; out += c; dynamic = false; }
          break;

        case ATTR_NAME:
          if (c === "=") { out += c; state = BEFORE_VAL; }
          else if (isWS(c)) { out += c; state = AFTER_NAME; }
          else if (c === ">") finalizeTag();
          else if (c === "/") { selfClose = true; state = AFTER_NAME; }
          else { attrName += c; out += c; }
          break;

        case AFTER_NAME:
          if (isWS(c)) out += c;
          else if (c === "=") { out += c; state = BEFORE_VAL; }
          else if (c === ">") finalizeTag();
          else if (c === "/") selfClose = true;
          else { state = ATTR_NAME; attrName = c; attrStart = out.length; out += c; dynamic = false; }
          break;

        case BEFORE_VAL:
          if (isWS(c)) out += c;
          else if (c === '"' || c === "'") { out += c; frag = ""; dynamic = false; state = c === '"' ? VAL_DQ : VAL_SQ; }
          else { frag = c; out += c; dynamic = false; state = VAL_UQ; }
          break;

        case VAL_DQ:
        case VAL_SQ: {
          const q = state === VAL_DQ ? '"' : "'";
          if (c === q) { if (dynamic) finalizeAttr(); else out += c; state = BEFORE_ATTR; }
          else if (dynamic) frag += c;
          else { frag += c; out += c; }
          break;
        }

        case VAL_UQ:
          if (isWS(c)) { if (dynamic) finalizeAttr(); out += c; state = BEFORE_ATTR; }
          else if (c === ">") { if (dynamic) finalizeAttr(); finalizeTag(); }
          else if (dynamic) frag += c;
          else { frag += c; out += c; }
          break;

        case CLOSE_TAG:
          out += c;
          if (c === ">") state = TEXT;
          break;

        case COMMENT:
          out += c;
          if (c === ">" && out.endsWith("-->")) state = TEXT;
          break;

        case RAWTEXT:
          out += c;
          if (c === ">" && out.toLowerCase().endsWith("</" + rawtextTag + ">")) state = TEXT;
          break;
      }
    }

    // end of chunk → a hole (unless this was the last chunk)
    if (i < strings.length - 1) {
      const hole = i;
      switch (state) {
        case TEXT:
          out += "<!--zoijs-->";
          parts.push({ type: "child", hole });
          break;

        case BEFORE_VAL: // attr=${x}  → unquoted whole-value hole
          out = out.slice(0, attrStart);
          dynamic = true; strs = [""]; holes = [hole]; frag = "";
          state = VAL_UQ;
          break;

        case VAL_DQ:
        case VAL_SQ:
        case VAL_UQ:
          if (!dynamic) { out = out.slice(0, attrStart); dynamic = true; strs = [frag]; holes = [hole]; frag = ""; }
          else { strs.push(frag); holes.push(hole); frag = ""; }
          break;

        case TAGNAME:
          unsupported("dynamic tag names are not supported (e.g. `<${tag}>`)");
        case BEFORE_ATTR:
        case ATTR_NAME:
        case AFTER_NAME:
          unsupported("dynamic attribute names / spreads are not supported (e.g. `<el ${x}>`)");
        case COMMENT:
          unsupported("interpolation inside an HTML comment is not supported");
        case RAWTEXT:
          unsupported(`interpolation inside <${rawtextTag}> is not supported — set its content via a property instead`);
        case CLOSE_TAG:
          unsupported("interpolation inside a closing tag is not supported");
        default:
          unsupported("interpolation in an unsupported position");
      }
    }
  }

  const hasElements = parts.some((p) => p.type === "element");
  return { template: createTemplate(out), parts, hasElements };
}

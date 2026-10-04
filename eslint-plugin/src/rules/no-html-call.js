// no-html-call — `html` must be used as a tagged template (html`…`). Calling it as a
// function (`html([...])`, `html(strings)`, `html.call(…)`) passes markup that did not
// come from your source code: the runtime rejects arrays built from data, but a
// deliberately rebuilt template object can't be told apart at runtime — so any direct
// call is flagged here. For untrusted HTML use @zoijs/sanitize.

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow calling `html` as a function; use it only as a tagged template",
      recommended: true,
      url: "https://zoijs.dev/security",
    },
    schema: [],
    messages: {
      directCall: "Use `html` as a tagged template (html`…`), not as a function. Never pass runtime HTML to it; for untrusted HTML use @zoijs/sanitize.",
    },
  },

  create(context) {
    const isHtml = (n) => n && n.type === "Identifier" && n.name === "html";
    return {
      CallExpression(node) {
        const c = node.callee;
        const viaMember = c.type === "MemberExpression" && isHtml(c.object) && !c.computed && ["call", "apply", "bind"].includes(c.property.name);
        const viaReflect = c.type === "MemberExpression" && c.object.type === "Identifier" && c.object.name === "Reflect" && isHtml(node.arguments[0]);
        if (isHtml(c) || viaMember || viaReflect) context.report({ node, messageId: "directCall" });
      },
    };
  },
};

export default rule;

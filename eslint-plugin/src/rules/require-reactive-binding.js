// require-reactive-binding — Zoijs's one rule, enforced.
//
// Zoijs setup runs ONCE. Inside an `html` template, a value updates only when it
// is wrapped in an arrow function: `${() => count.get()}` is live; `${count.get()}`
// is read a single time during setup and never updates again. That silent staleness
// is the #1 beginner footgun, and it has no runtime error to catch it — the page
// just sits there. This rule flags it at author time and offers a one-keystroke fix.
//
// Detection is deliberately narrow to keep false positives near zero:
//   • Only interpolations of an `html\`…\`` tagged template are inspected.
//   • Only a ZERO-ARGUMENT `.get()` counts — that is Zoijs's reactive-read shape.
//     `map.get(key)` / `params.get("id")` take an argument and are left alone.
//   • A `.get()` reached only THROUGH a nested function (an event handler, an
//     `each`/`effect`/`computed` callback, a `${() => …}` binding) is fine — the
//     function defers the read, so it stays reactive. We never descend into one.
//   • `.peek()` is the sanctioned one-time read and is never flagged — reach for it
//     when a static read is what you actually mean.

/** The tag names whose interpolations carry reactive bindings. */
const TEMPLATE_TAGS = new Set(["html"]);

/** Is `node` a Zoijs reactive read — a zero-arg, non-computed `.get()` call? */
function isReactiveGet(node) {
  return (
    node.type === "CallExpression" &&
    node.arguments.length === 0 &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "get"
  );
}

// Does `root` contain a reactive `.get()` that runs eagerly — i.e. NOT inside a
// nested function within `root`? We walk the subtree but stop at any function
// boundary, because code inside a function is deferred and therefore reactive-safe.
function containsEagerGet(root) {
  let found = false;
  const visit = (node) => {
    if (found || !node || typeof node.type !== "string") return;
    if (isReactiveGet(node)) {
      found = true;
      return;
    }
    // A nested function defers execution — its reads are reactive. Don't descend.
    if (
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "FunctionDeclaration"
    ) {
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) visit(c);
      } else if (child && typeof child.type === "string") {
        visit(child);
      }
    }
  };
  visit(root);
  return found;
}

/** @type {import("../index.d.ts").ZoijsRuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require reactive reads inside an `html` template to be wrapped in an arrow function so the DOM updates",
      recommended: true,
      url: "https://zoijs.dev/eslint-plugin",
    },
    fixable: "code",
    schema: [],
    messages: {
      staticRead:
        "This reactive `.get()` runs once during setup, so the DOM won't update when the value changes. Wrap the binding in an arrow function: `${() => …}`. (Use `.peek()` for an intentional one-time read.)",
    },
  },

  create(context) {
    const source = context.sourceCode || context.getSourceCode();
    return {
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || !TEMPLATE_TAGS.has(node.tag.name)) return;
        for (const expr of node.quasi.expressions) {
          if (!containsEagerGet(expr)) continue;
          context.report({
            node: expr,
            messageId: "staticRead",
            fix(fixer) {
              return fixer.replaceText(expr, `() => ${source.getText(expr)}`);
            },
          });
        }
      },
    };
  },
};

export default rule;

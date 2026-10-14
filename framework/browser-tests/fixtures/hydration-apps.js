// Components shared by the server render (hydration.spec.js, in Node via @zoijs/ssr) and the
// client (hydration-client.js, in the browser). Built from the core passed in, so each side
// uses its own copy.
export const makeApps = ({ html, each, createState }) => {
  const show = createState(true);
  const count = createState(0);
  const items = createState([{ id: 1, t: "one" }, { id: 2, t: "two" }, { id: 3, t: "three" }]);
  const Form = () => html`<form>
      <input id="name" value=${"server"} oninput=${() => count.set(count.peek() + 1)}/>
      <textarea id="bio">${"hello"}</textarea>
      <input id="agree" type="checkbox" checked=${false}/>
      <select id="size"><option value="s">S</option><option value="m">M</option></select>
      <output id="count">${() => count.get()}</output>
    </form>`;
  return {
    form: () => html`<main><h1>Form</h1>${() => (show.get() ? Form() : null)}</main>`,
    list: () => html`<ul>${each(() => items.get(), (x) => x.id, (x) => html`<li><input value=${() => x.t}/></li>`)}</ul>
      <button id="rev" onclick=${() => items.set([...items.peek()].reverse())}>reverse</button>`,
    mismatchServer: () => html`<div><h1>${"T"}</h1><section>${html`<b>${"in"}</b>`}</section></div>`,
    mismatchClient: () => html`<div><h1>${"T"}</h1><section>${html`<i>${"in"}</i>`}</section></div>`,
    counter: () => html`<p><button id="inc" onclick=${() => count.set(count.peek() + 1)}>${() => count.get()}</button></p>`,
  };
};

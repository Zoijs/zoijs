// each() — keyed list rendering (Milestone 3).
//
// Returns a small marker object that the renderer recognizes in a text slot and
// turns into a keyed list binding. Keeping this factory tiny (and separate from
// the renderer) avoids a circular import — the renderer just checks the marker.
//
//   ${each(
//     () => todos.get(),        // items: a reactive function (or a plain array)
//     todo => todo.id,          // keyFn: a stable unique key per item
//     todo => html`<li>...</li>` // renderFn: builds DOM for one item
//   )}
//
// When the array changes, items with matching keys reuse their DOM nodes (moved
// if reordered); new keys are inserted; removed keys are disposed and removed.

/**
 * @param {Function|Array} items    a function returning the array, or an array
 * @param {Function} keyFn          item -> unique key
 * @param {Function} renderFn       item -> html() result
 * @returns {{ __easyEach: true, items: any, keyFn: Function, renderFn: Function }}
 */
export function each(items, keyFn, renderFn) {
  return { __easyEach: true, items, keyFn, renderFn };
}

// A PLUGIN (not core): interaction-state tracking built entirely on the Pointer
// + Focus seams — proof that a plugin can implement CSS :hover/:active/:focus
// with zero core change. The real CSS engine (Increment 3) does this internally.

/** Pure: the ancestor chain view -> root (inclusive), following `.parent`. */
export function ancestorChain(view) {
  const out = [];
  for (let v = view; v != null; v = v.parent) out.push(v);
  return out;
}

/** Pure: given previous and next chains, the views to clear and to set. */
export function chainDiff(prev, next) {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    clear: prev.filter((v) => !nextSet.has(v)),
    set: next.filter((v) => !prevSet.has(v)),
  };
}

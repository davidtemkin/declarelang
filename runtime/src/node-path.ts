// node-path — a node's dotted address under a root (`app.col.opts`, `app.col.3`)
// and the node an address names. Core: scroll places key each pane by it, so a
// page restores where the user was in every build, not only one carrying the
// Inspector's bridge, whose `find` also matches a step by what a view says.

import { Node, authoredName } from "./node.js";

/** The dotted address of a live node under `root` — the inverse of find(). */
export function pathOf(root: Node, n: Node): string {
  const parts: string[] = [];
  let cur: Node | null = n;
  while (cur !== null && cur.parent !== null && cur !== root) {
    const m = authoredName(cur);
    parts.unshift(m ?? String(cur.parent.children.indexOf(cur)));
    cur = cur.parent;
  }
  return ["app", ...parts].join(".");
}

/** Resolve a dotted inspect path (`app.col.opts`, `app.col.3`) to the node.
 *  Returns null (never throws) on a miss — the caller owns the message. */
export function findPath(root: Node, path: string, said?: (from: Node, words: string) => Node | undefined): Node | null {
  // a step is a member's name, a child's index, or what a view says — its
  // label, its accessible name or its text (`app.seg.Two`), quoted when it
  // holds a dot or a space (`app.menu."Save As…"`)
  const segs = (path.match(/"[^"]*"|[^.]+/g) ?? []).filter((s) => s !== "");
  let cur: Node = root;
  for (let i = segs[0] === "app" ? 1 : 0; i < segs.length; i++) {
    const raw = segs[i];
    const quoted = raw.startsWith('"');
    const seg = quoted ? raw.slice(1, -1) : raw;
    const asIndex = !quoted && /^\d+$/.test(seg) ? cur.children[Number(seg)] : undefined;
    const asName = quoted ? undefined : (cur as unknown as Record<string, unknown>)[seg];
    const next = asIndex ?? (asName instanceof Node ? asName : undefined) ?? said?.(cur, seg);
    if (next === undefined) return null;
    cur = next;
  }
  return cur;
}

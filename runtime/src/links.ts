// links — carry the compiler's extracted navigation relation (capabilities.md
// §6) across the SOURCE-STRING channel to the runtime, exactly as deps.ts does
// for constraint dependencies.
//
// The compiler's link extraction (compiler/src/links.ts) finds each
// `navigate(to)` call in an ACTIVATION handler and attaches a LinkTarget to the
// element that carries the handler (`element.link`). The precompiled (declarec)
// path serializes the program AST, so `element.link` rides along for free; the
// dev / live path ships resolved SOURCE that the browser re-parses, so links
// travel as a parallel walk-order side-list and are zipped back on after parse.
//
// serialize (compiler side) and apply (runtime side) BOTH iterate through
// `forEachElement`, so their indices align by construction — the browser
// re-parses the identical resolved source into the identical structure. APPLY
// needs nothing but field-setting, so it lives here in the zero-dep runtime.

import type { Program, Element, LinkTarget } from "./parser.js";

/** One serialized link: the element's walk-order index plus its target. Sparse
 *  — only navigable elements appear — so the side-list stays small (most
 *  elements are not links). */
export type SerializedLink = { i: number } & LinkTarget;

/** Every element in a program, in a FIXED pre-order: the root subtree, then each
 *  class body (pre-order within each). The one iteration order serialize/apply
 *  share — and the same order the constraint walk (deps.ts) visits elements in,
 *  so the two side-lists stay mutually consistent. */
export function forEachElement(program: Program, fn: (el: Element) => void): void {
  const walk = (el: Element): void => {
    fn(el);
    for (const c of el.children) walk(c);
  };
  walk(program.root);
  for (const c of program.classes) walk(c.body);
}

/** Collect each navigable element's target with its walk index (compiler side,
 *  after extraction). Empty when a program has no `navigate(to)` links. */
export function serializeLinks(program: Program): SerializedLink[] {
  const out: SerializedLink[] = [];
  let i = 0;
  forEachElement(program, (el) => {
    if (el.link) out.push({ i, ...el.link });
    i++;
  });
  return out;
}

/** Zip a walk-order link side-list back onto a freshly-parsed program (runtime
 *  side). Additive: an element with no entry keeps `link` undefined. */
export function applyLinks(program: Program, list: readonly SerializedLink[]): void {
  if (list.length === 0) return;
  const byIndex = new Map<number, SerializedLink>(list.map((e) => [e.i, e]));
  let i = 0;
  forEachElement(program, (el) => {
    const e = byIndex.get(i++);
    if (e) el.link = "href" in e ? { href: e.href } : { read: e.read };
  });
}

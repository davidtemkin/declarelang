// links — static extraction of the navigation relation (capabilities.md §6).
//
// The dual of dep-extract.ts: where that walks `{ }` CONSTRAINT bodies for the
// reactive cells they read, this walks ACTIVATION HANDLER bodies for the
// `navigate(to)` CALLS they make — the navigation SERVICE ACTION (view.ts App.
// navigate). Each call attributes a link to the element that carries the
// handler: `<element>.link = { href } | { read }`. The relation then rides the
// compile() result exactly as `deps` do (a walk-order side-list, links.ts in the
// runtime), the runtime stamps each instance `_navLink`, and the static
// extractor (seo.ts) wraps the matched subtree in `<a href>`.
//
// Attribution is BY CONSTRUCTION — rooted at the (element, handler) pair — not by
// tracing an attribute name a router secretly consults. Only ACTIVATION handlers
// (`onClick`) become anchors; a `navigate` elsewhere emits no `<a>`.
// Conditionality lives in the VALUE (`navigate(this.link)` where the link value
// is "" when it shouldn't fire), which the extractor reads as a read-path and the
// serializer honours by emitting no anchor for an empty href.
//
// Runs on the RESOLVED program (post scope resolution, so `app` is `this.root`
// and every read is an explicit `this.`/`classroot.`/`parent.` chain), the same
// input dep-extract runs on.

import ts from "typescript";
import type { Program, Element, LinkTarget } from "../../runtime/dist/parser.js";

/** Handlers whose body activates the element — a click. A navigate here becomes
 *  an anchor; a navigate in `onInit` (or any non-activation handler) does not. */
const ACTIVATION = new Set(["onClick"]);

/** Attach `element.link` for every element whose activation handler calls
 *  `navigate(to)` with a resolvable target. Mutates the program in place;
 *  serializeLinks (runtime links.ts) then reads it in walk order. */
export function extractLinks(program: Program): void {
  const visit = (el: Element, isClassRoot: boolean): void => {
    const t = linkOf(el, isClassRoot);
    if (t) el.link = t;
    for (const c of el.children) visit(c, false);
  };
  // A class-body ROOT (and the program root) is the one element where a handler's
  // `classroot` binds to the instance itself — so a `classroot.…` read there is
  // the instance's own slot. Descendants get `classroot` = an ancestor, so a
  // classroot read is not resolvable against the element and is left unlinked.
  visit(program.root, true);
  for (const c of program.classes) visit(c.body, true);
}

/** The link an element's FIRST activation handler with a `navigate(to)` call
 *  yields, or undefined. */
function linkOf(el: Element, isClassRoot: boolean): LinkTarget | undefined {
  for (const m of el.methods) {
    if (!ACTIVATION.has(m.name)) continue;
    const t = navTargetInBody(m.body ?? "", isClassRoot);
    if (t) return t;
  }
  return undefined;
}

/** Find a `navigate(to)` call in a handler body and resolve its argument. */
function navTargetInBody(body: string, isClassRoot: boolean): LinkTarget | undefined {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("h.ts", body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return undefined;
  }
  let found: LinkTarget | undefined;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) && isNavigateCallee(n.expression) && n.arguments.length >= 1) {
      const t = resolveArg(n.arguments[0], isClassRoot);
      if (t) { found = t; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return found;
}

/** Is this call target the App's navigate service action? Matches the resolved
 *  spelling `this.root.navigate`, plus `app.navigate` and a bare `navigate` for
 *  robustness — no other `.navigate(` exists (it is not an attribute anymore). */
function isNavigateCallee(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) return callee.text === "navigate";
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "navigate") return false;
  const recv = callee.expression;
  if (ts.isIdentifier(recv)) return recv.text === "app";
  // `this.root` (the resolved `app`): a `.root` access on `this`.
  return ts.isPropertyAccessExpression(recv) && recv.name.text === "root" && recv.expression.kind === ts.SyntaxKind.ThisKeyword;
}

/** Resolve a navigate argument to a link target: a string literal → an href; a
 *  pure read-path rooted at the ELEMENT (`this.…`, or `classroot.…` on a class
 *  root, which is the same instance) → a read to evaluate at t=0. Anything else
 *  (a call, concatenation, an ancestor `classroot`/`parent` read) is left
 *  unresolved — sound: the element simply gets no anchor. */
function resolveArg(arg: ts.Expression, isClassRoot: boolean): LinkTarget | undefined {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return arg.text === "" ? undefined : { href: arg.text };
  }
  const path = readPath(arg);
  if (path === null) return undefined;
  if (path.root === "this") return { read: path.text };
  // `classroot.…` resolves to the element only where classroot IS the instance.
  if (path.root === "classroot" && isClassRoot) return { read: "this" + path.text.slice("classroot".length) };
  return undefined;
}

/** A pure property/element-access chain and its root identifier, or null if the
 *  expression is anything else (a call, an operator, a literal index by expr). */
function readPath(n: ts.Expression): { root: string; text: string } | null {
  const rootOf = (e: ts.Node): string | null => {
    if (e.kind === ts.SyntaxKind.ThisKeyword) return "this";
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) return rootOf(e.expression);
    if (ts.isElementAccessExpression(e)) {
      const idx = e.argumentExpression;
      return idx && (ts.isStringLiteral(idx) || ts.isNumericLiteral(idx)) ? rootOf(e.expression) : null;
    }
    return null;
  };
  if (!ts.isPropertyAccessExpression(n) && !ts.isElementAccessExpression(n) && n.kind !== ts.SyntaxKind.ThisKeyword && !ts.isIdentifier(n)) return null;
  const root = rootOf(n);
  if (root === null) return null;
  return { root, text: n.getText() };
}

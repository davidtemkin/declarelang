// expr-emit — the kernel's EXPR bytecode for a `{ }` body that is a pure
// numeric expression over slots (docs/system-design/kernel.md §2, class (A)).
//
// What qualifies, syntactically: number and boolean literals; property chains
// rooted at this/parent/classroot/app (or a bare member name), read as slots;
// unary − and !; + − * / %; comparisons; ?: ; Math.min/max/abs/floor/ceil/
// round/sqrt; && and || only where the value is used as a CONDITION (the
// kernel's AND/OR yield 1/0, JS's yield an operand). Whether every chain lands
// on a NUMERIC slot is decided by the runtime at bind time, where the views
// exist (bind.ts): the compiler emits for every syntactic candidate and the
// binder keeps the JS body when a path does not resolve to a numeric cell.
//
// The result rides INSIDE the body's `deps` list as one marked entry — the
// deps list is the one thing that already travels every channel to every
// host (the Mac's depsJSON, the boot cache, host-client's config, the
// production program JSON) — see annotateExprs / exprOf.

import ts from "typescript";
import type { Program, Element, ClassDecl, Method } from "../../runtime/dist/parser.js";

/** The opcodes — declare_kernel.h's enum, kept in step by kernel/test. */
export const OP = Object.freeze({
  END: 0, LOAD: 1, CONST: 2, ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOD: 7, NEG: 8,
  MIN: 9, MAX: 10, ABS: 11, FLOOR: 12, CEIL: 13, ROUND: 14, SQRT: 15,
  LT: 16, LE: 17, GT: 18, GE: 19, EQ: 20, NE: 21, AND: 22, OR: 23, NOT: 24,
  SELECT: 25, CLAMP: 26,
});

export interface ExprCode { code: number[]; paths: string[]; consts: number[] }

/** The marker: a deps entry that starts with this is the body's EXPR code. */
export const EXPR_MARK = "=E";
export function pathsOf(deps: readonly string[]): string[] { return deps.filter((d) => !d.startsWith(EXPR_MARK)); }

// THE WIRE FORM — compact, since it lives in the production program JSON:
// space-separated tokens. `L<n>` loads the n-th READ PATH of the body's own
// deps list (the extractor already lists every slot the body reads; the
// index costs one or two characters where the path would cost twenty),
// `L%path` a path not in that list, `K<number>` a constant, and one letter
// per operator. Decoded by the runtime's binder (bind.ts decodeExpr) with
// the same table.
export const OP_LETTERS: Record<number, string> = {
  [OP.ADD]: "+", [OP.SUB]: "-", [OP.MUL]: "*", [OP.DIV]: "/", [OP.MOD]: "%", [OP.NEG]: "~",
  [OP.MIN]: "m", [OP.MAX]: "M", [OP.ABS]: "a", [OP.FLOOR]: "f", [OP.CEIL]: "c", [OP.ROUND]: "r", [OP.SQRT]: "q",
  [OP.LT]: "<", [OP.LE]: "l", [OP.GT]: ">", [OP.GE]: "g", [OP.EQ]: "=", [OP.NE]: "!", [OP.AND]: "&", [OP.OR]: "|", [OP.NOT]: "n",
  [OP.SELECT]: "?", [OP.CLAMP]: "^",
};
export function encodeExpr(e: ExprCode, deps: readonly string[]): string {
  const out: string[] = [];
  for (let i = 0; i < e.code.length; i++) {
    const op = e.code[i];
    if (op === OP.END) break;
    if (op === OP.LOAD) { const p = e.paths[e.code[++i]]; const di = deps.indexOf(p); out.push(di >= 0 ? "L" + di : "L%" + p); continue; }
    if (op === OP.CONST) { out.push("K" + String(e.consts[e.code[++i]])); continue; }
    const letter = OP_LETTERS[op];
    if (letter === undefined) throw new Error("expr-emit: no letter for op " + op);
    out.push(letter);
  }
  return EXPR_MARK + out.join(" ");
}

const MATH: Record<string, number> = { min: OP.MIN, max: OP.MAX, abs: OP.ABS, floor: OP.FLOOR, ceil: OP.CEIL, round: OP.ROUND, sqrt: OP.SQRT };
const K = ts.SyntaxKind;
const BIN: Partial<Record<number, number>> = {
  [K.PlusToken]: OP.ADD, [K.MinusToken]: OP.SUB, [K.AsteriskToken]: OP.MUL, [K.SlashToken]: OP.DIV, [K.PercentToken]: OP.MOD,
  [K.LessThanToken]: OP.LT, [K.LessThanEqualsToken]: OP.LE, [K.GreaterThanToken]: OP.GT, [K.GreaterThanEqualsToken]: OP.GE,
  [K.EqualsEqualsToken]: OP.EQ, [K.EqualsEqualsEqualsToken]: OP.EQ, [K.ExclamationEqualsToken]: OP.NE, [K.ExclamationEqualsEqualsToken]: OP.NE,
};

// ── PURE METHOD INLINING ─────────────────────────────────────────────────────
// `app.lerp(a, b, t)` with `lerp(a: number, b: number, t: number) -> number
// { return a + (b - a) * t }` is a numeric expression too: the call is
// replaced by the method's return expression with the arguments substituted
// (each argument is re-emitted where its parameter is read — pure, so the
// duplication changes nothing). What may be inlined: every parameter typed
// `number`, `-> number`, a body that is one `return <expr>`, and the callee
// STATICALLY KNOWN — `app`'s methods (the root is instantiated nowhere
// else), and a class's for `classroot`/`this` only when no subclass and no
// use site of the class (or of a subclass) declares a method of that name.
// The receiver's own slots read inside the body (`this.nDays`) become the
// receiver's path in the caller (`this.root.nDays`).
export interface InlineScope {
  /** The methods visible for a receiver at this body's site, or null. */
  lookup(receiver: "app" | "classroot" | "this", name: string): Method | null;
}
interface Env {
  /** The receiver path `this` means inside an inlined body ("this.root",
   *  "classroot", "this"); null at the top level (the body's own `this`). */
  prefix: string | null;
  /** Parameter name → the argument node and the env it is read in. */
  params: Map<string, { node: ts.Node; env: Env }>;
  depth: number;
}
const INLINE_DEPTH = 3;
const METHOD_AST = new WeakMap<Method, ts.Expression | null>();
/** The method's return expression when its body is exactly `return <expr>`. */
function returnExprOf(m: Method): ts.Expression | null {
  if (METHOD_AST.has(m)) return METHOD_AST.get(m)!;
  let out: ts.Expression | null = null;
  if (m.returns === "number" && m.params.every((q) => q.type === "number" && q.nullable !== true)) {
    const body = m.body.trim();
    const sf = ts.createSourceFile("m.ts", "function f() " + (body.startsWith("{") ? body : "{" + body + "}"), ts.ScriptTarget.ES2022, true);
    const fn = sf.statements[0];
    if (sf.statements.length === 1 && fn !== undefined && ts.isFunctionDeclaration(fn) && fn.body !== undefined && fn.body.statements.length === 1) {
      const st = fn.body.statements[0];
      if (ts.isReturnStatement(st) && st.expression !== undefined) out = st.expression;
    }
  }
  METHOD_AST.set(m, out);
  return out;
}

/** Emit, or null when the body is not a pure numeric expression. */
export function emitExpr(src: string, scope: InlineScope | null = null): ExprCode | null {
  const sf = ts.createSourceFile("body.ts", "(" + src + "\n)", ts.ScriptTarget.ES2022, true);
  const st = sf.statements[0];
  if (sf.statements.length !== 1 || st === undefined || !ts.isExpressionStatement(st)) return null;
  const code: number[] = [], paths: string[] = [], consts: number[] = [];
  const constIndex = (v: number): number => { let i = consts.indexOf(v); if (i < 0 || !Object.is(consts[i], v)) { i = consts.length; consts.push(v); } return i; };
  const pathIndex = (p: string): number => { let i = paths.indexOf(p); if (i < 0) { i = paths.length; paths.push(p); } return i; };
  let ok = true;
  const fail = (): void => { ok = false; };
  // a property chain rooted at this/parent/classroot/app (or a bare member
  // name), as a slot path in the CALLER's terms; or a parameter read
  const chain = (n: ts.Node, env: Env): { path: string } | { param: { node: ts.Node; env: Env } } | null => {
    const segs: string[] = [];
    let cur: ts.Node = n;
    while (ts.isPropertyAccessExpression(cur)) { if (cur.questionDotToken) return null; segs.unshift(cur.name.text); cur = cur.expression; }
    if (cur.kind === K.ThisKeyword) segs.unshift(env.prefix ?? "this");
    else if (ts.isIdentifier(cur)) {
      const arg = env.params.get(cur.text);
      if (arg !== undefined) return segs.length === 0 ? { param: arg } : null;   // a number has no members
      if (cur.text === "app") segs.unshift("this.root");
      else if (cur.text === "classroot" || cur.text === "parent") { if (env.prefix !== null) return null; segs.unshift(cur.text); }   // an inlined body's classroot/parent is the receiver's, not the caller's
      else if (env.prefix !== null) return null;   // a free identifier inside a method body: a local, a script — not a slot
      else segs.unshift(cur.text);
    }
    else return null;
    if (segs.length === 1) return null;   // a bare identifier is a local or a constant, not a slot read
    return { path: segs.join(".") };
  };
  const receiverOf = (callee: ts.PropertyAccessExpression, env: Env): "app" | "classroot" | "this" | null => {
    const r = callee.expression;
    if (env.prefix !== null) return null;   // no inlining through an inlined body's receiver chain (depth is bounded anyway)
    if (r.kind === K.ThisKeyword) return "this";
    if (ts.isIdentifier(r)) return r.text === "app" ? "app" : r.text === "classroot" ? "classroot" : null;
    if (ts.isPropertyAccessExpression(r) && r.expression.kind === K.ThisKeyword && r.name.text === "root") return "app";
    return null;
  };
  // value position: the expression's value is consumed as a number
  const value = (n: ts.Node, env: Env): void => {
    if (!ok) return;
    if (ts.isParenthesizedExpression(n)) return value(n.expression, env);
    if (ts.isNumericLiteral(n)) { code.push(OP.CONST, constIndex(Number(n.text))); return; }
    if (n.kind === K.TrueKeyword) { code.push(OP.CONST, constIndex(1)); return; }
    if (n.kind === K.FalseKeyword) { code.push(OP.CONST, constIndex(0)); return; }
    if (ts.isPrefixUnaryExpression(n)) {
      if (n.operator === K.MinusToken) { if (ts.isNumericLiteral(n.operand)) { code.push(OP.CONST, constIndex(-Number(n.operand.text))); return; } value(n.operand, env); code.push(OP.NEG); return; }
      if (n.operator === K.PlusToken) { value(n.operand, env); return; }
      if (n.operator === K.ExclamationToken) { cond(n.operand, env); code.push(OP.NOT); return; }
      return fail();
    }
    if (ts.isBinaryExpression(n)) {
      const op = BIN[n.operatorToken.kind];
      if (op === undefined) return fail();   // && / || as VALUES are not the kernel's 1/0
      value(n.left, env); value(n.right, env); code.push(op); return;
    }
    if (ts.isConditionalExpression(n)) { cond(n.condition, env); value(n.whenTrue, env); value(n.whenFalse, env); code.push(OP.SELECT); return; }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee.expression) && callee.expression.text === "Math") {
        const op = MATH[callee.name.text];
        if (op === undefined) return fail();
        const arity = op === OP.MIN || op === OP.MAX ? 2 : 1;
        if (n.arguments.length !== arity) return fail();
        for (const a of n.arguments) value(a, env);
        code.push(op); return;
      }
      // `:field` — lowered by the compiler to `this.$data(["field"])`: a read of
      // the row's record, bound at runtime to a numeric DATA CELL (bind.ts
      // dataCellFor) that follows the record; the deps list carries ":field"
      if (callee.name.text === "$data" && callee.expression.kind === K.ThisKeyword && env.prefix === null
          && n.arguments.length === 1 && ts.isArrayLiteralExpression(n.arguments[0]) && n.arguments[0].elements.length === 1 && ts.isStringLiteral(n.arguments[0].elements[0])) {
        code.push(OP.LOAD, pathIndex(":" + n.arguments[0].elements[0].text)); return;
      }
      // a pure numeric method of a statically known receiver: inline it
      const recv = scope === null ? null : receiverOf(callee, env);
      const m = recv === null ? null : scope!.lookup(recv, callee.name.text);
      const ret = m === null ? null : returnExprOf(m);
      if (m !== null && ret !== null && env.depth < INLINE_DEPTH && n.arguments.length === m.params.length) {
        const params = new Map<string, { node: ts.Node; env: Env }>();
        for (let i = 0; i < m.params.length; i++) params.set(m.params[i].name, { node: n.arguments[i], env });
        value(ret, { prefix: recv === "app" ? "this.root" : recv!, params, depth: env.depth + 1 }); return;
      }
      return fail();
    }
    if (ts.isPropertyAccessExpression(n)) { const c = chain(n, env); if (c === null) return fail(); if ("param" in c) return value(c.param.node, c.param.env); code.push(OP.LOAD, pathIndex(c.path)); return; }
    if (ts.isIdentifier(n)) { const arg = env.params.get(n.text); if (arg === undefined) return fail(); return value(arg.node, arg.env); }
    fail();
  };
  // condition position: truthiness — && and || are fine here
  const cond = (n: ts.Node, env: Env): void => {
    if (!ok) return;
    if (ts.isParenthesizedExpression(n)) return cond(n.expression, env);
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === K.AmpersandAmpersandToken || n.operatorToken.kind === K.BarBarToken)) {
      cond(n.left, env); cond(n.right, env); code.push(n.operatorToken.kind === K.AmpersandAmpersandToken ? OP.AND : OP.OR); return;
    }
    if (ts.isPrefixUnaryExpression(n) && n.operator === K.ExclamationToken) { cond(n.operand, env); code.push(OP.NOT); return; }
    value(n, env);
  };
  value(st.expression, { prefix: null, params: new Map(), depth: 0 });
  if (!ok || paths.length === 0) return null;   // a constant body needs no rule at all
  code.push(OP.END);
  return { code, paths, consts };
}

/** The inlining scopes of a program: which methods a body may call into. */
function inlineScopes(program: Program): { forElement(el: Element, classroot: Map<string, Method> | null): InlineScope; root: Map<string, Method> } {
  const classes = new Map<string, ClassDecl>();
  for (const c of program.classes) classes.set(c.name, c);
  const chainOf = (name: string): ClassDecl[] => { const out: ClassDecl[] = []; for (let c = classes.get(name); c !== undefined; c = classes.get(c.base)) out.unshift(c); return out; };
  // a class's methods, nearest wins along the chain
  const tableOf = new Map<string, Map<string, Method>>();
  const methodsOf = (name: string): Map<string, Method> | null => {
    if (!classes.has(name)) return null;
    let t = tableOf.get(name);
    if (t === undefined) { t = new Map(); for (const c of chainOf(name)) for (const m of c.body.methods) t.set(m.name, m); tableOf.set(name, t); }
    return t;
  };
  // what is OVERRIDDEN below a class: a subclass's body, or a use site of the
  // class or a subclass, declaring the name — that name is not inlinable there
  const overridden = new Map<string, Set<string>>();
  const mark = (cls: string, names: Iterable<string>): void => { let s = overridden.get(cls); if (s === undefined) overridden.set(cls, (s = new Set())); for (const n of names) s.add(n); };
  for (const c of program.classes) { const names = c.body.methods.map((m) => m.name); for (const a of chainOf(c.name)) if (a !== c) mark(a.name, names); }
  const scan = (el: Element): void => {
    if (el.methods.length > 0) for (const a of chainOf(el.tag)) mark(a.name, el.methods.map((m) => m.name));
    for (const ch of el.children) scan(ch);
  };
  scan(program.root);
  for (const c of program.classes) scan(c.body);
  const classMethod = (cls: string, name: string): Method | null => {
    const t = methodsOf(cls);
    if (t === null) return null;
    const m = t.get(name);
    if (m === undefined || overridden.get(cls)?.has(name) === true) return null;
    return m;
  };
  const root = new Map<string, Method>();
  for (const m of program.root.methods) root.set(m.name, m);
  return {
    root,
    forElement(el, classroot) {
      const own = new Map<string, Method>();
      for (const m of el.methods) own.set(m.name, m);
      return {
        lookup(receiver, name) {
          if (receiver === "app") return root.get(name) ?? null;
          if (receiver === "classroot") return classroot?.get(name) ?? null;
          // `this`: the element's own use-site method, else its class's (unless overridden somewhere)
          return own.get(name) ?? classMethod(el.tag, name);
        },
      };
    },
  };
}

/** Attach the EXPR entry to every candidate body's deps (after dep
 *  extraction: a body without deps is not bindable statically anyway). */
export function annotateExprs(program: Program): { candidates: number; emitted: number } {
  let candidates = 0, emitted = 0;
  const scopes = inlineScopes(program);
  const visit = (v: unknown, scope: InlineScope): void => {
    const w = v as { src: string; deps?: readonly string[] };
    if (w.deps === undefined || w.deps.length === 0 || w.deps.some((d) => d.startsWith(EXPR_MARK))) return;
    candidates++;
    const e = emitExpr(w.src, scope);
    if (e === null) return;
    emitted++;
    w.deps = [...w.deps, encodeExpr(e, w.deps)];
  };
  // the same order as forEachCodeValue (deps.ts) — the indices must align
  const walk = (el: Element, classroot: Map<string, Method> | null): void => {
    const scope = scopes.forElement(el, classroot);
    for (const a of el.attrs) if (a.value.kind === "code") visit(a.value, scope);
    for (const d of el.decls) if (d.def && d.def.kind === "code") visit(d.def, scope);
    for (const c of el.children) walk(c, classroot);
  };
  walk(program.root, scopes.root);
  for (const c of program.classes) {
    const table = new Map<string, Method>();
    for (let k: ClassDecl | undefined = c; k !== undefined; k = program.classes.find((x) => x.name === k!.base)) for (const m of k.body.methods) if (!table.has(m.name)) table.set(m.name, m);
    walk(c.body, table);
  }
  return { candidates, emitted };
}

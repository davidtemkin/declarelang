// Free-identifier analysis of a `{ }` body — the input to compile-time scope
// resolution (compile.ts). Which occurrences of `count` in a body are *value
// reads of a bare name* (rewritable) versus property names, declaration
// names, labels, locals, or type positions is a real-lexing, real-AST
// question; a hand-rolled approximation would mis-classify, so this module
// reuses the TypeScript compiler's own parser — APPROACH §6's sanctioned
// primitive level, and §5's commitment that `{ }` bodies belong to the TS
// toolchain anyway (this is the first slice of that path). The dependency
// stays confined to the compile layer: nothing in the runtime module graph
// imports this file, so dist/index.js remains zero-dependency and
// browser-loadable (HANDOFF §R6 records the split).

import ts from "typescript";

/** One free value-position identifier occurrence, offsets in body-source
 *  coordinates. `shorthand` marks `{ count }` — its rewrite must become
 *  `count: <target>`, not a bare replacement, to stay an object literal. */
export interface FreeIdent {
  name: string;
  start: number;
  end: number;
  shorthand: boolean;
  /** The occurrence is a call's callee (`stroke(…)`) — what lets the compile
   *  layer keep the value CONSTRUCTORS (styling rung) out of member
   *  resolution: `stroke` alone is the slot, `stroke(…)` the constructor. */
  callee: boolean;
}

/** All free value-position identifiers of a body, in source order — or null
 *  when the body does not parse (the checker's compileExpr gate owns
 *  reporting syntax errors; resolution has nothing sound to say about a
 *  broken tree). `expression` bodies are parsed parenthesized, exactly as
 *  expr.ts evaluates them. `bound` seeds the outermost scope: the pronouns,
 *  and a method's parameters. */
export function freeIdentifiers(
  src: string,
  opts: { expression: boolean; bound: readonly string[] }
): FreeIdent[] | null {
  // The newline before the closing paren keeps a trailing `// comment` in an
  // expression body from swallowing it.
  const text = opts.expression ? `(${src}\n)` : src;
  const delta = opts.expression ? -1 : 0;
  const sf = ts.createSourceFile("body.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // parseDiagnostics is the parser's own error list — populated without a
  // Program/TypeChecker. It is not in the public .d.ts (hence the cast) but
  // is the one honest "did this parse" signal short of a full compilation.
  if ((sf as unknown as { parseDiagnostics: readonly unknown[] }).parseDiagnostics.length > 0) return null;

  const out: FreeIdent[] = [];
  // The scope chain, innermost last. Bodies run strict (expr.ts), so
  // function declarations are block-scoped like let/class; only `var`
  // hoists to the enclosing function scope.
  const scopes: Set<string>[] = [new Set(opts.bound)];
  const isBound = (name: string): boolean => scopes.some((s) => s.has(name));

  const bindingNames = (name: ts.BindingName, into: Set<string>): void => {
    if (ts.isIdentifier(name)) into.add(name.text);
    else for (const el of name.elements) {
      if (ts.isBindingElement(el)) bindingNames(el.name, into);
    }
  };

  /** `var` declarations reachable from `node` without crossing into a nested
   *  function — they belong to the enclosing function scope. */
  const collectVars = (node: ts.Node, into: Set<string>): void => {
    if (ts.isVariableDeclarationList(node) && (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0) {
      for (const d of node.declarations) bindingNames(d.name, into);
    }
    if (ts.isFunctionLike(node)) return; // a nested function's vars are its own
    ts.forEachChild(node, (c) => collectVars(c, into));
  };

  /** Block-scoped declarations sitting directly in a statement list. */
  const collectBlockScoped = (stmts: readonly ts.Statement[], into: Set<string>): void => {
    for (const s of stmts) {
      if (ts.isVariableStatement(s) && (s.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0) {
        for (const d of s.declarationList.declarations) bindingNames(d.name, into);
      } else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name !== undefined) {
        into.add(s.name.text);
      }
    }
  };

  /** Is this identifier occurrence a *value reference* (as opposed to a
   *  name being declared, a property name, a label, or a type)? */
  const classify = (id: ts.Identifier): "ref" | "shorthand" | null => {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return null;
    if (ts.isShorthandPropertyAssignment(p)) return "shorthand";
    if (ts.isPropertyAssignment(p) && p.name === id) return null;
    if (ts.isBindingElement(p)) return null; // both halves of `{ a: b }` patterns
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p)) && p.name === id) return null;
    if (
      (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
       ts.isClassDeclaration(p) || ts.isClassExpression(p)) && p.name === id
    ) return null;
    if (
      (ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) ||
       ts.isMethodSignature(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) ||
       ts.isEnumMember(p)) && p.name === id
    ) return null;
    if (ts.isLabeledStatement(p) && p.label === id) return null;
    if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id) return null;
    if (ts.isQualifiedName(p) || ts.isMetaProperty(p)) return null;
    if (ts.isPartOfTypeNode(id)) return null; // annotations, `as T` casts
    return "ref";
  };

  const isFunctionScope = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const kind = classify(node);
      if (kind !== null && !isBound(node.text)) {
        out.push({
          name: node.text,
          start: node.getStart(sf) + delta,
          end: node.end + delta,
          shorthand: kind === "shorthand",
          callee: ts.isCallExpression(node.parent) && node.parent.expression === node,
        });
      }
      return;
    }
    if (isFunctionScope(node)) {
      // One scope for params + vars + the body block's own block-scoped
      // declarations (a function expression's name binds inside itself).
      const scope = new Set<string>();
      scope.add("arguments");
      if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && node.name !== undefined) {
        scope.add(node.name.text);
      }
      for (const p of node.parameters) bindingNames(p.name, scope);
      if (node.body !== undefined) {
        collectVars(node.body, scope);
        if (ts.isBlock(node.body)) collectBlockScoped(node.body.statements, scope);
      }
      scopes.push(scope);
      ts.forEachChild(node, visit);
      scopes.pop();
      return;
    }
    if (ts.isBlock(node) || ts.isCaseBlock(node)) {
      const scope = new Set<string>();
      collectBlockScoped(ts.isBlock(node) ? node.statements : node.clauses.flatMap((c) => [...c.statements]), scope);
      scopes.push(scope);
      ts.forEachChild(node, visit);
      scopes.pop();
      return;
    }
    if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const scope = new Set<string>();
      const init = node.initializer;
      if (init !== undefined && ts.isVariableDeclarationList(init)) {
        for (const d of init.declarations) bindingNames(d.name, scope);
      }
      scopes.push(scope);
      ts.forEachChild(node, visit);
      scopes.pop();
      return;
    }
    if (ts.isCatchClause(node)) {
      const scope = new Set<string>();
      if (node.variableDeclaration !== undefined) bindingNames(node.variableDeclaration.name, scope);
      scopes.push(scope);
      ts.forEachChild(node, visit);
      scopes.pop();
      return;
    }
    ts.forEachChild(node, visit);
  };

  // The top level of a body is itself a function scope (expr.ts wraps it in
  // a Function): hoist its vars and block-scoped names into the seed scope.
  collectVars(sf, scopes[0]);
  collectBlockScoped(sf.statements, scopes[0]);
  visit(sf);
  return out;
}

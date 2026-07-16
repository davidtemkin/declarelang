// dep-classify.mjs — measure how statically analyzable Declare's `{ }` constraint
// dependencies are, across the real app corpus. For each constraint (and, followed
// interprocedurally, each method it calls) it finds the TRACKED reads — the only
// things that create reactive deps — and buckets the constraint:
//
//   T1  fully static dep set    — every tracked read resolves to a known cell/slot
//                                 at compile+link time (scope-noun.attr, .value,
//                                 literal :path, .read([literals]), pure calls,
//                                 calls to T1 methods). The scary find()/map() over
//                                 .value counts here: the traversal is UNTRACKED.
//   T2  dynamic TARGET          — a tracked read whose cell needs a runtime value:
//                                 .read([<dynamic>]), obj[<dynamic>] on a reactive
//                                 root, or iterating a reactive NODE collection.
//   T3  unbounded               — can't bound the tracked-read set statically.
//
// Reactive reads happen ONLY through tracked accessors (attribute getters,
// Dataset.read / :path). Raw property walks on a .value object are inert. So the
// analysis hunts a small, syntactically-marked surface — not general dataflow.
//
//   node tools/analysis/dep-classify.mjs [file.declare ...]   (defaults to the app corpus)

import ts from "typescript";
import { readFileSync } from "node:fs";
import { parseProgram } from "../../../runtime/dist/parser.js";
import { scanDatapaths } from "../../../runtime/dist/datapath.js";

const SCOPE_NOUNS = new Set(["this", "parent", "classroot", "app"]);
const GLOBALS = new Set(["Math","Object","JSON","Array","Number","String","Boolean","Date","console","parseInt","parseFloat","isNaN","isFinite","Infinity","NaN","undefined","null","RegExp","Symbol","Map","Set","Promise","Intl","Error"]);
const CONSTRUCTORS = new Set(["gradient","stroke","shadow","stop"]);
// Array/collection iteration methods: reactive iff the RECEIVER is a reactive node
// collection; over plain data (a .value array) the callback reads are untracked.
const ITER = new Set(["map","filter","find","findIndex","some","every","reduce","reduceRight","forEach","sort","flatMap","slice","concat","indexOf","includes","join","keys","values","entries","flat","at","reverse","fill","findLast"]);
// Pure builtin INSTANCE methods (String / Number / Array-noniter / Date). Calling
// one on a reactive value is a pure projection — it reads no reactive cell. Used by
// the SOUND boundary rule to tell "known-pure builtin" from "unknown target".
const PURE_METHODS = new Set([
  "toFixed","toString","toPrecision","valueOf","toExponential",
  "toUpperCase","toLowerCase","trim","trimStart","trimEnd","padStart","padEnd","charAt","charCodeAt","codePointAt","substring","substr","repeat","startsWith","endsWith","split","replace","replaceAll","match","matchAll","search","normalize","localeCompare","slice","at","indexOf","lastIndexOf","includes",
  "getFullYear","getMonth","getDate","getDay","getHours","getMinutes","getSeconds","getTime","getMilliseconds","getTimezoneOffset","toISOString","toLocaleDateString","toLocaleTimeString","toLocaleString","toDateString","getUTCFullYear","getUTCMonth","getUTCDate",
]);
// Sound mode: unknown call targets are conservatively treated as dynamic (they
// could read anything). Optimistic (default) trusts them as pure/static.
const SOUND = !!process.env.SOUND;
// Property names that denote a reactive NODE collection (iterating them reads each
// node's reactive slots → dynamic cell count). Conservative allow-list.
const NODE_COLLECTIONS = new Set(["children","subviews","views","members","instances"]);
// Dataset value accessors — reading one is a single tracked cell (T1); what you do
// to the RESULT (find/map/nested) is untracked.
const VALUE_ACCESSORS = new Set(["value","status","error","loading","loaded","failed","idle"]);

const DEFAULT_CORPUS = [
  "apps/calendar/calendar.declare",
  "apps/calendar-sample/calendar-sample.declare",
  "apps/weather/weather.declare",
  "apps/homepage/homepage.declare",
  "apps/docs/docs.declare",
];

// ── parse a body to a TS AST (expression or statement form), collecting locals ──
function parseBody(src, expression) {
  const rw = rewriteDP(src);
  const text = expression ? `(${rw}\n)` : rw;
  const sf = ts.createSourceFile("b.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length > 0) return null;
  return sf;
}
// rewrite :path islands to a marker call the walker recognizes as a static datapath
function rewriteDP(src) {
  let islands;
  try { islands = scanDatapaths(src); } catch { return src; }
  if (!islands.length) return src;
  let out = "", at = 0;
  for (const p of islands) {
    // $DP(n) with n = a number => encodes "static datapath read"; keeps it 1 token
    out += src.slice(at, p.start) + `$DP(${p.many ? 1 : 0})`;
    at = p.end;
  }
  return out + src.slice(at);
}

function collectLocals(sf, params) {
  const locals = new Set(params);
  const add = (name) => { if (name) { if (ts.isIdentifier(name)) locals.add(name.text); else if (name.elements) for (const el of name.elements) if (ts.isBindingElement(el)) add(el.name); } };
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) add(n.name);
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) locals.add(n.name.text);
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) for (const p of n.parameters) add(p.name);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return locals;
}

// ── the classifier: returns { tier, reasons:Set, deps:Set } for a body ──
function makeClassifier(methodTierOf) {
  return function classify(sf, locals) {
    let tier = 1;
    const reasons = new Set();
    const deps = new Set();
    const callees = new Set(); // user-method names this body calls (for transitive dep closure)
    const bump = (t, why) => { if (t > tier) tier = t; if (why) reasons.add(why); };

    // root identifier of an access/call chain
    const rootOf = (n) => { let c = n; while (ts.isPropertyAccessExpression(c) || ts.isElementAccessExpression(c) || ts.isCallExpression(c) || ts.isNonNullExpression(c) || ts.isParenthesizedExpression(c)) c = c.expression; return c; };
    const isChainInterior = (n) => { const p = n.parent; return p && ((ts.isPropertyAccessExpression(p) && p.expression === n) || (ts.isElementAccessExpression(p) && p.expression === n) || (ts.isCallExpression(p) && p.expression === n) || ts.isNonNullExpression(p) || (ts.isParenthesizedExpression(p) && false)); };
    const isReactiveRoot = (root) => {
      if (ts.isIdentifier(root)) {
        const t = root.text;
        if (SCOPE_NOUNS.has(t)) return true;
        if (locals.has(t) || GLOBALS.has(t) || CONSTRUCTORS.has(t)) return false;
        return true; // a free name → resolves to an enclosing-scope attribute (compile.ts)
      }
      if (root.kind === ts.SyntaxKind.ThisKeyword) return true;
      return false;
    };

    // walk the chain from a top node, escalating on dynamic segments / calls
    const classifyChain = (top) => {
      const root = rootOf(top);
      const reactive = isReactiveRoot(root);
      // collect segments outer→inner and recurse into side-expressions (args, indices)
      let n = top;
      const segs = [];
      while (n && (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n) || ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n))) {
        segs.push(n);
        if (ts.isCallExpression(n)) for (const a of n.arguments) walk(a);
        if (ts.isElementAccessExpression(n)) walk(n.argumentExpression);
        n = n.expression;
      }
      if (!reactive) {
        // still may hold a $DP marker call or reactive reads inside args (already walked)
        if (ts.isIdentifier(root)) { /* pure/local */ }
        return;
      }
      // reactive-rooted chain → default T1 dep; scan for escalators
      const rootName = ts.isIdentifier(root) ? root.text : "this";
      let depName = rootName;
      // segs are outer→inner; reverse to read root→out
      const ordered = [...segs].reverse();
      for (const s of ordered) {
        // a property that is itself a call's callee (`.map`, `.read`, a method) is
        // handled by the Call branch below — don't let its name pollute the dep.
        if (ts.isPropertyAccessExpression(s) && s.parent && ts.isCallExpression(s.parent) && s.parent.expression === s) continue;
        if (ts.isPropertyAccessExpression(s)) { depName += "." + s.name.text; }
        else if (ts.isElementAccessExpression(s)) {
          const idx = s.argumentExpression;
          const recv = s.expression;
          if (idx && (ts.isNumericLiteral(idx) || ts.isStringLiteral(idx))) { depName += "[" + idx.getText() + "]"; }
          // A dynamic index is a DYNAMIC TRACKED read only when it selects an
          // attribute off a Node directly (`this[name]`, `app[name]`). Indexing a
          // deeper property/call result is plain array access — untracked → T1.
          else if (ts.isIdentifier(recv) && (SCOPE_NOUNS.has(recv.text)) || recv.kind === ts.SyntaxKind.ThisKeyword) { bump(2, "computed attribute this[<dynamic>]"); }
        } else if (ts.isCallExpression(s)) {
          const callee = s.expression;
          if (ts.isPropertyAccessExpression(callee)) {
            const m = callee.name.text;
            const recv = callee.expression; // what the method is called ON
            const recvName = ts.isPropertyAccessExpression(recv) ? recv.name.text : (ts.isIdentifier(recv) ? recv.text : null);
            if (m === "read") {
              const a0 = s.arguments[0];
              const staticArr = a0 && ts.isArrayLiteralExpression(a0) && a0.elements.every(e => ts.isStringLiteral(e) || ts.isNumericLiteral(e));
              if (!staticArr) bump(2, ".read([<dynamic>]) — runtime region path");
            } else if (ITER.has(m)) {
              if (recvName && NODE_COLLECTIONS.has(recvName)) bump(2, `iterate reactive node collection .${recvName}.${m}()`);
              // else: iterating plain data (a .value array) — callback reads are untracked → stays T1
            } else if (VALUE_ACCESSORS.has(m)) { /* n/a as method */ }
            else if (!GLOBALS.has(rootName) && isUserMethodName(m)) {
              callees.add(m); bump(methodTierOf(m), null); if (methodTierOf(m) >= 2) reasons.add(`calls T${methodTierOf(m)} method ${m}()`);
            }
            else if (PURE_METHODS.has(m)) { /* pure builtin projection on a reactive value → T1 */ }
            else if (SOUND) { bump(2, `unknown call target .${m}() on reactive value`); }
            // (optimistic mode) an unrecognized method on a reactive value → assumed pure
          } else if (ts.isIdentifier(callee)) {
            const nm = callee.text;
            if (CONSTRUCTORS.has(nm) || GLOBALS.has(nm) || locals.has(nm)) { /* pure */ }
            else if (isUserMethodName(nm)) { callees.add(nm); bump(methodTierOf(nm), null); if (methodTierOf(nm) >= 2) reasons.add(`calls T${methodTierOf(nm)} method ${nm}()`); }
            else if (SOUND) { bump(2, `unknown bare call target ${nm}()`); }
          }
        }
      }
      if (depName.includes(".") || SCOPE_NOUNS.has(depName)) deps.add(depName);
    };

    const walk = (n) => {
      if (!n) return;
      // a $DP marker (rewritten :path) — static datapath read (T1). many-path shouldn't occur in a constraint.
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "$DP") {
        const a = n.arguments[0];
        if (a && a.getText() === "1") bump(3, "many-path in a { } body (shouldn't happen)");
        deps.add(":path");
        return;
      }
      // chain tops
      if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n)) && !isChainInterior(n)) {
        classifyChain(n);
        return;
      }
      // a lone reactive identifier (chain of length 1) at a read position
      if (ts.isIdentifier(n) && !isChainInterior(n)) {
        const p = n.parent;
        const isPropName = p && ts.isPropertyAccessExpression(p) && p.name === n;
        const isDeclName = p && (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isPropertyAssignment(p)) && p.name === n;
        const isShorthand = p && ts.isShorthandPropertyAssignment(p);
        if (!isPropName && !isDeclName && isReactiveRoot(n)) { deps.add(n.text); }
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return { tier, reasons, deps, callees };
  };
}

// ── driver ──
let USER_METHODS = new Map(); // name -> {params, body}
let isUserMethodName = (n) => USER_METHODS.has(n);
const METHOD_TIER = new Map();
const COMPUTING = new Set();
let classifyFn;
function methodTierOf(name) {
  if (!USER_METHODS.has(name)) return 1; // unknown call target — assume pure/static (best-effort)
  if (METHOD_TIER.has(name)) return METHOD_TIER.get(name);
  if (COMPUTING.has(name)) return 1; // recursion guard: assume static in the cycle
  COMPUTING.add(name);
  const { params, body } = USER_METHODS.get(name);
  const sf = parseBody(body, false);
  let tier = 1;
  if (sf) { const locals = collectLocals(sf, params); tier = classifyFn(sf, locals).tier; }
  COMPUTING.delete(name);
  METHOD_TIER.set(name, tier);
  return tier;
}

function collect(el, into) {
  if (!el || typeof el !== "object") return;
  for (const m of el.methods || []) {
    const params = (m.params || []).map((p) => (typeof p === "string" ? p : p.name));
    into.methods.set(m.name, { params, body: m.body ?? "" });
  }
  for (const a of el.attrs || []) if (a.value && a.value.kind === "code") into.constraints.push({ tag: el.tag, attr: a.name, src: a.value.src });
  // computed declaration defaults (`bf: number = { … }`) are constraints too —
  // and include the hot per-instance morph bindings.
  for (const d of el.decls || []) if (d.def && d.def.kind === "code") into.constraints.push({ tag: el.tag, attr: d.name + ":def", src: d.def.src });
  for (const c of el.children || []) collect(c, into);
}

function analyzeFile(path) {
  const src = readFileSync(path, "utf8");
  const prog = parseProgram(src);
  const bag = { methods: new Map(), constraints: [] };
  collect(prog.root, bag);
  if (prog.classes) for (const c of prog.classes) collect(c.body, bag);
  // set up interprocedural tables (per file — names are file-local enough)
  USER_METHODS = bag.methods;
  METHOD_TIER.clear(); COMPUTING.clear();
  classifyFn = makeClassifier(methodTierOf);

  // Per-method summary: its OWN direct tracked-read deps + the methods it calls.
  const methodSummary = new Map();
  for (const [name, { params, body }] of bag.methods) {
    const sf = parseBody(body, false);
    if (!sf) { methodSummary.set(name, { deps: new Set(), callees: new Set() }); continue; }
    const locals = collectLocals(sf, params);
    const r = classifyFn(sf, locals);
    methodSummary.set(name, { deps: r.deps, callees: r.callees });
  }
  // Transitive closure over the call graph (fixpoint; cycles just stop expanding).
  const transDeps = (name, seen = new Set()) => {
    if (seen.has(name) || !methodSummary.has(name)) return new Set();
    seen.add(name);
    const s = new Set(methodSummary.get(name).deps);
    for (const c of methodSummary.get(name).callees) for (const d of transDeps(c, seen)) s.add(d);
    return s;
  };

  // X-purity (ruled call-site-legible model): a method is "pure" iff it reads NO
  // reactive state directly anywhere in its call tree (its reactive inputs arrive
  // only via parameters). A constraint that CALLS a non-pure method is a
  // "hidden-dep call" — refused under docs/system-design/constraints.md §3.
  const methodPure = (name) => transDeps(name).size === 0;

  const buckets = { 1: [], 2: [], 3: [] };
  let xLegal = 0, xRefused = [];
  for (const c of bag.constraints) {
    const sf = parseBody(c.src, true);
    if (!sf) continue; // syntax the datapath rewrite couldn't handle; skip
    const locals = collectLocals(sf, []);
    const r = classifyFn(sf, locals);
    // full transitive dep set: this body's own deps + every reached method's deps
    const full = new Set(r.deps);
    for (const cal of r.callees) for (const d of transDeps(cal)) full.add(d);
    buckets[r.tier].push({ ...c, reasons: [...r.reasons], deps: [...r.deps], fullDeps: [...full], callees: [...r.callees] });
    // X-view: legal iff interprocedurally-static AND every method it calls is pure
    const hiddenDep = [...r.callees].filter((m) => USER_METHODS.has(m) && !methodPure(m));
    if (r.tier === 1 && hiddenDep.length === 0) xLegal++;
    else xRefused.push({ ...c, why: hiddenDep.length ? `hidden-dep call: ${hiddenDep.map((m) => m + "()").join(", ")} reads reactive state internally` : [...r.reasons][0] || "dynamic" });
  }
  return { path, total: bag.constraints.length, buckets, methods: bag.methods.size, xLegal, xRefused };
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_CORPUS;
const results = files.map(analyzeFile);

// ── report ──
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log("\nStatic-analyzability of { } constraint dependencies\n" + "=".repeat(72));
console.log(pad("app", 26) + padL("constraints", 12) + padL("T1 static", 11) + padL("T2 dyn-tgt", 12) + padL("T3 unbnd", 10));
console.log("-".repeat(72));
let tot = [0, 0, 0, 0];
for (const r of results) {
  const c = [r.buckets[1].length, r.buckets[2].length, r.buckets[3].length];
  tot[0] += r.total; tot[1] += c[0]; tot[2] += c[1]; tot[3] += c[2];
  const name = r.path.split("/").slice(-1)[0].replace(".declare", "");
  console.log(pad(name, 26) + padL(r.total, 12) + padL(c[0], 11) + padL(c[1], 12) + padL(c[2], 10));
}
console.log("-".repeat(72));
console.log(pad("TOTAL", 26) + padL(tot[0], 12) + padL(tot[1], 11) + padL(tot[2], 12) + padL(tot[3], 10));
const pct = (n) => ((100 * n) / tot[0]).toFixed(1) + "%";
console.log("\n  T1 fully static: " + pct(tot[1]) + "   T2 dynamic-target: " + pct(tot[2]) + "   T3 unbounded: " + pct(tot[3]));

// The two models side by side.
console.log("\nModel Y (interprocedural — follow into method bodies) vs");
console.log("Model X (ruled: call-site-legible — hidden-dep calls refused, deps via args)\n" + "-".repeat(72));
console.log(pad("app", 26) + padL("constraints", 12) + padL("Y analyzable", 14) + padL("X analyzable", 14));
console.log("-".repeat(72));
let xtot = 0;
for (const r of results) {
  const y = r.buckets[1].length;
  xtot += r.xLegal;
  const name = r.path.split("/").slice(-1)[0].replace(".declare", "");
  console.log(pad(name, 26) + padL(r.total, 12) + padL(`${y} (${((100*y)/r.total).toFixed(0)}%)`, 14) + padL(`${r.xLegal} (${((100*r.xLegal)/r.total).toFixed(0)}%)`, 14));
}
console.log("-".repeat(72));
console.log(pad("TOTAL", 26) + padL(tot[0], 12) + padL(`${tot[1]} (${pct(tot[1])})`, 14) + padL(`${xtot} (${((100*xtot)/tot[0]).toFixed(1)}%)`, 14));
console.log("\n  Under the RULED model, " + (tot[0]-xtot) + " constraints (" + (((tot[0]-xtot)*100)/tot[0]).toFixed(0) + "%) would be REFUSED as hidden-dep calls — the apps thread state through methods, which the ruling forbids.");
console.log("\n  Sample hidden-dep refusals (legal under Y, refused under X):");
let hs = 0;
for (const r of results) for (const x of r.xRefused) if (/hidden-dep/.test(x.why) && hs++ < 8) console.log(`    ${x.tag}.${x.attr} = {${x.src.trim().slice(0,40)}}  — ${x.why.slice(0,60)}`);

// residue detail
console.log("\nResidue (T2/T3) — the reads that need runtime resolution\n" + "-".repeat(72));
const res = new Map();
for (const r of results) for (const t of [2, 3]) for (const c of r.buckets[t]) for (const why of (c.reasons.length ? c.reasons : ["(root)"])) res.set(why, (res.get(why) || 0) + 1);
for (const [why, n] of [...res.entries()].sort((a, b) => b[1] - a[1])) console.log("  " + padL(n, 4) + "  " + why);
console.log("\nExamples:");
let shown = 0;
for (const r of results) for (const t of [2, 3]) for (const c of r.buckets[t]) { if (shown++ < 12) console.log(`  T${t} ${r.path.split("/").slice(-1)[0]}  ${c.tag}.${c.attr} = {${c.src.trim().slice(0, 68)}}`); }
console.log();

// legitimacy: T1 must carry REAL dep sets, not vacuously pass. Report dep coverage.
let withDeps = 0, depTotal = 0, empties = [];
for (const r of results) for (const c of r.buckets[1]) { if (c.deps.length) { withDeps++; depTotal += c.deps.length; } else empties.push(`${r.path.split("/").slice(-1)[0]} ${c.tag}.${c.attr} = {${c.src.trim().slice(0,40)}}`); }
console.log(`Legitimacy — T1 constraints carrying a non-empty extracted dep set: ${withDeps}/${tot[1]} (avg ${(depTotal/Math.max(withDeps,1)).toFixed(1)} deps each)`);
if (process.env.SAMPLE) {
  console.log("\nSample T1 constraints with extracted deps:");
  for (const c of results[0].buckets[1].slice(0, Number(process.env.SAMPLE))) console.log(`  {${c.src.trim().slice(0,52)}}  ->  [${c.deps.join(", ")}]`);
}
if (empties.length && empties.length <= 20) { console.log("\nConstant/dep-less { } (no reactive read — a computed literal):"); for (const e of empties) console.log("  " + e); }

// Demonstration: constraints that CALL methods — show shallow (this body only) vs
// FULL transitive dep set (following into every method + callback it reaches).
console.log("\nInterprocedural reach — shallow deps -> FULL transitive deps (through method bodies + the code they call):");
let ishown = 0;
for (const r of results) for (const c of r.buckets[1]) {
  if (c.callees.length && c.fullDeps.length > c.deps.length && ishown < 10) {
    ishown++;
    console.log(`  ${r.path.split("/").slice(-1)[0]}  {${c.src.trim().slice(0,44)}}`);
    console.log(`      shallow: [${c.deps.join(", ")}]  via ${c.callees.join("/")}()`);
    console.log(`      FULL   : [${c.fullDeps.join(", ")}]`);
  }
}
console.log();

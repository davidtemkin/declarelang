// exprcensus — how many `{ }` bodies in each app the compiler lowers to kernel
// EXPR bytecode (expr-emit.ts), and, for the ones it declines, WHICH feature
// stops it. Syntactic only: bind-time declines (a path that lands on a
// non-numeric slot) are not counted here.
//   node mac-host/profile/exprcensus.mjs [apps…]
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = path.resolve(HERE, "../..");
const { parseProgram } = await import(path.join(TREE, "runtime/dist/parser.js"));
const { emitExpr } = await import(path.join(TREE, "compiler/dist/expr-emit.js"));
const apps = process.argv.slice(2).length ? process.argv.slice(2) : ["weather", "desktop", "tracker", "calendar", "marketmap", "birds", "homepage", "docs", "sampler"];

const RULES = [
  ["multi-statement", (s) => /;|\breturn\b/.test(s)],
  ["string", (s) => /["'`]/.test(s)],
  ["provided()", (s) => /\bprovided\s*\(/.test(s)],
  ["arrow / new / typeof / as", (s) => /=>|\bnew\b|\btypeof\b|\s+as\s+/.test(s)],
  ["array / object / index", (s) => /[\[\]{}]/.test(s)],
  ["?. / ??", (s) => /\?\.|\?\?/.test(s)],
  ["call (non-Math)", (s) => /\b(?!Math\.)[\w.]+\s*\(/.test(s.replace(/Math\.\w+\s*\(/g, ""))],
  ["Math.* unsupported", (s) => /Math\.(?!min|max|abs|floor|ceil|round|sqrt)\w+/.test(s)],
  ["bare identifier (const/local)", (s) => /(^|[^.\w$])(?!this\b|parent\b|app\b|classroot\b|Math\b|true\b|false\b)[A-Za-z_$][\w$]*\b(?!\s*\()/.test(s.replace(/\b\d+(\.\d+)?\b/g, ""))],
  ["&& / || as a value", (s) => /&&|\|\|/.test(s)],
];
const classify = (s) => { for (const [k, t] of RULES) if (t(s)) return k; return "other"; };

const tot = new Map(); const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
console.log("| app | bodies | lowered | % | top decline reasons |\n|---|---|---|---|---|");
for (const app of apps) {
  const f = path.join(TREE, "apps", app, app + ".declare"); if (!existsSync(f)) { console.log(`| ${app} | — | | | not found |`); continue; }
  let prog; try { prog = parseProgram(readFileSync(f, "utf8")); } catch (e) { console.log(`| ${app} | — | | | parse: ${String(e.message).slice(0, 60)} |`); continue; }
  const why = new Map(); let bodies = 0, lowered = 0; const samples = new Map();
  const visit = (src) => { bodies++; if (emitExpr(src, null) !== null) { lowered++; return; } const k = classify(src); bump(why, k); if (!samples.has(k)) samples.set(k, src.trim().replace(/\s+/g, " ").slice(0, 70)); };
  const walk = (el) => { for (const a of el.attrs) if (a.value.kind === "code") visit(a.value.src); for (const d of el.decls ?? []) if (d.def && d.def.kind === "code") visit(d.def.src); for (const c of el.children) walk(c); };
  walk(prog.root); for (const c of prog.classes) walk(c.body);
  bump(tot, "bodies", bodies); bump(tot, "lowered", lowered); for (const [k, n] of why) bump(tot, "why:" + k, n);
  const top = [...why.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(", ");
  console.log(`| ${app} | ${bodies} | ${lowered} | ${(100 * lowered / bodies).toFixed(0)}% | ${top} |`);
  if (process.env.SAMPLES) for (const [k, s] of samples) console.log(`    ${k}: \`${s}\``);
}
const B = tot.get("bodies"), L = tot.get("lowered");
console.log(`\nall: ${B} bodies, ${L} lowered (${(100 * L / B).toFixed(0)}%). Declines: ` + [...tot.entries()].filter(([k]) => k.startsWith("why:")).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.slice(4)} ${n}`).join(", "));

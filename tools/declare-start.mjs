#!/usr/bin/env node
// declare-start — the reading for the needs you chose, assembled to read once.
//
//   npx declare-start --pick form,touch,overlays [--program calendar] [--out <dir>]
//   npx declare-start --list                       the names --pick takes
//
// The skill's table of what Declare handles for you is the menu: its first column names
// each need, and you choose from it, having read the brief. This writes what the needs
// you chose point at — the guide sections each row cites, the reference entries it names,
// and the outline of the one whole program you name — into a few files to read whole,
// once (default: ./declare-start/). It chooses nothing: the choice is yours.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] ?? "" : null; };
const usage = () => readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");

// the core reading the skill lists — read in place; a need inside it adds nothing
const CORE = ["docs/guide/01-what-declare-is.md", "docs/guide/04-structure.md", "docs/guide/05-run-and-check.md"];

// ── the menu: the skill's table — Pick | Need | Guide | See it in | Ask about ─────
const SKILL = readFileSync(join(ROOT, "skill/SKILL.md"), "utf8");
const tableAt = SKILL.indexOf("| Pick |");
const rows = tableAt < 0 ? [] : SKILL.slice(tableAt).split("\n").slice(2).filter((l) => l.startsWith("| ")).map((l) => {
  const [id, need, guide, , ask] = l.split(" | ").map((c) => c.replace(/^\|\s*|\s*\|$/g, "").trim());
  return { id: id.replace(/`/g, ""), need, guide: guide ?? "", names: [...(ask ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]) };
});
// the whole programs the skill names, by their folder
const progAt = SKILL.indexOf("**Complete programs**");
const programs = progAt < 0 ? [] : SKILL.slice(progAt, SKILL.indexOf("\n- **The library**", progAt)).split("\n  - ").slice(1)
  .map((b) => /`(apps\/[a-z0-9/_-]+\.declare)`/.exec(b)?.[1]).filter(Boolean)
  .map((file) => ({ id: file.split("/")[1], file }));
const progIds = [...new Set(programs.map((p) => p.id))];

const PICK = opt("pick");
if (args.includes("--list")) {
  console.log(`--pick takes: ${rows.map((r) => r.id).join(", ")}`);
  console.log(`--program takes: ${progIds.join(", ")}`);
  process.exit(0);
}
if (PICK === null || args.includes("--help") || args.includes("-h")) { console.log(usage()); process.exit(PICK === null && !args.includes("--help") && !args.includes("-h") ? 2 : 0); }

const ids = PICK.split(/[,\s]+/).filter(Boolean);
const unknown = ids.filter((id) => !rows.some((r) => r.id === id));
if (unknown.length > 0) { console.error(`declare-start: no need called ${unknown.join(", ")} — --pick takes: ${rows.map((r) => r.id).join(", ")}`); process.exit(2); }
const needs = ids.map((id) => rows.find((r) => r.id === id));
const PROGRAM = opt("program");
const prog = PROGRAM ? programs.find((p) => p.id === PROGRAM || p.file === PROGRAM) : null;
if (PROGRAM && !prog) { console.error(`declare-start: no program called ${PROGRAM} — --program takes: ${progIds.join(", ")}`); process.exit(2); }

// ── the guide sections a need cites: `14-data.md` § A form, § … ─────────────────
const WHOLE = "\u0000whole";
const PER_NEED = 20_000;   // a need adds a whole chapter at most; a longer one, its opening and its map
const sectionsOf = (cell) => cell.split(";").map((part) => {
  const file = /`(\d\d-[a-z0-9-]+\.md)`/.exec(part)?.[1];
  const heads = [...part.matchAll(/§ ([^§;()]+?)(?=\s*(?:,\s*§|\(|\)|;|$))/g)].map((m) => m[1].trim().replace(/[,.]$/, ""));
  return file ? { file, heads: heads.length > 0 ? heads : [WHOLE] } : null;
}).filter(Boolean);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function section(file, head) {
  const path = join(ROOT, "docs/guide", file);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split("\n");
  if (head === WHOLE) {
    const all = lines.join("\n").trim();
    if (all.length <= PER_NEED) return { file, head: "the whole chapter", text: all, from: 1, to: lines.length };
    const first = lines.findIndex((l, i) => i > 0 && /^## /.test(l));
    const opening = lines.slice(0, first < 0 ? 40 : first).join("\n").trim();
    const map = lines.map((l, i) => [l, i + 1]).filter(([l]) => /^#{2,3} /.test(l)).map(([l, n]) => `- line ${n}: ${l.replace(/^#+ /, "")}`).join("\n");
    return { file, head: "its opening and its sections", text: `${opening}\n\n**Its sections** (read the one you need when you reach it):\n\n${map}`, from: 1, to: first < 0 ? 40 : first };
  }
  const at = lines.findIndex((l) => /^#{2,4} /.test(l) && norm(l.replace(/^#+ /, "")) === norm(head));
  if (at < 0) return null;
  const level = /^#+/.exec(lines[at])[0].length;
  let end = at + 1;
  while (end < lines.length && !(new RegExp(`^#{1,${level}} `).test(lines[end]))) end++;
  return { file, head, text: lines.slice(at, end).join("\n").trim(), from: at + 1, to: end };
}
// a section inside another chosen one adds nothing; a larger one replaces those it holds
const inside = (a, b) => a.file === b.file && a.from >= b.from && a.to <= b.to;
const picked = [];
for (const r of needs) {
  let mine = 0;
  for (const { file, heads } of sectionsOf(r.guide)) for (const h of heads) {
    if (CORE.includes(`docs/guide/${file}`)) continue;
    const s = section(file, h);
    if (s === null || picked.some((p) => inside(s, p))) continue;
    if (mine > 0 && mine + s.text.length > PER_NEED) continue;
    for (const p of picked.filter((p) => inside(p, s))) picked.splice(picked.indexOf(p), 1);
    picked.push({ ...s, need: r.id }); mine += s.text.length;
  }
}

// ── write the reading ───────────────────────────────────────────────────────────
const help = (q) => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools/declare-help.mjs"), q], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const OUT = resolve(opt("out") ?? "declare-start");
mkdirSync(OUT, { recursive: true });
const files = [];
const write = (name, title, body) => {
  // a file Read takes whole: under its 2,000 lines, or in parts that say so
  const lines = body.split("\n");
  const parts = [];
  for (let i = 0; i < lines.length; i += 1800) parts.push(lines.slice(i, i + 1800).join("\n"));
  parts.forEach((p, i) => {
    const n = parts.length === 1 ? name : name.replace(/\.md$/, `-${i + 1}.md`);
    const more = i < parts.length - 1 ? `\n\n(continued in ${name.replace(/\.md$/, `-${i + 2}.md`)})\n` : "";
    writeFileSync(join(OUT, n), `# ${title}${parts.length > 1 ? ` (${i + 1} of ${parts.length})` : ""}\n\n${p}${more}\n`);
    files.push(join(OUT, n));
  });
};
if (picked.length > 0) {
  write("guide.md", "For this program: the guide", "The guide sections for the needs you chose, each with where it is in the guide.\n" +
    picked.map((s) => `\n---\n\n_docs/guide/${s.file}, lines ${s.from}–${s.to} (${s.head}) — for: ${s.need}_\n\n${s.text}\n`).join(""));
}
const seen = new Set(["App", "View", "Node"]);   // the core reading carries these
const refs = [];
for (const n of needs.flatMap((r) => r.names)) {
  if (seen.has(n)) continue;
  seen.add(n);
  const a = help(n);
  if (a !== null) refs.push(`\n---\n\n\`declare-help ${n}\`\n\n\`\`\`\n${a}\n\`\`\``);
}
if (refs.length > 0) write("reference.md", "For this program: the reference", "What `npx declare-help` answers for the names your needs point at.\n" + refs.join("\n"));
if (prog) {
  write("program.md", "The nearest whole program", `\`${prog.file}\`\n\nIts parts, by line. Read the ones your plan needs (Read with offset and limit), not the whole file.\n\n\`\`\`\n${help(`map ${prog.file}`) ?? ""}\n\`\`\``);
}

const rel = (p) => { const r = relative(process.cwd(), p); return r === "" || r.startsWith("..") ? p : r; };
console.log(`declare-start — the reading for ${ids.join(", ")}${prog ? ` and ${prog.id}` : ""}. Read each whole, once, in this order:`);
files.forEach((f, i) => console.log(`  ${i + 1}. ${rel(f)}  (${Math.max(1, Math.round(readFileSync(f).length / 1000))} KB)`));
console.log("");
console.log("Then stop reading, and plan (the skill's § Planning a program). Anything else is a lookup when");
console.log("you reach it: npx declare-help <name>.");

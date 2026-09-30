// briefs — the task-shaped entry points an agent takes before writing
// (docs/briefs/*.md). Each brief is one task: a verified snippet, the rules
// that bite, the names to look up, example code, and guide sections as the
// fallback. This module reads them for the three places that use them:
// declare-help (`briefs`, `brief <name>`), derive (the index stamped into
// SKILL.md and docs/declare.md), and the briefs test.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The order the index lists them in: the first read, then by how early a
 *  program meets the task. A brief missing here sorts after these, by name. */
const ORDER = [
  "shape-of-an-app", "lists-from-data", "editing-records", "kinds-of-rows", "loading-and-saving",
  "derived-values", "layout-and-sizing", "scrolling", "using-controls", "your-own-control",
  "pointer-and-drag", "keyboard-and-focus", "motion", "moving-arrangements", "overlays",
  "urls-and-navigation", "time", "text-and-themes", "drawing", "tables-and-selection",
  "when-it-misbehaves",
];

/** Every brief: `{ name, title, index, useWhen, text, file }`, in index order.
 *  `index` is the brief's own one-line entry (an `<!-- index: … -->` comment
 *  under its title). */
export function readBriefs(root) {
  const dir = join(root, "docs/briefs");
  const briefs = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
    const text = readFileSync(join(dir, f), "utf8");
    const title = (text.match(/^# (.+)$/m) ?? [, f])[1].trim();
    const use = text.match(/\*\*Use when\*\*\s+([\s\S]*?)\n\n/);
    const index = (text.match(/^<!-- index: (.+?) -->$/m) ?? [, ""])[1].trim();
    return { name: f.slice(0, -3), title, index, useWhen: use ? use[1].replace(/\s+/g, " ").trim() : "", text, file: `docs/briefs/${f}` };
  });
  const rank = (n) => { const i = ORDER.indexOf(n); return i < 0 ? ORDER.length : i; };
  return briefs.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** The brief a name asks for: exact, else the one it prefixes, else the one
 *  whose name contains every word of it. null when none or several match. */
export function findBrief(briefs, asked) {
  const q = asked.trim().toLowerCase().replace(/\s+/g, "-");
  const exact = briefs.find((b) => b.name === q);
  if (exact) return exact;
  const pre = briefs.filter((b) => b.name.startsWith(q));
  if (pre.length === 1) return pre[0];
  const words = asked.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const all = briefs.filter((b) => words.every((w) => b.name.includes(w) || b.title.toLowerCase().includes(w)));
  return all.length === 1 ? all[0] : null;
}

/** The one-line-per-brief index: the name, then what it is for. */
export function briefIndex(briefs) {
  const w = Math.max(...briefs.map((b) => b.name.length)) + 2;
  return briefs.map((b) => `  ${b.name.padEnd(w)}${b.index}`).join("\n");
}

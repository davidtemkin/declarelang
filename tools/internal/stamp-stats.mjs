// tools/internal/stamp-stats.mjs — carry the MEASURED flagship figures into every
// prose place that cites them.
//
// The homepage already renders its numbers live from apps/homepage/stats.json
// (written by prewarm.mjs from the real production builds). But the same figures
// are QUOTED as prose in README.md, docs/declare.md, and the FAQ — and quoted
// prose rots: the calendar's wire weight was cited as 54 KB while the measured
// artifact had grown to 68 (2026-07-24 audit). This tool makes those citations
// machine-carried: each one sits inside a marker pair
//
//   <!--stat:calendar.wireKB-->68<!--/stat-->
//
// and the derive chain (AFTER prewarm refreshes stats.json, BEFORE the doc
// pipeline consumes the files) rewrites every marker's interior from the live
// stats. Prose text stays the author's; only the number inside the marker moves.
// Idempotent: unchanged values rewrite nothing. An unknown key is a hard error —
// a typo'd marker must not silently freeze.
//
//   node tools/internal/stamp-stats.mjs

import path from "node:path";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isPublished, pushedVersion } from "./release.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stats = JSON.parse(readFileSync(path.join(ROOT, "apps/homepage/stats.json"), "utf8"));

// Key → formatted string. Formats are part of the contract: prose cites rounded,
// stable-reading figures, not raw byte counts.
const FORMATS = {
  "calendar.wireKB":   () => String(Math.round(stats.calendar.wireGzip / 1024)),
  // one decimal — what a release note wants ("86.1 → 85.0"), where prose
  // elsewhere reads the rounded figure
  "calendar.wireKB1":  () => (stats.calendar.wireGzip / 1024).toFixed(1),
  "calendar.code":     () => String(stats.calendar.code),
  "calendar.comment":  () => String(stats.calendar.comment),
  "calendar.total":    () => group(stats.calendar.total),
  "calendar.lines":    () => String(Math.round(stats.calendar.total / 10) * 10),
  "homepage.wireKB":   () => String(Math.round(stats.homepage.wireGzip / 1024)),
  "homepage.code":     () => String(stats.homepage.code),
  // The tracker is what prose cites for SOURCE size, the way the calendar is
  // cited for wire size — a thousand-line program over a million records. Its
  // wire figure excludes issues.json, which a DataSource fetches at run time.
  "tracker.total":     () => group(stats.tracker.total),
  "tracker.code":      () => group(stats.tracker.code),
  "tracker.comment":   () => String(stats.tracker.comment),
  "tracker.wireKB":    () => String(Math.round(stats.tracker.wireGzip / 1024)),
  // The to-do app is the skill's first read: its own file, and with the parts
  // it includes (the two are read together).
  "todo.code":         () => String(stats.todo.code),
  "todo.codeWithParts": () => String(stats.todo.codeWithParts),
  // THE LANGUAGE FILE'S SIZE IN TOKENS — the one figure AREPO-2 rests on ("a
  // model can hold the complete spec while it writes"), and the only number in
  // that prose that was hand-written. It had drifted badly: the claim said ten
  // thousand while the file had grown past twelve.
  //
  // ESTIMATED, because the repo ships four dependencies and a tokenizer is not
  // going to be the fifth — but calibrated: on 2026-11-01 Claude's own count of
  // the file (59,538 characters) was 20,915 tokens, 2.85 characters a token. The
  // file's code and punctuation make words a poor measure (1.33 a word had it at
  // 13,000), so the estimate is by characters at that ratio, rounded to the
  // nearest thousand and spoken as "about", which is what the prose says. It is
  // measured from the file on every derive, so it cannot drift.
  // the release a project pins (embedding.md's dependency line) — package.json's
  // version, so the example names the current release, not the first one
  "version":           () => JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version,
  "spec.tokens":       () => group(Math.round(specText().length / 2.85 / 1000) * 1000),
  // the calendar's code, as prose says it ("about 500 lines of code")
  "calendar.codeAbout": () => group(Math.round(stats.calendar.code / 100) * 100),
  // counted from the tree, never typed: the guide's chapters, the kernel's
  // lines (to the hundred, "about"), the Surface interface's methods
  "guide.chapters":    () => String(readdirSync(path.join(ROOT, "docs/guide")).filter((f) => /^\d+-.*\.md$/.test(f)).length),
  "kernel.linesAbout": () => group(Math.round(readFileSync(path.join(ROOT, "kernel/src/kernel.c"), "utf8").split("\n").length / 100) * 100),
  "surface.methods":   () => String(surfaceMethods()),
  // THE EVIDENCE: figures from the published eval reports the site cites
  // (apps/homepage/evidence.json names the runs — the one choice that is the
  // author's), read from each report's own table, so a citation cannot
  // disagree with the report it points to.
  "venue.checks":            () => String(passes(EVIDENCE.venueDeclare, /^hidden acceptance as delivered/)[1]),
  "venue.checksWord":        () => word(passes(EVIDENCE.venueDeclare, /^hidden acceptance as delivered/)[1]),
  "venue.declare.code":      () => group(num(cell(EVIDENCE.venueDeclare, /^code, excluding/))),
  "venue.declare.delivered": () => String(passes(EVIDENCE.venueDeclare, /^hidden acceptance as delivered/)[0]),
  "venue.declare.firstBoot": () => String(passes(EVIDENCE.venueDeclare, /^hidden acceptance at first boot/)[0]),
  "venue.declare.firstBootWord": () => word(passes(EVIDENCE.venueDeclare, /^hidden acceptance at first boot/)[0]),
  "venue.declare.firstBootMin": () => String(nums(cell(EVIDENCE.venueDeclare, /first boot$/)).at(-1)),
  "venue.react.code":        () => group(num(cell(EVIDENCE.venueReact, /^code, excluding/))),
  "venue.react.firstBoot":   () => String(passes(EVIDENCE.venueReact, /^hidden acceptance at first boot/)[0]),
  "venue.react.firstBootWord": () => word(passes(EVIDENCE.venueReact, /^hidden acceptance at first boot/)[0]),
  // the React run's first-boot bug, fixed at a minute its report's prose names
  "venue.react.fixMin":      () => String(Math.round(Number(reportText(EVIDENCE.venueReact).match(/fixed at ([0-9.]+) min/)[1]))),
  "venue.codeRatioWord":     () => ratioWord(num(cell(EVIDENCE.venueDeclare, /^code, excluding/)) / num(cell(EVIDENCE.venueReact, /^code, excluding/))),
  "presentify.delivered":    () => passes(EVIDENCE.presentify, /^hidden checks delivered/).join(" of "),
};

const EVIDENCE = JSON.parse(readFileSync(path.join(ROOT, "apps/homepage/evidence.json"), "utf8"));
const reportText = (dir) => readFileSync(path.join(ROOT, dir, "report.md"), "utf8");
/** A report's figure: the row whose label matches, its bold cell (the run's
 *  own column in a comparison table) or else its last. */
function cell(dir, label) {
  for (const line of reportText(dir).split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (!label.test(cells[0])) continue;
    const bold = cells.slice(1).find((c) => c.includes("**"));
    return (bold ?? cells.at(-1)).replace(/\*\*/g, "");
  }
  throw new Error(`stamp-stats: no row ${label} in ${dir}/report.md`);
}
const nums = (s) => s.replace(/,/g, "").match(/[0-9]+(\.[0-9]+)?/g).map(Number);
const num = (s) => nums(s)[0];
const passes = (dir, label) => { const m = cell(dir, label).match(/(\d+) of (\d+)/); return [Number(m[1]), Number(m[2])]; };
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const word = (n) => WORDS[n] ?? group(n);
const ratioWord = (r) => r < 0.4 ? "under half" : r <= 0.55 ? "half" : r <= 0.7 ? "two-thirds" : `${Math.round(r * 100)}%`;
function surfaceMethods() {
  const src = readFileSync(path.join(ROOT, "runtime/src/backend.ts"), "utf8");
  const body = src.slice(src.indexOf("export interface Surface"));
  return body.slice(0, body.indexOf("\n}")).split("\n").filter((l) => /^\s+[A-Za-z_]+\??\(/.test(l)).length;
}

const specText = () => readFileSync(path.join(ROOT, "docs/declare.md"), "utf8");

/** Thousands separators — prose reads "1,623 lines", never "1623". */
function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

const FILES = ["README.md", "docs/declare.md", "apps/homepage/declare-faq.md", "apps/homepage/why.md", "apps/homepage/getstarted.md", "docs/tenets/1 SATOR.md",
  "docs/tenets/2 AREPO.md", "docs/guide/01-what-declare-is.md", "docs/guide/27-with-an-llm.md",
  "docs/guide/28-calendar.md",
  "docs/guide/26-packaging.md", "docs/operational/building.md", "docs/operational/embedding.md",
  "skill/SKILL.md", ".claude/skills/declare/SKILL.md"];

// THE PENDING RELEASE'S NOTES are a stamp target too — releases/v<version>.md
// for package.json's version, but ONLY while that version is unpublished. A
// release's figure is a fact about its tag, not about the tree today, so once
// the version is published the file is FROZEN and never restamped: without
// this, every derive afterwards would rewrite the release's figure with
// whatever the calendar weighs now, and the published release (a projection of
// this file — release.mjs) would follow it. "Published" is release.mjs
// isPublished: its tag is here, OR origin/main already declares the version —
// the release workflow tags on GitHub, so the tag need never reach this clone,
// but the push that triggered it moved origin/main. This is the one deliberate
// impurity in a derive rule — a push is a fact about history, not a tree
// input — and it is safe in both directions: publication changes no input hash
// (so the rule need not re-run, and not writing is what re-running would do),
// and an input moving afterwards re-runs the rule, which then declines to
// write. Older release files are never in the list at all.
{
  const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const pending = `releases/v${version}.md`;
  // No git to ask (a tree copy, an unpacked archive) is NOT "untagged": a figure
  // that may already be published stays frozen. Guessing untagged there restamped
  // the tagged v0.4.4 notes in a git-less copy, and a merge carried the rewrite
  // back toward main (2026-09-15). A pending release is stamped where git exists.
  let published = true;
  try {
    const tags = execFileSync("git", ["tag", "-l"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    published = isPublished(version, { tags, pushed: pushedVersion(ROOT) });
  } catch { published = true; }
  if (!published && existsSync(path.join(ROOT, pending))) FILES.push(pending);
}
// key class admits digits: `calendar.wireKB1` (one decimal) never matched under
// `[a-zA-Z.]+` and was skipped SILENTLY — a marker that does not match cannot
// reach the unknown-key error either (found by the release dry run, 2026-09-05)
const RE = /(<!--stat:([a-zA-Z0-9.]+)-->)([^<]*)(<!--\/stat-->)/g;

let stamped = 0, unchanged = 0;
for (const rel of FILES) {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, "utf8");
  const next = text.replace(RE, (m, open, key, cur, close) => {
    const fmt = FORMATS[key];
    if (fmt === undefined) throw new Error(`stamp-stats: unknown stat key '${key}' in ${rel}`);
    const v = fmt();
    if (v === cur) { unchanged++; return m; }
    stamped++;
    return open + v + close;
  });
  if (next !== text) writeFileSync(p, next);
}
// THE ARCHITECTURE PAGE is a program, not prose: its figures arrive as one
// generated file of constants (parts/figures.declare) that its views read, the
// calendar's build block by block (stats.json `calendarParts`, prewarm) and the
// counts above. Rewritten only when a figure moved.
{
  const p = stats.calendarParts;
  const figures = {
    sizes: { calDom: p.calDom, calCanvas: p.calCanvas, calMac: p.calMac, totals: p.totals },
    runtimeKB: p.runtimeKB, kernelKB: p.calDom.ker, kernelWasmGzipKB: p.kernelWasmGzipKB,
    kernelWasmRawKB: p.kernelWasmRawKB, kernelLoaderKB: p.kernelLoaderKB, layoutKB: p.calDom.layout,
    canvasCarriesDomBackendKB: p.canvasCarriesDomBackendKB,
    kernelLines: FORMATS["kernel.linesAbout"](), surfaceMethods: surfaceMethods(),
  };
  const text = `// GENERATED by tools/internal/stamp-stats.mjs from apps/homepage/stats.json and
// the tree — do not edit. The Architecture page's measured figures, as constants
// its views read.

script {
    const FIGURES = ${JSON.stringify(figures, null, 4).replace(/\n/g, "\n    ")}
    }
`;
  const out = path.join(ROOT, "apps/architecture/parts/figures.declare");
  if (!existsSync(out) || readFileSync(out, "utf8") !== text) { writeFileSync(out, text); stamped++; }
  else unchanged++;
}
console.log(`stamp-stats: ${stamped} stamped, ${unchanged} already current`);

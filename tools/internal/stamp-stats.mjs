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
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
  // THE LANGUAGE FILE'S SIZE IN TOKENS — the one figure AREPO-2 rests on ("a
  // model can hold the complete spec while it writes"), and the only number in
  // that prose that was hand-written. It had drifted badly: the claim said ten
  // thousand while the file had grown past twelve.
  //
  // ESTIMATED, because the repo ships four dependencies and a tokenizer is not
  // going to be the fifth. ~1.33 tokens per word is the standard figure for
  // English prose under a BPE vocabulary, and it is the reasonable reading for a
  // document that is mostly prose with fenced code. Rounded to the nearest
  // thousand and spoken as "about", which is what the prose says.
  //
  // It is a MARKETING number and may read optimistically — the char-count
  // estimate would put it a thousand higher — but not dishonestly: it is
  // measured from the file on every derive, so it cannot drift again, and the
  // claim it supports (the whole language fits in a context window) is
  // unaffected either way.
  "spec.tokens":       () => group(Math.round(specWords() * 1.33 / 1000) * 1000),
};

const specText = () => readFileSync(path.join(ROOT, "docs/declare.md"), "utf8");
const specWords = () => specText().split(/\s+/).filter(Boolean).length;

/** Thousands separators — prose reads "1,623 lines", never "1623". */
function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

const FILES = ["README.md", "docs/declare.md", "apps/homepage/declare-faq.md", "docs/tenets/1 SATOR.md",
  "docs/tenets/2 AREPO.md", "docs/guide/01-what-declare-is.md", "docs/guide/26-with-an-llm.md",
  "docs/guide/27-calendar.md",
  "docs/guide/25-packaging.md", "docs/operational/building.md"];

// THE PENDING RELEASE'S NOTES are a stamp target too — releases/v<version>.md
// for package.json's version, but ONLY while that version is untagged. A
// release's figure is a fact about its tag, not about the tree today, so the
// moment `v<version>` exists the file is FROZEN and never restamped: without
// this, every derive after the tag would rewrite v0.4.3's "85.0" with
// whatever the calendar weighs now, and the published release (a projection of
// this file — release.mjs) would follow it. This is the one deliberate
// impurity in a derive rule — a tag is a fact about history, not a tree
// input — and it is safe in both directions: the tag appearing changes no
// input hash (so the rule need not re-run, and not writing is what re-running
// would do), and an input moving after the tag re-runs the rule, which then
// declines to write. Older release files are never in the list at all.
{
  const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const pending = `releases/v${version}.md`;
  // No git to ask (a tree copy, an unpacked archive) is NOT "untagged": a figure
  // that may already be published stays frozen. Guessing untagged there restamped
  // the tagged v0.4.4 notes in a git-less copy, and a merge carried the rewrite
  // back toward main (2026-09-15). A pending release is stamped where git exists.
  let tagged = true;
  try { tagged = execFileSync("git", ["tag", "-l", `v${version}`], { cwd: ROOT, encoding: "utf8" }).trim() !== ""; } catch { tagged = true; }
  if (!tagged && existsSync(path.join(ROOT, pending))) FILES.push(pending);
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
console.log(`stamp-stats: ${stamped} stamped, ${unchanged} already current`);

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
// and the pre-commit hook (AFTER prewarm refreshes stats.json, BEFORE the doc
// pipeline consumes the files) rewrites every marker's interior from the live
// stats. Prose text stays the author's; only the number inside the marker moves.
// Idempotent: unchanged values rewrite nothing. An unknown key is a hard error —
// a typo'd marker must not silently freeze.
//
//   node tools/internal/stamp-stats.mjs

import path from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stats = JSON.parse(readFileSync(path.join(ROOT, "apps/homepage/stats.json"), "utf8"));

// Key → formatted string. Formats are part of the contract: prose cites rounded,
// stable-reading figures, not raw byte counts.
const FORMATS = {
  "calendar.wireKB":   () => String(Math.round(stats.calendar.wireGzip / 1024)),
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
};

/** Thousands separators — prose reads "1,623 lines", never "1623". */
function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

const FILES = ["README.md", "docs/declare.md", "apps/homepage/declare-faq.md", "docs/tenets/1 SATOR.md",
  "docs/guide/19-run-check-ship.md", "docs/operational/building.md"];
const RE = /(<!--stat:([a-zA-Z.]+)-->)([^<]*)(<!--\/stat-->)/g;

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

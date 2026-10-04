// stamp-briefs — the briefs index, written between the `<!-- briefs:start -->`
// and `<!-- briefs:end -->` markers of the skill (skill/SKILL.md). The index is
// generated from docs/briefs, so a new brief appears there and the index cannot
// drift from the files. A derive rule.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readBriefs, briefIndex } from "./doc/briefs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGETS = ["skill/SKILL.md"];
const block = "<!-- briefs:start -->\n```\n" + briefIndex(readBriefs(ROOT)) + "\n```\n<!-- briefs:end -->";

for (const t of TARGETS) {
  const p = join(ROOT, t);
  const src = readFileSync(p, "utf8");
  const next = src.replace(/<!-- briefs:start -->[\s\S]*?<!-- briefs:end -->/, block);
  if (next === src && !src.includes("<!-- briefs:start -->")) throw new Error(`stamp-briefs: ${t} has no briefs markers`);
  if (next !== src) writeFileSync(p, next);
}

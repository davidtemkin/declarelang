// A GitHub Release is a PROJECTION of the tree (tools/internal/release.mjs):
// declared by a package.json bump plus releases/v<version>.md, verified by
// pre-push's third question, published after the push lands. What these pin:
// the pure question (every refusal names its fix; silent when nothing is
// pending), the projection (title from the H1, body without it, stamps
// reduced to values), the scaffold's shape, and the live tree's own state.

import assert from "node:assert/strict";
import { test, summarize } from "./harness.mjs";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRelease, titleFor, bodyFor, stripStamps, headlineOf, scaffoldText, compareVersions, notesPath, tagOf }
  from "../tools/internal/release.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await test("a bump with no notes is refused, and the refusal names the scaffold", () => {
  const r = checkRelease({ version: "0.4.4", tags: ["v0.4.3"], notes: [], committed: [] });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /a bump is a release/);
  assert.match(r.problems[0], /--scaffold 0\.4\.4/);
});

await test("a bump whose notes exist but are not committed clean is refused", () => {
  const r = checkRelease({ version: "0.4.4", tags: ["v0.4.3"], notes: ["releases/v0.4.4.md"], committed: [] });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /not committed clean/);
});

await test("notes for a version package.json does not declare are refused", () => {
  const r = checkRelease({ version: "0.4.3", tags: ["v0.4.3"], notes: ["releases/v0.4.3.md", "releases/v0.5.0.md"], committed: ["releases/v0.4.3.md", "releases/v0.5.0.md"] });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /v0\.5\.0\.md names a release package\.json does not declare/);
});

await test("a complete declaration is pending; an already-tagged version is silent history", () => {
  const pending = checkRelease({ version: "0.4.4", tags: ["v0.4.3"], notes: ["releases/v0.4.3.md", "releases/v0.4.4.md"], committed: ["releases/v0.4.3.md", "releases/v0.4.4.md"] });
  assert.deepEqual(pending, { ok: true, pending: true, problems: [] });
  const history = checkRelease({ version: "0.4.3", tags: ["v0.4.3"], notes: ["releases/v0.4.3.md"], committed: ["releases/v0.4.3.md"] });
  assert.deepEqual(history, { ok: true, pending: false, problems: [] });
  // an old notes file with a dirty working copy is still history — only the pending one must be clean
  const editing = checkRelease({ version: "0.4.3", tags: ["v0.4.3"], notes: ["releases/v0.4.3.md"], committed: [] });
  assert.equal(editing.ok, true, "amending a published release's notes is ordinary work; publish re-projects");
});

await test("the projection: title from the H1, body without it, stamps reduced to their values", () => {
  const text = "# headers, unions, coded errors\n\nThe calendar is <!--stat:calendar.wireKB1-->85.0<!--/stat--> KB.\n";
  assert.equal(headlineOf(text), "headers, unions, coded errors");
  assert.equal(titleFor("0.4.3", text), "v0.4.3 — headers, unions, coded errors");
  assert.equal(bodyFor(text), "The calendar is 85.0 KB.\n", "no H1 (the title carries it), no markers");
  assert.equal(stripStamps("a <!--stat:x.y-->7<!--/stat--> b"), "a 7 b");
  assert.equal(titleFor("0.4.3", "no heading here"), "v0.4.3", "a file without an H1 still has a title");
});

await test("the scaffold: an H1 placeholder, guidance in a comment, and ONE machine-owned region (a stamp)", () => {
  const s = scaffoldText();
  assert.match(s, /^# headline goes here/);
  assert.match(s, /<!--stat:calendar\.wireKB1-->/, "the measured figure is a marker, never typed");
  assert.doesNotMatch(s, /^\s*·/m, "the commit checklist is PRINTED by --scaffold, never written into the file");
});

await test("versions order as semver, and the names are what the tree uses", () => {
  assert.ok(compareVersions("0.4.4", "0.4.3") > 0);
  assert.ok(compareVersions("0.5.0", "0.4.9") > 0);
  assert.ok(compareVersions("1.0.0", "0.9.9") > 0);
  assert.equal(compareVersions("0.4.3", "0.4.3"), 0);
  assert.equal(notesPath("0.4.3"), "releases/v0.4.3.md");
  assert.equal(tagOf("0.4.3"), "v0.4.3");
});

await test("the live tree: the current version's notes exist, are tracked, and --check passes", () => {
  const version = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;
  const file = notesPath(version);
  assert.ok(existsSync(resolve(ROOT, file)), `${file} exists — every declared version has its notes`);
  assert.equal(headlineOf(readFileSync(resolve(ROOT, file), "utf8")) === null, false, "the notes carry a headline H1");
  const r = execFileSync("node", ["tools/internal/release.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.ok(typeof r === "string", "--check exits 0 on the tree as committed");
});

await test("no silent markers: every <!--stat:…--> in a stamp target is one the stamper matches AND can format", () => {
  // The release dry run found `calendar.wireKB1` never stamped: the stamper's
  // key class had no digits, so the marker never matched — and a marker that
  // never matches can't reach the unknown-key error either. Rot with no alarm
  // is the exact thing the stamper exists to prevent, so this walks every
  // stamp target with a LOOSER pattern and holds each key to the stamper's.
  const src = readFileSync(resolve(ROOT, "tools/internal/stamp-stats.mjs"), "utf8");
  const reLit = /const RE = \/(.+)\/g;/.exec(src)[1];
  const formats = new Set([...src.matchAll(/^\s*"([a-zA-Z0-9.]+)":\s*\(\)/gm)].map((m) => m[1]));
  const targets = [
    "README.md", "docs/declare.md", "apps/homepage/declare-faq.md", "docs/tenets/1 SATOR.md",
    "docs/guide/19-run-check-ship.md", "docs/operational/building.md",
    ...(existsSync(resolve(ROOT, "releases")) ? readdirSync(resolve(ROOT, "releases")).filter((f) => f.endsWith(".md")).map((f) => `releases/${f}`) : []),
  ];
  let seen = 0;
  for (const f of targets) {
    if (!existsSync(resolve(ROOT, f))) continue;
    for (const m of readFileSync(resolve(ROOT, f), "utf8").matchAll(/<!--stat:([^>]+)-->/g)) {
      if (m[1].startsWith("/")) continue;                       // the closing marker
      seen++;
      assert.ok(new RegExp(reLit).test(`${m[0]}x<!--/stat-->`), `${f}: key '${m[1]}' is not matched by the stamper's regex — it would be skipped silently`);
      assert.ok(formats.has(m[1]), `${f}: key '${m[1]}' has no FORMATS entry`);
    }
  }
  assert.ok(seen > 5, `markers were actually walked (${seen})`);
  assert.ok(new RegExp(reLit).test("<!--stat:calendar.wireKB1-->0<!--/stat-->"), "a digit in a key matches");
});

summarize("release");

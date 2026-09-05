// tools/internal/release.mjs — a GitHub Release is a PROJECTION of the tree.
//
// Until 2026-09-05 the Releases page was the one published artifact that was
// not derived from anything committed: the notes were typed into `gh release
// create` from outside the tree, the tag was made by hand, and a number in
// the notes was transcribed from a commit message and was wrong at the tag.
// Now the release is declared IN the tree and published as a consequence of
// the push landing — the same inversion derive made for the doc model.
//
// THE DECLARATION (two files, both in the arc's own commits, reviewed beside
// the code they describe):
//   · package.json `version` is bumped — the increment is a JUDGMENT (patch is
//     the cadence, minor for a milestone that reframes the language; ruled
//     2026-08-30) and nothing here infers it: --scaffold takes the version as
//     an argument and refuses without one.
//   · releases/v<version>.md exists — hand-authored notes, in the teaching
//     voice, around <!--stat:…--> markers that stamp-stats fills from the
//     MEASURED figures. Its H1 is the headline ONLY; the title is composed
//     here as `v<version> — <headline>`, so the version is authored in exactly
//     one place.
//
// THE THREE MODES
//   --scaffold <version>   bump package.json, write the notes SKELETON (refuses
//                          if the file exists), PRINT the commit subjects since
//                          the last tag as the checklist — printed, not written:
//                          nothing machine-made lives in the file but stamps.
//   --check                the pre-push question, read-only: a bump without its
//                          committed notes, or notes for an undeclared version,
//                          refuses with the fix named. Silent when nothing is
//                          pending. (Stamp FRESHNESS is derive --dry's question.)
//   (none)                 publish, idempotently — run by the `release` workflow
//                          on every push to main (.github/workflows), or by hand
//                          after a push (`npm run release`): tag HEAD if the
//                          version is untagged (HEAD must already be on
//                          origin/main — never inside pre-push, which may not
//                          write), push the tag, then create the release or
//                          CORRECT its body to equal the file's projection. A
//                          hand edit on GitHub is overwritten on the next run,
//                          as an edit inside a stamp marker would be: the file
//                          is the source, the page follows it.
//
// The projection: title = `v<version> — <H1>`; body = the file after its H1
// (the title carries it), with every stamp marker reduced to its value.
//
// releases/*.md is a STAMP TARGET of stamp-stats — hand-authored around
// markers, like README — never an OUTPUT of any rule (a rule that authored it
// whole would clobber the prose: derive's "two authors, one file"). And a
// stamp is FROZEN once its version is tagged: a release's figure is a fact
// about that tag, not about the tree today (stamp-stats.mjs).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RELEASES = "releases";
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
const git = (...args) => run("git", args);
const tryRun = (fn) => { try { return fn(); } catch { return null; } };

export const tagOf = (version) => `v${version}`;
export const notesPath = (version) => `${RELEASES}/v${version}.md`;

// ── pure: versions ──────────────────────────────────────────────────────────
export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m === null ? null : m.slice(1).map(Number);
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// ── pure: the projection ────────────────────────────────────────────────────
/** The file's H1, which is the headline ONLY (no version). */
export function headlineOf(text) {
  const m = /^#\s+(.+?)\s*$/m.exec(text);
  return m === null ? null : m[1];
}
export function titleFor(version, text) {
  const h = headlineOf(text);
  return h === null ? tagOf(version) : `${tagOf(version)} — ${h}`;
}
/** Every stamp marker reduced to the value it carries. */
export function stripStamps(text) {
  return text.replace(/<!--stat:[a-zA-Z0-9.]+-->([^<]*)<!--\/stat-->/g, "$1");
}
/** The body: everything after the H1 (the title carries it), markers reduced. */
export function bodyFor(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^#\s+/.test(l));
  const rest = i === -1 ? lines : lines.slice(i + 1);
  return stripStamps(rest.join("\n")).trim() + "\n";
}

// ── pure: the pre-push question ─────────────────────────────────────────────
/** `version` from package.json; `tags` every local tag; `notes` every
 *  releases/*.md path; `committed` the subset of those that are tracked AND
 *  clean in the working tree. Returns the problems, each with its fix. */
export function checkRelease({ version, tags, notes, committed }) {
  const problems = [];
  if (parseVersion(version) === null) {
    problems.push(`package.json version '${version}' is not semver-shaped (x.y.z)`);
    return { ok: false, pending: false, problems };
  }
  const tagged = tags.includes(tagOf(version));
  const file = notesPath(version);
  if (!tagged) {
    if (!notes.includes(file)) {
      problems.push(`package.json declares ${version} and no tag ${tagOf(version)} exists — a bump is a release, and ${file} is missing.\n` +
        `    node tools/internal/release.mjs --scaffold ${version}   (writes the skeleton; then write the notes)\n` +
        `    …or restore package.json's previous version if no release was meant.`);
    } else if (!committed.includes(file)) {
      problems.push(`${file} exists but is not committed clean — the push would publish a release without its notes.\n` +
        `    git add ${file} && git commit`);
    }
  }
  for (const n of notes) {
    const m = /^releases\/v(\d+\.\d+\.\d+)\.md$/.exec(n);
    if (m === null) continue;
    const v = m[1];
    if (v !== version && !tags.includes(tagOf(v))) {
      problems.push(`${n} names a release package.json does not declare (version is ${version}; ${tagOf(v)} is not a tag).\n` +
        `    bump package.json to ${v}, or remove the file.`);
    }
  }
  return { ok: problems.length === 0, pending: !tagged && problems.length === 0, problems };
}

// ── pure: the scaffold ──────────────────────────────────────────────────────
/** The skeleton an author replaces. The one machine-owned region is the stamp. */
export function scaffoldText() {
  return [
    "# headline goes here",
    "",
    "<!-- Replace the headline above: the tool composes \"v<version> — <headline>\".",
    "     Teach, don't enumerate — what the new form is, why it exists, a small",
    "     example a reader can use from the notes alone. Commit subjects are your",
    "     CHECKLIST (--scaffold printed them), never the notes. Measured figures",
    "     are stamped, never typed — keep them inside markers like the one below. -->",
    "",
    "The flagship calendar is <!--stat:calendar.wireKB1-->0<!--/stat--> KB gzipped at this tag.",
    "",
  ].join("\n");
}

// ── the tree's state ────────────────────────────────────────────────────────
function state() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const tags = git("tag", "-l").split("\n").filter(Boolean);
  const dir = join(ROOT, RELEASES);
  const notes = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => `${RELEASES}/${f}`) : [];
  const tracked = new Set((tryRun(() => git("ls-files", "--", RELEASES)) ?? "").split("\n").filter(Boolean));
  const committed = notes.filter((n) => tracked.has(n) && (tryRun(() => git("status", "--porcelain", "--", n)) ?? "x") === "");
  return { version: pkg.version, tags, notes, committed, pkg };
}

function lastTag(tags) {
  return tags.filter((t) => parseVersion(t.replace(/^v/, "")) !== null)
    .sort((a, b) => compareVersions(a.slice(1), b.slice(1))).at(-1) ?? null;
}

// ── modes ───────────────────────────────────────────────────────────────────
function scaffold(version) {
  if (version === undefined || parseVersion(version) === null) {
    console.error("release --scaffold needs the version as an argument — x.y.z. The increment is a judgment (RELEASING.md), not inferred.");
    process.exit(1);
  }
  const s = state();
  const last = lastTag(s.tags);
  if (last !== null && compareVersions(version, last.slice(1)) <= 0) {
    console.error(`release: ${version} is not above the last tag ${last}`);
    process.exit(1);
  }
  const file = notesPath(version);
  if (existsSync(join(ROOT, file))) {
    console.error(`release: ${file} already exists — edit it; the scaffold never overwrites`);
    process.exit(1);
  }
  const pkgPath = join(ROOT, "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  writeFileSync(pkgPath, raw.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
  mkdirSync(join(ROOT, RELEASES), { recursive: true });
  writeFileSync(join(ROOT, file), scaffoldText());
  console.log(`release: package.json → ${version}; wrote ${file}`);
  console.log("");
  console.log(`  the checklist — commit subjects since ${last ?? "the beginning"} (your notes TEACH; this is only what happened):`);
  const range = last === null ? ["HEAD"] : [`${last}..HEAD`];
  const subjects = git("log", "--format=%s", ...range).split("\n").filter(Boolean);
  if (subjects.length === 0) console.log(`    (none yet — HEAD is ${last})`);
  for (const line of subjects) console.log(`    · ${line}`);
  console.log("");
  console.log("  then: write the notes → npm run derive (stamps the figures) → commit with the arc → push.");
}

function check() {
  const s = state();
  const r = checkRelease(s);
  if (!r.ok) {
    for (const p of r.problems) console.error(`  ${p}`);
    process.exit(1);
  }
  if (r.pending) console.log(`release --check: ${tagOf(s.version)} is pending — this push publishes it from ${notesPath(s.version)}`);
  process.exit(0);
}

function publish() {
  const s = state();
  const r = checkRelease(s);
  if (!r.ok) { for (const p of r.problems) console.error(`  ${p}`); process.exit(1); }
  const tag = tagOf(s.version);
  const file = notesPath(s.version);
  if (!s.tags.includes(tag)) {
    // HEAD must already be published — this runs after the push, never in it
    tryRun(() => git("fetch", "origin", "main"));
    const onRemote = tryRun(() => { git("merge-base", "--is-ancestor", "HEAD", "origin/main"); return true; });
    if (onRemote !== true) { console.error(`release: HEAD is not on origin/main — push first, then publish`); process.exit(1); }
    if (tryRun(() => git("cat-file", "-e", `HEAD:${file}`)) === null) { console.error(`release: ${file} is not in HEAD`); process.exit(1); }
    git("tag", tag);
    console.log(`release: tagged ${tag} at ${git("rev-parse", "--short", "HEAD")}`);
  }
  git("push", "origin", tag);
  const text = readFileSync(join(ROOT, file), "utf8");
  const title = titleFor(s.version, text);
  const body = bodyFor(text);
  const existing = tryRun(() => run("gh", ["release", "view", tag, "--json", "body", "-q", ".body"]));
  if (existing === null) {
    run("gh", ["release", "create", tag, "--title", title, "--notes-file", "-"], { input: body });
    console.log(`release: created ${title}`);
  } else if (existing.trim() !== body.trim()) {
    run("gh", ["release", "edit", tag, "--title", title, "--notes-file", "-"], { input: body });
    console.log(`release: corrected ${tag}'s body to match ${file}`);
  } else {
    console.log(`release: ${tag} is published and current`);
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [mode, arg] = process.argv.slice(2);
  if (mode === "--scaffold") scaffold(arg);
  else if (mode === "--check") check();
  else if (mode === undefined) publish();
  else { console.error(`release: unknown mode ${mode} — --scaffold <version> | --check | (none: publish)`); process.exit(1); }
}

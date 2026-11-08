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
//                          CORRECT its body to equal the file's projection —
//                          and every earlier published release's too, so an
//                          amended older file reaches its page. A
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
// stamp is FROZEN once its version is published (isPublished): a release's
// figure is a fact about that tag, not about the tree today (stamp-stats.mjs).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readChanges } from "./changes.mjs";

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
  // x.y.z, or x.y.z.w — a smaller release between patches (0.6.4.1)
  const m = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/.exec(v);
  return m === null ? null : m.slice(1).map((n) => Number(n ?? 0));
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i];
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
/** The body: everything after the H1 (the title carries it), markers reduced. A
 *  release with breaking changes says so before its first section, with their count
 *  — counted here, so it can't disagree with the list below it. */
export function bodyFor(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^#\s+/.test(l));
  const rest = i === -1 ? lines : lines.slice(i + 1);
  const n = readChanges(text).length;
  if (n > 0) {
    const at = rest.findIndex((l) => /^##\s/.test(l));
    const line = `**Breaking:** ${n} change${n === 1 ? "" : "s"} to make — \`npx declare-changes app.declare\` lists the ones in your program.`;
    rest.splice(at === -1 ? rest.length : at, 0, line, "");
  }
  return stripStamps(rest.join("\n")).trim() + "\n";
}

// ── pure: is a version published? ───────────────────────────────────────────
/** A version is PUBLISHED once its tag exists here, or once origin/main
 *  already declares it (or a later one). The second is the signal this side
 *  can trust: the release workflow tags and publishes on GitHub as a
 *  consequence of the push, so its tag need never reach this clone — but the
 *  push itself moves the local origin/main. `pushed` is origin/main's
 *  package.json version, or null when there is no remote to read. */
export function isPublished(version, { tags, pushed }) {
  if (tags.includes(tagOf(version))) return true;
  return pushed !== null && parseVersion(pushed) !== null && compareVersions(version, pushed) <= 0;
}

// ── pure: the pre-push question ─────────────────────────────────────────────
/** `version` from package.json; `tags` every local tag; `pushed` origin/main's
 *  version (isPublished); `notes` every releases/*.md path; `committed` the
 *  subset of those that are tracked AND clean in the working tree. Returns the
 *  problems, each with its fix. */
export function checkRelease({ version, tags, pushed = null, notes, committed, removed = [], notesText = null }) {
  const problems = [];
  // three parts: npm reads this as semver and refuses anything else (v0.6.4.1, the one
  // four-part release, broke npx after npm install); parseVersion still reads that
  // release's notes as history
  if (parseVersion(version) === null || version.split(".").length !== 3) {
    problems.push(`package.json version '${version}' is not release-shaped (x.y.z)`);
    return { ok: false, pending: false, problems };
  }
  const tagged = isPublished(version, { tags, pushed });
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
    // notes without "## Breaking changes" say the release breaks nothing. A release
    // that removes public surface does break something: its notes say what to change
    // (migration.md §3), in the form declare-changes reads
    const breaking = notesText !== null && /^##\s+Breaking changes\s*$/m.test(notesText);
    if (removed.length > 0 && notesText !== null && !breaking) {
      problems.push(`${file} has no "## Breaking changes", and this release removes ${removed.length} public member${removed.length == 1 ? "" : "s"} since the last tag (${removed.slice(0, 5).join(", ")}${removed.length > 5 ? ", …" : ""}).\n` +
        `    add the section, one entry per change (RELEASING.md § Breaking changes), so npx declare-changes can list them.`);
    }
  }
  for (const n of notes) {
    const m = /^releases\/v(\d+\.\d+\.\d+(?:\.\d+)?)\.md$/.exec(n);
    if (m === null) continue;
    const v = m[1];
    if (v !== version && !isPublished(v, { tags, pushed })) {
      problems.push(`${n} names a release package.json does not declare (version is ${version}; ${tagOf(v)} is not a tag).\n` +
        `    bump package.json to ${v}, or remove the file.`);
    }
  }
  return { ok: problems.length === 0, pending: !tagged && problems.length === 0, problems };
}

// ── pure: the public surface a release removes ──────────────────────────────
/** The public reference ids (`View.x`, `TextInput.text`) in `before` that `after`
 *  no longer has — both docs/declare-model.json. A removal is how the reference
 *  says a program must change (migration.md §3). */
export function removedPublic(before, after) {
  const pub = (m) => new Set(Object.entries(m?.reference ?? {}).filter(([, e]) => e?.internal !== true).map(([id]) => id));
  const now = pub(after);
  return [...pub(before)].filter((id) => !now.has(id)).sort();
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
    "<!-- A release that changes how programs must be written puts, right after this",
    "     introduction, a section \"## Breaking changes\": one \"### old → new\" entry per",
    "     change, each with a sentence of why, a Find: line, the before and after",
    "     fragments, a Docs: line and a Watch for: line for what changes without an",
    "     error (RELEASING.md). npx declare-changes reads it. Without the section, the",
    "     release breaks nothing; the push refuses that when public surface was removed.",
    "     Then \"## New\" (what was added, taught) and \"## Smaller changes\". -->",
    "",
    "## New",
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
  // what the reference lost since the last tag: read-only, from the tag's own model
  const last = lastTag(tags);
  const before = last === null ? null : tryRun(() => JSON.parse(git("show", `${last}:docs/declare-model.json`)));
  const modelPath = join(ROOT, "docs", "declare-model.json");
  const removed = before === null || !existsSync(modelPath) ? [] : removedPublic(before, JSON.parse(readFileSync(modelPath, "utf8")));
  const own = join(ROOT, notesPath(pkg.version));
  const notesText = existsSync(own) ? readFileSync(own, "utf8") : null;
  return { version: pkg.version, tags, pushed: pushedVersion(), notes, committed, pkg, removed, notesText };
}

/** origin/main's package.json version — what the last push declared — or null
 *  with no remote-tracking ref to read. Read-only: no fetch (a push moves the
 *  ref, and --check runs inside pre-push, which may not write). */
export function pushedVersion(root = ROOT) {
  const raw = tryRun(() => execFileSync("git", ["show", "origin/main:package.json"], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
  if (raw === null) return null;
  try { return JSON.parse(raw).version ?? null; } catch { return null; }
}

function lastTag(tags) {
  return tags.filter((t) => parseVersion(t.replace(/^v/, "")) !== null)
    .sort((a, b) => compareVersions(a.slice(1), b.slice(1))).at(-1) ?? null;
}

// ── modes ───────────────────────────────────────────────────────────────────
function scaffold(version) {
  if (version === undefined || parseVersion(version) === null || version.split(".").length !== 3) {
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
  // the compiler's own word for the release it is (a program's declareVersion is compared with it)
  const verPath = join(ROOT, "compiler", "src", "version.ts");
  writeFileSync(verPath, readFileSync(verPath, "utf8").replace(/DECLARE_VERSION = "[^"]*"/, `DECLARE_VERSION = "${version}"`));
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
  // The release workflow may already have tagged this version on GitHub: see
  // its tag before deciding to make one (publishing writes; --check never does).
  tryRun(() => git("fetch", "origin", "--tags"));
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
  project(s.version, true);
  // an earlier release's notes can be amended too (RELEASING.md, "To amend"): every
  // published page follows its file, not only the newest
  for (const n of s.notes) {
    const v = /^releases\/v(\d+\.\d+\.\d+(?:\.\d+)?)\.md$/.exec(n)?.[1];
    if (v !== undefined && v !== s.version && s.tags.includes(tagOf(v))) project(v, false);
  }
}

/** Make release `version`'s page equal its file's projection; `create` when it may not exist yet. */
function project(version, create) {
  const tag = tagOf(version), file = notesPath(version);
  const text = readFileSync(join(ROOT, file), "utf8");
  const title = titleFor(version, text);
  const body = bodyFor(text);
  const existing = tryRun(() => run("gh", ["release", "view", tag, "--json", "body,name", "-q", ".name + \"\\n\" + .body"]));
  if (existing === null) {
    if (!create) return;
    run("gh", ["release", "create", tag, "--title", title, "--notes-file", "-"], { input: body });
    console.log(`release: created ${title}`);
    return;
  }
  const nl = existing.indexOf("\n");
  const [name, current] = [existing.slice(0, nl), existing.slice(nl + 1)];
  if (name !== title || current.trim() !== body.trim()) {
    run("gh", ["release", "edit", tag, "--title", title, "--notes-file", "-"], { input: body });
    console.log(`release: corrected ${tag}'s page to match ${file}`);
  } else if (create) {
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

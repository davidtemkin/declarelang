# Releasing

Release notes are **GitHub Releases** — a tag plus hand-written notes. The
Releases page is the changelog; watchers can subscribe to releases alone, and
each release page is a stable, linkable record of what the language looked
like when.

**A release is a projection of the tree.** It is declared *in* the tree — a
version bump and a notes file, committed with the code they describe —
verified by the push gate, and published as a consequence of the push
landing. Nothing about it is typed into a command from outside the tree, and
no number in it is transcribed: the page is derived from a committed file
the way the doc model is, and edited only by editing that file.

## When to cut a release

A release marks a change to the **language surface** — something a program's
author can see:

- a new form, keyword, or declaration modifier (`external`, …);
- a new verb or event on a built-in (`post`/`onPost`, …);
- new facts (`pageVisible`, `onScreen`, …) or methods on views;
- changed semantics of any of the above;
- a new embedding or host contract (the boot API, the sanctioned handles).

Internal work — renderer fixes, host performance, tooling — ships in whatever
release comes next; it may get a line, not a headline. The structural test:
**if the guide or the reference changed, it's notable.** A stretch of purely
internal pushes needs no release at all.

## The increment is a judgment

**Patch** (0.4.x) is the rolling cadence — almost every release: new forms,
new verbs and facts, sharpened semantics of what already shipped, the
language evolving in place. **Minor** only for a milestone that reframes what
the language is — a new pillar of the model, a rework that re-teaches the
guide. (Ruled 2026-08-30, after 0.4.0: "minor for new surface" would have
marched the number to 1.0 long before the language is there.) Nothing infers
the increment — not from commit messages, not from what changed; `--scaffold`
takes the version as an argument and refuses without one.

The version number is plain semver-shaped but carries no compatibility
promise before 1.0 — it orders releases, nothing more. `bundles/version.json`
is unrelated: that is the derive graph's cache-busting build hash.

## The flow

The release steps sit inside the ordinary arc; nothing runs around derive or
the push.

1. **Declare it** (during the arc, once the surface is known):

   ```sh
   node tools/internal/release.mjs --scaffold 0.4.4
   ```

   bumps `package.json`, writes `releases/v0.4.4.md` — a skeleton: a headline
   placeholder and a stamp marker — and **prints** the commit subjects since
   the last tag. Those are your checklist of what happened. They are not the
   notes, and they are not written into the file.

2. **Write the notes**, in that file. Teach, don't enumerate: what the new
   form is, why it exists, a small example — a reader should be able to use
   the feature from the notes alone. The H1 is the headline *only*
   (`# headers, unions, coded errors`); the tool composes the title
   `v0.4.4 — headers, unions, coded errors`, so the version is authored in one
   place. A `declare-fragment` block in the notes is checked by the docs test
   like one in the guide.

   **Measured figures are stamped, never typed.** The calendar's wire weight
   is `<!--stat:calendar.wireKB1-->…<!--/stat-->`, filled by `stamp-stats`
   from `apps/homepage/stats.json` — the same markers README carries, so the
   number in the notes is the number at the tag by construction. (A figure
   about a *previous* release is history and stays hand-written; the arrow's
   right-hand side is the stamp.)

3. **`npm test`**, then **`npm run derive`** — as always. Derive stamps the
   notes' markers along with everything else, which is why it runs after the
   notes are written and before the commit.

4. **Commit** — the code, the bump, the notes, and the derived outputs, in the
   arc's batch.

5. **`git push`** — the gate asks its two questions and a third: a bumped,
   untagged version must have its notes present and committed, and a notes
   file must not name a version `package.json` doesn't declare. It refuses
   with the fix named; when nothing is pending it is silent, which is most
   pushes.

6. **The push lands, and the release follows it.** The `release` workflow
   (`.github/workflows/release.yml`, the repo's first CI) runs
   `node tools/internal/release.mjs` on every push to `main`: seeing an
   untagged version, it tags the pushed SHA, pushes the tag, and creates the
   GitHub Release — title from the H1, body from the file with the markers
   reduced to their values. Idempotent, so a partial failure re-runs; on an
   ordinary push it finds the version already tagged and exits. The same
   command works by hand after a push (`npm run release`) and refuses if
   HEAD isn't on `origin/main`.

To **amend** published notes: edit the file, derive, commit, push. The
release body is corrected to match — it is a projection, and a hand edit on
GitHub is overwritten on the next run, as an edit inside a stamp marker would
be. The file is the source; the page follows it.

## What holds it together

- `releases/*.md` is a **stamp target** of `stamp-stats` — hand-authored
  around markers, like README — never an **output** of any rule. A rule that
  authored it whole would clobber the prose.
- A stamp in a release file is **frozen once its version is tagged**. A
  release's figure is a fact about that tag, not about the tree today; without
  the freeze, every later derive would rewrite v0.4.3's number and the
  published page would follow. This is the one deliberate impurity in a derive
  rule (a tag is a fact about history, not a tree input), and it is safe in
  both directions — see the note in `stamp-stats.mjs`.
- The hooks **refuse, never write** (a commit or tag made inside `pre-push`
  lands *after* the pushed SHA). So the tag is made after the push, by the
  publish step, and points at what was published.
- The **`bump` is the intent.** There is no flag at push time and nothing to
  remember afterward: raising the version declares that the next push
  publishes, and the gate refuses to let that declaration go out incomplete.

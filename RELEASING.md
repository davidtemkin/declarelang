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

**A release is a decision, not a consequence.** Nothing in the tree makes one due: not a
bug fix, not a new feature, not a number of commits.

**A breaking change is always a release.** A change is breaking when it changes what a
feature of the language means or removes one; whether it brings a bug has nothing to do
with it. The language surface it touches is:

- a form, keyword, or declaration modifier (`external`, …);
- a verb or event on a built-in (`post`/`onPost`, …);
- a fact (`pageVisible`, `onScreen`, …) or a method on views;
- an embedding or host contract (the boot API, the sanctioned handles).

It ships in a release because a program moving across it needs the notes:
`npx declare-changes` reads its entries from them.

**A new feature is a judgment.** Cut a release when there is something worth telling the
people who write programs, such as a coherent addition they should learn. Many features
aren't that on their own, and wait for the next release.

**A bug fix is never a release by itself,** and neither is tooling, performance, or a
change to the docs alone (prose rewritten, an example corrected, a chapter reordered).
They ship in whichever release comes next, a line each in its notes. A stretch of pushes
with nothing worth announcing needs no release at all. When unsure, wait: the next release
carries it.

## The increment is a judgment

**Patch** (0.4.x) is the rolling cadence — almost every release: new forms,
new verbs and facts, sharpened semantics of what already shipped, the
language evolving in place. **Minor** only for a milestone that reframes what
the language is — a new pillar of the model, a rework that re-teaches the
guide. (Ruled 2026-08-30, after 0.4.0: "minor for new surface" would have
marched the number to 1.0 long before the language is there.) Nothing infers
the increment — not from commit messages, not from what changed; `--scaffold`
takes the version as an argument and refuses without one.

A version has three parts, because npm reads `package.json`'s version as semver and
refuses anything else: v0.6.4.1, the one release published with a fourth part, broke
`npx` after `npm install`. The tools still read that release's notes, as history.

The version number is plain semver-shaped but carries no compatibility
promise before 1.0 — it orders releases, nothing more. `bundles/version.json`
is unrelated: that is the derive graph's cache-busting build hash.

## The flow

The release steps sit inside the ordinary arc; nothing runs around derive or
the push. The arc itself — edit, test, derive, commit, push, and what each
command builds — is [`docs/operational/shipping.md`](docs/operational/shipping.md);
this page adds only what a release does on top of it.

1. **Declare it** (during the arc, once the surface is known):

   ```sh
   node tools/internal/release.mjs --scaffold 0.4.4
   ```

   bumps `package.json` (and the compiler's `compiler/src/version.ts`, which a program's
   `declareVersion` is compared with), writes `releases/v0.4.4.md` — a skeleton: a headline
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

3. **`npm run test:all`** — `npm test` plus the release tier (the tools' browser-driven
   suites, `run-tests.mjs --full`) and the ladder — then **`npm run derive`**, as always. Derive stamps the
   notes' markers along with everything else, which is why it runs after the
   notes are written and before the commit.

4. **Commit** — the code, the bump, the notes, and the derived outputs, in the
   arc's batch.

5. **`git push`** — the gate asks its two questions and a third: a bumped,
   unpublished version must have its notes present and committed, and a notes
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

## The notes' shape

Every release's notes have the same order, so a reader upgrading finds what they must do
first, and what is merely new is never mistaken for it:

1. **The headline** (the H1) and an introduction.
2. **`## Breaking changes`**, only when the release has any. On the Release page a line
   before it counts them and names `npx declare-changes`; the count is made when the page is,
   from the entries below it.
3. **`## New`**: what was added, taught. Nothing in it requires a program to change.
4. **`## Smaller changes`**: fixes and polish.

A release without a `## Breaking changes` section breaks nothing. Breaking changes don't
change the increment: a patch can carry them (below).

## Breaking changes

A release that changes how programs must be written — a name removed or renamed, a form
replaced, a behaviour that changes without an error — has a section `## Breaking changes`,
right after its introduction, one entry per change, in this form:

````markdown
### `onInput` → `commit`
A text field hands the person's change to `commit`, as every value control does.

Find: `/\bonInput\s*\(/`

```declare-fragment
TextInput [ text = { app.name }, onInput(v: string) { app.name = v } ]
```

```declare-fragment
TextInput [ value <-> app.name ]
```

Docs: [Controls](declare-docs:guide:controls@the-value-pattern) · [`ValueControl.commit`](declare-docs:ValueControl.method.commit)

Watch for: a change in behaviour that produces no error.
````

- **The heading** is the change, as "old → new"; then one sentence of why.
- **`Find:`** is a literal, or a regular expression in `/…/`, that marks where a program needs
  the change. It may span lines. In a regular expression, `{TextInput}` is that class or any
  class extending it, the library's and the program's own: a program's subclass of a changed
  class needs the change where the class does. Leave it out when no spelling is honest; the entry is then
  listed for every program under "check these too".
- **The two fragments** are the before and the after; both must parse (the docs test).
- **`Docs:`** links the reference and guide pages for the new form.
- **`Watch for:`**, optional, is what changes with no error. These matter most.

[`declare-changes`](docs/operational/changes.md) reads these entries — the notes people read
are its source. Three things keep them honest:

- `test/changes.test.mjs` runs every entry's `Find:` over the apps, the library and the docs,
  and fails on any hit: the corpus moves in the same change as the language, and each `Find:`
  is shown to come up empty on code that has moved.
- The same test runs `declare-changes` on an old program (`test/fixtures/migration/`), so each
  `Find:` is also shown to find what it should.
- The push gate refuses a pending release whose reference lost a public member since the last
  tag (`docs/declare-model.json`) and whose notes have no `## Breaking changes`.

## What holds it together

- `releases/*.md` is a **stamp target** of `stamp-stats` — hand-authored
  around markers, like README — never an **output** of any rule. A rule that
  authored it whole would clobber the prose.
- A stamp in a release file is **frozen once its version is published**. A
  release's figure is a fact about its tag, not about the tree today; without
  the freeze, every later derive would rewrite v0.4.3's number and the
  published page would follow. A version is published when its tag is in the
  clone **or `origin/main` already declares it** (`release.mjs isPublished`):
  the workflow tags on GitHub, so the tag need never reach a clone, but the
  push that triggered it moves the local `origin/main`. This is the one
  deliberate impurity in a derive rule (a push is a fact about history, not a
  tree input), and it is safe in both directions — see the note in
  `stamp-stats.mjs`.
- The hooks **refuse, never write** (a commit or tag made inside `pre-push`
  lands *after* the pushed SHA). So the tag is made after the push, by the
  publish step, and points at what was published.
- The **`bump` is the intent.** There is no flag at push time and nothing to
  remember afterward: raising the version declares that the next push
  publishes, and the gate refuses to let that declaration go out incomplete.

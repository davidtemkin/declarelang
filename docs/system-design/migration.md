# Moving a program to a new release

*Proposal, 2026-11-05; built in 0.6.0, except the release check's "Changes to make" requirement (§3). It's first needed by the editing-values change (`editing-values.md` §4.12), the
first release that changes how programs already in use must be written. It builds on the release process that
already exists (`open-items.md`, "The release process, regularized"; `RELEASING.md`; `tools/release.mjs`).*

---

## 1. The problem

People are writing programs in Declare, and agents more than people. When a release changes how something is
written, a program written for the earlier release has to be brought up to date. Usually an agent does that, and
it has never seen either version of the language.

Today it has only the compiler's errors on the old spellings, and the prose of each release's notes. Neither says:
- all of what changed since the release the program was written for;
- which of those changes apply to this program, and where;
- which changes alter behaviour without any error at all.

## 2. The design: three pieces and a line in the skill

### 2.1 A program can say which release it was written for

One optional line, at the top of a file:

```declare
declareVersion [ "0.6" ]
```

- **No program needs it.** Without it, `declare-changes` works out what applies from the old spellings themselves
  (§2.3). The line only makes the next migration exact.
- **The tool writes it, not people or agents.** When a migration is finished and `declare-verify` is clean,
  `declare-changes --done app.declare` writes the line at the top. It appears only in programs that have actually been
  migrated.
- **The corpus doesn't carry it,** and the guide's examples never show it. Those are the files agents learn from,
  and a declaration at the top of every one would be noise. It's documented in `declare.md`'s list of top-level forms
  and on `declare-changes`'s own page.
- **Its shape** is the top-level form every file-level declaration has (`include [ … ]`, `script [ … ]`, `use [ … ]`,
  `ship [ … ]`). The name says exactly what it is.
- **What the compiler does with it:**
  - a release newer than the compiler: an error, "written for Declare 0.7; this is 0.6".
  - an older one: one line of output, "written for Declare 0.5.3; `npx declare-changes app.declare` lists what
    changed since".
  - the same release, or no line: nothing.
- **Per file.** The main file's line is the program's. Versions are release versions (`releases/v<version>.md`),
  compared as `major.minor.patch`.

### 2.2 Release notes say what to change, in a set form

A release that changes how programs must be written adds a section to its notes, **"Changes to make"**, with one
entry per change in this form:

````markdown
## Changes to make

### `onInput` → `commit`
A field hands the person's change to you through `commit(v)`, as every value control does.

Find: `onInput(`

```declare-fragment
TextInput [ text = { app.name }, onInput(v: string) { app.name = v } ]
```

```declare-fragment
TextInput [ value <-> app.name ]
```

Docs: [Controls](declare-docs:guide:controls@text-fields) · [`ValueControl.commit`](declare-docs:ValueControl.method.commit)

Watch for: an `onInput` that only watched a field with no `text` binding must now call `super.commit(v)`, or the
field stops keeping its text.
````

- **The heading is the change,** as "old → new".
- **One sentence of why.**
- **`Find:`** gives the literal text, or a regular expression in `/…/`, that marks a line needing this change. It
  needn't be exact; it points the agent at candidates. In a regular expression, `{TextInput}` stands for that class
  and every class extending it — the library's, and the program's own, read from its files — because a program's
  subclass of a changed class needs the change wherever the class does. (The first program tried, written against
  0.5.3, had most of its fields as its own subclasses of `TextInput`; a list of library names found none of them.)
- **Two fragments,** before and after. The docs test already compiles fragments in `releases/`, so the "after" is
  checked against the release.
- **`Docs:`** links to the reference and guide pages for the new form.
- **`Watch for:`**, optional, is a change in behaviour that produces no error. These matter most.

There is one source. It's the same file people read, and the GitHub Release is its projection, as today.

### 2.3 `declare-changes` lists what to do

```
npx declare-changes app.declare                # what applies to this program
npx declare-changes app.declare --since 0.5.3  # only changes after 0.5.3
npx declare-changes --since 0.5.3              # every change since, with no program
npx declare-changes --done app.declare         # after a clean migration: write its declareVersion line
```

- **It reads "Changes to make"** from every release after the program's version, up to this one, in order. With no
  `declareVersion` line and no `--since`, it reads every release's entries and lets each `Find:` decide whether it
  applies.
- **For a program,** it runs each entry's `Find:` over the program's files, its includes among them. It prints the
  entries that match, each with its file and line numbers, its before and after, its `Docs:` links resolved to files
  in the distribution, and its `Watch for:`. Then it lists every `Watch for:` from entries that didn't match, under
  "check these too", because a quiet change may not leave a findable spelling.
- **It ends with a next step:** "make these changes, then `npx declare-verify app.declare`; when it's clean, run
  `npx declare-changes --done app.declare`."
- **`--json`** gives the same output for tools.
- **It changes nothing.** The agent makes the changes, reading the docs it's pointed to.

### 2.4 The skill

One instruction, early in `skill/SKILL.md`:

> When you update a program to a new release of Declare (it fails to compile with names the reference doesn't have,
> or it says it was written for an earlier release), run `npx declare-changes <file>` before changing anything else,
> and work through its list.

## 3. Keeping it honest

- **The corpus is migrated in the same change as the language.** A test runs every entry's `Find:` from the current
  release over `apps/`, `library/` and the docs. Any hit fails the test. That proves both that the corpus is up to
  date and that each `Find:` pattern finds what it should (§3, item 3).
- **A release that changes the language needs its entries.** The release check (`pre-push`, `test/release.test.mjs`)
  already pairs a version bump with its notes. It also requires a "Changes to make" section whenever a removed name
  is listed in the derived reference's change log. In practice that means whenever `declare-model.json` lost a
  public member since the last tag.
- **Each `Find:` is tried on real old code** before the release, to show it finds what it should.
- **The migration test:** a fresh agent is given a program written for an earlier release, the new release, and
  nothing else. What it gets stuck on is fixed in the notes, or in `declare-changes`, before the release is
  announced. The first one is the author's own app, written a couple of releases back.

## 4. Decided against, on purpose

- **Teaching errors in the compiler for every old spelling:** a lot to carry for an optional gain. The single
  "written for an earlier release" note (§2.1) and `declare-changes` do the job.
- **An automatic rewrite tool:** the changes in the first release that needs this are mostly not mechanical (a
  `commit` that parses, a quiet change in validation). The agent makes them, pointed to the right lines and docs. A
  rewrite tool can come later, for a release whose changes are purely mechanical.
- **A separate machine-readable change file:** it would drift from the notes people read. The set form in §2.2 is
  readable and parseable at once.

## 5. Scope

- **The parser and checker:** `declareVersion [ "…" ]` at top level; the newer and older checks; one per file; the
  formatter keeps it first.
- **`tools/declare-changes.mjs`,** plus its `npx` entry.
- **The release notes format:** `RELEASING.md` and the scaffold in `tools/release.mjs`.
- **Tests:** the format parser, the corpus `Find:` test, the version checks, and `declare-changes` on a fixture
  program.
- **Documentation:** `declare.md` (the top-level forms), guide chapter 04 (structure), `docs/operational/` (a page
  for `declare-changes`), and the skill.
- **The corpus:** unchanged. It doesn't carry the line (§2.1).

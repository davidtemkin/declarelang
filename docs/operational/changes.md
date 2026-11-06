# `declare-changes` — moving a program to a new release

When a release of Declare changes how programs are written, its notes say what to change, in a
set form: a section **Breaking changes**, first in the notes, one entry per change. A release
without it breaks nothing. `declare-changes` reads those
entries from every release after the one a program was written for, finds where each applies
in the program, and lists them. It changes nothing; you make the changes, reading the docs it
names.

```bash
npx declare-changes app.declare                # what applies to this program, and where
npx declare-changes app.declare --since 0.5.3  # only the changes after 0.5.3
npx declare-changes --since 0.5.3              # every change since 0.5.3, with no program
npx declare-changes --done app.declare         # after a clean migration: record the release
```

**For a program**, each change that applies is listed with its file and line numbers — the
program's own files and what they include, never the library's — then the change before and
after, the docs to read (a guide chapter's file, or the `declare-help` name of a reference
page), and what changes without an error. Changes that may leave no findable spelling follow,
under **Check these too**. It ends with the next step: make the changes, run
[`declare-verify`](declare-docs:operational:verify), and when it is clean,
`declare-changes --done`.

**First, install the new release** with `npm install -D "declarelang@github:davidtemkin/declarelang#v<version>"`.
Changing the version in `package.json` by hand and running `npm install` leaves the lockfile,
and so the installed copy, on the old release.

**Which release a program was written for** is its `declareVersion` line, when it has one:

```declare
declareVersion [ "0.6.0" ]

App [ Text [ text = "Hello" ] ]
```

No program needs the line. `--done` writes it (or updates it) once a migration is finished,
so the next release's list starts from there. Without it, and without `--since`, every
release's changes are tried, and each one's `Find:` decides whether it applies. The compiler
reads the line too: a program written for a newer release than the compiler is an error, and
one written for an older release compiles with a one-line note naming this command.

- **`--json`** — the same list as data, for a tool.
- **The notes are the source.** The entries are the ones in `releases/v<version>.md` that a
  person reads; [`RELEASING.md`](../../RELEASING.md) has their form.

# `format` — the canon formatter

`format` rewrites a `.declare` file to the one house style — the shape described in
[the formatting appendix](declare-docs:guide:formatting). It is the enforcement side of that
style: run it on save, and your files match every other file in the corpus.

```bash
npx declare-format app.declare            # formatted → stdout
npx declare-format --write app.declare    # rewrite in place (only if changed)
npx declare-format --check app.declare     # exit 1 if not canon (CI gate)
```

- **no flag** — print the formatted result to stdout, leaving the file untouched.
- **`--write`** — rewrite the file in place, and only when it actually changed.
- **`--check`** — verify without writing; exit **1** if any file has drifted from canon. This
  is the CI gate, alongside [verify](declare-docs:operational:verify).

All three accept multiple files. Because canon is deterministic, `--write` then `--check` is a
no-op — the formatter is idempotent, so there is exactly one canonical form per program.

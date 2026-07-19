# `format` — the canon formatter

`format` rewrites a `.declare` file to the one house style (the rules are
the style canon ([docs/declare.md §15](declare-docs:spec:core))). It is the enforcement side of that style — run it on
save, and your files match every other file in the corpus.

```bash
node tools/format.mjs app.declare            # formatted → stdout
node tools/format.mjs --write app.declare    # rewrite in place (only if changed)
node tools/format.mjs --check app.declare     # exit 1 if not canon (CI gate)
```

- **no flag** — print the formatted result to stdout, leaving the file untouched.
- **`--write`** — rewrite the file in place, and only when it actually changed.
- **`--check`** — verify without writing; exit **1** if any file has drifted from canon. This
  is the CI gate, alongside [verify](declare-docs:operational:verify).

All three accept multiple files. Because canon is deterministic, `--write` then `--check` is a
no-op — the formatter is idempotent, so there is exactly one canonical form per program.

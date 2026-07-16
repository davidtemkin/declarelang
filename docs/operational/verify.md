# `verify` — the checking CLI

`verify` checks a program by climbing a ladder of rungs, cheapest first, stopping at the first
failure. The concept is [Check it](declare-docs:guide:checking); this page is the command.

```bash
node tools/verify.mjs app.declare
```

## The rungs

| # | rung | catches | needs |
|---|---|---|---|
| 1 | structure | parse errors | — |
| 2 | resolution | unresolved names, tags, datapaths | — |
| 3 | analysis | type errors, constraint reads without a known target | — |
| 4 | boot | fails to construct / settle headlessly | — |
| 5 | behavior | drive/expect mismatch | `--assert <script.mjs>` |
| 6 | visual | mismatch against named baselines | `--states <script.mjs>` `--baselines <dir>` |

## Flags

| flag | effect |
|---|---|
| `--rung=N` | stop after rung N (default 6) |
| `--json` | machine-readable result (used by the eval harness and editors) |
| `--no-typecheck` | skip the rung-3 typecheck (on by default) |
| `--assert <script.mjs>` | the drive/expect script for rung 5 |
| `--fixtures <dir>` | data fixtures the app consumes |
| `--states <script.mjs>` · `--baselines <dir>` | rung-6 named states and their baseline images |
| `--bless` | write current renders as the baselines |
| `--wrap` | wrap a bare `class … extends` in a probe app, so a library component verifies standalone |

Exit codes: **0** every requested rung passed · **1** a rung failed · **2** usage/toolchain
error. The diagnostics name the fix and report every independent error in a rung at once — read
them, apply them, re-run.

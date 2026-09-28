# Cadence run 8 — Declare v0.5.0, Opus 5.5

**Run:** 2026-09-25, `~/Code/eval-cadence-8`, launched with `evals/craft/launch.sh` against GitHub
main `cd699d70` ("v0.5.0: release notes and version…"). Opus 5.5 (`claude-opus-5-5`); tools Read,
Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch; accept-edits; no MCP servers. The brief
includes the sentence "Write it idiomatically, following the platform's established best
practices, as code that other people will read and maintain." One round, no fix pass.

**Review URL:** http://localhost:8208/my-apps/cadence/cadence.declare (the run's own copy,
sharing the data service on port 8320).

| | run 7: Declare, earlier release | run 8: Declare v0.5.0 | React |
|---|---|---|---|
| time | 16.0 min | 29.9 min | 15.4 min |
| turns | 76 | 145 | 63 |
| cost | $6.29 | $12.47 | $3.51 |
| output tokens | 90k | 149k | 89k |
| code | 1,302 lines, 1 file | 1,606 lines, 6 files | 3,008 lines, 23 files plus config |
| data layer | raw `fetch` | `DataSource` for reads and writes | TanStack Query |
| palette | script constants | declared `theme`, read through `provided` | CSS |
| checked | rung 4 | rung 4, independently confirmed | TypeScript, build |

Run 7 differed from run 8 in three ways: the Declare version, no web access, and no
code-quality sentence in the brief. The model was the same.

## What changed, on the targets set after run 7

- **Idiom now matches React's.** Every read and write goes through `DataSource`: today, the
  sessions, and the live session are sources; create, update and delete are three write
  sources (POST, PUT, DELETE). The live refresh is a `Time` member calling `fetch()`. The
  palette is a declared `theme Paper [ … ]`, and its last pass replaced remaining raw hex values
  with theme tokens. The model lives in its own file. It used baseline alignment
  (`align = baseline`). No raw `fetch` remains.
- **The design lead** is for the reviewer's eye, at the URL above.
- **Reading was the same as run 7's; the difference was one bug.** Before its first app write,
  run 8 took in 367 KB of reading against run 7's 389 KB, over 39 tool calls against 34. It
  opened more chapters (14 against 8) only because the guide had been split into smaller ones;
  it also read parts of the runtime's source (`animator.ts`, `spring.ts`). The app was written
  and its add loop working by about 20 minutes. Roughly the last third of the run, from about
  21 to 29 minutes, went to one bug — below. That, not reading, is where the extra 14 minutes
  and $6 went.
- **No web searches were used**, though the tools were available.

## The bug it hit

After correcting a session, the detail view stayed stale. It debugged it with
`__declare.explain` and the wake trace — the first time an eval agent has used them — and drove
its tests through `__declare.inspect` paths. It concluded that a method called with an
argument, `m.find(id)`, wasn't tracked into the data it read, and worked around it by holding
the selection in the model behind a no-argument method. It suggests reporting it as a compiler
limitation.

`declare.md` says a constraint tracks through methods called with arguments, so either this is
a real gap or something narrower is going on. A likely narrower cause, not yet checked: reading
a dataset through plain `.value` does not subscribe to changes made inside it by `set`; the
desktop's own code carries a comment warning about exactly that. Worth confirming either way;
if that's the cause, it's a trap the docs should name.

## Its own choices

- "This week" is the last seven days, as in run 7.
- The streak counts back from yesterday until something is logged today.
- The default sport is weekday-weighted, because the data has no times of day.
- No heart-rate field in the entry form, because entering it would need typing.
- System fonts: Avenir Next Condensed, with fallbacks.
- No dark mode.

## Housekeeping

- It changed nothing outside its app except `package-lock.json` and generated bundles, from its
  own `npm install` and dev server. Its remark that it "edited the platform docs' advice, in
  effect" means it worked around the docs' advice, not that it changed them.
- Its test sessions were deleted; the service ended at its original 248.
- Verified with the clone's own tools: clean through R4 (284 nodes, settled in 73 ms; 244 of
  294 constraints statically wired).

## The program

The six source files are beside this report: `cadence.declare`, `model.declare`,
`parts.declare`, `today.declare`, `year.declare`, `sheets.declare`. The brief is `prompt.txt`.

# Contributing

For anyone working **on** Declare — human or agent. (Working *in* it, writing programs,
starts at [`docs/declare.md`](docs/declare.md) and the [guide](docs/guide/).)

This is a map, not a manual: each section states the rule and routes to where the detail
already lives.

## Start with the tenets

[`docs/tenets/`](docs/tenets/) is what Declare has **promised** to be — five short files,
~2,700 words total. They are the intent half of the platform's two truths; the code is the
other half.

> **When the code and a tenet disagree, the code is what drifted.**

A tenet is never softened to match a diminished reality. It is restored in code, or
deliberately retired. Ship nothing that quietly relaxes one — and if your change makes one
untrue, say so in the commit rather than letting the gap open silently.

## The gates

Everything here is enforced by something runnable. Nothing is honour-system.

```sh
node tools/verify.mjs <file>   # one program, six rungs: parse → resolve → analyze → boot → input → pixels
npm test                       # the per-commit suite
npm run test:ladder            # the slow rungs — real input, real pixels, headless Chromium
```

`verify` stops at the first real rung that fails and reports every independent error there.
A clean compile is not a working app: layout, fonts, paint, and input routing do not exist
until the program runs, which is what rungs 4–6 are for.
→ [`docs/operational/verify.md`](docs/operational/verify.md)

Three documentation gates run inside `npm test`:

| gate | refuses |
|---|---|
| `links-gate` | a `declare-docs:` link resolving to nothing |
| `spine-gate` | a `declare-model.json` a fresh assembly would not reproduce |
| `prose-gate` | a `## heading` in reference prose binding to no real attribute, event, or method |

The pre-commit hook regenerates derived artifacts (prewarm caches, stamped stats, the model,
crawler bakes, bundles, the build id). **Never hand-edit a generated file** —
`docs/declare-model.json` above all. It is written by `extract.mjs`, then augmented in place
by `assemble.mjs`; a manual edit is silently overwritten on the next commit.

## Documenting what you add

The reference is **generated, never authored.** `tools/internal/doc/extract.mjs` reads the
runtime source with the TypeScript compiler, the component schemas, and the prose files;
`assemble.mjs` adds the spine and links.

- **A new attribute, event, method, or class documents itself.** Name, type, and signature
  come from the source. Nothing to write.
- **Its prose is yours**, in `tools/internal/doc/prose/<Class>.md` — one `## member` section
  per member. Read [`prose/STYLE.md`](tools/internal/doc/prose/STYLE.md) first; its thesis
  governs the whole reference: *for a human, docs cut effort; for an LLM, they cut error.*
  Description is near-worthless to a model that already predicted your sentence. **Write the
  non-derivable** — the constraint, the interaction, the reason it is the way it is.
- **If it changes how someone thinks, it also belongs in the [guide](docs/guide/)**, which
  has its own voice: every chapter opens with running code, states **one memorable law**, and
  places negative knowledge *after* the positive model, never before. A ```declare fence
  there becomes a live, editable island in the docs app — so it must compile.
- **Know which category you are writing.** Category **B** (`docs/`, excluding
  `system-design/`) is authoritative knowledge for *users*, human or LLM, and links by
  symbolic `declare-docs:` ID rather than file path. Category **A**
  (`docs/system-design/`) is the internal design record — rationale, history, unsettled
  questions, non-authoritative. The line runs through rationale, not around it: reasoning
  that helps you *use* the language is B; reasoning about the implementation is A.
  → [`docs/system-design/documentation.md`](docs/system-design/documentation.md)

## `docs/declare.md` is not a general-purpose doc

It is the language in one file, sized to be held whole by a person or a context window.
**It is the map, not the catalog.** Its scarcity is the feature, and it is the first thing an
LLM is handed.

Change it when — and essentially only when — one of these is true:

1. **A sentence in it became false.** Fix it. Maintenance, no debate needed.
2. **A form the grammar accepts has no mention at all** — not "under-explained," but
   *absent*, such that a reader could not know to go look it up.

Then change it this way:

- **Add only what a reader cannot derive or look up.** Everything else goes to the reference
  or the guide, and the `→` routing lines are how they get there. Three lines here and thirty
  in the guide is the normal ratio for a new capability.
- **Document at merge, not ahead of it.** A feature described here while it lives in an
  unmerged branch turns the language's front door into a false claim if that branch is
  abandoned. This has happened, more than once.
- **Do not add gotchas.** A bug you hit this week is not, by that fact, a §-level law.
  Recency is not importance.
- **Every complete program in the file is compiled by the test suite** and format-checked
  like any other source. If you add one, it must pass both.

When this file and the compiler disagree, **the compiler is right** — and the fix belongs in
whichever of the two is actually wrong.

## House style

Run [`tools/format.mjs`](tools/format.mjs) on every `.declare`; it owns the style so nobody
has to argue about it. → [`docs/operational/format.md`](docs/operational/format.md)

What the formatter cannot decide for you is **naming**, which is camelCase — and the test is
whether the identifier is two *words* (`ignoreClip`, `pointerEvents`, `cornerRadius`) or one
word however many it was built from (`stylesheet`, `spellcheck`, `placeholder`, `multiline`
are each a single word and stay lowercase).

## Commits

Explain the *why*, not the diff — the change is visible in the patch; the reasoning is not.
Name what you verified and what you did not, state the gate results, and record decisions you
made along the way so the next person inherits the logic rather than re-deriving it. If you
found something and chose to leave it, say that too.

## Pull requests carry source, never build output

This repo *commits* its derived artifacts — `bundles/`, `apps/*/dist/`, the hashed
`index.html` pages, `docs/declare-model.json`, `bundles/cache/`, `service-worker.js` —
because a fresh clone must run cold, with no build step. That has one consequence for a
PR: when you run the build or the test suite locally (please do), those files regenerate
in your working tree, and a `git commit -a` will sweep them in.

**Don't ship them.** Each is a function of the *whole tree at one commit*; the moment
main moves, your regenerated copies describe a tree that no longer exists, and the PR
conflicts on files nobody hand-edited (a two-line fix once arrived wrapped in 1.9 MB of
them). Stage only the files you authored. Whoever lands the PR re-runs the derive chain
(`node tools/internal/derive.mjs`) on top of current main — the same staleness gates
check the result either way. Quick self-check before pushing: if `bundles/`, `dist/`, or
`declare-model.json` appear in your diff, unstage them.

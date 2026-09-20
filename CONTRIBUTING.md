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
npm test                       # everything that tests the sources — no derive needed
npm run derive                 # regenerate the committed artifacts (required before a push) — stages its outputs
npm run test:derived           # the artifact gates — only meaningful straight after a derive
npm run test:ladder            # the slow rungs — real input, real pixels, headless Chromium
```

**How to work: one page.** The order, what each command actually builds, what derive
stages and what it leaves to you, the two questions pre-push asks, and the trap at each
step live in [`docs/operational/shipping.md`](docs/operational/shipping.md). It is the
single source for edit-to-push; this page holds the norms, not the loop. The per-rule
contract (what each rule reads and writes) is [`docs/operational/derive.md`](docs/operational/derive.md).

`verify` stops at the first real rung that fails and reports every independent error there.
A clean compile is not a working app: layout, fonts, paint, and input routing do not exist
until the program runs, which is what rungs 4–6 are for.
→ [`docs/operational/verify.md`](docs/operational/verify.md)

Three documentation gates run inside `npm run test:derived` — they compare a committed
artifact against a fresh assembly, so they belong to the derived tier and are only
meaningful straight after `npm run derive`:

| gate | refuses |
|---|---|
| `links-gate` | a `declare-docs:` link resolving to nothing |
| `spine-gate` | a `declare-model.json` a fresh assembly would not reproduce |
| `prose-gate` | a `## heading` in reference prose binding to no real attribute, event, or method |

**Never hand-edit a generated file** — `docs/declare-model.json` above all. It is written by
`extract.mjs`, then augmented in place by `assemble.mjs`; a manual edit is silently
overwritten on the next derive.

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

## One version of the truth, and where history is allowed

Everything a program author or an agent reads carries the **current** truth and no trace
of what came before. That is not tidiness; it is most of what the language is offering.
A reader has no way to tell a current form from a former one, so one sentence about a
previous design introduces a second candidate answer and no way to choose between them.

**User-facing** — the reference prose under [`tools/internal/doc/prose/`](tools/internal/doc/prose),
the guide, `docs/declare.md`, the tenets, the operational pages, every diagnostic message,
**and every line of `apps/` and `library/`, code and comments alike**: no former designs,
renames or migrations; no implementation history; no dates or "ruled" notes; no citations
into `docs/system-design/`; no prior-art framing. Mid-sentence ALL-CAPS is not emphasis
here either — `**bold**` once or twice, or a better sentence. The prose rule, with
examples, is [`prose/STYLE.md`](tools/internal/doc/prose/STYLE.md#one-version-of-the-truth);
what a *comment* may say is [the house-style chapter](docs/guide/22-house-style.md#what-a-comment-says).

The corpus is the reason `apps/` is on that list. Every program under it is read to learn
the language from, by people and by agents, so an ordinary `// ` comment in an app carries
the same obligation as published prose: say what the code does and why it is shaped that
way, never what it was. A refactor is where this slips — the reason for the change is
fresh and feels like the explanation — so the comment describes the shape that is there,
not the one it replaced.

**Internal** — comments inside `runtime/`, `compiler/`, `tools/` and `test/`, and the
design record in `docs/system-design/`: history is *welcome*. A comment saying why a
thing is shaped this way, including the bug that shaped it and the measurement that
settled it, saves the next maintainer a re-derivation and should stay. Those files are
read by people changing the code, who need the reasoning; the surface is read by people
using it, who need one answer.

**The line is the audience, not the directory.** The trap is the file that looks internal
and is not. A library component's doc header lives in `library/*.declare` beside its code
and is *published* as that component's reference entry. The code around that header is
read too — a component is the worked example of the thing it implements — and so is every
app in the corpus. Source that ships as teaching material is user-facing however much it
looks like implementation.

## Diagnostics in the runtime

**Developer prose never ships in a production build.** A production build replaces each
developer diagnostic's sentence with a code plus the values it interpolated —
`[Declare E3A14CE] /nope/deep, '/nope' is missing` — and `declare-help E3A14CE` gives the
sentence back (what an app author sees:
[`building.md`](docs/operational/building.md)). The strip finds a diagnostic by how it is
*written*, never by what a string looks like, so write every one in one of these forms:

| write | for |
|---|---|
| `` throw new DeclareError(`…`) `` | an error that stops something |
| `` console.error(`[Declare] …`) `` or `` console.warn(`[Declare] …`) `` | a contained report — the literal is the whole first argument, `[Declare]` capitalized |
| `` diag`…` `` (`runtime/src/errors.ts`) | a sentence that reaches its reader any other way: a builder's return, a helper's argument, one arm of a conditional |

The exceptions are deliberate. A plain `Error` is text an *app* may put on screen (a
`DataSource`'s `.error`), so it is never coded. Dev keeps every sentence — the dev server,
the live-compile pages, the Mac runtime, the tests, `declarec --debug` — because that is
where a developer meets them. A literal joined to built text (`"[Declare] " + build(…)`) and
a multiline literal are skipped rather than mangled: put the sentence in the builder, tagged
`diag`. `test/error-codes.test.mjs` refuses a production build in which any `[Declare]`
sentence survives.

## Commits

Explain the *why*, not the diff — the change is visible in the patch; the reasoning is not.
Name what you verified and what you did not, state the gate results, and record decisions you
made along the way so the next person inherits the logic rather than re-deriving it. If you
found something and chose to leave it, say that too.

## Pull requests carry source, never build output

Stage only the files you authored. This repo *commits* its derived artifacts — `bundles/`,
`apps/*/dist/`, the hashed `index.html` pages, `docs/declare-model.json`, `bundles/cache/`,
`service-worker.js` — so a fresh clone runs cold with no build step, and the build or the
test suite regenerates them in your working tree as you go. Each is a function of the *whole
tree at one commit*: the moment main moves, your regenerated copies describe a tree that no
longer exists, and the PR conflicts on files nobody hand-edited (a two-line fix once arrived
wrapped in 1.9 MB of them). Whoever lands the PR re-runs the derive chain on top of current
main. Self-check before pushing a branch: if `bundles/`, `dist/`, or `declare-model.json`
appear in your diff, unstage them.

Working on `main` is the opposite case — there the artifacts belong *in* the commit, because
the push is the deploy. [`shipping.md`](docs/operational/shipping.md) states both.

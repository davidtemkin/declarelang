# Derivation — the build, commit, and gate pipeline as a rule graph

**Status: BUILT AND RATIFIED-IN-USE, 2026-08-05** (David's ruling: "fundamentally this
is like a makefile — there should be structure"). This is the design record for
`tools/internal/derive.mjs` and `tools/internal/run-gates.mjs` in their rule-graph
form. The operational page — how to actually run them — is
[`operational/derive.md`](../operational/derive.md). This document is the *why*, the
invariants, and the honest account of what the mechanism does and does not protect.

## 1. Intention

The repository commits its derived artifacts — the prewarm cache, the documentation
model, the production builds, the baked static surfaces, the build id — so the tree
hosts and runs as-is with no build step. That choice (the OpenLaszlo distribution
model) means *generation is part of every publication*, and the generation pipeline's
quality is therefore release-path quality. (Until 2026-08-12 it was commit-path
quality: the pre-commit hook derived on every commit. That moved — §4 — but the
requirements below were written against the harder case and are unchanged by it.)

The intention, as ruled:

- **As little work as possible per pass, but no less.** Don't test what's not
  changed. Don't generate what's already correct. Don't generate anything more than
  once in one round.
- **Regular.** One rule shape for everything: declared inputs, declared outputs, a
  command. Build rules and test suites are the *same shape* — a suite is a rule whose
  output is a green stamp.
- **Non-looping by mechanism, not by accident.** Order and acyclicity are properties
  the driver *verifies against declarations*, never properties a comment asserts.
- **Maintainable.** Adding an artifact means adding a rule with its edges. Getting an
  edge wrong is a build error that names the rule and the file — not a one-round lag
  someone diagnoses three weeks later.

## 2. What it replaced, and why that shape failed

Before 2026-08-05, `derive.mjs` was nine stages in a hand-maintained order, all
running unconditionally (~21s), invoked by the pre-commit hook on every commit.
The order was right because a comment said so. Three failures followed from that
shape, all real, all found the same week:

1. **A cycle survived by luck.** `extract` read the build id out of
   `bundles/version.json`; `stamp-version` wrote that file five stages later, after
   hashing `bundles/cache`, which `prewarm` derives from extract's outputs. A true
   cycle — extract → version.json → stamp-version → cache → prewarm — survivable only
   because one edge happened to be weak. Symptom: every committed model trailed the
   build id by exactly one derive, a one-line diff chasing every commit.
2. **Two authors, one file.** `extract` and `assemble` both wrote
   `docs/declare-model.json` in sequence. A bare `extract` deleted assemble's half —
   the browse tree the docs app renders — leaving the artifact structurally invalid,
   reported three suites away as "STALE" with nothing pointing at the cause.
3. **The stale-crawl lag nobody had ever seen.** `prewarm`'s homepage crawl fetches
   `declare-faq.md` and `docs/declare.md`, whose `<!--stat-->` figures `stamp-stats`
   writes — *after* prewarm ran. The committed crawl artifacts had carried the
   previous round's figures for as long as both stages existed. Nothing failed;
   nothing was ever right on the first pass either.

The third one matters most for this record: it was found **by the validator, on its
first run**, not by any person or gate. Declaring the edges made a week-old invisible
defect a named build error.

## 3. The model

A **rule** declares:

- `inputs` — files/dirs/filtered walks it reads, *including its own tool sources*
  (so editing a generator reruns it);
- `outputs` — files it authors whole. One author per output, enforced;
- `stamps` — token or marker writes *into* files someone else authors (`?v=`
  cache-busters, `<!--stat-->` figures, the baked crawler region, marker-injected doc
  tables). Stamps are this pipeline's one honest deviation from make: a second writer
  is allowed, but only in this declared, idempotent, region-scoped form.

The driver enforces two invariants on every run, both build errors:

- **I1 — one author per output.** Two rules declaring the same output path.
- **I2 — no forward reads.** A rule whose input is an output *or stamp* of a later
  rule. A forward read is a cycle waiting for its second edge; refusing it at one
  edge is what makes loops impossible rather than unlikely.

**Skipping** is by content hash: a rule runs only when the hash of its declared
inputs differs from the manifest (`.derive/manifest.json`, untracked, per-clone), or
when its outputs' recorded hashes no longer match disk (a hand-edited artifact
triggers regeneration — tamper-safe for outputs; see §5 for stamps). Input hashes are
recorded **post-image** — after the rule ran — so a rule that stamps one of its own
inputs settles immediately instead of re-triggering itself once per round.

**Gates are the same mechanism.** `run-gates.mjs` treats each suite as a rule:
declared inputs (a curated map plus a core set every suite depends on), a hash
recorded only on a **green** run, a loud `skip` line when unchanged. An unmapped
suite always runs — *unlisted means unskippable*, so a missing declaration fails
safe. `npm test` and `npm run test:derived` are each unconditional within their
tier. One walker
(`tools/internal/filesets.mjs`) serves both systems, because two implementations of
"what does this depend on" would be its own defect class.

Measured on the same tree, all artifacts byte-identical throughout the rebuild:

| pass | before | after |
|---|---|---|
| no-op derive (then: the pre-commit hook, every commit) | 21.6s | 0.4s |
| no-op gates | 223s | 4.5s (all 43 skip) |
| one guide edit → gates | 223s | 18.2s (exactly `docs` + `ops` run) |

## 4. Decisions worth recording

- **The order is declared, then verified — not computed.** The rules execute in
  declaration order and the validator proves that order consistent with the declared
  IO. A topological sort would also work; verification was chosen because it keeps
  execution predictable (the file reads top to bottom as the truth) while making a
  wrong order impossible, which is the actual requirement.
- **Post-image hashing** is what reconciles stamps with skipping. Recording inputs
  before the run would make every self-stamping rule (assemble stamps
  `docs/operational/*` tables it also reads) rerun once per round forever.
- **`.derive/` is per-clone and disposable.** A fresh clone runs everything once;
  deleting the directory is always safe and only ever costs a full pass. No skip
  state is shared or committed, so no skip state can be wrong for anyone else.
- **prewarm split (`--stats-only` / `--no-stats`)** exists purely so the two halves
  can sit on opposite sides of `stamp-stats` — the fix for failure 3 above. A bare
  `prewarm.mjs` still does both, stats first, for standalone use.
- **Two test tiers, split by SUBJECT — not by speed** (ruled 2026-08-12). A suite
  belongs to `test:derived` only if its subject *is* a derived artifact: "the committed
  thing matches what the tree produces," or "the published thing is coherent." Everything
  else is `npm test`, which needs no derive and is meaningful on any tree. A test that
  merely *reads* a derived artifact to get at a fact the sources already hold is reaching
  for the assembled join out of convenience, and should read the sources — that is a
  defect in the test, not a tier assignment. Membership was vetted by intent, one suite
  at a time, and the vetting moved `datasource-failure` out (its only match was a comment)
  and `declare-help` in (the model *is* its knowledge base — most of its assertions are
  coverage claims over it). `docs` and `schema-completeness` stay because the assembled
  model is not source-derivable without running `extract`, which is the expensive rule
  this whole mechanism exists to skip. The membership is enforceable rather than
  remembered: `--outputs` × `SUITE_INPUTS` is the regression check, and the proof is
  running `npm test` against a tree with the artifacts deleted.
- **Hooks verify; only `derive` writes** (ruled 2026-08-12). `pre-commit` checks canon and
  writes nothing — it used to format the staged `.declare` files and `git add` the result,
  which defeated partial staging (a `git add -p` hunk plus later edits became one
  whole-file add) and staged even when the formatter failed. `pre-push` asks two read-only
  questions and refuses — it used to derive, stage, and refuse anyway, because **a commit
  made inside pre-push is not part of the push it intercepts** (git has already resolved
  the refs), so a hook-made commit would deploy one commit behind, silently. Since it had
  to refuse regardless, the writes bought nothing.
- **The push gate needs two questions, because `--dry` reads the wrong tree.** `--dry`
  compares artifacts on disk against sources on disk; a push publishes HEAD. So "derived
  but never committed" passes `--dry` and still deploys stale files. The second question —
  `git status` over `--outputs` — closes that, and catches the content-hash trap besides
  (`git commit -am` cannot stage the new `app.<hash>.js`). It uses `--outputs` rather than
  `--paths` because stamped files are hand-authored around their markers, so uncommitted
  prose in README would otherwise refuse every push.
- **Mixed directories get prefix filters, not looser claims.** `apps/docs/demos/`
  holds authored per-class examples (extract's *inputs*) beside generated `seg_*`
  islands (extract's *outputs*). The first validator run rejected the whole-dir
  claim in both directions; the resolution was to say precisely which half is whose.

## 5. Prospective risks — stated, not hidden

The mechanism trades a small amount of *declared* trust for a large amount of speed.
Each trust point is listed here with its backstop, because the failure mode of a
skipping build system is always the same: silence that reads as health.

1. **A rule's input list can lie by omission.** The validator sees declared edges
   only; a generator that quietly grows a new read (exactly how the buildId cycle
   began) skips when it shouldn't. *Backstops:* the content gates verify
   independently of the manifest (`assemble --check`, `links --check`,
   dist-freshness, prewarm's freshness gate, format); a fresh clone always runs
   everything; and the discipline is that **editing a generator's reads means
   editing its rule** — the rule is now the natural place a reviewer looks.
2. **A suite's input map can be too narrow**, silently skipping a genuinely affected
   suite. *Backstops:* every map includes the core (runtime, compiler, library,
   harness), so platform edits run the world; maps err coarse; an unmapped suite
   always runs; each tier's chain (`npm test`, `npm run test:derived`) is
   unconditional; and `run-gates --all` is the
   stated habit before a push and after anything structural. *Protocol:* if a
   regression ever slips through a skip, the fix is that suite's input list —
   widening it costs seconds — not abandonment of the mechanism.
3. **Stamped regions have weaker tamper protection than outputs.** A hand-mangled
   stamp persists until its rule's inputs change, because stamps are excluded from
   output-hash tamper detection (the surrounding file is legitimately hand-edited).
   *Backstops:* the marker-injected doc tables are byte-compared by
   `assemble --check`; the `?v=` and BUILD_ID stamps are re-asserted idempotently on
   every stamp-version run, which the hook triggers whenever platform inputs move.
4. **Coarse inputs over-trigger.** A rule with a superset input list reruns
   needlessly. This is a cost, never a correctness risk, and it is the deliberate
   direction of error everywhere in the maps.
5. **A non-deterministic generator never settles.** Its outputs move on every run,
   so derive reports regenerated files forever. This is *visible* (the per-run
   "N regenerated" line, and `derive --check` goes red), which makes it the opposite
   of the old failure mode — non-determinism used to look like ordinary churn.
6. **The validator reads the current tree.** An output that doesn't exist yet (a
   fresh clone before the first derive) contributes no files to edge detection on
   that first pass. Ordering still holds — it is declared — and every subsequent run
   validates the populated tree. Accepted as harmless; noted so nobody rediscovers
   it as a surprise.
7. **Manifest schema or rule renames discard skip history.** The manifest key
   includes a hash of the rule's own spec, so any change to a rule's declaration
   invalidates its record and forces one rerun. Always safe, occasionally a few
   seconds slower — the correct direction.

## 6. Open items

- **Hash sources, not artifacts, for the build id.** `stamp-version` hashes built
  outputs (bundles, dist pages, stubs), which is what forces it late in the graph
  and requires the normalize-before-hash discipline for self-referential stamps.
  Hashing the *inputs* that produce those artifacts (plus the lockfile) would let
  the id be computed first and embedded anywhere with no ordering constraint at
  all. Larger change to cache-busting semantics; recorded, not scheduled.
- **Gate dedupe.** `docs.test` and `ops.test` both execute `assemble --check` and
  `links --check` (one directly, one through the ops registry). With skipping the
  duplicate cost mostly vanishes, so this is now tidiness rather than time.
- **CI posture — none, deliberately.** `pre-push` gates freshness and committedness
  locally, with a documented escape hatch. What it does NOT check is CORRECTNESS: a
  rule's input list can lie by omission (risk 1), so an artifact can be hash-fresh and
  wrong. Ruled 2026-08-12 that this does not justify standing infrastructure. The
  window is narrow — a rule's own sources are among its inputs, so the moment a
  generator grows an undeclared read the rule reruns and the artifact comes out
  correct; the defect only appears later, if that newly-read file changes by itself —
  and the content gates (`npm run test:derived`) catch it on their next run, which is
  a command already in the flow before any push worth caring about. Recorded, not
  scheduled. If CI ever exists it runs `derive --all` + `npm test` +
  `npm run test:derived`, and the manifest never enters into it.

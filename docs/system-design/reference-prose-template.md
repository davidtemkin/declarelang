# Reference prose — the voice and template (ratified)

**Status:** RATIFIED 2026-07-14 (Fable editorial pass; the audit assigned this call here).
Governs the `@api` prose fill — the ~67 missing entries in `docs-model.json` and every
entry after. The format is the existing one (`tools/doc/prose/<Class>.md`, a class-lead
paragraph + `## member` sections, swapped later for captured source doc-comments with no
model change). **`tools/doc/prose/Animator.md` is the canonical exemplar** — match it.

## The template

**Class lead (2–6 sentences + one runnable fence):**
1. First sentence: what it *is* and what it's *for*, in the language's own terms.
2. Where it sits in its family, and **when to reach for the sibling instead**
   ("for a live, reactive target, reach for `Spring`") — the reader is always choosing.
3. One minimal runnable example fence (it becomes a live island if it compiles — write it
   to compile).

**Member entries (1–4 sentences each):**
- Lead with the contract, not a restatement of the name: what the slot means, what shape
  it takes, what reads/writes it.
- **Bold the one load-bearing rule** — the fact that prevents the misuse ("a **bare
  attribute name** … not a string, not a path"; "**omit it to sample the current value**").
- State the default's *meaning*, not just its value ("`0`/absent runs once").
- Name the escape or the sibling where the reader's next question is obvious.
- Never narrate the obvious (`width` — "the width"). If an entry has no rule, default
  meaning, or interplay worth stating, say the one true sentence and stop.

## The rules

- **Voice:** the core doc's register — declarative, present-tense, certain, never cute.
  Same words serve the human, the model, and (later) the hover tooltip.
- **Truth:** the compiler wins. Check every claim against the schema/source; run every
  fence. A member whose behavior you can't verify gets no prose until you can.
- **No duplication of the guide:** an entry states the contract; teaching the concept is
  the guide's job (the linking pass will connect them). One cross-reference is fine;
  a paragraph of tutorial is not.
- **Negative knowledge belongs in entries too** where a prior will bite ("not a string,
  not a path"), phrased as the positive rule plus the refused form.
- **Order within a class file:** the class lead, then members in the order a reader meets
  them (the important/defining ones first), not alphabetically — the generated page keys
  by name, so file order is free to serve reading.

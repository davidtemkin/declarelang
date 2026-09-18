# Writing Declare reference prose

How to write the doc blocks the reference is built from. Two readers consume every
entry, and they fail in opposite ways — write for both by writing for the harder one.

> **For a human, docs cut effort. For an LLM, they cut error.**
> A human recovers intent from the code, just slowly — so even a description ("what
> this does") saves them the climb. A model has almost no reading cost at this scale,
> so description is *near-zero value to it — it already predicted your sentence*. But
> the model's failure mode is worse than not-knowing: it **mis-knows** — confidently
> invents a plausible "why" and acts on it. Description doesn't fix that. The
> non-derivable does.

So the whole game is: **spend words on what the code cannot tell either reader, and
cut the rest.** A doc is worth only the bits a strong reader can't recover.

## Lead with the non-derivable

Order every entry so the first sentence is the thing you can't get from the signature.
The generator already prints the name, type, and default — **never restate them in
prose.** Rank what's left by value:

1. **Prior-correction / gotcha — the highest.** Where Declare *deviates from the
   common pattern* is exactly where a model is confidently wrong and a human assumes
   instead of checking. A doc here is a **prior override**, not a gap-fill. The ones
   that actually saved a reader in this codebase: `0x` vs `#` colors, **no DOM in
   `{ }`**, `DataSource.fetch()` is explicit (no auto-load), a `provided(…)` value follows
   an ancestor, `layout` is an *attribute not a child*, read-only intrinsics, the `app`
   noun. None are derivable; all counter a reasonable default. Write these first.
2. **Invariants / contracts.** "must run after init", "never mutate", "idempotent",
   ordering, lifetime. Invisible in the code, and the model is the agent most likely to
   violate them (it pattern-matches from everywhere). **Bold** the must/never.
3. **Intent / why.** Not in the code for anyone. Prevents the confident-wrong
   invention — you are pre-empting a guess, not filling a blank.
4. **A canonical example.** The single highest-signal thing you can hand a model
   (few-shot beats prose). One tight, *correct*, idiomatic snippet — not a toy. Include
   one whenever the shape isn't obvious from a word.

If, after cutting restatement, an entry has none of the above — it's a plain slot, and
one clause is the right length. Don't pad it to look thorough.

## Cut

- **Restatement of name / type / default** — the reference shows them beside your prose.
- **"Renders a button" description** — a strong reader predicted it. Zero value.
- **Obvious behaviour** — say the surprising thing or nothing.

## One version of the truth

The reference describes what Declare **is**, and nothing else. It carries no trace of
what it was.

That is a promise the language makes, not a matter of taste. A reader — and far more
often a model — arrives with no way to tell a current form from a former one, so a
single sentence about a previous design costs more than it explains: it introduces a
second candidate answer and no way to choose. One authoritative version, uncomplicated
by history, is a large part of what Declare is offering.

So in any entry, and in any component's own `/* # Name … */` header:

- **No former designs, renames or migrations.** Not "used to sit on `View`", not
  "replaces the old `accents`", not "this was three mechanisms before". If the old form
  is gone, it is gone; if it still exists, document the one that is correct.
- **No implementation history.** "Verified frame-by-frame against the original",
  "found exactly that way", "ruled 2026-07-29" — all of it belongs to the decision, not
  to the surface. Date nothing.
- **No citations into `docs/system-design/`.** That directory is the design record,
  including superseded decisions; pointing a reader at it hands them the archaeology we
  just removed. Cite the guide, a sibling entry, or nothing. (`declare.md`'s one
  pointer — that the directory exists and is background, not truth — is the exception,
  and exists to steer readers away.)
- **No prior-art framing.** "OpenLaszlo's `basetabslider`, reborn" tells a newcomer
  nothing and tells a model to go looking. Describe the component.

**Emphasis is a word, not a case.** ALL-CAPS mid-sentence reads as shouting to a person
and is noise to a tokenizer, and it spreads: one entry in capitals invites the next.
Use `**bold**` for the one load-bearing clause, at most once or twice an entry, and
reach for a better sentence before either. Genuine acronyms (`CSS`, `SQL`, `IME`) are
not emphasis and are fine.

**Where the history goes.** Inside `runtime/`, `compiler/` and the tools, a comment
explaining why a thing is shaped the way it is — including the bug that shaped it — is
valuable and should stay: that reader is the next maintainer, and the cost of
re-deriving it is real. The line is the audience, not the repository. Anything a
program author or an agent reads — this prose, a component's header, the guide, the
language file, a diagnostic — carries the current truth only.

## Two facts that change how you write

- **The doc is also a generation constraint.** For an editing agent the entry is a
  *spec it must conform to*, not just something to read. State must/never crisply and
  in the imperative — "**never** set this from a `{ }` body", not "it's generally best
  avoided."
- **It gets extracted into a model's context, weighted.** The AI-context export front-
  loads the non-derivable, so an entry that leads with a gotcha survives truncation and
  one that leads with description gets skimmed off. Front-loading isn't style — it's
  what makes the bits land.

## Shape

- One dense paragraph; a second only for an example or a genuine second gotcha.
- Markdown. `inline code` for identifiers, values, expressions. A fenced ```declare
  block for the canonical example.
- Terse. If a sentence would survive being deleted, delete it.

## The test

> Read your entry with the signature line covering the prose. If everything you wrote
> is now also visible in the signature, you wrote description — start over. What's left
> when the signature is hidden is the only part that was worth writing.

---

### The same slot, done twice

**Description (near-worthless to a model, thin for a human):**
> `fill` — sets the fill of the view. A `Fill` value; defaults to `null`.

**To standard (leads with the gotcha, then the consequence, then the shape):**
> What paints the box: a solid `Color` or a `gradient(…)`. `null` (the default) paints
> **nothing** — an unfilled box is invisible but still lays out and still catches
> clicks. In a `[ ]` literal a color is `#RRGGBB`; inside a `{ }` body it is
> `0xRRGGBB` — the one place the spelling differs.
> ```declare
> View [ fill = { gradient("90deg", 0x1E2A36, 0x0B141B) } ]
> ```

The second says nothing the signature already says, and everything it doesn't.

---

See [`../../docs/system-design/documentation-plans.md`](../../docs/system-design/documentation-plans.md) for the
value framework this operationalises, and [`../../docs/system-design/doc-system.md`](../../docs/system-design/doc-system.md)
for how `@api`/coverage turn these blocks into the built reference.

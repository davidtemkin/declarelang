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
   that actually saved a reader in this codebase: `0x` vs `#` colours, **no DOM in
   `{ }`**, `DataSource.fetch()` is explicit (no auto-load), `prevailing` slots follow
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
> clicks. In a `[ ]` literal a colour is `#RRGGBB`; inside a `{ }` body it is
> `0xRRGGBB` — the one place the spelling differs.
> ```declare
> View [ fill = { gradient("90deg", 0x1E2A36, 0x0B141B) } ]
> ```

The second says nothing the signature already says, and everything it doesn't.

---

See [`../../design/documentation-plans.md`](../../design/documentation-plans.md) for the
value framework this operationalises, and [`../../design/doc-system.md`](../../design/doc-system.md)
for how `@api`/coverage turn these blocks into the built reference.

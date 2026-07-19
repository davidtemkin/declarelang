<!-- nav: With an LLM -->
<!-- part: In practice -->

# Writing with an LLM

The calendar you are one chapter from reading reports a number on the homepage:
**zero lines written by hand.** A person decided what the calendar should be, reviewed
its behavior, and pushed back; an LLM wrote the Declare — every line — with the
compiler in the loop. That is not a stunt. It is the workflow this language was
designed around, and this chapter is its anatomy:

> **You own intent. The LLM owns the text. The toolchain keeps the text honest.**

If you have read this far, you have already used every mechanism in this chapter —
you just met each one as *your* tool. Here is the design intent that connects them.

## Why the loop converges

An LLM writing React verifies its work by resemblance: *this looks like the billion
lines I trained on.* Resemblance is not correctness — and no LLM has trained on
Declare at all. The language competes on different ground, and each piece is
something you have already touched:

- **The whole contract fits in context.** The language's complete definition is
  [one file](declare-docs:spec:core) of about ten thousand tokens — a small fraction
  of a modern context window. An LLM doesn't need a corpus for a language it can
  hold the entire spec of *while writing*; recent research (cited on
  [the homepage](declare-docs:essay:why-declare)) shows LLMs writing
  never-before-seen languages competently from a spec in context — in one study,
  outperforming the same LLM writing Python, its best-trained language. And most
  of any Declare program isn't new anyway: everything inside `{ }` is TypeScript,
  riding the largest training corpus there is.
- **The diagnostics steer the next attempt.** Every error you have met in this guide
  — naming the rule and the exact position, and often the fix — was written for the
  write-check-revise loop, where feedback quality bounds how fast the loop converges. A
  compiler that explains beats one that merely rejects; you have been benefiting from a
  design decision made for machines.
- **The checking is mandatory, and an error means it.** Every `{ }` body typechecks
  on every compile, no opt-out — and the checker is held to zero false positives
  across the repository's entire corpus, so an error is never noise to be talked
  past. A hallucinated attribute dies at compile time with a correction attached,
  not in production with a shrug.
- **There is one way to say most things.** No-magic regularity — dependencies
  extracted statically, events that don't bubble, one value pattern for every
  control — means code that looks right *is* right far more often, for an LLM
  exactly as for you.
- **Verify is the oracle.** The [ladder](declare-docs:guide:loop) gives an agent
  the thing agents otherwise lack: a mechanical, trustworthy answer to "does my
  output actually work?" — through boot and behavior, no browser, no human in the
  checking loop.

## The practice

Working with an LLM on Declare is deliberately unexotic:

1. **Hand it the language.** Give your LLM `docs/declare.md` — the whole language,
   one file — or install the packaged agent skill from the repository (`skill/`),
   which any coding agent can use as plain instructions. You do not teach an LLM
   Declare with examples; you hand it the contract and let the compiler hold it to
   it.
2. **Describe what you want.** Product intent — what it is, how it should feel, what
   matters. The mistakes you'd expect an LLM to make (CSS instincts, React
   reflexes) are exactly the ones the diagnostics were written to catch and correct.
3. **Let the loop run.** Compile, read, revise — the LLM's cycle is your cycle
   from this guide, faster. `verify` gates the result mechanically before you ever
   look.
4. **Review the tree.** Here is where the language pays you back. Because a program
   *reads as what it is* — named things and stated relationships, a few hundred
   lines for a real app — reviewing generated Declare is reading, not archaeology.
   You are checking intent: is this the interface I meant? Is the state modeled the
   way the product thinks? Do the springs express the continuity I asked for? The
   compiler already owned the rest — structure, types, paths, wiring. The division
   of labor is clean: **it verifies what code says; you judge what code means.**

That last point is why this chapter sits at the end of the guide instead of the
beginning. Review-by-reading only works if you can read — which is the skill the
previous eleven chapters built. An LLM at your side makes the writing cheap. It
makes your comprehension *more* valuable, not less.

## Tested, not assumed

"Designed for LLMs" is a marketing sentence anyone can type. Declare's version is a
measured claim, and the measuring instrument ships in the repository: an evaluation
harness (`evals/`) that hands LLMs an application brief and the language reference
*alone* — no repo, no examples — has them write the program cold, in one-shot and
iterated tracks, and scores the result mechanically with the same verify ladder you
use. Failures feed back into the language, the diagnostics, and the documentation;
several language changes exist specifically because evals showed LLMs tripping —
when the first eval cycle found programs failing because the docs never showed how
to draw a border, the fix was a sentence in the docs, and the next run came back
clean. The loop is spec → diagnostics → evals → revision, continuously. That is what
it means for a language to be designed for this era: not a hope, a feedback system.

The calendar is that system's exhibit. The person's work was product work —
deciding, reviewing, pushing back. The LLM's work was every line of the text. The
toolchain arbitrated. And the result is not a demo but the flagship this site ships
— which you are now equipped to judge for yourself, because it's next.

---

**What you can now say:** you can hand an LLM the language and direct it with
intent; you know why its loop converges here when it flounders elsewhere; and you
know which half of the work remains irreducibly yours — the half this guide trained.

[Next: **Declare Calendar** →](declare-docs:guide:calendar)

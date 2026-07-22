# The wager

Why the language is shaped the way it is: built for the era when much code is
written by machines, and bet on verifiability over familiarity.

### AREPO-1 — Built for machine-written code
When machines write the code, familiarity matters less and *verifiability* matters
more. Declare is designed around that shift, not retrofitted to it.
*Held in:* homepage hero ("the UI language for the AI era"); FAQ ("Declare is built for the era when much code is written by machines").

### AREPO-2 — The whole language fits in a model's context
The declarative surface is small, closed, and regular — its *entire* definition is
one file (`docs/declare.md`, on the order of ten thousand tokens). No model has
trained on Declare, and none needs to: a model can hold the complete spec while it
writes.
*Held in:* declare.md preamble ("the whole language in one file … no model has been trained on it"); FAQ; the "why" essay.

### AREPO-3 — Comprehension leverage, not corpus leverage
Declare competes on the kind of leverage a new language *can* have: a language
small enough to hand a model whole, regular enough to be analyzed rather than
pattern-matched, backed by a compiler that turns each mistake into a precise
correction. With less code passing under human eyes, the language and its compiler
are the one reviewer always present.
*Held in:* the "why" essay ("Two kinds of leverage").

### AREPO-4 — Type-checking is mandatory, and trustworthy
Every `{ }` body is type-checked on every compile, with no opt-out, and the
checker is held to **zero false positives** across the repository's own corpus —
every app, component, and doc example it ships. So an error always means something
is genuinely wrong.
*Held in:* FAQ ("Mandatory type-checking … zero false positives").

### AREPO-5 — Diagnostics name the fix
A compiler message is written to steer the *next* attempt — it states the rule and
names the rewrite that fixes it, including "did you mean" guidance for instincts
carried from other frameworks. The primary reader of a diagnostic, now, is a model
deciding what to do next.
*Held in:* FAQ ("Diagnostics that name the fix"); the "why" essay.

### AREPO-6 — No magic
Declare consistently chooses predictability over cleverness: dependencies are
extracted statically, events don't bubble, there is one way to say most things.
Where it looks familiar it behaves as you'd assume; where it is genuinely new it
*looks* new — a cue to consult the spec rather than autocomplete from memory.
*Held in:* FAQ ("No magic"); the "why" essay.

### AREPO-7 — Tested against models, not assumed
The claim that Declare suits LLMs is tested: an evaluation harness gives
model tiers application-building tasks cold, one-shot and iterated, and failures
feed back into the language, the diagnostics, and the docs. The documentation
doubles as training material — every code fence in the guide is compiled and
booted by the test suite, so nothing a model reads is stale or wrong.
*Held in:* FAQ ("What has been done during Declare's development to optimize for LLM usage").

### AREPO-8 — The human owns intent; the toolchain keeps the text honest
The workflow the language is designed around: a person directs and reviews; a
model writes the text; the compiler stays in the loop. The flagship calendar
reports its own number — zero lines written by hand.
*Held in:* FAQ ("The calendar says '0 lines written by hand'").

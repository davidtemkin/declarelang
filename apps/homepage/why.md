# Why a new language, now?

Start with the obvious objection. LLMs write code now, and they’re best at the
languages they’ve seen the most — so the winning move is to use whatever has
the biggest corpus and let the model figure it out. By that logic the era of
new programming languages is over.

That argument gets its facts right and its conclusion backwards. Producing
code is now nearly free; trusting it costs what it always did. An LLM writing
React verifies its work by resemblance — this looks like the billion lines it
trained on — and resemblance is not correctness. Meanwhile, less and less of
the code passes under human eyes, which leaves the language and its compiler
as the one reviewer that is always present. Handing the writing to a machine
doesn’t make the language irrelevant. It makes it load-bearing.

## Two kinds of leverage

What an LLM gets from a mainstream stack is corpus leverage: fluency by
imitation — broad, shallow, self-contradictory, unverifiable. The other kind
is comprehension leverage: a language small enough to hand to a model whole,
regular enough that its programs can be analyzed rather than pattern-matched,
and backed by a compiler that turns each mistake into a precise correction.
Corpus leverage arrives free with popularity. Comprehension leverage has to be
designed in — and it is the only kind a new language can compete on.

This is a measured bet, not a hunch. LLMs can learn a language they never
trained on from a spec in context — in recent studies, a small language
purpose-designed for LLM use, with zero training exposure, beat the same model
writing Python, its best-trained language. And what bounds a model’s ability
to repair its own mistakes is the quality of the feedback: a compiler that
explains beats one that merely rejects, by a double-digit margin.

The studies: [a zero-corpus DSL vs. Python →](https://arxiv.org/abs/2512.23214) · [feedback quality vs. repair →](https://arxiv.org/abs/2504.06939)

## Designed in, not bolted on

Declare’s declarative layer is small — the whole language fits in a model’s
context window with room left for your app — and everything inside a { } is
ordinary TypeScript, so the hard part of generation rides the largest corpus
there is. Where Declare looks familiar, it behaves the way a model — or you —
will assume: assignment is assignment, and there is no bypass to forget. Where
it’s genuinely new, it looks new — brackets for structure, :path for data — a
visible cue to consult the spec instead of autocompleting from memory.

And because a UI’s real structure — components, state, data, what reacts to
what — is expressed in the language, the compiler can see all of it: it
extracts every binding’s dependencies statically, checks the shape of the
tree, and types the seams. What a model reasons about is exactly what the
compiler verifies, and its errors are written for that loop — each one states
the rule and names the rewrite that fixes it, because the primary reader of a
compiler message, now, is an LLM deciding what to do next.

Indexable content is there from the start: the compiler runs your program at
build time and serializes what it renders, so what a visitor sees and what a
crawler sees can never drift. No server-side rendering, no hydration. That’s
why this page works on a static host like GitHub Pages.

## What it’s actually for

All of that is the floor, not the point. The point is what a language makes
sayable. The most prized layer of modern UI — the continuity you feel in the
best native software, where a view doesn’t switch so much as become the next
one, where motion carries meaning and everything stays interruptible — has
always been bespoke: specialist craft, one interaction at a time, locked to a
platform. It is also the least machine-writable code there is; the corpus is
thin, custom, and wrong in ways nothing catches.

Declare makes continuity the grain, not the garnish. Motion is a Spring on an
attribute; layout is a reactive slot; a mode is a reversible state — so the
continuous version of an interface is often less code than the discrete one.
The reference app is a calendar whose four views are one surface seen through
a moving, zooming rectangle — normally a bespoke project of its own, here a
few hundred lines of declarations, readable end to end, written with an LLM.
The whole category moves into the declarative, analyzable layer: the hardest
part of ambitious UX becomes the part a model is best at.

And that is the forward-looking wager. There is another generation of
experiences beyond the hand-crafted best-in-class interfaces of today — built
on a foundation with continuity at its core, enabled at the language level,
deployed as universally as a URL, and iterated by imaginative
designer-developers working with an LLM at their side. Declare is built to
find that out.

None of this trades away the human. What makes code legible to a model is what
makes it fast for you to read — and you are still the reader who decides. You
don’t teach an LLM Declare with a million examples. You hand it the language
and let the compiler keep it honest. The corpus will come; the language
doesn’t need it first.

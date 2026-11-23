# Why a new language, now?

Start with the obvious objection. AI writes most code now, and it is best at the
languages it has seen the most — so the sensible move is to use whatever has the
biggest corpus and let the model figure it out. By that logic the era of new
programming languages is over.

That argument gets its facts right and its conclusion backwards. Writing code is
now nearly free; trusting it costs what it always did. An AI writing React
verifies its work by resemblance — this looks like the billion lines it trained
on — and resemblance is not correctness. Meanwhile less and less code passes
under human eyes, which leaves the language and its compiler as the one reviewer
that is always present. Handing the writing to a machine doesn’t make the
language irrelevant. It makes it load-bearing.

## Two aims

Declare set out to be two things at once.

**Expressive.** A language that can say what a real interface is — not just data
entry screens, but fast, polished, custom software designed to be used, even
enjoyed: views that become the next view, motion that carries meaning, layouts
that answer to content and to the screen they are on.

**Verifiable.** A language that can be learned, written, debugged and tested by an
AI, and whose programs a compiler can check rather than guess at.

Most attempts to make code safe for machines make it duller for people. Declare refuses that tradeoff. Every feature that makes a program checkable — one tree for
structure, style and behavior; every dependency visible to the compiler; one
decider for each value — is also what makes it short, and readable to the person
who has to judge it.

## Made for the people who make interfaces

A well-designed experience is a set of decisions — how it should look, how it should
move, what should feel inevitable — and those decisions are yours. An AI can
produce a standard-looking app easily, and in Declare it can produce one
verifiably. What it cannot supply is a custom-crafted design.

That is why layout, motion, states, theming and drawing are part of the language itself rather than libraries: a `Spring` on an attribute, a layout as a value a view
holds, a mode as a state you are in or not. The continuous version of an
interface is often less code than the discrete one. And because a Declare
program is one complete description — no separate stylesheet, no framework
lifecycle, no build of a dozen files — the design you meant is written plainly
in the code, where you, a colleague or an AI can read it back and see that it
is still what you meant.

## Verifiable, by design

What an AI gets from a mainstream stack is corpus leverage: fluency by imitation
— broad, shallow, self-contradictory, unverifiable. The other kind is
comprehension leverage: a language small enough to hand to a model whole,
regular enough that its programs can be analyzed rather than pattern-matched,
and backed by a compiler that turns each mistake into a precise correction.
Corpus leverage arrives free with popularity. Comprehension leverage has to be
designed in, and it is the only kind a new language can compete on.

It is a measured bet: a small language handed to a model in context has beaten the
same model writing Python ([study →](https://arxiv.org/abs/2512.23214)), and a
compiler that explains its errors measurably improves a model’s repairs
([study →](https://arxiv.org/abs/2504.06939)).

Declare was built the same way it is meant to be used: eval by eval. An agent that
had never seen the language was given a written application spec and the Declare download, and
built the app while I watched — how long it took, what it tripped on, what it
found missing, how well its code read, how well the app worked. Another agent built the same spec in React. Over a hundred runs, what improved was not the
model but the language: the same ticket-buying app went from 48 minutes to 24, compiler
errors per build from 32 to 6. In the latest pair the Declare app was <!--stat:venue.declare.code-->1,279<!--/stat-->
lines to React’s <!--stat:venue.react.code-->2,666<!--/stat-->, and its first build that ran passed all
<!--stat:venue.checksWord-->eleven<!--/stat--> hidden checks; React’s passed <!--stat:venue.react.firstBootWord-->six<!--/stat-->. Single runs, not yet
a benchmark. [The runs, in full →](https://github.com/davidtemkin/declarelang/tree/main/evals/reports)

## What it’s for

The most prized quality of a great interface — the continuity you feel in the best
native apps — has always been bespoke: specialist craft, one interaction at a
time, locked to a platform, and wrong in ways nothing catches. Declare makes
that continuity the grain of the language, and puts it where a compiler can
check it. The calendar is the proof: four
views as one zooming surface, about <!--stat:calendar.codeAbout-->600<!--/stat--> lines, human-designed and directed, and built with AI.

There is another generation of experiences beyond today’s hand-crafted best —
built on a foundation with continuity at its core, deployed as widely as a URL,
and shaped by people with an idea of how software should feel, working with an
AI at their side. Declare is built to find out what they make.

*Further: [the FAQ](#faq) · [how it works](#architecture) ·
[the whole language, in one file](#language)*

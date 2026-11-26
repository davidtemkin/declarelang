# Why a new language, now?

AI writes most code now. You tell it what you want to build, and it uses
whatever language it likes to get it done. *Et voilà,* the era of new
programming languages is over. Therefore: English is the best, and final,
programming language. Right?

I think that argument starts with the plain truth — programming languages don't
play the same role they once did — but gets its conclusion wrong. Writing code
is now nearly free, but trusting it is as expensive as it's always been. An AI
writing React checks its work by resemblance ("this looks like the billion lines
I was trained on"), but resemblance isn't correctness. Meanwhile, less and less
code passes under human eyes. That leaves the language and its tools as the one
reviewer that's always there. Handing the coding to a machine makes the
language matter more, not less.

## Two aims

I started with two objectives.

**Expressive.** A language that can concisely describe a real interface: not
just simple data entry screens, but fast, polished, custom-designed software
meant to be used, even enjoyed, by actual humans. Views that become the next
view, motion that carries meaning, layouts that answer to content and to the
screen they're on.

**Verifiable.** A language designed to be learned, written, debugged and tested
by AI, whose programs a compiler can check rather than guess at, without
sacrificing human readability.

Most attempts to make code safe for machines make it duller for people. Declare
doesn't accept that tradeoff. The features that make a program checkable (one
tree for structure, style and behavior; every dependency visible to the
compiler; one decider for each value) are also what make it short, and readable
to the person who has to judge it. The whole language fits in an AI's context
window, and in your head.

## Made for the people who make interfaces

A well-designed user experience is a set of decisions: how it should look, how
it should move, what should feel inevitable. Those decisions are yours. An AI
can produce a standard-looking app easily, and in Declare it can produce one
verifiably. What it can't supply is a custom-crafted design. Declare is for
people who want to go beyond prototyping these experiences with AI, to building
structured, verified, accessible apps with it.

That's why layout, motion, states, theming and drawing are part of the language
itself, not libraries bolted on: a `Spring` on an attribute, a layout as a value
a view holds, a mode as a state you're in or not. The continuous version of an
interface is often less code than the discrete, screen-by-screen version. And,
because a Declare program is one complete description — no separate stylesheet,
no framework lifecycle, no build of a dozen files — the design you meant is
written plainly in the code, where you, a colleague or an AI can read it back
and see that it's still what you meant.

## Verifiable, by design

What an AI gets from a mainstream stack is corpus leverage: fluency by
imitation, which is broad, shallow, self-contradictory and unverifiable. The
other kind is comprehension leverage: a language small enough to hand to a model
whole, regular enough that its programs can be analyzed rather than
pattern-matched, and backed by a compiler whose every error names the fix,
because the reader of those errors is as often as not an AI deciding what to do
next. Corpus leverage arrives free with popularity. Comprehension leverage has
to be designed in, and it's the only kind a new language can compete on.

There's research behind this approach: a small language handed to a model in
context has beaten the same model writing Python ([study
→](https://arxiv.org/abs/2512.23214)), and a compiler that explains its errors
measurably improves a model's repairs ([study
→](https://arxiv.org/abs/2504.06939)).

I built Declare the way it's meant to be used: eval by eval. (An "eval," in
AI-speak, is a test drive with the AI at the wheel and me taking notes.) An
agent that had never seen the language got a written application spec and the
Declare download, and built the app while I watched how long it took, what it
tripped on, what it found missing, how well its code read and how well the app
worked. Another agent built the same spec in React. I've done this over a
hundred times. You could call it a form of recursive self-improvement, except
that what improves isn't the AI but the language. Languages usually evolve over
years; Declare did it in weeks, with feedback from a user who never gets tired
and writes down everything that confused it. The same ticket-buying app went
from 48 minutes to build to 24, and compiler errors per build from 32 to 6. In
the latest pair the Declare app was
<!--stat:venue.declare.code-->1,279<!--/stat--> lines to React's
<!--stat:venue.react.code-->2,666<!--/stat-->, and its first build that ran
passed all <!--stat:venue.checksWord-->eleven<!--/stat--> hidden checks; React's
passed <!--stat:venue.react.firstBootWord-->six<!--/stat-->. These are single
runs, not yet a benchmark. [The runs, in full
→](https://github.com/davidtemkin/declarelang/tree/main/evals/reports)

## Custom-designed experiences

Custom-designed experiences, as seen in the best native apps, have their own
components and continuity, where one view becomes another instead of a sequence
of screens. They've always been bespoke, locked to a platform, and can be wrong
in ways that are hard to catch. This is also among the least machine-writable
code there is, because the corpus for it is thin. Declare makes continuity,
motion and custom components the grain of the language, and puts it where a
compiler can check it. One example is the calendar, whose day, week, month and
year views are one zooming surface, in about
<!--stat:calendar.codeAbout-->600<!--/stat--> lines. A human (me!) guided it; AI
wrote it; the compiler, inspector and checker kept it honest.

I don't believe computing collapses into a chat window; we still need apps.
There's a next generation of experiences beyond today's hand-crafted best, built
on a foundation with continuity at its core, deployed as widely as a URL, and
shaped by people with an idea of how software should feel, working with an AI at
their side. Declare is built to find out what they make.

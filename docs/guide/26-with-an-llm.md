<!-- nav: Writing with an LLM -->
<!-- part: Shipping and working -->

# Writing with an LLM

The calendar app reports a number on the homepage: **zero lines written by hand.** A
person decided what the calendar should be, reviewed its behavior and pushed back; an LLM
wrote every line, with the compiler in the loop. That is the workflow this language was
designed around.

> **You own the intent. The LLM owns the text. The toolchain keeps the text honest.**

This chapter is the working loop — the four things an LLM, or an agent, does to write a
Declare program that works — and the reasons that loop converges on a language no LLM
has seen in training.

## 1. Start with context

An LLM does not need a corpus for a language whose entire definition fits in its context
window. Hand it the language and let it write from that, rather than from resemblance to
other frameworks:

- **[`docs/declare.md`](declare-docs:spec:core)** — the whole language in one file, about
  <!--stat:spec.tokens-->12,000<!--/stat--> tokens.
- **The skill** in `skill/` — the language, the library, the conventions and the working
  loop, packaged for coding agents (Claude Code discovers it automatically; any agent can
  read it as plain instructions).
- **`npx declare-help <name>`** — any class, attribute, enum or error code, answered on
  demand from the same documentation model this guide is built from. It also answers
  *absences*: ask for `borderWidth` and it names the Declare way.

Most of a Declare program is TypeScript anyway — everything inside `{ }` — so the hard
part of generation rides the largest training corpus there is. Only the small declarative
layer is new, and it is regular enough to learn from the spec. [What Declare
is](declare-docs:guide:what-declare-is) shows the shape of an idiomatic app; point an
agent at it before it writes one.

## 2. Correct, don't guess

Every compile type-checks every `{ }` body, with no opt-out, and the checker is held to
zero false positives across the repository's own programs — so an error always means
something is actually wrong, never noise to talk past. Every diagnostic names the rule and
the position, and for the mistakes the compiler anticipates — a CSS property name, a React
habit, a percentage inside braces — it names the fix:

```
Text has no attribute 'color' — the CSS instinct: text color is 'textColor'
(a provided value — set it on a container to cascade) [DECLARE2000] (line 2, col 28)
```

Feedback quality bounds how fast a write-check-revise loop converges; a compiler that
explains beats one that only rejects. An LLM's job is to apply the named fix, not to
guess around the error.

## 3. Question the result

When a program compiles and still behaves wrongly, reading the source again is the slow
path. Ask the running program. `__declare.explain(path, attr)` returns a value, the
expression that produced it, and every value that expression read; `__declare.explainHit(x,
y)` names what a click at a point actually reaches. The Inspector is the same answers with a
face ([Running and checking](declare-docs:guide:run-and-check)). An agent driving a browser
can call these directly.

## 4. Prove the change

`npx declare-verify app.declare` climbs six rungs — parse, resolve, typecheck, boot, then
behavior against a drive-and-assert script, then pixels against named screenshots — and
reports the first real problem. The first four need no browser, so an agent can prove its
output boots before handing it back; the last two prove it does what was asked. Every rung
reports what it proved and what it cannot see.

## Reviewing what comes back

This is where the language pays you back. A Declare program reads as what it is — named
things and stated relationships, a few hundred lines for a real app — so reviewing
generated code is reading, not archaeology. The compiler has already checked the
structure, the types, the paths and the wiring. What remains is yours: is this the
interface you meant, is the state modeled the way the product thinks, does the motion
express the continuity you asked for? **The toolchain verifies what code says; you judge
what it means.**

Some things to look for, because an LLM arriving from other stacks drifts toward them:

- state piled on [`App`](declare-docs:App) instead of in datasets and model classes
  ([Data](declare-docs:guide:data), [Components](declare-docs:guide:components));
- hand-set `x`/`y` ladders where a layout belongs
  ([Size, position and layout](declare-docs:guide:layout));
- clickable plain views where a library control or a [`Control`](declare-docs:Control) subclass belongs
  ([Controls](declare-docs:guide:controls));
- views created in a loop instead of replicated from data;
- a timer or per-frame handler checking whether something has happened, instead of a
  constraint on the thing itself ([Time and change events](declare-docs:guide:time)).

Each one works, and each one quietly costs what the language was for.
[Coming from other frameworks](declare-docs:guide:coming-from) lists the reflexes and the
Declare answers.

## Tested, not assumed

"Designed for LLMs" is a sentence anyone can type. Declare's version is measured: an
evaluation harness in `evals/` hands LLMs an application brief and the language reference
alone — no repository, no examples — has them write the program, and scores the result with
the same verify ladder. Failures feed back into the language, the diagnostics and the
documentation; several language changes exist because evals showed LLMs tripping.

---

**What you can now do:** give an LLM the language and direct it with intent, run the four
steps that make its loop converge, and review what comes back for the things only you can
judge.

[Next: **Reading the calendar** →](declare-docs:guide:calendar)

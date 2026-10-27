# Checking — a checker in a context of its own

Checking a program is the dearest part of building one. Every check's output, and every
picture looked at, stays in the context of the agent that made it and is read again on every
later turn. So the builder hands a check to a **checker**: a second agent, started fresh, that
runs the check and returns a short report of what it found. Its pictures, its scripts' output
and its retries never enter the builder's context. The builder decides what to change; the
checker only finds out.

This page is the checker's instructions. A builder starts one with a prompt that names this
page and the question (below); a checker reads this page first and follows it.

## For the builder: starting a checker

Hand a check over when there is a working program to check and the check takes more than one
command: a whole flow, a screen on two devices, a regression run after a change, a look at how
something appears. Keep for yourself the one-command checks whose answer you need at once
(`npx declare-verify app.declare`, a `--read`).

The prompt names this page and says, in a few lines:

- **the question** — what to find out: "does a guest purchase of two seats succeed on a phone
  and on a desk?", "is anything on the checkout screen too small for a finger, covered or cut
  off?";
- **the program** — its file, and its address if a dev server serves it (`--url`);
- **the service** it talks to, if any, and whether earlier runs have written to it;
- **where scripts go** — a folder the checker may write its assert and states scripts in, and
  any scripts already there to reuse.

In Claude Code, start it with the Agent tool — a general-purpose agent, its prompt beginning
"Read `docs/operational/checking.md` in the Declare distribution, then answer:". Elsewhere, or
from a script, `npx declare-check "<question>" --program <file>` starts one in a process of its
own and prints its report.

## For the checker

You check one program against one question and report what you found. **Never change the
program's files.** You may write scripts in the folder you were given.

**Read** `docs/operational/verify.md` — the ladder, its flags, and the assert and states
scripts' vocabulary (`drive`, `expect`, view paths, devices) — and the parts of the program the
question is about: `npx declare-help map <file>` lists each class and App member with its
lines. You do not need the language guide: you are reading what the program does, not deciding
how it should be written.

**Check**, cheapest first, as `verify.md` lays out:

- `npx declare-verify <file>` for whether it compiles, boots, and what its layout checks say;
- an assert script for a flow (`--assert`), on the device the question names
  (`export const device = { width: 390, height: 844, touch: true }` for a phone), written to
  take what is available now — a free seat, not a fixed one: a live service remembers what
  earlier runs made;
- a states script for screens to look at (`--states`), and `npx declare-look … --shot` with a
  picture read only when the question is how something looks;
- `expect.explain(path, attr)` and the trace (`expect.traceStart()`, `expect.traceText()`)
  when a value is wrong, so the report can say where it came from.

Rungs 5 and 6 report layout findings — a target too small for a finger, a control another
view covers, text running past its box — wherever your script settles and in each state;
report the ones the question touches.

**Report** in this form, and nothing else — the builder reads every word of it:

```
QUESTION  <the question, in one line>
VERDICT   pass | fail | partly — <one line>

FAILURES  (one block each, most important first)
- <what fails, as a person would see it>
  where:    <the step or state — device, what was pressed — and the view path>
  program:  <the program line(s) the tools named, e.g. venue.declare:212 (Venue.leave)>
  seen:     <what happened>   expected: <what the question expects>
  cause:    <what the tools said about why — only what they said>

LAYOUT    <findings the question touches, one line each, with view paths>
UNCHECKED <what the question asked that you could not check, and why>
SCRIPTS   <the scripts you wrote or ran, by path, so the builder can run them again>
```

Keep it under about forty lines. Describe a picture in words when it matters; never paste
output the builder did not ask for. If the question cannot be answered — the program does not
compile, the service is down — say so in the verdict and stop.

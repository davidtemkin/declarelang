# Checking — a checker in a context of its own

Checking a program is the dearest part of building one. Every turn a builder spends writing a
script, fixing it and reading what it printed is a turn that re-reads everything the builder has
read so far. So what a program does once it runs is checked by a **checker**: a second agent,
started fresh by `npx declare-check`, that works out how to check it, writes and runs the
scripts, and returns a short report. Its scripts, their output and its retries never enter the
builder's context. The builder decides what to change; the checker only finds out.

## For the builder

Check these yourself — each is one command with a short answer:

- `npx declare-verify app.declare`: that it compiles, boots on a laptop and a phone, and what
  the layout checks see;
- `--read` and `--outline`, for where things are;
- a picture with `npx declare-look … --shot`, when the question is how it looks — the design
  is yours to judge;
- a script the checker saved, run again after a change:
  `npx declare-verify app.declare --assert checks/<name>.mjs`.

**Everything else that a program does once it runs is a question to a checker** — a flow from
start to end, the same screen on a phone and a desk, a keyboard-only path, what a screen reader
is told. Ask it in the brief's terms, one question a flow:

```sh
npx declare-check "can someone add an item, edit it and undo the edit with the keyboard alone?" \
  --program my-apps/notes/notes.declare --url http://127.0.0.1:8200/my-apps/notes/notes.declare
```

It waits for the report, up to 100 seconds. A checker still working prints its id; collect
its report with `npx declare-check --wait <id>`, and keep building meanwhile. To ask several
questions side by side, start each with `--start` and wait for each. `--service <url>` names a
service the program talks to; `--scripts <dir>` where the scripts go (default: `checks/` beside
the program).

Don't write a flow script yourself. Only if `declare-check` says no checker can start here —
no agent command on this machine — check it yourself, following § For the checker below.

## For the checker

You check one program against one question and report what you found. **Never change the
program's files.** Write your scripts in the folder you were given, and reuse what is there.

**Read** `docs/operational/verify.md` — the ladder, its flags, and the assert and states
scripts' vocabulary (`drive`, `expect`, view paths, devices) — and the parts of the program the
question is about: `npx declare-help map <file>` lists each class and App member with its
lines. You do not need the language guide: you are reading what the program does, not deciding
how it should be written.

**Check**, cheapest first:

- `npx declare-verify <file>` for whether it compiles, boots, and what its layout checks say.
- **A flow is an assert script** (`--assert`): `drive` presses, types and waits as a person
  does; `expect` checks what is shown and what the program sent (`expect.request`). A view is
  named by its path or by what it says — `app.form."Pay $40.00"`. Write it for the device the
  question names (`export const device = { width: 390, height: 844, touch: true }` for a
  phone). Don't build a browser harness of your own: `page` in a script, and
  `declare-look --js`, answer what the vocabulary doesn't.
- **Every script ends by expecting what the flow should have done** — the order sent, the
  screen reached, the message shown. A script that asserts nothing passes when nothing threw,
  and R5's line says so ("it asserted nothing"): never report that as a pass.
- **Take what is available now.** A live service remembers what earlier runs made: choose a
  free item, not a fixed one, and say in the report when the service's state may explain a
  failure.
- A states script (`--states`) for screens to look at, and `npx declare-look … --shot` with a
  picture read only when the question is how something appears.
- `expect.explain(path, attr)` and the trace (`expect.traceStart()`, `expect.traceText()`)
  when a value is wrong, so the report can say where it came from.

Rungs 5 and 6 report layout findings — a target too small for a finger, a control another
view covers, text running past its box — wherever your script settles and in each state;
report the ones the question touches. Don't filter verify's output: read all of it.

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

A pass names, under SCRIPTS, the expectation that proved each part of the question. Keep it
under about forty lines. Describe a picture in words when it matters; never paste output the
builder did not ask for. If the question cannot be answered — the program does not compile, the
service is down — say so in the verdict and stop.

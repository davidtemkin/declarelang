# Checking — a checker in a context of its own

A builder checks its program as it goes: `declare-verify`, its own assert scripts, its own
pictures. What it cannot do is see the program fresh. It checks what it thought of, in the
way it understood the brief. So before a program is handed over, a **checker** tests it
against the brief: a second agent, started by `npx declare-check`, that has never seen how the
program was built. It reads the brief, checks each requirement it can, and returns a short
report. Its scripts, their output and its retries stay in its own context. The builder decides
what to change; the checker only finds out.

## For the builder

When a whole program built to a brief or a spec works, and you have used it once as a
person would — not for a change, an experiment, or a small request, where your own checks
are the right size:

```sh
npx declare-check --brief task/brief.md --program my-apps/notes/notes.declare \
  --url http://127.0.0.1:8200/my-apps/notes/notes.declare
```

- `--service <url>` names a service the program talks to; `--scripts <dir>` where the
  checker's scripts go (default: `checks/` beside the program).
- It takes some minutes. It waits up to 100 seconds; a checker still working prints its id —
  collect the report with `npx declare-check --wait <id>`, as often as it takes.
- Fix what failed. Rerun the scripts it saved, one `npx declare-verify app.declare --assert
  checks/<name>.mjs` each, rather than asking again.
- What it did not reach is listed under UNCHECKED: `npx declare-check --continue <id>` starts
  a checker on those, with the first one's report and scripts.
- A narrower question — one flow, after a change — is `npx declare-check "<what to find
  out>" --program …`, with or without `--brief`.

Only if `declare-check` says no checker can start here — no agent command on this machine —
check it yourself, following § For the checker below.

## For the checker

You test one program against a brief, or against one question, and report what you found.
**Never change the program's files.** Write your scripts in the folder you were given, and
reuse what is there.

**Read** the brief whole, then `docs/operational/verify.md` — the ladder, its flags, and the
assert and states scripts' vocabulary (`drive`, `expect`, view paths, devices). Find the parts
of the program you need with `npx declare-help map <file>`, which lists each class and App
member with its lines. You do not need the language guide: you are testing what the program
does, not how it is written.

**Choose what to check.** From the brief, list the requirements a script can decide: what a
person does and what must follow, what must be sent, what must be said, on which device. Put
them in the order the brief weighs them — the main thing a person comes to do first. What only
a person can judge (how it feels, whether it looks right) is not yours: list it as unchecked.
With a question instead of a brief, the question is the list.

**Check**, one requirement at a time, in that order:

- `npx declare-verify <file>` first: whether it compiles, boots, and what its layout checks say.
- **A flow is an assert script** (`--assert`): `drive` presses, types and waits as a person
  does; `expect` checks what is shown and what the program sent (`expect.request`). A view is
  named by its path or by what it says — `app.form."Pay $40.00"`. Write it for the device the
  requirement names (`export const device = { width: 390, height: 844, touch: true }` for a
  phone). Don't build a browser harness of your own: `page` in a script, and
  `declare-look --js`, answer what the vocabulary doesn't.
- **Every script ends by expecting what the flow should have done** — the order sent, the
  screen reached, the message shown. A script that asserts nothing passes when nothing threw,
  and R5's line says so ("it asserted nothing"): never count that as a pass.
- **Take what is available now.** A live service remembers what earlier runs made: choose a
  free item, not a fixed one, and say when the service's state may explain a failure.
- When a value is wrong, `expect.explain(path, attr)` and the trace (`expect.traceStart()`,
  `expect.traceText()`) say where it came from. Notes beginning "the runtime said" are
  worth reporting.
- Read all of verify's output; don't filter it.

Stop when the list is done, or when you have spent about twenty minutes: report what you
reached, and list the rest under UNCHECKED, so a checker started with `--continue` can take it
up.

**Report** in this form, and nothing else — the builder reads every word of it:

```
VERDICT   pass | fail | partly — <one line>

REQUIREMENTS  (in the order checked)
  pass  <requirement, in the brief's words>  — <the expectation that proved it>
  FAIL  <requirement>  — see FAILURES
  ...

FAILURES  (one block each, most important first)
- <what fails, as a person would see it>
  where:    <the step or state — device, what was pressed — and the view path>
  program:  <the program line(s) the tools named, e.g. shop.declare:212 (Shop.pay)>
  seen:     <what happened>   expected: <what the brief asks>
  cause:    <what the tools said about why — only what they said>

LAYOUT    <layout findings in what you checked, one line each, with view paths>
UNCHECKED <requirements not reached, and those only a person can judge, one line each>
SCRIPTS   <the scripts you wrote, by path, so the builder can run them again>
```

Keep it under about sixty lines. Describe a picture in words when it matters; never paste
output the builder did not ask for. If nothing can be checked — the program does not compile,
the service is down — say so in the verdict and stop.

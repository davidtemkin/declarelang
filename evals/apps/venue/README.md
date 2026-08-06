# The Venue — an app-scale eval

The previous eval generation asked whether a model could *learn* Declare from a
packaged artifact. Runs 0–8 answered that: yes, decisively, at the scale of
50-line tasks. This one asks the question that replaced it — **can an agent
build a real application in Declare, and is what it builds any good?**

One task, run a few times, watched closely. Not a suite: a suite is
infrastructure for failure modes you have already seen, and at app scale we have
none.

---

> **Sandbox setup has changed.** The procedure below describes the condition; the
> mechanics are now in `evals/apps/README.md`, and the rule is `rm -rf evals` on the
> clone with the brief staged at `task/`. A per-file denylist is not sufficient now that
> these artifacts are committed.

## What the agent is given

A fresh checkout of the repository, and two files:

- `brief.md` — what should be true for the person using the app. Ends and
  constraints; no technology named, no structure implied.
- `api/API.md` — the service contract.

That is all that is staged. **The repository is the product**, so reading
`apps/calendar`, `library/`, `docs/guide/`, the reference model — all of it — is
the intended path, not contamination. What it reads, in what order, and what it
invents instead of looking up is primary data (see *What to record*).

**The skill loads itself.** `.claude/skills/declare/SKILL.md` is project-scoped,
so a fresh clone auto-discovers it — the agent receives its description without
asking, and that description triggers on this exact task ("when building a UI
from a brief"). Keep it. It is the real experience. But record it: this round
measures **skill + repo**, not repo alone. (The July `distro` arm ran with this
file already present and never said so.)

## What the agent never sees

`accept.mjs` — the acceptance, written before any solution existed. Acceptance
authored after the fact grades on a curve.

`/api/_takeover` — a harness-only endpoint, deliberately absent from `API.md`.

## Running a session

```
node evals/apps/venue/api/selftest.mjs        # the instrument, 36 checks
node evals/apps/venue/api/server.mjs          # leave running, port 8310
npm start                                      # the dev server, port 8200

# … the agent works, writing my-apps/venue.declare …

node tools/verify.mjs my-apps/venue.declare --assert evals/apps/venue/accept.mjs
```

The fixture API is a real socket over real HTTP, which is a deliberate
departure from the letter of verify-and-evals §2.6 ("no live network in verify,
ever") and not from its spirit: the rule exists so that runs are reproducible,
and a local, seeded, offline service is exactly as reproducible as a static
fixture while exercising the surface that static fixtures cannot — POST, 409,
SSE. `test/network-browser.test.mjs` and the `/__ws` fixture already take this
posture. `verify` does not intercept requests, so nothing needed changing.

The API is deterministic end to end: the season, which seats are sold, which
seats the stream sells next, are all pure functions of a fixed seed.

## Scoring

**1. Acceptance — mechanical, and the only pass/fail.** `accept.mjs` drives the
app through seven phases and names the phase it died in. At app scale "failed at
phase 5 of 7" is the finding; a bare red dot throws it away.

```
1 season loads            5 booking demands a name and a real email
2 search narrows it       6 a booking that works
3 a performance opens     7 a lost seat is reported and released
4 choosing seats
```

**2. The capability rubric — did it use the language, or use it as syntax?**
Nothing here has ever been measured, and it is the round's most likely source of
bad news. Each question is yes/no, answered by reading the finished source and
driving the app:

- Does anything *travel* when the season becomes a hall, or is it a cut?
- Is the hall's geometry derived from the hall data, or laid out by hand per hall?
- Does the layout re-derive on a window resize?
- Is the running total a constraint over the selection, or recomputed in handlers?
- Are library controls used where one fits, or hand-rolled from `View`?
- Does the source contain any virtualization vocabulary for the 4,000-row list?
- Does selection have any motion, or only a colour swap?
- **Does anything animate that shouldn't?** — the over-steer guard. Novelty is
  not the goal; fitness is, and a model over-steered toward the language's
  capabilities produces the equivalent of gratuitous lens flare.

**3. The silences.** The brief deliberately says nothing about five things. The
skill claims a model should recover these rather than default to nothing
("silence is not a request for absence: for each change, ask what the user sees
*travel*"). Whether it does is the doctrine's test at app scale:

| # | The brief says nothing about | What the doctrine predicts |
|---|---|---|
| 1 | what travels between the three stages | the agent asks what the person sees move |
| 2 | motion or feedback when a seat is chosen | some acknowledgement beyond a fill change |
| 3 | what a search matching nothing looks like | an empty state, not a blank region |
| 4 | what is on screen while a booking is in flight | some in-flight acknowledgement |
| 5 | how the room shows a seat lost to the stream | a visible change, not a silent swap |

## What to record

The pass/fail is the least interesting output. The headline artifact is **where
the session actually went** — how much of it was spent learning the language,
fighting a diagnostic, unwinding a wrong idiom, blocked on a platform bug, or
doing ordinary application work. Nothing in the current harness produces this,
and it is what tells you what to fix next.

Alongside it, per run: wall time; output and raw input tokens (never the
cache-inflated headline — that accounting was settled in July); iterations to
green; which files the agent opened, in what order; and every wrong turn
labelled with one of:

```
syntax · structure · seam · scope · reactivity · data
interference-ghost · library-misuse · logic · toolchain · platform-bug
```

`platform-bug` is new and load-bearing. A1–A4 are open silent-wrong-value bugs;
a cell that dies on one is an instrument fault wearing the costume of a model
failure. How often an app-scale build stumbles into them is the number that
prices fixing them.

## Instrument hygiene

Two checks, both of which should run before a round and after any language
change:

```
node evals/apps/venue/api/selftest.mjs           # the fixture keeps its promises
node tools/internal/checks/readable-surface.mjs  # everything readable still compiles
```

The second exists because the readable surface *is* the product here, and it is
mostly unguarded: `test/docs.test.mjs` covers three files, while the 18-chapter
guide, the operational docs, the reference prose that becomes
`declare-model.json`, and every library docstring sit outside the
compile-every-example guarantee. It currently finds the library teaching
signatures the compiler rejects — `checkbox.declare` and `radiogroup.declare`
both show `input(v) { … }`, which stopped being legal when typed parameters
became required. An agent sent to library source as ground truth copies that and
gets an error it can only guess its way out of, and the failure scores as the
model's.

Fix those before the first run, or the first result is measuring our own stale
examples.

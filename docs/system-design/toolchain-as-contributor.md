# The toolchain as a contributor — tools that edit, review, and converse

**Status: CONCEPT, 2026-11-08. Not designed, not built; the user: "this needs a lot more
thought."** Three pieces, gathered from the essay in `agent-ui-language-essay.md` and the
conversation around it: an outside author's answer to "what if the verification tools came back
with an edited program, not just errors and fix hints?" (Part A); a reaction to the same question
from the session that ran the evals (Part B); and the user's further idea of the toolchain and the
agent working as two contributors on one codebase, through a review of comments, suggestions and
edits (Part C).

---

## Part A — When the tools return an edited program

*Written 2026-11-08, after Parts 1–3. The question: what if the verification tools, taken broadly (compiler, formatter, boot findings, behaviour scripts, `declare-look`, `declare-help`), came back with an edited program, not just errors and fix hints?*

### 1. Where the toolchain stands now

Declare's diagnostics already do most of the hard part. Most of them name the fix. declare.md §12 says: "Apply exactly the named fix, change nothing else, and compile again." The eval accounts agree that the named fix is nearly always right (Ledger: "the fix was nearly always right"; RealWorld: seven fix-and-recheck rounds to a clean boot). So in most cases the toolchain already knows the edit. It then asks a model to type it in, which costs a turn.

The timing files show what that typing costs:

- **Ledger:** 63 verify calls, and 8.46 minutes of model time after verify results.
- **Presentify:** 29 verify calls, 3.60 minutes.
- **RealWorld:** 23 verify calls, 1.87 minutes, plus the edit turns that follow.

Not every one of those turns is mechanical, but many are. The evidence:

- **DECLARE4025**, the nested-ternary lint, appears in every run, 13 times in Ledger.
- **DECLARE7001** rewrites (hoist a ternary, name an intermediate value) come up in every run.
- **DECLARE3006** told the RealWorld agent the exact rewrite for each of three sites.
- **Renames across files.** Ledger's agent renamed `filter` to `filters` "by regex across files, because `.filter(` the array method must not be touched", and that cost a fix-up pass. Its BSD `sed` silently did nothing on another rename until it switched to perl.

The toolchain already edits in one place: the formatter, through a hook. The evidence there is a warning. Two agents opened their accounts confused that "all three `.declare` files changed on disk after I finished … not by me", and that the formatter "has since rewritten whitespace". An edit the agent didn't see damages its model of its own code, even when the edit is harmless.

So the question isn't whether tools should edit. They already know the edit for many findings, and one tool already applies its edits. The question is which edits should come back as edits, in what form, and with what guarantees.

### 2. Which findings can come back as edits, and which must not

The test I'd use: **is the fix unique, does it preserve meaning, and can the tool check it?** That sorts findings into four classes.

**Class A: apply, and show the diff.** The fix is unique, preserves meaning, and can be checked mechanically.

- Formatting.
- Redundant parentheses (DECLARE1002).
- `string?` inside a `{ }` body becomes `string | null`.
- A nested ternary becomes named facts. The rewrite is mechanical, but the names must be chosen, so these are named from the condition text and listed for review.
- 7001 rewrites that only name an intermediate value or hoist a conditional, with no change in what is computed.
- `x = { (parent.width - this.width) / 2 }` becomes `x = center`.
- A missing `super.onKeyDown(e)` *when the message already prescribes the exact line*.
- Migrations that `declare-changes` currently only lists (renamed attributes and classes).
- **Renames driven by the resolver.** When a declaration collides with a reserved member (`filter`, `blend`, `key`, `valueOf`, `bounds`), the compiler knows every use of the name, so it can rename all of them and leave `Array.prototype.filter` untouched. That is exactly what regex couldn't do safely in Ledger.

**Class B: offer candidates, verified before they're offered.** The finding is real, and several fixes are legitimate. Choosing among them changes what the person sees, so it's a design choice.

- **Boot layout findings.** The message already lists remedies: "let a child give room up (`shrinks = true`), take what is left (`flexes`), or let the parent scroll or clip". Each one gives a different interface.
- **Tap targets under 44 × 44.** A fix changes size or adds a hit area.
- **DECLARE4026**, a set of toggles that should be a `ChoiceControl`. This is a structural conversion that keeps the look and changes semantics for the better. Cadence's agent did it "in about half a minute", but it could easily have taken longer.
- **A failed behaviour script** whose cause is the script itself: a path written with class names (RealWorld lost three rounds to this), or a locator matching two elements. The tool can offer the path that resolves, or the disambiguated locator.
- **Part 3's frame audits.** The week view's left-over strip could be fixed by clipping under the header, by fading rows outside the rectangle, or by moving the board. Each choice changes the craft.

For these, the tool should *try* each remedy and keep only those that clear the finding without causing new ones. Section 3 covers this.

**Class C: explain, never edit.** The fix needs knowledge the tool doesn't have.

- **Accessible names.** The tool can't invent the words. It may offer a label derived from visible text or a tooltip, marked as derived.
- **Copy, colour, typography, and the stiffness and damping of motion.** These are the designer's.
- **Data-model and structural redesigns.** RealWorld's `exists` lifetime problem was fixed by rebuilding pages per address. That is a design decision, not a fix.
- **Anything inside `library/` or `runtime/`.** A platform defect is filed, not patched into the user's copy.

**Class D: forbidden.**

- **Never edit an assertion to make a check pass.** No loosening `expect`, no deleting a step, no widening a regex. The script is the oracle, and a tool that edits the oracle destroys it.
- **Never delete code to silence a finding.**
- **Never quiet a finding with a flag** (`lint = false`, `devices = desktop`) on the program's behalf.
- **Never touch a value a designer has pinned.**

### 3. How edits should come back and be applied

**Verified before offered.** A candidate edit is applied to a scratch copy. The ladder is rerun up to the rung that raised the finding (rungs 1–3 take about 2 seconds; boot adds about 1–2 seconds per size). The edit is kept only if:

- the finding is gone;
- no new error or finding appears at any size the run covers;
- every assert script that passed before still passes.

For class B, run every candidate this way and return only the survivors. Rank them by how small they are, and attach a before/after crop of the affected view (`--shot-of`) and the outline lines that changed. A layout remedy that clears the overflow by truncating a name to "No cust…" passes structurally. The crop is what lets the agent, or a designer, see that it's wrong.

**Returned as a patch the agent applies.** Class B always comes back as a patch. Class A comes back as a patch too, unless the agent passes `--apply`. Either way, the output includes **the code as it now stands around each change**, not only the diff. This addresses the problem the formatter hook revealed. An agent that applies the patch itself, or reads the post-edit code in the same tool result, keeps an accurate model of its files. The agent's own Edit tool also refuses to work on a file that changed since it was read, which is another reason the change has to arrive in the agent's context. The formatter hook should follow the same rule: report "formatted: 3 files, whitespace only" in the result of the call that triggered it.

**Opt-in by class, with a default.** I'd default to:

- class A as a patch with `--apply` available;
- class B as verified candidates;
- class C and D as text only.

An agent that has turned on `--apply` for class A should still see each kind of applied fix named once, with a one-line note on what to write next time (below).

**Provenance.** Every edit carries a marker in the report: tool, diagnostic code, verified by which rungs. A reviewer can then tell what the agent wrote from what the tool wrote, and a regression can be traced to the fix that caused it.

### 4. Effects

**Turns.** The record suggests a sizeable share of the checking phase is mechanical fix-and-recheck:

- RealWorld took seven rounds to a clean boot.
- Ledger's compile-and-boot work spans dozens of verify calls.
- DECLARE4025 and 7001 recur in every run.

If class A fixes come back applied and class B comes back pre-verified, I'd expect:

- 2–4 fewer verify→edit cycles on a small or medium run;
- 5–10 fewer on a Ledger-sized one;
- roughly 1–4 minutes of wall time saved, mostly model time.

That is a meaningful but not transformative share of 16–46-minute runs. The larger checking costs in Part 2 (writing scripts, platform defects, screenshots) are mostly untouched. The exception is the script-path errors, which class B handles.

**Accuracy.** There are two opposite effects.

- **It goes up where the agent's transcription was the error source.** Ledger's regex rename and sed failure are real examples. A resolver-driven rename can't hit `.filter(`.
- **It goes down if verification is narrower than the change.** A verified layout remedy can still be the wrong design, for example `shrinks` truncating a name the brief needs whole. That is why class B has to show crops and stays the agent's choice, and why the brief's own checks must be among the verifying rungs when they exist.

**Learning, and the agent's model of its code.** This is the subtle cost.

- **The agent may never learn the idiom.** A message the agent has to act on teaches. 4031 taught the Ledger agent to hand on keys with `super`, and it called the warning "right, and good". A fix applied silently teaches nothing, and the agent will write the same construct in its next 400-line write. Recurrence is already visible with messages: 4025 appeared 13 times in Ledger.
- **Mitigation.** Each kind of auto-applied fix prints a short teaching line the first time in a session ("named facts instead of nested `? :` — write them this way"). Recurrence of the same code later in the run should be measured (§6).
- **The agent's sense of ownership weakens.** If the program drifts from what the agent believes it wrote, its later reasoning ("I wrote X, so Y") goes wrong. Returning the post-edit code in context, and keeping class B as the agent's own choice, keeps the agent the author.

**For the designer-steered craft of Part 3.** Here "returning an edited program" is the *goal*, not a risk.

- **Write-back of tuned values.** Part 3's proposal 2 (keep the stiffness the designer found by hand; keep a phase range) is exactly a tool returning an edit. It is class A for the *value*, because the designer chose it, and the edit only moves it from the Inspector into source. It should come back as a source diff with provenance "designer, via Inspector".
- **Frame-audit findings** (Part 3's proposal 1) are class B. The tool can offer verified candidates with film-strip crops, but continuity is the designer's call, so they're never applied automatically.
- **Motion parameters** that no one pinned are class C. The tool can say "this spring overshoots past the clip at 390 wide". It must not retune the feel of an interface on its own.

The general rule: the tool may write down a decision a human or the agent made, and may offer decisions. It may make a decision itself only when the decision is mechanical.

**`declare-help` and `declare-look`.** Help could return a fragment fitted to the call site: `declare-help Slider --at app.declare:120` would give a `Slider` using the program's own attribute names and the value pattern already used there. That is an offered edit, not an applied one. `declare-look` returns no edits of its own. It is where class B candidates should be *seen*, as before/after crops at the sizes in the run.

### 5. Risks, in order of concern

1. **Wrong fixes applied with confidence.** One bad auto-edit costs more trust than ten good ones earn. Mitigations: restrict auto-apply to class A, verify every edit, record provenance, and treat any regression traced to a tool edit as a top-priority defect, under the same zero-false-positive bar the diagnostics already hold.
2. **Passing the finding instead of meeting the goal.** Edits optimise for the finding's disappearance. Layout and accessibility findings are proxies for "the person can use this", and a fix can satisfy the proxy while failing the person. This is why the person-facing evidence (crops, the brief's scripts) has to be part of verification, and why class B stays a choice.
3. **The agent's model breaking down.** This is the formatter-hook effect at scale: files change and the agent works from a stale read. Mitigation: patches applied by the agent, or post-edit code returned in the same tool result.
4. **Learning lost.** The idiom never sticks and is repaired forever. Mitigation: teaching lines, and measuring recurrence.
5. **The tool reaching past its remit.** A tool that edits the program will be asked to edit more: the library, the tests, the flags. Class D draws the line, and it must be enforced in code, not left to convention.

### 6. How to measure it

Run the existing craft briefs (Cadence, Murmur, Presentify, Ledger, RealWorld, 7GUIs) in three arms: hints only (today), verified candidates offered, and class A auto-applied plus candidates. One run per brief per arm at first, scored from timestamps, not self-report.

**Speed:**

- verify→edit cycles;
- model time after verify;
- minutes to first clean boot;
- total minutes and turns.

**Accuracy:**

- hidden checks, at first clean boot and as delivered;
- **an audit of every applied tool edit**, judged right, harmless, or wrong, with any downstream regression traced to it;
- defects found by eye or screenshot that verification missed.

**Learning and the agent's model:**

- recurrence of each auto-fixed code later in the same run;
- "file changed underneath me" events in the transcript;
- the agent's account, asked: "Which parts of your program did a tool write?" A correct answer means its model held.

**Idiom:** `idiom.py` scores per arm, so we can see whether auto-fixes make programs more idiomatic or just quieter.

**For the craft goal:** run the steered-session eval from Part 3 with and without write-back. Count the designer's rounds to acceptance, the rounds spent re-dictating values, and whether tuned values survived later agent edits.

The decision rule should be stated before any results. Auto-apply ships for a class only if the class adds no wrong edits in the audit and the recurrence rate doesn't rise. Candidate offering ships if cycles fall without a drop in hidden checks.

### 7. Bottom line

Yes: the tools should return edits. Declare's diagnostics already know most fixes, and having a model retype them is a wasted turn. But the edits have to come back in a form that preserves three things: the program's meaning, the agent's knowledge of its own code, and the human's decisions.

- **Apply** mechanical, meaning-preserving fixes, verified and shown.
- **Offer** design-bearing fixes only as verified candidates, with crops.
- **Write down** decisions the designer made by hand.
- **Never** edit the oracle, the platform, or the feel.

The speed gain is modest, a few minutes per run. The accuracy gain is real wherever the agent's typing was the error. The largest gain is on the craft side, where returning an edited program closes the designer's loop.

---

## Part B — A reaction from the session that ran the evals

*Written by the agent that has been running and auditing Declare's evals, separately from the essay's author, who answers the same question in Part 4.*

**I think it is a good idea, but not mainly for the reason it first suggests.** It doesn't mainly save time. Its value is that the toolchain can do something the building agent can't: try a fix, check it, and throw it away, at almost no cost.

### What the record says about the cost being removed

Declare's diagnostics already carry their fix in words. Most name the rewrite exactly:
- `write string | null`;
- `write app.selected to reach the outer one`;
- `remove their own width and use align = stretch`.

So today the agent reads a message, thinks, edits the file (often with `sed` or a Python script, which is itself error-prone), and runs the check again. Across ten recent runs, thinking that followed a refusal was under 2% of all thinking. So refusals are cheap to work out. But each costs a turn and a recompile, and a cold run takes several: RealWorld needed seven fix-and-recheck rounds to reach a clean boot. Returning the fix applied removes the turns, not much of the thinking. On a cold run that's perhaps a minute or two. On a long run it's a little less churn. Real, but modest.

### Where the real value is: findings the agent can't cheaply resolve

The expensive cases in the record weren't compile errors. They were:
- **Layout findings:** Ledger's panels collapsing on a column, its ranked rows overflowing at 1,024 pixels; RealWorld's pager stacking.
- **States the agent never visited.**

For a layout finding, the checker has the layout engine to hand. It can try the candidate fixes its own message names:
- `shrinks = true` on the child;
- `flexes` instead of `width = 100%`;
- a width on the parent.

It can re-run the layout questions on each, at the program's sizes, and return only the candidates that clear the finding without raising another. The agent can't do that search cheaply; each try costs it a turn. That turns "here is a problem and three possible fixes" into "here is the one edit that works at 1280, 1024 and 390, as a diff". For the designer-steered goal, that's the shape of a good collaborator: the tool proposes, the designer or agent chooses.

### Three tiers, by what kind of fix it is

1. **Mechanical, one correct answer:**
   - a type spelled the declaration's way inside a body;
   - a bare enum inside `{ }`;
   - a missing `super.onKeyDown(e)`;
   - the canonical format.

   These are applied, returned as a diff, and re-checked in the same call. Nobody needs to choose.
2. **Several right answers:** shadowing (rename it, or write `app.`), layout findings, a method writing a bound attribute (the declared-default form is one choice among others). Offer candidates the tool has verified, as diffs, with what each changes. Never apply them silently: they are design decisions, and in the designer-steered loop they are exactly the decisions that belong to the person steering.
3. **Content or intent:** an accessible name, what a button should say, which state an empty screen shows. Stay with the message. A tool that invents a label is worse than one that asks.

### The risks I'd take seriously

- **The agent's picture of its own code goes stale.** An edit it didn't make, to a file it wrote, is the classic source of confusion: the next edit is made against text that isn't there any more. Return a diff, always, and have the agent's next read reflect it. Never edit silently.
- **The agent stops learning the language.** If the tool always fixes `string?` inside a body, the agent writes it every time. That's fine for speed. It's not fine for the docs-as-teacher loop: the repeated mistake is the signal that a sentence in `declare.md` is missing. Count applied fixes per kind across runs. A fix applied in every run is a docs bug.
- **Fixes that are right locally and wrong in intent.** Layout is where this bites: `shrinks = true` can clear an overflow by squeezing something the designer wanted at full size. Verified-by-the-checker isn't verified-by-the-eye. Tier 2 keeps a person in the loop for that reason.
- **Measurement.** If the tools fix things, the eval measures the toolchain more and the language less. That's legitimate, because the product is both, but report how many edits the tools contributed, so a faster run isn't read as a better language.

### How I'd measure it

The same brief before and after, several runs each:
- turns to the first clean boot;
- checker calls;
- time from the first draft to the first passing hidden check;
- hidden checks at the agent's "done";
- the count of applied and offered edits by kind.

My expectation: tier 1 saves a few turns per run, and tier 2 layout candidates take a real bite out of the checking phase, which is about half of every run's time.

---

## Part C — The toolchain as a second contributor: review, not output

*From the conversation of 2026-11-08, after Parts A and B. The user: "I am wondering if there can be a more collaborative, direct means for an agent and a tool chain to interact, almost like two contributors on a codebase. The tools can annotate, propose changes, etc., and the agent can act on this like a PR or Google Docs set of comments, suggestions and edits." The user's ruling on it: it "needs a lot more thought" — recorded here as a concept, not designed.*

**The idea.** Today the agent runs a check, reads text, edits, and runs again; each run starts from nothing, and what the agent decided ("this overflow is intended") is forgotten. Instead the toolchain keeps a *review* of the program, as a pull request or a document in suggesting mode does:

- **comments** anchored to the code — errors, layout and accessibility findings, a frame where a transition jumps;
- **suggestions** carrying a patch the tool has already verified;
- **questions** where only intent can decide ("what should this button be called?");
- each item **open, accepted, or dismissed with a reason**.

**Why Declare in particular.** A review is only as good as its anchors, and line numbers break with every edit. Declare's compiler knows the program as a tree of named members — `app.main.ranks.0`, `CodeField.commit`, `width` on a view — so a comment can be pinned to "the `width` of `app.form.efforts`" and stay attached as the file changes around it. Most frameworks can't do that; their structure exists only at run time.

**The loop it suggests.**
- The agent reads the open items: blocking first, each with its anchor, its evidence, and a ready patch where one exists.
- It answers in batches: accepts the mechanical fixes in one action, picks among verified layout candidates, answers questions, dismisses what it means, with a reason.
- The tool re-checks only what the edits touched and updates the threads. A resolved item stays resolved unless the code under its anchor changes, so a deliberate choice is never reported again.
- "Done" means the review has no blocking items and every finding is fixed or dismissed with a reason — firmer than "the last run printed nothing".

**What it adds over returning edits.**
- Memory across turns: the agent doesn't lose track, the tool doesn't nag.
- Dismissals as data: a rule agents dismiss run after run is probably a false positive or a docs gap — measurable, like counting applied fixes.
- The designer in the same thread: a comment pinned to an element or a moment in the running app, from the Inspector, lands in the review beside the tool's. The agent addresses both alike, the tool verifies, the designer resolves — the loop Part 3 of the essay calls lossy today.
- Runtime observations fit too: a transition's filmstrip with the frame where it jumps, attached to the spring that drives it.

**What exists already.** Diagnostics with codes, positions and stated fixes; `--json` output; layout findings named by view path; the formatter; behaviour scripts; the Inspector. Missing is the layer that gathers them into one persistent review: stable anchors, patches applied against the current text, status, threads.

**What to watch.** It must stay a compact, text-first command line — agents work well with terse output, and a review they must learn an API for could cost more than it saves. Patches must survive the agent's own edits (tree anchors are what make that workable). Every tool edit visible as a diff, so the agent's picture of its own code stays true.

**Open, before any design.** Whether the review lives in a file beside the program, in a long-running session, or both; how a human's comment and a tool's finding share one shape; how an agent is taught to work the review rather than the old loop; how to measure it against today's loop (turns, time to a clean boot, defects at "done").

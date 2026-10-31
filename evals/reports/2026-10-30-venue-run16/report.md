# Venue run 16: Declare f62e9876, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-16 claude-opus-5-5 f62e9876` against GitHub main,
alongside Cadence run 21. It validates two fixes to the tools, neither of them to the language:
- **verify waited out every settle.** Venue's seat stream is an `EventStream` with `credentials = include`, so the
  runtime opens it with `fetch`, and verify counted that never-ending request as pending. Every `settleData` waited
  its full 10 s.
- **`npx` audited every call against the npm registry.** Each `declare-help` and `declare-verify` call reinstalled
  the package into npm's exec cache and sent an audit request over the network. The repo's `.npmrc` now turns the
  audit off.

**Files beside this report:**
- the app's five files and its four assert scripts (`tests/`);
- the hidden acceptance result (`drive/`);
- the agent's account (`account.md`, asked with `impressions.txt`);
- its answer to a follow-up on layout (`layout-account.md`, asked with `layout-question.txt`).

Both accounts are filed word for word.

## The comparison

| | Venue 14 | Venue 15 | **Venue 16** | React 1 |
|---|---|---|---|---|
| Declare commit | `6aedaaa0` | `3cc1d76c` | **`f62e9876`** | — |
| time | 31.2 min | 38.1 min | **25.2 min** | 31.4 min |
| turns | 130 | 125 | **110** | 101 |
| code, raw lines (files) | 1,701 (2) | 1,653 (5) | **1,817 (5)** | |
| code, excluding blanks and `//` lines | 1,333 | 1,272 | **1,407** | |
| output tokens | 138.6k | 123.1k | **120.5k** | |
| cached input re-read | 29.9M | 26.2M | **23.7M** | 9.3M |
| first app write at | 8.1 min | 5.9 min | **8.2 min** | |
| tool time | | 20.3 min | **5.7 min** | |
| model time | | 17.8 min | **19.5 min** | |
| thinking (reading · writing · checking) | | 4.0 · 1.9 · 4.0 = 9.8 min | **5.5 · 1.4 · 3.0 = 9.8 min** | |
| verify calls · their time | | 30 · 16.3 min | **25 · 4.1 min** | |
| `declare-help` calls · their time | | 23 · 0.9 min | **18 · 0.5 min** | |
| hidden acceptance | 11 of 11 ¹ | 11 of 11 | **11 of 11** ² | 11 of 11 |
| library or runtime source read | 6 | 5 | **4** | |
| workarounds | | none | **none** | |

¹ On the fixed kernel. ² After a fix to the hidden drive (below).

"Tool time" is from each tool call to its result; "model time" is everything else. "Thinking" is the stream's
`thinking_duration_ms`, assigned to a phase by when it happened: reading is before the first app write, writing
runs up to the first verify after it, and checking is the rest.

## What the fixes did

**Tool time fell from 20.3 to 5.7 minutes**, and the run from 38.1 to 25.2. Verify averaged 33 s a call in run 15
and 10 s in run 16. Its five-check loop took 181 s in run 15; replayed against run 15's app with the fix, it took
58 s. No settle waited out its time.

**Model time didn't fall.** It was 19.5 minutes against 17.8, and thinking was 9.8 minutes in both runs. Model time
is now the larger part of the run: about three-quarters of it.

## Correctness

The app passes all 11 hidden flows. The first scoring failed `phone_guest_pays` ("never shown: 2 seats · $160.00").
The cause was the drive, not the app:
- On a phone, while seats are smaller than a thumb, the app's first tap on the hall zooms in and the next one
  chooses. The brief itself calls this the hard case ("at true scale a seat is too small to hit").
- The drive assumed one tap per seat, so its first tap only zoomed in, and seat 1 was never chosen.
- The drive now finds the seat again and taps it again when a seat that reports its chosen state isn't chosen yet,
  as a person would. With that change all 11 pass. Run 15's app still passes all 11.

## What the agent said

### The account (`account.md`)

The account was largely positive. It said the reference fit the brief "unusually well" (`TextInput.judged`,
`Form.refusedWith`, `purpose`), and that "nothing typed is lost on sign-in" took only a computed default. It had
three complaints:
- It called responsive layout and axis switching "the steepest part of the language".
- It found no supported way to get from a record to the view replicated for it.
- The layout checks raised false alarms on the zoomable hall.

### The follow-up on layout (`layout-account.md`)

A remark like "the steepest part" can name one roadblock or a gap in the model, so the agent was asked to go
through it in detail. Its answer withdrew the remark:

> "The steepest part of the language" overstated it. A more accurate description: this is where my CSS habits were
> most wrong and where I had read the least.

It **never read `06-layout.md`** during the build. SKILL.md's "Then stop reading" and its belief that it already
knew flexbox kept it from treating layout as "a part that needs it". By its own account the chapter answers almost
everything it struggled with:
- the page-frame example;
- the paragraph that stretch "still holds when a constraint turns the row into a column";
- `State` for a configuration that holds at some widths;
- a layout of your own when "where the room goes" changes.

Three of its four layout errors came from one rule: what a layout decides, the child doesn't declare. Each
diagnostic named a fix that worked.

What it says remains, in its own order:
1. **Under a reactive axis, the rule is caught only at boot, and only in the state that booted.** It suggests a
   compile-time rule: under a computed axis, a child declares neither width nor height.
2. **No way to say "unset" from a constraint.** It notes this is documented (use a `State`); it was surprising, not
   missing.
3. **Sticky inside a layout is missing.** `ignoreScroll` pins only against the view's own scroller.
4. **Unclear: fixed-height screens beside scrolling ones in one App.**
5. **A diagnostic slip:** the no-percentages hint suggested `parent.width` for a height.

## Fixed after this run (585c768d)

- **Layout checks** judge a finger's target at its size on screen, and skip a control that lets presses through or
  that a clipping view cuts off. On this app, "648 controls smaller than 44 × 44" is gone. What remains is a real
  finding: a few seats under the floating "Whole hall" button when zoomed in.
- **The layout refusal of a child's size** names both ways to fill: `flexes` along the flow, `align = stretch`
  across it. That was its item 7.3.
- **The no-percentages hint** reads the parent's height for a vertical slot (its item 5).
- **A `Combobox` last in a form:** with its list closed and a choice made, Return now submits, under `enterMoves`
  too.
- **`declare-help`** lists members that share a word's stem, so `View.children` names `childViews`.
- **`Form.refusedWith`** now says an override may type the body with a schema. That already worked; the agent cast
  to `any` because nothing said so.

## Open

- **Discoverability of `06-layout.md`.** The agent's first suggestion is that the first read carry the page-frame
  example and the stretch paragraph (SKILL.md's list or `declare.md` §4). This is a question about the docs, and it
  bears directly on whether agents keep their CSS habits.
- **A compile-time rule for children of a layout whose axis is computed.**
- **Sticky positioning.** It was asked for in runs 15 and 16.
- **A content-sized view with a cap, outside a layout.** `maxWidth` bounds only what a layout gives a child, so a
  floating view can't be "as wide as its content, up to the window less a margin". That is why `Toast` can't wrap
  on a phone; runs 14, 15 and 16 all hit it. This is a gap in the model, not a `Toast` bug.
- **Finding the view replicated for a record.** It was asked for in runs 15 and 16, and passed over before.

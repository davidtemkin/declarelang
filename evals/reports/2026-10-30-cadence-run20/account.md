# Building Cadence in Declare: an account for the people who make it

First, a correction to my last message. The dev server I started on port 8201 has since exited; the notification came in after I'd told you it was running. As of now nothing is serving the app. You asked me not to change anything, so I haven't restarted it. `PORT=8201 npm start` from `declarelang/` brings it back.

## (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md`'s order exactly:
- `docs/declare.md` in full.
- Guide chapters 01, 04 and 05.
- The to-do app, whole: `todo.declare` and `todo-parts.declare`.

Then, as each need came up, I read sections rather than chapters:
- `10-touch.md` § Gesture claims and § Pan and zoom about the fingers.
- `14-data.md` § Where data comes from, § Talking to a server, and the form sections.
- `21-motion.md` § Springs.
- `12-text.md` on rich text and `textStyles`.
- `06-layout.md` § Responsiveness.
- `17-your-own-views.md` § Writing a layout.
- `18-overlays.md` § Open as state, § Sheets, § Toasts.

Total reading was perhaps 4,000 lines before I wrote anything, and it was enough.

**What taught me the most:**
- **The to-do app.** It showed the whole shape: a dataset class that makes every write, where-the-user-is on the App, computed defaults in a form that exists only while its sheet is open, `classroot` versus `parent`, use-site `press()`. I copied its structure almost directly: `Log extends DataSource` mirrors `Tasks`, and `EntryForm` mirrors `AddForm`.
- **The pan-and-zoom fragment in `10-touch.md`.** It mapped one-to-one onto the brief's demand that the year "stay with the hand."
- **The `21-motion.md` paragraph on writing the value and its target together under the hand.** It solved the drag-versus-chip problem before I had it.
- **`Spring.arrive()`.** The note that "a figure that arrives with its data appears; it does not count up" is precisely the kind of judgment a newcomer gets wrong. Having it in the docs is excellent.

**What was missing or misleading:**
- **Overlays and App padding.** Nothing told me that `padding` on the App would also offset its overlay children. My first phone screenshots showed the Sheet and the docked button shifted 20 px right, ending at x=410 on a 390-wide window. Verify flagged it ("app.form runs past the window's right edge"). The fix, moving page padding onto a `page` child, is obvious once seen. A sentence in the Sheet or padding docs would have saved a round trip. I'm not certain this is intended behaviour rather than a bug.
- **`textBaseline` in `draw`.** The DrawContext reference lists `fillText(text, x, y, style)` but not what `y` means by default. My month labels landed on the axis, and I set `textBaseline = "top"` by trial.
- **What `RadioGroup` puts first among its children.** I tapped `felt.8` expecting the ninth tile and got effort 8. Something precedes the radios in the group's children. Path-by-index is fragile in a way the docs don't warn about. Naming by accessible name (`felt."Effort 9"`) worked, and I should have used it from the start.
- **`minWidth` on a content-sized Control.** Setting `minWidth = 44` on `ZoomChip` didn't change its 42-px measured width. I widened its padding instead. I'm unsure whether I misused `minWidth` (it may only be read by layouts that place width) or hit a gap.

## (b) Expressing what I wanted

**Where it fit closely:**
- **The year surface.** It is one `draw()` reading `app.start`, `app.span` and `app.log.load`. Every way of moving it (drag, pinch, wheel, chip) writes two numbers, and the drawing, the date-range label, the period totals, the "hardest in view" row and the list all follow. I wrote no update code. This is the part of the brief the language suits best, and it was the least effort per unit of quality.
- **"Numbers travel."** Five `Spring`s on shown copies of derived values, plus `arrive()` on load, was the entire implementation. That would be dozens of lines in React with a motion library.
- **"Nothing is stale."** The Log folds each POST/PUT/DELETE reply into its own records, and this week, the streak, the week's bars and the year all re-derive. The flow check confirmed it without my having written any invalidation.
- **Computed defaults in the form.** `minutes: number = { classroot.was?.minutes ?? app.log.usualMinutes(classroot.sport) }` follows the sport until touched and is then the user's. That is exactly the brief's "the common case is confirming rather than filling in," with no "dirty" flags.
- **"Reads exactly."** One `HTMLText` with `<span class='Fig'>` runs and a `textStyles` map built in `{ }` gave a single run of text whose content is exactly `2 sessions · 1h 24m`, with the figures set at 112 px and the words at about 29.
- **Open-as-state sheets.** `shown = { app.formOpen }` plus `input(open)` plus `exists = { app.form.present }` gave a fresh form each opening and clean closing motion.

**Where I worked around something, or am unsure I wrote it idiomatically:**
- **Writes through child DataSources, with a mutable `outgoing` body and `target` id.** It works, and the docs sanction it ("fetch() settles first"). But stashing the next request's body in an attribute and then calling `fetch()` feels like an indirection where a `post(body)` verb would read better.
- **Failure handling.** I watched `failed` with `trackChanges`/`onChange` to copy `errorBody.message` into `lastError`. A constraint (`{ create.failed ? … }`) would have been cleaner, but three sources share one message, and the last-failed one is what matters. I'm not sure what the idiom is there.
- **`Form` and `Field`.** I didn't use them. My controls are custom tiles, not `ValueControl`s, and every field always holds a valid value, so client-side validation had nothing to do. The server's refusal goes to a plain Text. That's a reasonable choice for this brief, but it means I didn't exercise the form machinery the docs invest in.
- **The selected day's outline.** `YearStrip.draw` reads `app.picked`, so opening a session redraws the year. That's fine here, but the dependency is invisible from the view's declaration.
- **The verifier's accessibility warnings were right, and the rewrite was easy.** DECLARE4026/4032 told me ten `EffortTile`s were "one choice among several" that a screen reader would hear as ten toggles. Moving them under a `RadioGroup` with `choice` and `pick()` took about ten minutes, and I got arrow-key navigation for free.

## (c) Verifying it

**How I checked it:** `declare-verify` after each edit, `declare-look` for screenshots at 1440×900, `--phone` and `--dark`, and two assert scripts:
- `flow.mjs`, on a phone: log, check that the figures moved, correct, delete, check that they returned.
- `pan.mjs`: a profiled drag and pinch with an `expect.budget`.

**How well the tools served me — mostly very well:**
- **The diagnostics are as good as claimed.** Each one I hit named its fix exactly:
  - The `{ {} }` object-literal error.
  - `'extrabold' … inside { } write it as a string`.
  - `'save' is already a method … members share one namespace`.
  - The BigButton "width is only its padding … a Spacer on each side centers it."
  
  I applied each verbatim and moved on.
- **The layout findings at boot caught real bugs I hadn't seen:** the off-window sheets and the 42×36 touch targets. These are exactly what a screenshot would show but a model wouldn't notice.
- **The profiler output was readable and decisive.** "turn 1322 · onWheel … 6.1 ms" and its "why View's replication ran" chain told me panning was fine and why the list re-reconciled.
- **The live-service warning was honest about something I caused.** "this run failed after talking to http://127.0.0.1:8320, which earlier runs wrote to." My first edit-flow run did fail mid-way and left session s0250 on the server, and I cleaned it up by hand. That's a consequence of my script, not the tool, but `--fixtures` should probably be the suggested default for write flows, not a footnote.
- **The note "fed a sample of their schema at boot … app.log.create, app.log.update" confused me briefly.** Were my write sources firing at boot? I eventually inferred it was the verifier priming typed sources for layout checking. I'm still not entirely sure it doesn't send anything.
- **The list of classes "never built … so never checked for layout"** (Fact, SportPlot, EntryForm…) was useful honesty. Even after my flow opened those sheets, though, the pan run still listed them, so I don't know whether the flow run's layout checks covered them.

## Surprises

- **A compiler analysing TypeScript inside constraints passed R3 first time** on a ~900-line program with typed schemas, `provided("theme")` tokens and `as FontWeight` casts in draw styles. I expected a wall of type errors.
- **`exists` keyed on `present`, not on the flag,** makes sheets animate out with their content intact. That's a subtle thing, and the docs call it out.
- **Every interactive view showed hover tint on desk and none on touch** with nothing written by me.
- **Naming a method `log()` on an App with a member `log`** was caught as a namespace clash. A good catch. In plain TypeScript it would have silently shadowed.

## Good and bad

**Good:**
- Constraints plus springs make "everything derived, everything moves" cheap.
- The docs are written for the reader who will get it wrong, and they anticipate React instincts specifically.
- The diagnostics are actionable.
- `declare-look` with `--click`/`--pinch`/`--read` is a superb loop for a model, which cannot see without being shown.
- The library's Sheet, Toast, RadioGroup and DatePicker handled focus, Esc and scrims so I never thought about them.

**Bad, or at least rough:**
- Path-by-index into replicated or library-composed children is fragile.
- The draw-context text semantics are underdocumented.
- The App-padding-affects-overlays gotcha.
- Writes as reconfigure-then-`fetch()` are slightly indirect.
- I couldn't easily tell which constraints were "statically wired" versus runtime-tracked: the summary said "402 of 463," and I never learned what the other 61 cost or whether they matter.
- I never verified the real-device gesture arbitration (pinch inside a page that scrolls vertically, `claim = x`). Emulated Chrome passed, but the brief rightly says that can't be proved here.

## Compared with what I'm used to

- **Against React:** no state/effect choreography at all. In React, the Cadence year would be a canvas in a `useEffect` with refs, gesture handling via a library, figure tweening via framer-motion, and SWR or React Query for the writes. Here each of those is a member of the tree.
- **The constraint engine reminded me of** spreadsheets, Knockout/MobX computeds, and SwiftUI's declarative view tree. The `State`-as-reversible-overrides idea is closest to Flex/OpenLaszlo states, which the README cites as lineage.
- **`Spring` with a reactive `to`** recalls Framer Motion's spring targets, and also Core Animation's implicit animations, but more principled about interruption.
- **The absence of CSS took no adjustment.** Layout as an attribute with custom `place()` (my `Columns` layout) felt like UIKit's `layoutSubviews` without the imperative bookkeeping.

## Where I'd most want improvement

1. **Documentation of DrawContext text** (baseline, measurement) and of how App padding and overlays interact.
2. **Stable addressing for tests:** have the verifier warn when a numeric path crosses a library class's own children, or suggest the label path it could have used.
3. **A first-class write verb on DataSource** (`post(body)` / `put(id, body)`), or a documented pattern for one source per resource with per-call bodies.
4. **Clarity on what verify's "sample" priming does to non-GET sources,** and fixtures nudged as the default for flows that write.
5. **A way to see which constraints fell back to runtime tracking and why,** in the verify summary.

## What I'd use it for

If I had the option, I'd reach for Declare for interfaces where continuity and derived state dominate:
- dashboards and logs like this one;
- timelines and calendars;
- anything with a pannable or zoomable surface;
- forms with smart defaults.

It also gives me unusually good feedback as a model author: the check-look-fix loop converged quickly, and I trusted the result more than I would a React build of similar size.

I'd hesitate for:
- apps leaning heavily on third-party web components;
- content-heavy SEO sites (though the crawl story suggests it's considered);
- anything requiring a mature ecosystem of answers.

I'm also uncertain how it behaves past a few thousand lines or with several authors. Cadence is about 900 lines, and the largest program I read was the to-do app.
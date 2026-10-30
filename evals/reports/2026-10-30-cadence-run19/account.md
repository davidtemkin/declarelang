# Building Cadence in Declare: an account for the people who make it

First, a correction to what I told you earlier: the dev server I started on port 8201 has since stopped. It exited with code 144, which looks like it was killed rather than crashing. The address I gave you won't answer until it's restarted with `PORT=8201 npm start` in `declarelang/`. You asked me not to change anything, so I haven't restarted it.

## (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` as written:
- `docs/declare.md` in full;
- guide chapters 01, 04 and 05;
- the to-do app, both files.

After that I read only what the plan needed:
- `10-touch.md` § Pan and zoom about the fingers;
- `14-data.md` § Talking to a server and § A form in a sheet;
- `21-motion.md` § Springs;
- `12-text.md` on rich text and `textStyles`;
- `17-your-own-views.md` § Custom drawing;
- `06-layout.md` § Responsiveness;
- `18-overlays.md` § Open as state;
- many `npx declare-help` lookups.

**What taught me the most:**
- **Three paragraphs carried most of the hard parts.** The pan-and-zoom fragment in `10-touch.md` became the year chart almost line for line. The `arrive()` paragraph in `21-motion.md` ("a figure that arrives with its data appears; it does not count up") was exactly the brief's "numbers travel" requirement. The "write the value and its target together" idiom covered a surface that is both dragged and sent somewhere by buttons.
- **The to-do app taught the shape of a program.** The dataset class makes the writes, and computed defaults in `AddForm` suggest values until the person touches them. I copied that shape directly.
- **SKILL.md's "What Declare handles for you" table worked as a map.** It sent me to the right section for almost every need.

**What was missing or misleading:**
- **`Toast.say`.** The reference says the action record is optional, but the signature is `say(m: string, a: object)`. DECLARE6001 caught my one-argument call, and I passed `null`.
- **`Time.tick`.** `declare-help Time` lists it as `enum(frame|second|minute|hour|day)`, but the guide says `tick = 5000`. The number compiled, so the reference summary is incomplete.
- **Script names collide with members.** I named a script helper `duration`. DECLARE4002 then warned *inside `library/toast.declare`* that bare `duration` meant Toast's member, not my function. The same happened with `km`, which collided with a field of my form. Nothing I read said that script names share a namespace with bare-name resolution, including the library's. The warning was clear; the rule behind it was a surprise.
- **Giving a gesture back.** The docs say declaring `onWheel` claims the wheel. Nothing said how to hand a vertical wheel back to the page. I used `app.scrollBy(0, e.deltaY)`. I'm not confident that's idiomatic, and it probably loses native momentum.

## (b) Expressing what I wanted

**Where the language fit closely:**
- **"Numbers travel"** was a sprung copy of each figure plus `arrive()` when the data lands. That's about six lines for every animated figure.
- **The form's suggestions** were computed defaults, such as `minutes: number = { base?.minutes ?? usualMinutes(sport) }`. The person's first press replaces the formula. There's no dirty flag and no reset; the form exists only while its sheet is `present`.
- **Writes** were DataSources whose `onLoad` merges the reply into `Log`. Week, streak, week shape and year all followed without refetching. `fetch()` settling first made aiming a PUT or DELETE at one record trivial.
- **Overlays as state** (`shown`, `input`, `present`) and `ResponsiveLayout` for desk versus phone needed almost no thought.

**Where I worked around it:**
- **Mixed type sizes in one line.** The brief wanted "4 sessions · 3h 40m" as exact copy, with the figures set large. The only way I found was `HTMLText` with `<span class='Fig'>` and helpers in `script` that build the HTML. I rebuild that HTML every frame while a spring runs. It works, and the text content is exact, but it's string-building where I wanted structure. I added separate `accessibilityLabel`s because I wasn't sure what a screen reader gets from those spans.
- **`Dial` with `less()` and `more()` methods.** These sit close to a pattern the drift check warns against: a method that only passes a press on. I think they're justified here, because the two Nudges are internal to a composite and the use site needs verbs on the Dial itself. A reviewer might disagree.
- **`liveAt = app.clock.now` in `onLoad`.** This resembles the "flag set when data arrives" pattern that the drift check warns against. I needed the arrival time to count seconds between polls. I'm unsure whether there's a more declarative way.
- **I chose not to use `Form`.** Every field comes from a choice, and none can be invalid. The only thing that can go wrong is the server refusing, which I show above the Save button. That was defensible, but it means I didn't exercise the form machinery at all.
- **Hand-reconciled widths.** `ResponsiveLayout` plans measure their own view's width, but my `app.wide` measures the window. I matched the two thresholds by hand (860 for the plan against 960 for the window).
- **A `parent.parent.s` reach.** It compiled fine; I only replaced it with `app.last` in review.

## (c) Verifying it

**`declare-verify` was the best part of the experience.**
- **Diagnostics name the fix.** Examples from this build:
  - DECLARE4005: write a font weight as a string inside `{ }`.
  - DECLARE4022: my chips showed which one was chosen but told a screen reader nothing.
  - DECLARE4012: an Animator that nothing ever starts.

  Each was a one-step fix.
- **The boot-time layout check caught a real problem.** The seven day bars were 43 px wide on a phone, just under a finger's 44.
- **An assert script found a real bug.** I wrote the desk flow expecting to test editing. Instead the driver reported "2 swipes up on 'App' moved it 0 px": the chart, under the middle of a desk-sized window, was trapping the mouse wheel. No reading of the source would have shown me that.
- **The tools are honest about live services.** The verify report listed every write the scripts sent, and warned that earlier runs had also written to this service. That made it easy to keep the service's history as I found it, and to confirm I had.
- **The assert API covered what the brief cares about.** `drive.pinch` sends two fingers on a touch device and a trackpad pinch on a desk. `expect.request` checks a request's body. `settleData` and `settleMotion` remove timing guesswork.

**Where the tools were weaker:**
- **Paths to anonymous views.** My first script used `now.0.weekLine`, a guess at an index. I ended up naming views just to make them addressable.
- **The sample-data note is ambiguous.** Verify says "2 data source(s) fed a sample of their schema". It didn't tell me which two, or whether a given boot ran on real data or samples.
- **A probable false positive.** One layout finding after ⌘⏎ said the entry sheet ran past the window's right edge. I believe that's the sheet sliding away as it closes, but I didn't confirm it.

**What I didn't verify:**
- the visual-baseline rung (R6);
- dark mode within a flow (I checked it only with a screenshot);
- a 320 px-wide window;
- the "no streak" wording, and the screen with no session in progress (this service always reports one);
- drawing cost: the chart's `draw` loops over every session on each pan frame, and I never profiled it on a phone.

## Surprises

- The skill's "use it as a person would" advice paid off immediately, through the wheel bug.
- Library code could warn me about my own script's names.
- How small the continuous-motion code was. The chart's window, the bars' heights and every animated figure are each one spring plus a target.

## Good and bad

**Good:**
- Errors that name their fix.
- Computed defaults.
- Springs with `arrive()`.
- The view-path assert scripts.
- Overlays as state.
- The docs' habit of explaining *why* a form is the right one.

**Bad:**
- Small inaccuracies in the reference (`Toast.say`, `Time.tick`).
- The namespace collision between script names and members.
- No structured mixed-size text.
- No sanctioned way to claim part of a gesture and give the rest back.
- Having to name views just so tests can reach them.

## Compared with what I'm used to

There's no re-render step and no dependency list: a value is either a constraint or an assignment. Events don't bubble. Layout is an attribute rather than wrapper components.

It reminded me of:
- **QML:** property bindings, and `Behavior on x` working like a Spring;
- **Flex/MXML and OpenLaszlo**, which Declare names as its ancestor;
- **MobX's computed values**;
- **Flutter's `CustomPainter`**, in how `draw` works.

The strongest contrast with React is that I wrote essentially no update logic. The main cost is that every library name is new, so I leaned on `declare-help` constantly.

## Where I'd most want improvement

1. Structured runs of mixed sizes inside one Text.
2. A way to claim part of a gesture and hand the rest back.
3. Keep the reference in step with the signatures it describes.
4. Report script/member name collisions at the point of definition, with the rule written down in the docs.
5. Better addressing of anonymous views in the test tools.
6. Clearer reporting of which sources ran on sample data.

## What I'd use it for

I'd use it for glanceable dashboards, gesture-driven data views, and internal tools where continuity matters and one codebase must serve phone and desk. That's this app's territory, and it handled it unusually well.

I'd hesitate on large consumer products for now. It's pre-1.0, the library is small, and I couldn't check real-device gesture behaviour.
# Cadence run 19: Declare 6aedaaa0, Opus 5.5

**Run:** 2026-10-30, launched with `evals/craft/launch.sh cadence ~/Code/eval-cadence-19 claude-opus-5-5 6aedaaa0`
against GitHub main, alongside Venue run 14. It is the first run after the fixes from Cadence 18 and Venue 13:
- a stale reader of a computed default;
- `align = stretch` filling the view;
- overlays judging a press in paint order;
- styled rich text read by screen readers;
- `null` in optional schema fields;
- `RadioGroup` checking what the arrows land on;
- Playwright's locators on an assert script's `page`.

Opus 5.5, the brief's idiom sentence included, one round, the standard strip.

**Try it:** the app and its two assert scripts are filed beside this report (`cadence.declare`,
`cadence-parts.declare`, `tests/phone-flow.mjs`, `tests/desk-flow.mjs`).

## The comparison

| | run 17 | run 18 | **run 19** | React |
|---|---|---|---|---|
| Declare commit | `1b3064f2` | `b641a1a9` | **`6aedaaa0`** | — |
| time | 13.8 min | 17.6 min | **13.5 min** | 15.4 min |
| turns · tool calls | 60 · 59 | 83 · 82 | **78 · 77** | 63 |
| code, raw lines | 1,253 (2 files) | 1,197 (3 files) | **1,198 (2 files)** | 2,943 |
| code, excluding blanks and `//` lines | 929 | 883 | **894** | 2,537 |
| output (incl. thinking) | 64k (23k) | 96k (46k) | **75k (33k)** | 89k |
| fresh input (cache writes) | 212k | 264k | **245k** | 129k |
| cached input re-read | 8.8M | 14.8M | **10.1M** | 3.5M |
| read before first app write | 327 KB | 345 KB | **357 KB** | 23 KB |
| context at first write → end | 159k → 218k | 164k → 272k | **182k → 255k** | 30k → 134k |
| first app write at | 7.7 min | 5.3 min | **5.7 min** | 2.6 min |
| download (gzip) | 200.0 KB | 200.7 KB | **196.5 KB** ¹ | 99 KB (+ a 90 KB web font) |
| names refused by a check | 1 | 0 | **0** | |
| library source read | 0 | 1 | **1** (`toast.declare`) | |

¹ Program 27.2 KB, runtime 156.5 KB, kernel 12.6 KB.

**The fastest Cadence yet, and faster than React.** It is correct: both of its flows pass from main, and the service
ends at the 248 sessions it began with. Its one workaround was one the platform caused (the wheel, below), and it is now
fixed.

## Where the time and the tokens went

| phase | calls | cached re-read | share |
|---|---|---|---|
| reading (0–5.7 min) | 20 | 1.82M | 18% |
| writing the two files | 3 | 0.54M | 5% |
| compile fixes (font weights in `{ }`, chip state, an Animator not started, `Toast.say`'s second argument, two helper names) | 7 | 1.46M | 14% |
| looking at desk and phone | 9 | 1.96M | 19% |
| two assert flows, and naming views so they could be addressed | 6 | 1.37M | 13% |
| **the wheel over the year chart** | 3 | 0.71M | 7% |
| a final look, formatting, the service checked, the dev server | 10 | 2.48M | 24% |

## Findings

**The wheel (fixed).** The year chart declares `onWheel` for a trackpad pinch and a sideways pan. Declaring it claimed
the whole wheel over the chart, so a vertical wheel stopped scrolling the page. The agent's own desk flow found this
("2 swipes up on 'App' moved it 0 px"), and it hand-forwarded vertical wheels with `app.scrollBy`. Fixed: `claim = x`
now claims that axis of the wheel as it does of a drag. A scroll mostly along the other axis goes on to the page, and a
pinch stays the view's.

**`Toast.say`'s reference (fixed).** The reference called the action "optional", but the method takes both arguments,
and Declare has no optional-parameter spelling. It now says to pass `null` for none, with examples. This cost the run
its one library read.

**A script name warned of inside library code (fixed).** The agent's helper `duration` shares a name with `Toast`'s
member, and DECLARE4002 fired *inside `library/toast.declare`*. Library code never calls a program's script functions,
and it isn't the author's to rename, so the warning is now kept to the program's own bodies.

**`Time.tick`'s summary (fixed).** `declare-help Time` listed `tick` as `enum(frame|second|minute|hour|day)` and left out
the number of milliseconds that the attribute's own entry, and the guide, allow. The summary now shows `|number`.

**Which sources ran on samples (fixed).** The rung-4 note now names them: "2 data source(s) fed a sample of their schema
at boot … — app.postReq, app.putReq — not the service's data".

**Smaller ones:**
- **Mixed sizes in one line** are still `HTMLText` with spans built by string. That's legitimate, and the copy is exact.
  Since today's fix, screen readers hear the figures, so the agent's extra `accessibilityLabel`s are no longer needed.
- **A probable false layout finding** while a sheet slides closed, which the agent didn't confirm. Not looked into yet.

## Is it idiomatic Declare?

Yes, and more closely than any Cadence run so far:
- One `Log` model answers everything, and every write puts the service's reply into it.
- Figures travel on springs, with `arrive()` when the data lands.
- The year is one drawn view with value and target written together.
- The form is computed defaults, with no form state to reset.
- There's a dark theme.
- `draw()` sets its labels in the program's mono face (`d.fillText(text, x, y, label)` with `fontFamily: app.mono`).
  That also confirms run 18's hard-coded font was the agent's choice.

Missteps:
1. **Sport and effort are `Tile`s with `accessibilityRole = radio`, but not in a `RadioGroup`**
   (`cadence.declare:287–294`, `:326–335`). A screen reader hears no group, and the arrows don't move between them.
   DECLARE4026 didn't fire, because the role is set by hand. Since today's fix, a `RadioGroup` holding these tiles with
   a `choice` each would be right, and a new warning (DECLARE4032) now says so at the tiles.
2. **"Log a session" is a `Tile` with `on = true`** (`cadence.declare:650`): a pressed toggle to a screen reader, for a
   button. This is run 18's misstep again.
3. **`app.wide` against the plan's 860** (`:404`, `:661`): the agent reconciled two thresholds by hand. That's fine, but
   a single fact would read better.

## Names

None missed, none collided. The ledger is empty for the second Cadence run running.

## The agent's account, verbatim

Asked after the build with read-only tools and Cadence's own questions (`impressions.txt`); 1.0 minute, 5.8k output
tokens. Also filed as `account.md`. It opens by noting that its dev server had stopped. The operator stopped it, along
with other strays, before the account was asked for.

### Building Cadence in Declare: an account for the people who make it

First, a correction to what I told you earlier: the dev server I started on port 8201 has since stopped. It exited with code 144, which looks like it was killed rather than crashing. The address I gave you won't answer until it's restarted with `PORT=8201 npm start` in `declarelang/`. You asked me not to change anything, so I haven't restarted it.

#### (a) Getting up to speed

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

#### (b) Expressing what I wanted

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

#### (c) Verifying it

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

#### Surprises

- The skill's "use it as a person would" advice paid off immediately, through the wheel bug.
- Library code could warn me about my own script's names.
- How small the continuous-motion code was. The chart's window, the bars' heights and every animated figure are each one spring plus a target.

#### Good and bad

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

#### Compared with what I'm used to

There's no re-render step and no dependency list: a value is either a constraint or an assignment. Events don't bubble. Layout is an attribute rather than wrapper components.

It reminded me of:
- **QML:** property bindings, and `Behavior on x` working like a Spring;
- **Flex/MXML and OpenLaszlo**, which Declare names as its ancestor;
- **MobX's computed values**;
- **Flutter's `CustomPainter`**, in how `draw` works.

The strongest contrast with React is that I wrote essentially no update logic. The main cost is that every library name is new, so I leaned on `declare-help` constantly.

#### Where I'd most want improvement

1. Structured runs of mixed sizes inside one Text.
2. A way to claim part of a gesture and hand the rest back.
3. Keep the reference in step with the signatures it describes.
4. Report script/member name collisions at the point of definition, with the rule written down in the docs.
5. Better addressing of anonymous views in the test tools.
6. Clearer reporting of which sources ran on sample data.

#### What I'd use it for

I'd use it for glanceable dashboards, gesture-driven data views, and internal tools where continuity matters and one codebase must serve phone and desk. That's this app's territory, and it handled it unusually well.

I'd hesitate on large consumer products for now. It's pre-1.0, the library is small, and I couldn't check real-device gesture behaviour.

## The names ledger

```
NAMES — eval-cadence-19: 0 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```

# Building Cadence in Declare: an account for the people who make Declare

The short version: I built a working, reasonably polished app in a language I had never seen, in one sitting, with no human help. The compiler and a few very good documents did most of the teaching. The weak spots are real, though. There are errors that only appear when the app runs in a browser, attributes that are accepted but have no visible effect, and a checker that passed a program which then failed to start in the browser.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, which sent me to `skill/SKILL.md`.
2. `docs/declare.md`, the whole language in one file, read in full.
3. `docs/operational/intake.md`, on starting from a brief.
4. Guide chapter 1, then chapters 14 (data), 10 (touch), 6 (layout), 20 (motion) and 22 (animated arrangements).
5. Then 8 (controls), 9 (pointer), 11 (paint and themes), 12 (text), 17 (custom components), 21 (time), 7 (scrolling), 18 (overlays) and 5 (components).
6. The operational pages `verify.md`, `introspection.md` and `getting-started.md`.
7. All of `apps/calendar/calendar.declare`, plus the swipe code in `weather.declare` and the `Roll` class in `tracker.declare`.

I also ran `npx declare-help` perhaps twenty times (`DataSource`, `WheelEvent`, `PinchEvent`, `View.claim`, `Text.numeralWidth`, `ResponsiveLayout --all`, and others).

**What taught me the most:**
- **`declare.md`** is the best single document. It's dense, it's honest about where the rules stop, and "Seven differences" set my expectations correctly before I wrote a line.
- **`calendar.declare`** taught me the house idioms in practice:
  - a few sprung numbers with everything else derived from them;
  - reading `app.pointerX` inside drag handlers;
  - building a theme by spreading a preset and adding the app's own tokens;
  - and heavy commenting that explains *why*.
- **`SKILL.md`'s "drift check"** was useful as a list of things not to do.

**Something I should say plainly.** Several guide passages match this exact task closely:
- Chapter 14's "Deriving summaries" example is a `Log` class with `Session` records, a `week()` summary and a "Log 20 minutes" button.
- Chapter 20's `Figure` example uses `weekCount` and says "Logging a session then rolls the count over."
- Chapter 12 uses `"1h 24m"` with a `Unit` style as its example of a large figure with small units.

I lifted these patterns almost directly. So my sense of how easy this was is probably inflated. Someone building a different kind of app would find less of their problem already solved in the guide. I can't tell whether that's deliberate or a coincidence.

**What was missing or misleading:**
- **The `stack` plan in `ResponsiveLayout`.** Chapter 6 says "Wide, it is a 30/70 row; narrow, a stack," which reads as if a stack gives each child the full width. It doesn't. On the phone my two columns collapsed to their natural widths: the headline broke into one word per line, and the week bars were squeezed to a sliver. Adding `width = 100%` was refused with a good diagnostic (the layout owns the width; use a share). The actual answer, that `share` also sets band width in a stack, is only in `declare-help ResponsiveLayout --all`. It belongs in the chapter's example.
- **Colour on rich text.** `HTMLText` takes its text colour from `bodyColor`. I set `textColor` on my `Big` class. It compiled, and every large figure rendered slate grey instead of ink. Only a screenshot showed it. (I'm not certain whether `textColor` is ignored outright or overridden by a default, but either way I got no warning.)
- **Font weights.** I guessed `heavy`. The diagnostic listed the real options (`extrabold | black`) and I fixed it in seconds, so this was the system working as intended.
- **Nowhere to put a live URL during intake.** `intake.md` is excellent on thinking, but it didn't cover what I needed on day one of an API-backed app: a DataSource's `url` pointing at another origin. That worked the first time, so this is a minor gap.

## (b) Expressing what I wanted

**Where it fit my intent, closely:**
- **Derived state.** This week, the streak, the per-day bars and the period summary are methods on the `Log` model. They feed derived `Dataset`s with schemas. When I added a session, all of them updated with no update code. The end-to-end test confirmed it: the week went from 4 to 5 sessions, the streak from 2 to 3, and both returned after I deleted the session.
- **Writing to the server.** I used one `DataSource` per verb (POST, PUT, DELETE), each with an `onLoad` that merges the server's reply into the working copy. The rule that "`fetch()` settles first" made `target = id; remove.fetch()` correct without my having to think about ordering.
- **The year surface.** It's two numbers on a small model class (`start` and `span`), each with a spring, plus one `draw()` method. The gestures came from declaring handlers:
  - `onPointerMove` together with `claim = x`: a horizontal swipe moves the year while a vertical swipe still scrolls the page, and I didn't write any arbitration code;
  - `onPinch`, where `e.center` let me zoom about the fingers;
  - `onWheel`, where `e.pinch` covers the trackpad pinch.

  The rule that "declaring the handler is the claim" is the best idea I met in this build.
- **The sheets.** Each is one sprung `t`. Its position derives from `t` differently on phone and desk, and the scrim reads the same `t`. The docs promised continuity would be less code than a hard cut, and here it was.
- **Rolling numbers.** The `Figure` pattern (a spring on the displayed value, with the first real value taken outright) was exactly right for "numbers travel."

**Where I worked around the language:**
- **Theme colours inside drawings.** `draw()` needed theme colours per effort level. A `script` function can't call `provided("theme")`, so I made a model class, `Effort`, with a single method purely to get access to the theme. It works, but it's a class that exists only as a workaround.
- **Replicating over a computed list.** I wanted ten effort buttons replicated from `[1..10]`. Pointing `datapath` at an inline array compiled, then failed at boot: "belongs to no Dataset." I ended up writing a JSON literal of ten `{ "n": k }` records. Replicating over a small computed array ought to be easy.
- **Seeding the year view once data arrives.** I used `trackChanges = ["ready"]` with an `onChange` on the lens model. It's close to the "flag you set to say data has arrived" drift the skill warns against, and I'm not sure it's the idiomatic way. I couldn't find a better one.
- **Holding a spring still while the hand drives it.** Under the hand I write both the value and its spring target (`follow()`) so the spring stays at rest. I copied this from `weather.declare`. The guide never says it outright, and it's the key trick for any directly manipulated surface.
- **TypeScript friction:**
  - `reduce` with a `null` starting value wouldn't typecheck (no annotations are allowed in bodies), so I rewrote those as loops;
  - `-> Session?` as a return type worked, but I found it by guessing;
  - `errorBody` needed a cast (`as Refusal`, a small schema I declared) to read `message`.
- **Small hacks:**
  - an empty `onClick() { }` on `Sheet` so taps on the sheet don't fall through to the scrim and close it;
  - the keyboard shortcuts check whether the note field is focused through a long path (`app.layer.form.body.noteField.focused`).
- **Performance I didn't measure.** Rolling numbers re-set an `HTMLText`'s HTML every frame. It looked fine; I didn't measure the cost.

## (c) Verifying it

**The checker, `declare-verify --rung=4`.** It was fast (seconds) and reported all the errors of a rung at once, each with its fix. I went through about eight compile-and-fix rounds, and most were one-line fixes. The good diagnostics included:
- the layout-ownership errors (`Text.y — View's WrappingLayout places its children…`);
- DECLARE4003 on `classroot` used outside a class;
- DECLARE4009 warning that my `Log.discard()` overrode a runtime method;
- DECLARE1002 on redundant parentheses.

That last one is pedantic, and the guide's own examples use `({ … })` inside methods, so its boundary is confusing.

**Where the tools let me down:**
- **The checker passed a program that crashed in the browser.** With rungs 1–4 clean, the real browser failed with `Cannot read properties of null (reading 'toUpperCase')` in `transformText`. The cause was a `:letter` datapath that is null before data arrives, on text with `textTransform = uppercase`. The checker's boot rung never fetches the `DataSource`, so rows that depend on data are never built there. `--fixtures` exists, but the checker could say plainly that data-dependent code went unexercised.
- **Name collisions only surfaced at boot:**
  - a child named `surface` collided with an existing View member;
  - the inline datapath above failed the same way.

  Both are knowable at compile time.
- **A confusing error from a name clash.** Naming a class `Pick` produced "Generic type 'Pick' requires 2 type argument(s)" at 16 sites. It's TypeScript's utility type showing through. A one-line "your class name shadows a TypeScript global" would have saved a minute of puzzlement.
- **Console warnings from the documented pattern.** The docs' own `Figure` class produces "onChange: 'value' changed again in the same settle chain — a ring" warnings at boot. I left them in place. I don't know whether that indicates a real problem.

**Checking behaviour.** I didn't write assert scripts for the higher rungs. Instead I used puppeteer with `__declare.find(...)` to call methods and read state, and `__declare.inspect(path)` for `rootX`/`rootY` to aim real mouse, wheel and touch events. That bridge is excellent: gesture testing was straightforward because I could read the lens values in the middle of a drag. Screenshots caught what the checker couldn't: the collapsed phone columns, the slate figures, and the grey live dot.

**What I did not check:**
- editing a session through its UI, and the delete dialog through taps (I called the model methods directly);
- the keyboard shortcuts;
- the brief's "six times" type-size ratio, which I only checked by eye;
- behaviour on a real device.

`explain` and `trace` I never needed. Ideally I'd have encoded the add/delete test as an assert script so it stays in the repository.

## Surprises

- How much the guide already contained this app (above).
- There's no build step. The dev server's message on the port collision ("port 8200 is already taken by another Declare dev server… `PORT=8201 npm start`") was a model error message.
- Gesture arbitration took no code at all.
- One `HTMLText` gives a number and its unit at different sizes as a single run of text that can still wrap. That solved "reads exactly" and "numbers are the hero" together.

## Good and bad

**Good:**
- a small, complete spec;
- diagnostics that name the fix;
- constraints that remove update code entirely;
- springs as the default way to animate, rather than an add-on;
- handlers doubling as gesture claims;
- the introspection bridge.

**Bad:**
- errors that surface only in a browser or only at boot;
- accepted attributes that have no visible effect;
- awkward access to the theme from pure drawing code;
- clumsy replication over small computed lists;
- TypeScript's typechecking without its annotations;
- a few gaps in the docs, notably the `ResponsiveLayout` stack width.

## Compared with what I'm used to, and what it resembled

Compared with React, there's no render function, no keys to pass, no effects and no memoisation. Compared with SwiftUI, animation isn't wrapped around a change; a `Spring` stands on the attribute and responds to any change.

- **QML** is the closest relative: property bindings, `states`, and `Behavior on x { SpringAnimation }` map almost one-to-one.
- It is recognisably **OpenLaszlo's** heir, as it says: datapath replication, `classroot`, constraints.
- The reactive core resembles **MobX** and **Knockout** computed values, and spreadsheet recalculation.
- Replicating views from data paths echoes XSLT.

## Where I'd most want improvement

1. Catch at compile time what now fails at boot: member name collisions, datapaths pointing at non-data, and null reads under text transforms. Warn when the boot rung didn't exercise data-dependent code.
2. Warn on attributes that are accepted but don't take effect (`textColor` on `HTMLText`).
3. A sanctioned way to read theme tokens from drawing and helper code without a model class.
4. Replication over a computed array of values.
5. Document the "write the value and its target together" pattern for direct manipulation, and the stack `share` behaviour.
6. Allow typed accumulators, or a documented alternative to `reduce` with a null seed.

## What I'd use it for

- Dashboards, personal tools and data visualisations with rich direct manipulation, such as timelines, maps and zoomable surfaces. That's where the springs, claims and derivation paid off most.
- LLM-written prototypes, because the diagnostic loop converges quickly.

I'd hesitate on:
- large public-facing sites with strict accessibility needs (the docs themselves say ARIA support is still growing);
- teams that rely on a big ecosystem;
- anything that needs pre-1.0 stability.

For an app like Cadence, I would choose it again.
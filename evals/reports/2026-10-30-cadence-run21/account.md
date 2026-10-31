# Building Cadence in Declare: an account for the Declare team

I made no changes for this. Everything below comes from the one build. Where I'm inferring rather than reporting, I say so.

## (a) Getting up to speed

**What I read, in order.** README → `skill/SKILL.md` → `docs/declare.md` in full → guide chapters 01, 04 and 05 → the to-do app whole (`todo.declare` plus `todo-parts.declare`). After that I only read what I needed for a specific problem:
- `10-touch.md` § Pan and zoom about the fingers
- `14-data.md` § Talking to a server and § A form in a sheet
- `21-motion.md` § Springs
- `12-text.md` on fonts and rich text
- `18-overlays.md` § Open as state
- About fifteen `declare-help` lookups: `Sheet`, `Segmented.choices`, `Spring.arrive`, `PinchEvent`, `DrawContext`, `Color`, `Form`, `Shortcuts`, `ResponsiveLayout --all`, `HTMLText.textStyles`, `DatePicker` and others.

The SKILL's "read these, then stop" discipline worked. I wrote the first full draft (about 900 lines across two files) after that reading, and it was clean through typechecking after two short rounds of fixes.

**What taught me the most:**
- **The to-do app.** It's long, but it showed me the shape of a whole program: a dataset class that makes every write, the user's place held on the App, `exists = { sheet.present }` for a form that starts fresh each time it opens, and a phone add button parked at the foot of the window. I copied that add-button pattern almost line for line.
- **The `zoomAbout` snippet in `10-touch.md`.** It was nearly the exact code my year surface needed.
- **Two sentences in `21-motion.md`.** "Under the hand, write the value and its target together" and the `arrive()` paragraph. Both settled design questions before I had them.
- **The dividing line in `declare.md` §5** between setting an attribute with a constraint and declaring one with a computed default. My whole entry form rests on it: sport, minutes, distance and effort are computed defaults that follow the likely value until the person nudges one.

**What was missing or misleading:**
- **Colors are numbers inside braces.** I only learned that `Color` is `number | null` by asking `declare-help Color` when I needed to blend two colors. `declare.md` implies it ("a color inside braces is `0x4169E1`"), but the type is never named there.
- **No-break spaces in rich text.** `12-text.md` says a no-break space keeps words together "in a `Text` and in rich text alike." In an `HTMLText`, I tried `\u00A0` and `&nbsp;` inside one span, and "1h 24m" still broke between "1h" and "24m". I then gave up and put a deliberate `<br>` before the duration instead. I'm fairly but not fully sure this is a runtime bug and not something in my markup.
- **Pointer events during a pinch.** Nothing told me whether single-finger events keep arriving once a pinch has begun. More below.
- **Theme tokens.** I didn't find out which tokens style a `Segmented`'s selected segment. As a result it's the one control in Cadence that doesn't match the ink-and-paper look. `declare-help "theme tokens"` exists and I didn't use it, so that one is on me.

## (b) Expressing what I wanted

**Where it fit closely:**
- **The model as a class.** `Sessions extends DataSource` with derived attributes (`days`, `weeks`, `week`, `weekCount`, `streak`, `dayScale`) and methods (`usualSport`, `pace`, `shareBelow`, `put`, `drop`). After a save I write the service's reply into the source with `put`, which `14-data.md` explicitly sanctions for a source that loads once. That made "nothing is stale" free: the week, the streak, the bars and the year all followed with no code from me.
- **Figures that travel.** Three springs on the App plus `arrive()` in `onLoad`. That took about six lines.
- **The year surface.** One view with a `draw` method reading `start` and `span`. Every gesture just writes those two numbers. This is the strongest idea in the language, and the docs teach it well.
- **The entry form.** A `Form` subclass with its own POST/PUT `DataSource` and `source = { classroot.save }`, opened with `exists = { app.entrySheet.present }`. Edit and create share one class.
- **Layout and controls.**
  - `ResponsiveLayout` with a plan: Today and Year in a row on a desk, stacked on a phone.
  - `Sheet` with `edge = { app.wide ? "end" : "bottom" }`: one control that is a side panel on a desk and a bottom sheet on a phone.
  - `defaultPlacement = face` on my `Nudger` class let each use site put its own figure in the middle. It worked first time.

**Where I worked around it:**
- **Color blending.** Mapping effort onto a color ramp needed a `mix()` helper in `script` doing bit arithmetic on channels. It's fine, but a `mix`/`lerpColor` built-in would be welcome.
- **A line of mixed sizes.** "4 sessions · 3h 40m", with large figures and small words, had to become an `HTMLText` with `textStyles` built in braces, assembling HTML strings by concatenation. Every other piece of text in the program is a `Text`. This was the clumsiest corner, and the no-break-space problem made it worse.
- **`classroot.` everywhere.** It's explicit and correct, but noisy. Inside `Entry`, nearly every expression starts with it.
- **Optional schema fields.** These produced a lot of `:id ?? ""` and `?.distanceKm ?? 0`. The to-do app has the same noise, so I suspect it's inherent.
- **Two-finger handling.** I had to invent a `fingers` counter (below).
- **Where `api`, the window and its springs live.** I had to decide what goes on the App and what goes in a class. The guide's rule ("where the user is goes on the App") made that easy.

## (c) Verifying it

**The compiler diagnostics were the best part.** Each named the fix, and several caught real bugs:
- **`DECLARE4002`.** "bare 'km' means Entry's member here, not the script binding". I had named an attribute `km`, which hid my `km()` formatter. This would have been a silent wrong value anywhere else.
- **`DECLARE4005`.** `bold` inside braces must be the string `"bold"`.
- **`DECLARE4026`.** It noticed that my four sport toggles were really one choice of four, and told me to use `Segmented`. That's a design review, not a type check.
- **`DECLARE4020`.** A button nested inside my add button.
- **An R4 layout finding** ("Choice.width is only its padding … TextLabel places itself in it (x = center)"), plus a phone tap-target note. Both came from the same mistake, and the message explained the cause precisely.

**`declare-look`** with `--call`, `--read`, `--js`, `--shot` and `--pinch` covered almost everything I needed to see. `__declare.inspect` and `__declare.at(x, y)` let me rule out hit-testing in a few seconds while debugging the pinch.

**The assert script** (`drive` and `expect`, including `expect.request`) checked the brief's whole story in 31 steps. One note stood out: verify warned that my script "sent 2 writes to the live service … what they made stays there" and pointed me to `--fixtures`. That was exactly the right warning. I avoided the problem by running an unmodified copy of the service on port 8399 and pointing `app.api` at it. I never tried `--fixtures`.

**The pinch bug.** A trackpad pinch zoomed; a touch pinch did nothing.
- **Finding it.** I built a minimal test program and bisected. The minimal version worked, so I added handlers back one by one until the difference showed up. That took six or seven runs.
- **The likely cause.** The runtime seems to deliver the second finger's `onPointerDown` (and single-finger moves) after `onPinchStart`. My drag handler was also rewriting the span, which was my own design choice and not the docs' snippet.
- **What I'm unsure of.** I inferred the event order from symptoms and never confirmed it. My fix assumes `onPointerUp` arrives once per finger, which I haven't checked on a real device.

**Limits:**
- **Real gestures.** I couldn't check how the gestures feel on a real phone, as the brief warned.
- **No visual baselines.** I never ran rung 6.
- **The rung-4 sample data.** R4 notes that it "fed a sample of their schema" to `app.restorer`, which is my undo's POST source. Feeding a sample to a write source seems odd, and I'm not sure what it implies.

## Surprises

- A two-file, roughly 900-line program was clean through typechecking after two short rounds of fixes, and booted on both sizes after one more.
- The diagnostics read like a reviewer who knows the domain, including accessibility.
- One moment where I trusted, not checked: I gated the history's URL with `url = { app.today == "" ? "" : … }`, assuming an empty URL suppresses `autoFetch`. It behaved that way, but I never confirmed it in the docs.

## Good and bad

**Good:**
- Constraints and springs as the whole update model.
- Computed defaults that the person can take over.
- The `draw` and gesture idiom for a surface you handle.
- Overlays treated as state.
- Diagnostics that name the fix.
- A verification ladder that is genuinely fast.

**Bad:**
- Rich text is the weak spot for typographically ambitious display copy.
- Brace-vs-bare spelling trips you up (`bold` vs `"bold"`, colors as numbers).
- `classroot` and optional-field noise.
- Gesture event ordering isn't documented.
- Some theme tokens are hard to discover until you know to ask.

## Compared with what I'm used to, and what it reminded me of

- **QML, above all.** Nested bracket trees, property bindings, `State`, and the rule that assigning to a bound property breaks the binding. That last one is Declare's computed default almost exactly.
- **OpenLaszlo.** The lineage shows: datapaths and replication.
- **SwiftUI.** States and the environment (`provided`).
- **Flutter.** `CustomPainter` for `draw`.
- **Spreadsheets.** The dependency model.

Coming from React, the biggest change is that nothing renders: no effects, no memoization, and repeated children come from data, not loops. That removed whole categories of bugs. It also took away the escape hatch of "just compute it in render," and occasionally I missed that.

## Where I'd most want improvement

1. **Rich text:** honor no-break spaces, or offer a "row of runs on one baseline" primitive for figure-and-word lines like the hero.
2. **Gestures:** document event order across drag-into-pinch and pinch-into-drag, or give drag handlers a `pinching` fact so authors don't invent finger counters.
3. **Colors:** a color-mixing built-in, and say in `declare.md` that `Color` is `number | null`.
4. **Theme tokens:** surface a control's tokens in its `declare-help` entry with a "set these to restyle" note. `Segmented` did list its tokens; I'd want the hint to be more prominent.

## What I'd use it for

**Yes:** dashboards, data-driven tools, and anything with a surface you handle (timelines, charts, schedules), especially one program meant for both phone and desk. Cadence's hardest part, the year surface, was its easiest code.

**More hesitant:**
- **Text-heavy, typographically intricate pages.** Rich text was the clumsiest corner of this build.
- **Projects needing a large third-party ecosystem.** I can't judge the island story (embedding another library's widget), because I didn't use it.
- **Very large datasets.** My judgment on performance is unproven: about 250 records never stressed it.
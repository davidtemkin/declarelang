# Building Murmur in Declare: an account for the Declare team

I didn't change anything for this. One housekeeping note: the dev server I started in the background has since stopped, so the URL from my last message won't load until `npm start` is run again.

## (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` closely:
- `docs/declare.md` in full;
- guide chapters 01, 04 and 05;
- the to-do app (`todo.declare` and `todo-parts.declare`) whole.

Then I read only what the plan needed: 07 Scrolling, 16 Collections, 13 Media, 12 Text, 10 Touch, 06 Layout, 18 Overlays, and the Streams part of 14 Data. I looked everything else up with `npx declare-help`. That was about 40 lookups, mostly `Socket`, `Stream`, `Media.position`, `firstVisibleRow`, `scrollAnchor`, `Popover.asSheet`, `defaultPlacement` and `TweenLayout`.

**What taught me the most.** Three things:
- **Guide chapter 07, "Keeping the reader's place" and "Following the end".** This was the single most valuable read. Half of the brief's hard requirements are scroll anchoring: stay at the bottom when there, hold the words still when reading back, report "new below". The chapter says this is one attribute, `scrollAnchor = end`, and even gives the `newBelow` constraint. It was true.
- **Chapter 16, on `virtualize` and "What sits between records belongs to the row after it".** This gave me the whole transcript design: day headings, runs of one sender, and the NEW rule, all decided by each line from its neighbours via `rowIndex`. The `firstVisibleRow` entry literally says "a chat's date chip". It felt like the docs had anticipated my app, which may be because they were written with chat in mind.
- **The to-do app.** This is where I learned the idioms: `trackChanges`/`onChange`, `exists`, `classroot`, `State` overrides, theme spreads, the `Glyph extends Icon` drawing pattern. I copied its shape for the icons and the custom layout.

**What was missing or misleading.**
- **The custom-layout box contract.** I wrote `Flow extends TweenLayout` returning `{x, y, w}`. The rows existed but were invisible, and `visible` read `null`. The fix was adding `h` and `vis: true`, which I found by noticing that todo's `Glide` returns `vis`. I didn't see the box shape stated anywhere I read, and nothing warned me.
- **Overriding a Floating's `input`.** I wrote `input(open) { if (!open) app.reacting = null }` on a Popover. That silently disabled `show()`, because the base `input` is what writes `shown`. I found it by grepping `library/floating.declare`. Section 3 of `declare.md` does say a subclass's method replaces the base's, but a warning for overriding `input` without `super` would have saved me ten minutes.
- **Time in checks.** `verify.md` says `drive.wait(ms)` passes "`ms` of real time, and exactly `ms` of the program's virtual time". I measured a `drive.wait(6000)` taking about 100 ms of wall time, and the WebSocket server's timed frames never arrived. I may be misreading the sentence, but for a program talking to a real-time service it's misleading either way. The fix was a Node-side `setTimeout` in the assert script.

## (b) Expressing what I wanted

**Where it fit.** Most of the brief mapped onto one declaration each:
- **Opens at the latest, keeps the place when new messages arrive:** `scrollAnchor = end`.
- **Reading back through 30,500 messages:** `virtualize = true`. Scrolling to row 0 of the 30,500-row thread worked first time, and so did dragging to the middle (row 12,735).
- **Keeping each conversation's scroll:** one `Transcript` per thread, replicated over `:threads[]`, with the inactive ones `visible = false`. Hidden panes kept their `scrollY`. I tested that in a throwaway prototype before committing to it, and it held.
- **The live feed:** a `Socket` with `active = { app.convos.loaded }`. Each frame becomes one write to the dataset (`insert`, `set`), and the list order, unread counts, typing lines and transcripts all followed with no update code.
- **Unread:** "unread" is derived from `lastSeen`, and `lastSeen` advances only while the pane `reading` (open, at the end, page visible). That one definition gave me list badges, the "N new" pill and the header count. I liked this most: the requirement became a constraint rather than bookkeeping.
- **One sound at a time:** a single `Audio` on the App with `playing = { app.voicePlaying }`. The scrubber follows the guide's own pattern (frame `Time` integrating `dt`, seek by assigning `position`).
- **Bubble kinds:** text, photo and voice are `classFor` subclasses of `Line` with `defaultPlacement = bubble`. Nested placement worked as `declare-help` said it would.

**Where I worked around it.**
- **Reaction tallies.** I wanted a computed list of tallies for each message. `datapath = { { rows: … } }` was refused with DECLARE3006, so each line now carries its own `counts: Dataset [ contents = … ]`. That works, but a Dataset per recycled row feels heavy for what's really a derived array. I'm unsure whether that's the intended idiom.
- **The live-frame handler.** It's an untyped `JSON.parse` dispatch. Frames share a field name, `message`, that is a Message in one frame type and an id string in another, so a single `schema` didn't fit. I accepted `any` rather than write a TypeScript union in script. A drift purist would object.
- **Hand-placed views.** The hover "react" button beside a bubble, and the pinned jump pill, are placed with `x = { … }` arithmetic. I think that's legitimate overlay placement. The drift check's warnings about hand-placed `x`/`y` made me second-guess it.
- **The Audio was laid out by my own layout.** The `Audio` was a child of the App, so my `Stage` layout placed it as the first pane and shoved the inbox to the right. Since `Audio` "draws nothing", I'd have guessed layouts skip it. They don't, and I needed `ignoreLayout = true`. `--outline` showed this instantly.
- **The waveform is a View with pointer handlers.** It's not a `Control`, so it has no proper slider role or keyboard seek. That's an accessibility gap I left.

## (c) Verifying it

The ladder worked well. My errors, in order:
- `textAlign = end`;
- bare `semibold` inside braces (DECLARE4005);
- the literal datapath (DECLARE3006);
- `cornerRadius` typed as `number[]`;
- `this.fresh` inside a `State`;
- DECLARE7001 on `titleOf(app.convos.thread(…))`, where the argument isn't a nameable path;
- a boot error because `InboxRow` declared a width that the `Flow` layout owns.

Every one named its fix, and the fixes were mechanical. The DECLARE4025 warning ("give the facts names") made the code better: `startsRun` became `otherVoice` plus `broke`.

`--outline` and `--read` were excellent for "where is it?" questions. Screenshots via `declare-look` caught the things only pixels show:
- the shadow of the off-screen conversation bleeding onto the phone list;
- the light viewer background, which needed `theme = { …surface: scrim }` because the Dialog paints the theme's surface.

Assert scripts that address views by their text (`app.conversation.body.5."mine's nicer"`, `"Play voice message, 0:09"`) were pleasant. Here is what I measured, not assumed:
- scroll offset identical before and after an arrival (219026);
- unread count going 1 → 0 after the jump;
- `voiceHead` tracking `player.position`;
- the return position (1850954) on the phone after Back.

**What I did not verify:**
- real-device gesture arbitration (hold versus scroll);
- the date chip actually appearing mid-scroll;
- whether the hover button flickers in the gaps between views;
- the inbox glide animation;
- load time for the 5.5 MB history on a slow device;
- dark mode, which I didn't build.

## Surprises

- Virtualized variable-height rows, plus anchoring, plus dragging to the first record, all simply worked. In any other stack I've used, that's the week-long part of a chat app.
- The virtual clock, described above.
- How often the docs had already named my exact case: a chat date chip, a message `ref` keyed before the server id arrives, a bubble that takes a hold while its photo takes a tap.

## Good and bad

**Good:**
- Diagnostics that name the fix.
- `declare-help` as the reference.
- One reactive model for data, layout, motion and media.
- The "facts" API: `atEnd`, `userScrolling`, `firstVisibleRow`, `loaded`, `naturalWidth`.

**Bad:**
- Silent failures at the edges where the compiler can't see: the layout box contract, the Floating `input` override, a non-drawing view being laid out.
- The check tools' time model, at least for networked apps.
- A thin record of what the library's own `place()` and `input` contracts require, short of reading the library source.

## Compared with what I'm used to

There are no hooks, effects or keys, and no virtualization library. The anchoring I'd normally hand-write in React with `useLayoutEffect` is an attribute here. The flip side is that you can't escape to imperative DOM when you're stuck. I didn't need to, but I noticed the absence.

It reminded me most of **QML**: property bindings, `State`s, an anchors-like literal vocabulary. Then of OpenLaszlo, which the README cites, with datapaths that feel like Laszlo's XPath ones. The reactivity resembles Solid/MobX signals with compile-time dependency extraction. Custom `place()` layouts recall Flutter's or SwiftUI's `Layout` protocol.

## Where I'd most want improvement

1. Diagnostics or a boot check for:
   - malformed layout boxes;
   - overriding `input`/`show` without `super`;
   - a non-visual view caught by a custom layout.
2. A real-time mode for `drive.wait`, or a clear sentence that it isn't one.
3. A sanctioned way to replicate over a computed array without minting a `Dataset`.
4. A library scrubber or slider that accepts a custom drawing, so a waveform gets keyboard support and a slider role for free.

## Would I use it

For consumer-style apps where continuity and long lists matter (chat, feeds, timelines, dashboards) and the team can live inside its library: yes, gladly. I got more of the hard requirements correct on the first try than I would have in React.

I'd hesitate for products that depend on a large third-party UI ecosystem, or for teams that need decades of Stack Overflow answers. I'm also uncertain how it behaves at real-device scale and under heavy production load, which I couldn't test here.

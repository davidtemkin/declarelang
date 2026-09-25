## Appendix — what it was actually like

### Against the alternatives

For *this* app — a surface you manipulate, with every number derived from one dataset — Declare beat React clearly and landed roughly level with SwiftUI. Three things earned that, concretely:

**The write path.** `POST → insert the returned record into `hist`` and the week total, the streak, the seven bars, the ribbon and the period summary were all true. I wrote no invalidation, no cache key, no dependency array, and there is nowhere to put one. In React that's a query client and a real conversation about optimistic updates and re-render scope. This is the claim the language makes loudest and it is the one that held up best.

**`claim = x`.** One attribute on the ribbon bought "the horizontal drag is mine, the vertical scroll stays the browser's" on touch. In React that's `touch-action`, pointer capture, a gesture library and an afternoon. Single largest labour saving in the app.

**Springs as standing declarations.** `Spring [ attribute = shown, to = { value } ]` inside a `Figure` class meant every number in the app travels, and interruption cost one `stop()`. framer-motion would get me there with per-component wiring and worse interrupt semantics.

The compiler diagnostics are the best I have worked with, in any language. *"`App.hold(…)` is never called — 'hold' is an EVENT here, delivered to 'onHold'. Rename it."* Not one error made me guess.

### Where it cost me

**Write-then-act is a stale-read footgun, and it is silent.** `wUrl = …; writer.fetch()` sends to the *old* url; `zoomGlide.to = x; start()` animates to the *old* target. The docs say plainly that a handler reads the pre-write world, and `afterSettle` is the documented answer — but the failure is quiet and wrong rather than loud. This is the same shape of bug as a stale closure in React. The language moved it, it did not remove it, and I had been led to expect otherwise.

**Layout ownership is learned by collision.** A child cannot own `x` inside an x-axis layout — good compile error. A child that reads `parent.contentWidth` *while contributing to it* is a **runtime** cycle ("re-evaluated 100 times"), invisible to rung 4, and it cost me a live-page round trip. `WrappingLayout.lineSpacing` treats any negative value as its "same as spacing" sentinel, so my `-0.26 × heroSize` silently became `+7px` — a footgun with a sentinel sharing the value space.

**No ink metrics.** `measureText` returns advance width only. That made correct optical kerning between two text runs not *hard* but **unexpressible** — the trailing bearing in this face is 15.1px after a "1" and 3.0px after a "4" at 104px, and nothing inside the program can tell those apart. I changed the design (one text run) and hard-coded a bearing constant for the rail alignment. Canvas and SwiftUI both hand me `actualBoundingBoxLeft`. For a language pitching typographic ceiling, that is the sharpest concrete gap I hit.

### What the platform could plausibly have caught and didn't

All eight defects you found shipped past a green R1–R5 ladder. Three of them were mechanically knowable:

| mistake | why it was catchable |
|---|---|
| child reads `parent.contentWidth` and feeds it | a static structural property, not a runtime one — R3/R4 territory |
| `lineSpacing = -21` meaning "+7" | a negative literal that isn't the `-1` sentinel could warn |
| write an attribute, then call a method that reads it, in one handler | the compiler already reads *through* methods for dependencies; it knows `send()` reads `wUrl` |

Two more are arguable: rung 4 does lay out (with approximated metrics), so gross content overflow past an unclipped fixed height — my card was 11px over — could be a warning. And a presence constraint gated on `.loaded` of an `auto` source is a lintable shape.

The rest were mine and not the platform's. Two in particular I should own: I wrote `height = 104` twice when `height = { contentHeight }` was there from the start, and I hand-rolled a worse `TextLabel` when the library ships one, documented, for exactly that job. A real fraction of "the platform didn't catch it" is "the platform provided it and I didn't reach for it."

### Documentation and tooling

**`declare-help` is the standout.** Two dozen queries, every one answered, several with "this deliberately does not exist — here's the real door." It is the reason I never invented an attribute name.

**The reference app was worth more than the guide.** 826 lines of `calendar.declare` taught me the idiom faster than the chapters did. The guide is genuinely well written, but it is a *course*, and I had a task.

**`verify` R1–R4 gave me false confidence, repeatedly.** It is instant and it is honest about its blind spots — and I still trusted green. The ergonomic problem is real: R4 is free, R5 requires authoring an assert script, and there is no rung in between that just boots the thing in a browser and reports page errors. I ended up writing my own `drive.mjs` to get that. That's a tell.

**The introspection bridge is excellent and has one trap.** `inspect`/`find`/`evaluate` beat React DevTools for this work — I could read any attribute and call any method from a script. But `evaluate` appears to apply writes immediately rather than at a settle, so my probe of the animator *passed* while the identical code in a real handler failed. The debugger has different semantics from the thing being debugged.

**Things I looked for and could not find:** ink bounds on text; negative leading in a wrapping layout; a stated rule for which `contentWidth`/`contentHeight` reads are cyclic; and — the one I needed most while hunting the flash — a "what woke this constraint" trace. `explain` tells you why a slot *has* its value; it does not tell you what just changed. I found the flash with a MutationObserver and a screencast frame-size diff, i.e. browser tools, not Declare tools.

**One doc error:** `docs/operational/verify.md` documents `drive.find(path).attr("name")` as "the real read" for assert scripts. The shipped `verify-behave.mjs` has no `drive.find`. That's the only place the docs told me something false rather than merely incomplete.

### Against expectation

I expected to spend most of the budget fighting syntax and hunting names. That didn't happen — I was productive inside an hour and 1,888 lines came together at least as fast as a React version would have. What I did not expect is that **every real bug would be semantic** — settle timing, lifecycle-versus-data, layout ownership, font metrics — and that the fast half of the tooling would be structurally blind to all of them.

The honest summary: the "legible to a model" claim held for *writing* and failed for *verifying*. I could write fluent Declare long before I could tell whether it was right. And the thing that actually found the eight defects was not the compiler, the ladder, or the inspector — it was you looking at the screen for ten seconds. I had screenshotted that page a dozen times and measured it numerically, and I still shipped a clock that skipped, a page that flashed, and text hanging out of its box. That is a limitation of how I was working, not of the language, and it's the part I'd change first.
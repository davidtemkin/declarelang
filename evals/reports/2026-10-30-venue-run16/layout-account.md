I made no changes. To answer this I re-read the final code in `venue.declare` and, for the first time, `docs/guide/06-layout.md`. That second fact shapes the answer: **I never read the layout chapter during the build, and it covers almost everything I struggled with.** "The steepest part of the language" overstated it. A more accurate description: this is where my CSS habits were most wrong and where I had read the least. A few real rough edges remain, and I separate them out in section 5.

## 1. What I wanted

**The hall page (the seat map)**
- **Desk:** a top bar, then a row: the seating plan filling all remaining width and height, and a fixed 380-wide side panel beside it. The side panel scrolls on its own if it is too tall. The page itself shouldn't scroll.
- **Phone:** a column. A one-line header with the performance, then (only after a failed payment) a notice, then the plan filling all remaining height, then a bar pinned at the bottom with the seat key or "3 seats · $240.00" and Continue.
- **The difference between them:** the side panel and the bottom bar are different children with different content, not the same child moved.

**The checkout**
- **Desk:** a centred block up to about 1000 wide holding two columns. The form column takes the rest of the width; the 360-wide order summary stays beside it the whole way down while the long form scrolls.
- **Phone:** one column: the summary at the top, then the form, with the page scrolling. A bar pinned to the window's bottom holds the total and Pay.

**Smaller cases**
- Expiry and security code side by side at equal widths. Postal code and country the same.
- The list and ticket screens: a centred column of capped width (no difficulty there).

## 2. What I wrote first, and why

From `venue.declare` as I first wrote it, the hall screen was:

```
hallScreen: View [ ..., height = { app.height - app.barH },
    layout: SimpleLayout [ axis = { app.phone ? "y" : "x" } ],
    phoneHead: View [ visible = { app.phone }, width = 100%, ... ],
    notice: FormError [ ... ],
    mapArea: View [ flexes = true, height = { app.phone ? 0 : 100% }, ... ],
    side: View [ visible = { !app.phone }, width = 380, height = 100%, scrolls = y, ... ],
    phoneBar: View [ visible = { app.phone }, width = 100%, ... ]
```

The checkout columns were:

```
cols: View [ x = center, width = { Math.min(980, parent.contentBox("width")) },
    layout: SimpleLayout [ axis = { app.phone ? "y" : "x" }, spacing = { app.phone ? 24 : 48 } ],
    formCol: View [ width = { app.phone ? parent.width : 0 }, flexes = { !app.phone }, ... ],
    summaryCol: View [ visible = { !app.phone }, width = 360, ... ]
```

The paired card fields were `PayField [ width = 0, flexes = true, ... ]`.

**The model I was working from** was flexbox with Declare's spelling:
- `flexes` is `flex: 1`.
- `width = 0` next to `flexes` is the `flex-basis: 0` trick for equal shares.
- `100%` across the flow is `height: 100%`, or flexbox's default `align-items: stretch`.
- `height = { app.phone ? 0 : 100% }` came from "in a column the flex decides height, so put a placeholder; in a row, fill."

The Declare part of the model came only from `docs/declare.md` §4, "Layout is an attribute". I had read its sentence that a layout places its children "and what it places a child does not declare", and that "`align = stretch` makes what its content would size fill the view across". I didn't apply either. I also wrote `100%` inside braces even though §2 says outright that `width = { 100% }` is a syntax error. That was habit beating what I had read.

**Why I didn't read `06-layout.md`:** SKILL.md says "Then stop reading. Everything else is read when you reach the part that needs it." I felt I already had the layout model, so I never treated layout as "a part that needs it." SKILL.md's table does point at `06-layout.md` and at the weather app's `desk: State [ applied = { !app.phone } ]`. I skipped both.

## 3. The attempts, in order

**Attempt 1: first compile of the whole program.** R1 (structure) reported, among other unrelated errors:

> `PayField.width = { … } is not a valid expression — there are no percentages: read the parent and scale, so 100% is { parent.width * 1 } [DECLARE2000] (venue-pay.declare:147:32)`

That came from `width = { app.phone ? 100% : 220 }` on the saved-card code field.

> `PayField.width — View's SimpleLayout sizes its children, so this child does not declare its width — it flexes, so the run gives it its width: the room left, shared among the children that flex. Remove the width to let it flex, or remove 'flexes' to keep its own width. — 4 sites, also on lines 206, 230, 236 [DECLARE2000] (venue-pay.declare:195:28)`

That came from my `width = 0, flexes = true` pairs.

> `View.height = { … } is not a valid expression — there are no percentages: read the parent and scale, so 100% is { parent.width * 1 } [DECLARE2000] (line 250, col 49)`

That was the hall's `mapArea` height. The suggested rewrite names `parent.width` for a height. It's a small slip in the message, but it made me pause.

What I concluded and changed:
- For the paired fields, the message was exactly right. I removed `width = 0` and they shared the room equally.
- For the saved-card field, I used `{ app.phone ? parent.width : 220 }`. It sits in a y-flow, so the layout doesn't decide its width.
- For the hall, I decided I shouldn't size those children on either axis. I added `align = stretch` to the hall's layout and removed `width = 100%` from `phoneHead` and `phoneBar`, `height = …` from `mapArea`, and `height = 100%` from `side`. That came from remembering the §4 sentence about stretch, and from the "does not declare its width" message I had just seen. The hall never gave another layout error, and both screenshots (desk and phone) were right the first time after that.

**Attempt 2: checkout columns.** R1 to R3 passed. R4 (boot) failed:

> `boot: View.width (line 326, col 37) — View's SimpleLayout sizes its children, so this child does not declare its width; remove it and let the layout size the child, or set 'ignoreLayout = true' on the child to size it yourself.`

This was `formCol`'s `width = { app.phone ? parent.width : 0 }` together with `flexes = { !app.phone }`. It was the same rule as attempt 1, but caught only at boot, I assume because `flexes` and `axis` were constraints the compiler couldn't settle. I applied the fix I had just learned: removed the width and added `align = stretch` to `cols`. It booted, and on a phone the form column filled the width. The message offered "remove it" or `ignoreLayout`. The fix I actually needed, stretch for the across axis on a phone, wasn't among its suggestions. I already knew it by then.

**Attempt 3: keeping the summary in view on a desk.** No error was involved; this was a design gap I noticed once the checkout worked. The page scrolled as a whole, so the summary scrolled away. I read `07-scrolling.md` § "Fixed headers: `ignoreScroll`". It says a pinned view must be a direct child of the scroller. Pinning the summary would have meant moving it out of its column to the App and placing it by hand at the column's x. I rejected that. Instead, on a desk only, I gave the checkout screen a fixed height and made the form column its own scroll pane. "Only on desk" couldn't be written as a constraint: I needed "a fixed height on a desk, sized by content on a phone", and I found no value that means "unset". So I used `State`. It compiled and booted clean, and the screenshot showed the form column scrolling with the summary standing still.

## 4. What I ended with, and whether it's the idiom

The hall, from `venue.declare` lines 279–374, condensed:

```
hallScreen: View [ visible = { app.step == "hall" }, width = 100%, height = { app.height - app.barH },
    accessibilityRole = main,
    layout: SimpleLayout [ axis = { app.phone ? "y" : "x" }, align = stretch ],
    phoneHead: View [ visible = { app.phone }, padding = [4, 10, 4, 4], ... ],
    notice: FormError [ visible = { app.phone && app.notice != "" }, ... ],
    mapArea: View [ flexes = true,
        padding = { app.phone ? [0, 0, 0, 0] : [24, 24, 24, 24] },
        map: HallMap [ width = 100%, height = 100%, ... ],
        ... ],
    side: View [ visible = { !app.phone }, width = 380, scrolls = y, ... ],
    phoneBar: View [ visible = { app.phone }, padding = [12, 18, 16, 18], ... ]
    ],
```

The checkout, lines 378–403:

```
payScreen: View [ visible = { app.step == "pay" }, width = 100%, accessibilityRole = main,
    padding = { app.phone ? [20, app.gutter, 220, app.gutter] : [0, app.gutter, 0, app.gutter] },
    State [ applied = { !app.phone }, height = { app.height - app.barH } ],
    cols: View [ x = center, width = { Math.min(1000, parent.contentBox("width")) },
        State [ applied = { !app.phone }, height = { parent.contentBox("height") } ],
        layout: SimpleLayout [ axis = { app.phone ? "y" : "x" }, spacing = { app.phone ? 24 : 48 }, align = stretch ],
        formCol: View [ flexes = { !app.phone },
            State [ applied = { !app.phone }, scrolls = y, padding = [40, 12, 80, 4] ],
            ... ],
        summaryCol: View [ visible = { !app.phone }, width = 360, padding = [92, 0, 0, 0],
            OrderSummary [ ] ]
        ]
    ],
```

The phone's pay bar (lines 407–408) is a child of the App with `ignoreScroll = true, ignoreLayout = true, y = end`. That is the guide's pattern and worked the first time.

**Is it the intended idiom?** Partly. Now that I've read the chapter:
- **Matches the guide:**
  - `align = stretch` with `flexes` is `06-layout.md`'s "page frame" example (lines 124–137), which is nearly my hall on a desk.
  - Lines 147–150 say stretch "still holds when a constraint turns the row into a column on a narrow screen". That is precisely my case.
  - `flexes = { !app.phone }`, `axis = { … }`, and a `State` for "a configuration that holds at some widths" are all named at lines 237–241.
- **Probably not what the authors would write:**
  - Lines 243–250 say that when what changes is "where the room goes — a panel beside the main view on a wide screen, a strip under it on a narrow one, the main view taking what is left either way", the answer is a layout of your own. That describes the hall exactly. I used two different children shown and hidden with `visible`, plus an axis switch. It works, but by the guide's own words it isn't the idiom. The checkout is closer to "only the direction changes", so it's probably fine.
- **Where I'm unsure of the idiom:**
  - `height = { app.height - app.barH }` on the hall and checkout screens is arithmetic over siblings, which the skill's drift check names as a smell. The page-frame example would give the screens `flexes = true` under an App with a y layout. But my App also scrolls (`scrolls = y`) for the list and the phone checkout, and I don't know what `flexes` means inside a scrolling App whose other screens are taller than the window. I hand-computed it instead.
  - `scrolls = y` set inside a `State` worked in the screenshots, but I didn't find it shown anywhere.
  - `summaryCol`'s `padding = [92, 0, 0, 0]` is a magic number to line the card up with the "Checkout" title. That is hand placement by another name.
  - `app.phone` reads the window width. `ResponsiveLayout` reads the view's own width, which the guide says lets plans nest. For whole screens it's equivalent here, but it isn't the more composable choice.

## 5. Judgement: one roadblock, several, or a gap?

**Mostly several small roadblocks with one root cause:** carrying flexbox habits over, combined with not reading the chapter that corrects them. The one rule, that whatever a layout decides the child doesn't declare, was behind three of the four errors (`width = 0` with `flexes`, `100%` across the flow, and the boot-time `formCol` width). The diagnostics were good, and each fix worked. The docs covered all of it, in `06-layout.md`. I didn't find it because I didn't look, not because it was hidden or untrustworthy.

What remains is real but smaller:
1. **A rule that's hard to apply when the axis is reactive.** With `axis = { … }`, which of a child's dimensions the layout decides flips with the condition. The compiler can't see that, so the error arrives at boot (R4), and only for the state that booted. My final `--phone --desk` run was clean, so both states got checked in the end, but the default laptop boot can't speak for the phone. A compile-time rule would catch it every time: "under a reactive axis, a child declares neither width nor height; use `flexes`, or `align = stretch` for across."
2. **No way to say "unset" from a constraint.** A size that is fixed in one condition and content-sized in the other needs a `State`. `06-layout.md` does point to `State` for configurations that hold at some widths. So this is a documented rule that surprised me, not a missing capability.
3. **A missing capability: sticky inside a layout.** Keeping a column's content in view while the page scrolls past it is CSS `position: sticky`. `ignoreScroll` only pins against the view's own scroller, and the guide says it must be a direct child of that scroller. My workaround, making the column the scroller, is legitimate, but it changes the page's scrolling model just to keep one card in view.
4. **One unclear rule:** fixed-height screens beside scrolling screens in one App. I couldn't find what the intended form is.
5. **A diagnostic slip:** the no-percentages message suggests `{ parent.width * 1 }` for a height.

## 6. Compared with what I expected, and with other platforms

I expected flexbox semantics:
- Stretch across by default.
- A declared size as a starting point the layout may override.
- `100%` meaning "fill" on either axis.

Declare is stricter. Stretch is opt-in, and a declared size isn't negotiated with the layout; it's refused. Once I understood that, it was easier to reason about than flexbox, because there's one decider per value and no `min-width: 0` puzzles.

**How I'd have written it elsewhere:**
- **CSS:**
  - The hall: `display: flex` with `flex-direction: column` inside a media query, `flex: 1` on the map, the side panel shown on desk and the bar on phone. About the same code.
  - The checkout's summary: `position: sticky; top: 24px`, one line where I restructured the scrolling.
  - The screen height: `height: calc(100dvh - var(--bar))`, the same arithmetic I wrote, without any sense that it was a smell.
- **SwiftUI:** `HStack`/`VStack` chosen by horizontal size class, `.frame(maxWidth: .infinity)` to fill, a `ScrollView` around the form column. That's very close to my final checkout structure.

## 7. What would have let me write it right the first time

In order of how much each would have helped:
1. **Reading `06-layout.md`.** The page-frame example and lines 143–150 and 237–250 answer every question I had. On the docs' side: SKILL.md's "Read first" list could include `06-layout.md` (or just its frame example plus the stretch paragraph), or `declare.md` §4 could carry the page-frame example. Its current one-line mention of stretch is easy to read past for someone who thinks they already know flexbox.
2. **A compile-time check for reactive axes**, worded with the across-axis fix: "this layout's axis changes; a child it arranges declares neither width nor height — use `flexes` for along and `align = stretch` for across."
3. **An R4 message that offers stretch.** When the layout decides the along axis, the message could add "for the across axis, `align = stretch` on the layout" next to "remove it" and `ignoreLayout`.
4. **A sticky option**, something like "stay in view within the scroller while my parent is on screen", or a guide example showing the intended way to keep a summary beside a long form.
5. **One sentence on fixed-height screens inside a scrolling App**, saying whether to use `flexes`, a state, or a screen that is its own scroller.
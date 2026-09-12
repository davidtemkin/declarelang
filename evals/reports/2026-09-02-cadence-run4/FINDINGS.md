# Building Cadence in Declare — a field report

I had not seen this language before today. What follows is what actually happened, in
order, including the parts that were slower than they should have been.

---

## Getting in

The front door works. `git clone`, `npm install`, `npm start` — 87 packages, two seconds,
and the README's "Agents start here" section is the first thing under the fold. It names
four artefacts in priority order and it is right about all four: the skill file is the map,
`docs/declare.md` is the language (879 lines, and genuinely complete), `intake.md` is what
to do with a brief, and `apps/calendar/calendar.declare` is the program to read before
writing one.

I read, in this order: `docs/declare.md` whole, `intake.md`, `getting-started.md`, guide
chapters 3–9 and 14–16 and 22, and then all 852 lines of the calendar. That is maybe forty
minutes and it was the correct forty minutes — I wrote the first 1,100 lines of Cadence in
one pass and the compiler found three errors in it. I do not think I have ever had that
experience with an unfamiliar framework.

The one thing I want to flag about the on-ramp is a small thing done unusually well:
`intake.md` insists you write a restatement *before* you plan, and it names the specific
failure it is preventing ("Left alone a model does the reverse" — literal about structure,
free about values). I wrote one (`RESTATEMENT.md`) and it changed two real decisions: it is
why the year is a camera over one surface rather than a chart with a range picker, and why
effort rather than sport gets the accent. Guidance that changes a decision is rare.

**The only setup friction was not the platform's fault, and the platform handled it
perfectly.** Port 8200 was already held by an unrelated Declare server rooted in a different
checkout, and 8201 by something else:

```
port 8201 is already taken by a process that is not a Declare dev server.
  Start this one elsewhere:  declare dev 8202
```

It probed `/__identity` to work out *what* was holding the port, and it refused to share
rather than silently serving a second tree. I moved to 8210. That message is the whole
design philosophy of this project in six lines.

---

## What the compiler said, and whether it helped

I hit six compile errors and one runtime crash. Five of the six diagnostics named the exact
rewrite and I applied it without thinking; that is the advertised behaviour and it is real.

**1. The `on` prefix is load-bearing.** I wrote a plain method called `onSecond()` and got:

```
App has no 'onSecond' event — its handlers: onInit, onClick, onDblClick, onHold,
onPointerDown, onPointerUp, onPointerMove, onPointerOver, onPointerOut, onTouchStart,
onTouchMove, onTouchEnd, onTouchCancel, onWheel, onPinchStart, onPinch, onPinchEnd,
onRetire, onContextMenu, onFocus, onBlur, onEscapeFocus, onKeyDown, onKeyUp, onFollow,
onReady, onArrive, onPost [DECLARE2000] (line 368, col 5)
```

`docs/declare.md` §8 says "the `on` prefix is a naming convention, not syntax", which I read
as *you may name a method anything*. It is closer to a reserved prefix: `on…` on a component
is checked against that component's event list. Renaming to `tickSecond()` fixed it. The
error printing the entire legal set was the right call — I could see instantly that the
problem was the prefix and not the name.

**2. A method may return `Session?`; an attribute may not be declared `Session?`.**

```
unknown type 'Session?' — a declared attribute's type is one of number, string, boolean,
Color, Length, Shape, array, object, View, Axis, WrapAlign, a component class, a declared
schema, or a function type '(a: T) -> R' [DECLARE2000]
```

`lastOne() -> Session?` compiles; `selected: Session? = { … }` does not, even though the
expression legitimately yields null and `selected: Session = { … }` accepts it. That
asymmetry cost me a minute of confusion and is the one place the type grammar felt
inconsistent to me. (Declaring it `Session` and letting it hold null works fine, and every
read site had to be null-guarded anyway.)

**3. The best diagnostic I got all day**, when I applied chapter 8's value pattern
(`input(v)`) to a `TextInput`:

```
TextInput.input(…) is never called — 'input' is an EVENT here, delivered to 'onInput'.
Rename it to 'onInput(…)'. (The 'input(v)' value pattern belongs to CONTROLS — Checkbox,
Slider, Segmented — which fire no such event; an editor delivers through its event
instead.)
```

That message did not just tell me the fix; it told me *why my generalisation was wrong* and
where the boundary of the rule actually falls. Chapter 9 does say this, and I had
over-generalised from chapter 8 — but the compiler taught it to me better than my reading
had. Whoever writes these: this is the standard.

**4. A `Spring` has no cursor.** I put a `:path` inside a spring's `to` inside a replicated
node:

```
a ':path' reads the enclosing VIEW's datapath, and Spring is not a view — it has no
cursor. Declare an attribute on the enclosing view that reads the path
('n: number = { :field }'), and read that attribute here. [DECLARE6001]
```

Exactly right, and the suggested rewrite is what I did (`mins: number = { :minutes }` on
the column, read from the spring).

**5. Six real nullability holes**, surfaced as `DECLARE6001` with the TypeScript code as a
hint (`Object is possibly 'null'. hint: TypeScript 2531`). Every one was a genuine bug I
would have shipped — `app.src.value.sessions` in an `onLoad`, `app.live.value.session.…`
in four constraints. Narrowing across the compiler's read-rewriting worked correctly
wherever I had actually written a guard; the errors were all places where I had not.
Typechecking `{ }` bodies with no flag to remember is a quiet, large win.

**6. Scope is lexical and it means it.** I referred to `app.heroBox.height` for a node that
actually lived at `app.page.heroBox`:

```
'heroBox' is not a member of this App — declare it (heroBox: <type> = …) or fix the name
```

**And a warning I would never have written a test for:**

```
warning: a text field at 14px: iOS zooms the whole page toward any focused field smaller
than 16px, and back on blur — set fontSize = 16 on the field (or the ancestor it inherits
from) to keep the viewport still [DECLARE3005]
hint: measured: the zoom factor is 16 ÷ fontSize — at 14px the page jumps to ×1.14
```

A compiler that knows about the iOS focus-zoom is a compiler that has been used to ship
something. I changed the note field to 16px.

### The one failure that was not in Declare's terms

A `Text` whose `text` resolved to `null` (a `:note` read under a computed cursor that was
null because nothing was selected) crashed the runtime:

```
TypeError: Cannot read properties of null (reading 'split')
    at wrapLines (http://127.0.0.1:8210/bundles/declare-boot.js:21:81)
```

That is a raw stack in a minified bundle — no path, no attribute name, no node. It is the
only diagnostic all day that did not tell me where in *my program* the problem was; I found
it by reasoning about which of my `Text` bodies could yield null under a null cursor. Given
that §7 explicitly documents "an unresolved `:path` yields null and the bound attribute
falls back to its default", a `null` reaching a `string` slot is arguably meant to be
handled: **either coerce it to `""` at the slot, or throw with the node path and attribute
name.** This is my clearest maintainer-facing bug report.

---

## What actually carried the build

**The two-scalar camera.** This is the thing I would tell someone. The brief asks for
fourteen months as one surface you push and pull, and in every stack I know that is a
charting library plus a gesture layer plus a re-render budget. Here it is:

```declare
camRight: number = 0,          // which day sits at the right edge
camSpan: number = 91,          // how many days are on screen
```

…and then every one of ~250 bars declares `x = { app.stripW * (app.camRight + app.camSpan
- :age) / app.camSpan }`. Panning is two numbers moving. There is no draw call, no
invalidation, no `requestAnimationFrame`, and — the part that surprised me — no code
anywhere that knows a pan is happening. The month datelines, the period label, the summary
figures and the position rail all fall out of the same two numbers because they read them.

The calendar's `blockness` idiom transferred wholesale: `openness = { clamp((46 - camSpan)
/ 26, 0, 1) }` is a continuous scalar, and the bars' labels fade up as you pull the year
open, so a tick *becomes* a block instead of switching into one. That is a mode without a
mode flag, and it is one line.

**`claim = x`.** The brief's hardest phone requirement — a horizontally-draggable surface
sitting on a vertically-scrolling page — is one attribute. I asserted it with real touch
events and a vertical swipe scrolls the page while the year stays put. In every other stack
I have used, that is a day of `touch-action` and `preventDefault` archaeology.

**Springs as the answer to "numbers travel".** Six declarations
(`Spring [ attribute = nMinutes, to = { app.weekMinutes } ]` and friends) and every headline
figure moves to its new value instead of cutting. Then, because `stiffness` is an ordinary
reactive slot, `stiffness = { app.handOn ? 2400 : 260 }` gave me a camera that is locked to
the hand during a drag and glides for the "TODAY" button — one declaration, two behaviours.
I expected that to be a place where the abstraction would run out. It did not.

**`verify --assert`, rung 5.** This is the feature I did not expect to matter and it
mattered most. `cadence-checks.mjs` is 140 lines that read like the brief — "adding one, and
everything derived being true of it at once" — and it runs the real program in headless
Chromium against the real service, driving real presses. It caught nothing I had not already
seen, but it means every subsequent edit was free: I refactored the whole responsive layout
three times and re-ran one command. The `__declare.evaluate(path, src)` bridge (evaluate
Declare in a node's scope, from the test) is what makes the assertions read at the language's
altitude instead of poking at DOM selectors.

**`declare-help`.** I asked it about 25 names. It answered every one in a sentence and never
sent me to a page. `DataSource.method` told me POST/PUT/PATCH send `body`, and
`DataSource.body` told me — unprompted and exactly when it mattered — that "changing it
sends nothing until the next `fetch()`". That saved me a real bug: I had been about to set
state and call `fetch()` in the same handler, which cannot work, because a handler's writes
land at the settle. Reading the answer, I restructured so the request's `url`, `method` and
`body` are all standing constraints over form state and `save()` is one line.

**The canvas renderer.** On a whim I appended `?render=canvas` to the URL. The entire app —
webfonts, two hundred and fifty bars, the sheet, the meters — rendered, as far as a
screenshot comparison shows, identically, with zero changes to my program. I did not build for it and I did not have to.

---

## What fought me

**`WrappingLayout` and baselines.** The brief needs `4 sessions · 3h 40m` to be one sentence
in two sizes. My first attempt put four differently-sized runs in a `WrappingLayout` and got
a scrambled two-line arrangement — the layout places boxes by top edge, and my runs had
different heights and different intrinsic baselines. That is not a bug; it is me reaching for
the wrong tool. The right tool was already there and documented:

```
Text.baseline — The y of the first baseline inside this view — the fact cross-font,
cross-size baseline alignment needs: `y = { title.y + title.baseline - this.baseline }`
```

I replaced the layout with four absolutely-placed runs whose y derives from
`app.page.h1.t.baseline` and `.capHeight`, so the sentence sits on one baseline at any font
size, at any width, and wraps as one sentence on a phone. **Suggestion for the maintainers:**
a `SimpleLayout [ axis = x, align = baseline ]` would be a small addition that removes a real
sharp edge, because mixed-size type on one line is not exotic — it is most of editorial
design.

**A layout mistake the language cannot catch.** When I laid the wrapped hero out I used
`heroStride = heroSize * 0.88`, guessing at Antonio's cap height. At 768pt the two lines
collided. The fix was to stop guessing — `heroStride = { app.heroCap * 1.22 }`, where
`heroCap` is the *measured* `Text.capHeight`. This is the class of bug the docs warn about
directly ("a clean compile is not a working app: layout, fonts, paint… do not exist until it
runs"), and it is the reason I screenshotted at six widths rather than trusting the ladder.

**`declarec` ships whatever sits next to the program.** My assertion script lived at
`my-apps/cadence-checks.mjs`, and the production build reported:

```
assets: cadence-checks.mjs, fonts
```

It copied my test file into the deployable. I moved the file out and it stopped, but a
sibling `.mjs` next to a `.declare` is not obviously a data asset, and shipping a test file
to production is the sort of thing that should require asking for.

**Two small tooling papercuts.** `__declare.evaluate()` returns `{ ok, text }` where `text`
is JSON, so string values come back quoted (`"\"s0245\""`); I built an id from one and got
`expected app.selectedId = "\"s0245\"", got ""`, which is a clear message about a confusing
value. And rung 5's `expect` vocabulary has no numeric comparison — `approx` exists but not
"greater than" — so every quantitative assertion I wrote is a hand-rolled condition plus
`expect.fail`. Both are five-minute fixes with real leverage, since a behaviour suite is
mostly "this number went up".

---

## Where I stopped, honestly

- **I did not use `location` or `waypoint`.** Chapter 13 makes a good case that an open
  detail panel is exactly what `waypoint` is for — Back should undo it, a stranger should
  not see it — and I skipped it to protect the schedule. The cost is real: on a phone, the
  system back gesture leaves the app instead of closing the sheet. `Esc`, the scrim, and
  CLOSE all work. This is the one place I know the app is less than the platform offered.
- **No visual baselines (rung 6).** I checked appearance with screenshots at six widths and
  both colour schemes rather than blessing baselines, which is the right trade for a
  one-shot build and the wrong one for a codebase.
- **Performance is unmeasured on real hardware.** 1,257 nodes and 7,046 owned slots; a pan
  recomputes roughly three constraints per bar per frame. It is smooth in headless Chrome on
  this machine and I have no data beyond that. Notably I never needed `virtualize` — 250
  materialised bars was not a problem, and browser find still works over the whole year.
- **I read none of `evals/apps/cadence/`.** The repository contains an evals tree that
  includes this brief's fixture; per the hygiene rule I did not open it beyond the API server
  the task itself points at.

---

## The one paragraph I would send the maintainers

The claim on the README — that the language is what makes an LLM's output trustworthy — held
up in a specific, measurable way here. Of the ten things that went wrong today, six were
caught by a compiler message that named the fix, one by a compiler *warning* about a platform
behaviour I did not know existed, two by driving the real program, and one — the null into
`Text.text` — by reading a minified stack trace and guessing. The ratio is the product. The
place to spend the next increment is that last category: make every runtime refusal name the
node path and the attribute, the way every compile-time one names the line and the rewrite.
And add baseline alignment to the layouts, because the moment anyone takes the "type carries
the design" instruction seriously, they will hit it.

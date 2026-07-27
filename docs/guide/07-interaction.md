<!-- nav: Interaction -->
<!-- part: Building -->

# Interaction is delivery

A program hears the user through **handlers** — methods whose names begin with `on`.
There is no `addEventListener`, no listener cleanup, and no bubbling: an event fires on
the one node it happened to, and when something *else* needs to know, the handler
tells it directly. That is the whole routing model, and it fits in a sentence:

> **Handlers fire where they're declared; children deliver by calling methods.**

## Interaction state you never wire

Hover and press are not events you route — they are **read-only attributes every view
already has**. `hovered` is true while the view is on the live *hit chain*: the topmost
visible view under the pointer, plus its ancestors — occlusion-correct, so anything
covering a view suppresses it, and always false on touch. `pressed` is true from a
pointer-down on the chain until release — drag off a button and it lets go, drag back
and it re-arms, the way native buttons behave. You read them; the runtime keeps them
true:

```declare
App [ width = 220, height = 100, fill = white,
    n: number = 0,
    btn: View [ x = 20, y = 20, width = 160, height = 40, cornerRadius = 10,
        fill = { pressed ? 0x2E5BD0 : hovered ? 0x3B74FF : 0x4C8DFF },
        onClick() { app.n = app.n + 1 },
        Text [ x = 40, y = 10, textColor = white, text = { `clicks: ${app.n}` } ],
        ],
    ]
```

No declarations, no `onMouseOver` bookkeeping — the four handlers and two booleans this
took before the intrinsics existed are simply gone, and what remains is the one line
that was ever the point: the `fill` constraint. Everything composes as usual: gate a
State on it (`applied = { hovered }`), read another view's (`visible =
{ parent.parent.hovered }`), or spring from it. Because the chain derives from
geometry too, a view that *moves* under a stationary cursor updates — and because the
chain is occlusion-correct, one transparent view laid over a region silences every
hover beneath it (the "activation glass" idiom: how a desktop declares
click-to-activate windows). Declaring or assigning `hovered`/`pressed` is a compile
error that says so — like `contentWidth`, they are computed for you. For controls, the
library's `Control` derives a styling pair from them (`hot`/`down` — the intrinsics
gated by `disabled`, plus the keyboard flash), which is what its buttons paint with.

## Two layers: what happened, and what it meant

Every pointer handler belongs to one of two layers, and choosing between them is the
whole skill.

The **raw layer** — `onMouseDown`, `onMouseMove`, `onMouseUp` — reports what the
pointer physically did, the instant it did it. No waiting, no interpretation; a press
is a press whether it came from a mouse button or a fingertip. This is the layer for
*manipulation*: dragging a card, tracking a slider, drawing on a canvas.

The **resolved layer** — `onClick`, `onDblClick`, `onHold` — reports that the user
*activated* this view. That is a judgment, not an event: the runtime watches the whole
gesture and decides. This is the layer for *commands*: buttons, links, menu items,
anything where "the user chose this" is the meaning.

> **`onClick` activates, `onMouseDown` manipulates.**

Reach for `onMouseDown` to run a command and it will misfire on a phone, because a
finger landing on your button may be starting a scroll — and only the resolved layer
knows the difference. What the runtime decides, precisely:

- A **click** needs press and release on the same view *and* a pointer that never
  wandered — about 4px for a mouse, 10px for a finger. Past that the gesture was a
  drag or a swipe, whatever it started on, and it activates nothing. (With a mouse,
  movement inside a target is meaningless; you are still pointing at it. With a
  finger, movement is the entire vocabulary of scrolling.)
- A **double-click** is two clicks on the same view, in about the same place, inside
  400ms. A third tap starts a fresh pair rather than making a second double.
- A **hold** is a press that stays in place for half a second. It does not consume the
  gesture: the raw stream keeps flowing and the eventual click still fires, so a hold
  can start a drag, open a menu, or be ignored.

One nicety you get for declaring things rather than configuring them: if a view
declares `onDblClick`, the runtime **holds its single click** for the double window,
so a double-click never performs the single action first. A view with only `onClick`
— nearly all of them — fires immediately, with no added latency. You pay for the
ambiguity exactly where you asked for it.

## The drag pattern

Down, move, up on one node is the entire shape. The pressed view **captures** the
pointer: until release, moves and the release itself come to it even when the pointer
travels far away, so there is no tracking code to write.

```declare
App [ width = 300, height = 160, fill = white,
    card: View [ x = 20, y = 40, width = 120, height = 80, cornerRadius = 10, fill = 0x4C8DFF,
        downX: number = 0,
        startX: number = 0,
        onMouseDown(e) { downX = e.x; startX = this.x },
        onMouseMove(e) { x = Math.max(0, Math.min(180, startX + (e.x - downX))) },
        ],
    ]
```

Drag the card. There is no click-versus-drag bookkeeping here, because the runtime's
click rule already covers it: a gesture that moved is a drag and activates nothing, so
an `onClick` on this same card would fire only on a real tap.

Two things worth knowing about the coordinates and the ending:

**`onMouseMove` and `onMouseUp` carry *root-space* coordinates** — measured against the
whole app — while `onMouseDown`, `onClick`, and `onDblClick` carry view-local ones. A
drag needs a frame that does not move with the thing being dragged, which is why the
two differ.

**A gesture can be interrupted.** On a touch screen the browser may reclaim a gesture
mid-flight to scroll the page, which ends your drag without a release. That still
arrives as `onMouseUp`, so state resets — but the event says which it was:

```declare-fragment
onMouseUp(e) {
    dragging = false                       // always reset
    if (e.canceled) return                 // …but never commit an interrupted drag
    classroot.commitMove(this.x, this.y)
    },
```

## Tap and hold

A press held in place fires `onHold` — the touch analog of a right-click, and equally
available to a mouse. What happens next is yours to decide; the runtime only reports
the fact.

```declare-fragment
row: View [ width = 200, height = 40,
    onHold()  { classroot.showActions(this) },     // a menu, a pick-up, a peek…
    onClick() { classroot.open(this) },
    ],
```

Because a hold does not consume the gesture, a view can offer both, as above: hold for
options, tap to open.

## Finding what is under the pointer

A drag that must *land* somewhere needs to know what it is over. Ask the tree:

```declare-fragment
onMouseUp(e) {
    if (e.canceled) return
    let t = app.viewAt(e.x, e.y)                  // root-space, like the event
    while (t != null && t.accept == null) t = t.parent
    if (t != null) t.accept(this.payload)
    },
```

`app.viewAt(x, y)` answers with the deepest view under a root-space point, and
`view.containsPoint(x, y)` asks the same question of one view. Both run the *same* walk
the pointer itself is routed by — clip shapes, scale, `pointerEvents`, and overflow all
count exactly as they do for a real press — so what your handler computes and what the
runtime delivers can never disagree.

The idiomatic drop target combines the two layers: the dragger decides with `viewAt`
and writes **one** reactive slot; every target derives its appearance from that slot by
constraint.

```declare-fragment
// on the dragger
onMouseMove(e) { app.dropTarget = app.viewAt(e.x, e.y) },

// on each target — no handlers, just a standing relationship
hot = { app.dropTarget == this },
```

One writer, many readers, and the highlight is a constraint like everything else.

## Touch is not mouse

The same handlers fire for both, and the runtime absorbs most of the difference: a
finger that moves does not click, a tap never leaves a view stuck in a hover state, and
an interrupted gesture reports itself. Three differences remain yours to design for.

**There is no hover.** `hovered` is always false on a touch device, and
`onMouseOver`/`onMouseOut` are mouse facts. Anything that only appears on hover is
invisible on a phone unless you give it another way in — let `pressed` carry the
feedback instead.

**Targets want to be bigger.** Ask the device, and design accordingly:

| you ask | it answers | use it for |
|---|---|---|
| `app.touchDevice` | is the *primary* pointer a finger? | sizing and layout density |
| `app.hasTouch` | is there a touch digitizer *at all*? | a hit-target floor |
| `app.hasPointer` | is there a mouse, trackpad, or stylus? | offering precise affordances |
| `app.lastPointerType` | what did the user *just* use — `"mouse"`, `"touch"`, `"pen"`? | revealing hover-only chrome |

The last two exist for the awkward middle: a Windows touch laptop reports
`touchDevice = false`, because its trackpad really is primary, yet a finger may arrive
at any moment. The rule that follows is worth stating plainly — **size from
`touchDevice`, floor from `hasTouch`, and reveal from `lastPointerType`.** Never drive
layout from the live pointer type: targets that resize as the user alternates trackpad
and finger are worse than either size. And a hit region need not match a visual one, so
a hybrid can keep compact chrome and generous touch targets at the same time.

**The browser is a gesture competitor.** Scrolling, pinch-zoom, and the long-press
callout all belong to the browser until an app says otherwise — which is the next
section.

## When the app owns the gesture

Most apps should let the browser scroll and zoom; it does both better than you will,
and its physics are the ones the platform's users already know. But some apps *cannot*
delegate — a canvas with nested coordinate spaces and continuous zoom has no browser
primitive to hand the job to — and those need the raw multi-finger stream plus a frame
heartbeat to integrate their own physics.

Declaring the raw touch family is that statement. A view with `onTouchStart` and its
siblings receives every finger, with a stable `id` per finger for the life of its
contact, and the browser stops claiming gestures in that subtree:

```declare-fragment
surface: View [ width = 100%, height = 100%,
    onTouchStart(e) { classroot.engine.begin(e.touches) },
    onTouchMove(e)  { classroot.engine.track(e.touches) },
    onTouchEnd(e)   { classroot.engine.release(e.touches) },
    onTouchCancel(e) { classroot.engine.abort() },
    ],
```

`e.touches` is every finger currently down; `e.changed` is the one this event is about.
Coordinates are root-space throughout — a gesture engine wants one stable frame.

The other half is the heartbeat. `Frames` is a member, like a `Spring` or a `Dataset`,
that calls `onFrame(dt)` once per animation frame with the real elapsed time in
seconds:

```declare
App [ width = 240, height = 120, fill = midnightblue, textColor = whitesmoke,
    x0: number = 20,
    v: number = 60,
    physics: Frames [ onFrame(dt) { app.x0 = (app.x0 + app.v * dt) % 200 } ],
    dot: View [ x = { app.x0 }, y = 40, width = 40, height = 40, cornerRadius = 20, fill = turquoise ],
    ]
```

`running` gates it (`running = { app.simulating }`), `dt` is clamped so a backgrounded
tab does not resume with one enormous step, and it rides the same clock every `Spring`
and `Animator` uses — so it costs nothing until it runs, and there is no second frame
loop. Reach for it when you are integrating something yourself; for "move this there,
smoothly," a `Spring` is less code and better behaved.

## Reaching another node: call a method

When a handler must affect something beyond its own node, it does not dispatch an
event upward — it **calls a method** on the node that owns the behavior, reached by a
[scope noun](declare-docs:guide:tree):

```declare-fragment
class Row extends View [
    onClick() { classroot.select(this) },      // tell the list; nothing bubbles
    ]
```

The call *is* the notification, and because the method's assignments are reactive,
one call updates every constraint that read the changed state. Event routing you
can't see — capture phases, propagation stops, a listener three components up — is a
class of bug this model simply doesn't have. ("The whole panel is clickable" is an
`onClick` on the panel itself, not a bubbled child event.)

## The keyboard

A **focused** view receives `onKeyDown`/`onKeyUp` like any other handler — right for
keys that belong to a particular widget. For app-level shortcuts that should work
regardless of focus, put a `Keys` member in the tree. It is a **source**: a non-visual
member, like a `Dataset` or a `Spring`, whose handlers are called by something outside
the tree. Its lifetime is the node's, so there is nothing to unsubscribe:

```declare
App [ width = 240, height = 100, fill = white, textColor = black,
    n: number = 0,
    keys: Keys [
        onKeyUp(e) {
            if (e.key == "ArrowUp") { app.n = app.n + 1 }
            else if (e.key == "ArrowDown") { app.n = app.n - 1 }
            },
        ],
    Text [ x = 20, y = 30, fontSize = 30, text = { `n = ${n}` } ],
    ]
```

Click the preview once, then use the arrow keys. The payload is a normalized key
event — `e.key` (`"ArrowUp"`, `"Escape"`, `"a"`), `e.code`, modifier flags — never a
numeric code. `Keys` is the *raw* stream: it fires even while a text field has focus,
so gate shortcuts on app state where that matters.

The other sources work the same way: `Focus` (`onFocusChange`, `onGeometry` — how the
library's focus ring follows focus), `Tip` (`onTip` — what the tooltip renders), and
`Frames` (`onFrame(dt)` — the frame heartbeat, above). Fan-out is by instance, which is
the point of their being members: a menu, a dialog, and a menubar each holding a `Keys`
member all hear the keyboard at once.

`Keys` and `Focus` each name one concept that you can either **ask** or **listen to** —
`Keys.isDown("KeyA")` and `Focus.focus(this)` are calls you make; `Keys [ onKeyDown … ]`
and `Focus [ onFocusChange … ]` are members that call you. You cannot listen to another
*view's* events — that is what calling a method is for.

## The standard library

You do not hand-build buttons outside of tutorials. The library ships a small set of
controls — themed, keyboard-ready, auto-included by bare tag:

| component | value | one line |
|---|---|---|
| `Button [ label, primary?, onClick() ]` | — | the action control; Space/Enter fires it |
| `Checkbox [ label, checked ]` | `checked: boolean` | box + mark + label |
| `Switch [ checked ]` | `checked: boolean` | sliding-thumb boolean |
| `RadioGroup [ value ]` + `Radio [ choice, label ]` | `value: string` on the group | one-of-N |
| `Slider [ value, min, max, step ]` | `value: number` | drag or arrow keys |
| `Field [ label, labelWidth ]` | — | a labeled row; nest your control inside |
| `ProgressBar [ value, min, max ]` | — | display-only |

Every control also takes `disabled` (inert and unfocusable — constrain it). The
library is small and actively growing — more controls are arriving — but what's worth
learning is not the catalog; it's the two contracts every control obeys, because they
are what your *own* components should obey too.

**Contract one: the value pattern.** A control's value is a plain reactive attribute,
used in one of three forms. *Standalone* — the control owns its state; read it by
name (`mute: Checkbox [ label = "Mute" ]` … `visible = { mute.checked }`).
*App-owned* — the truth lives elsewhere: **derive down, deliver up**:

```declare
App [ width = 360, height = 200, fill = { theme.bg },
    volume: number = 50,
    muted:  boolean = false,

    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Checkbox [ label = "Mute", checked = { app.muted },
            input(v) { app.muted = v },
            ],
        Slider [ value = { app.volume },
            input(v) { app.volume = v },
            disabled = { app.muted },
            ],
        ProgressBar [ value = { app.muted ? 0 : app.volume } ],
        Button [ label = "Reset", primary = true,
            onClick() { app.volume = 50; app.muted = false },
            ],
        ],
    ]
```

`checked = { app.muted }` derives the display; `input(v)` is the edit-delivery
channel, redirecting the control's edits into your state. The pair goes together — a
one-way binding *without* `input` leaves the control's edits fighting your
constraint. *Data-owned* — an editor bound straight to a datum with `<->` — is
[chapter 8](declare-docs:guide:data)'s form, for editors only, and the compiler
holds that line: point `<->` at a `Checkbox` and the error tells you a Checkbox is
not an editor, use `checked = { … }` + `input(v)`.

**Contract two: focus is provided.** Tab and Shift-Tab walk the controls, Space and
Enter activate, a click claims focus, and a traveling focus ring is injected into any
app that uses the library — disable or replace it via the theme. You declared none of
it.

## When there is no widget for it

There is no `Modal`, `Tabs`, or `Select` yet — and that is the normal case, not a
gap: **compose it, or define a class.** A tab bar is a row of views with `onClick`
and a selected state; a modal is a full-bleed view over a dimmed backdrop, shown by a
`State`. The library earns its place only where native behavior (caret, focus,
keyboard) is worth sharing; everything else is the composition you already know from
[chapter 4](declare-docs:guide:tree) — and the library's own source, written in
Declare, is readable proof there's no privileged component layer underneath.

---

**What you can now say:** you can make anything respond — pointer, drag, keyboard —
route behavior without invisible event plumbing, and wire real controls to real state
with the one value pattern that all of them share.

[Next: **Data is a place, not an event** →](declare-docs:guide:data)

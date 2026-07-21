# The Inspector — asking a running app why

The Inspector opens over any running Declare program and answers the question a
compiler cannot: **why does this value look like that?** Click a number and it shows
the expression that produced it, every input that expression read, and each of their
live values. Then you can type at it — set a slot, replace a constraint, add a view —
and watch the running program change.

It is the [Computed Styles](https://developer.chrome.com/docs/devtools/css) idea, for
a whole program instead of one stylesheet.

```
⌥⌘D            on any page
?inspect       on any program URL — http://…/apps/calendar/calendar.declare?inspect
               (?inspector is accepted too; a directory URL works — …/apps/calendar/?inspect)
```

It is itself a Declare program (`apps/inspector/inspector.declare`) reading another one
through the [introspection surface](declare-docs:operational:introspection). Opening it
never reloads or disturbs the app, and the app stays fully usable underneath: the
overlay takes no pointer events except where its own window is.

## The window

A floating, draggable, resizable window — not a docked panel, deliberately: docking
would reflow the app you are trying to explain, and you would be changing the geometry
under examination. Drag the title bar to move it clear of what you are picking at; drag
any edge or the corner to resize; drag the column seams and the divider above the
prompt to re-proportion the panes. **☾ / ☀** switches its own rendition, seeded from
your system setting.

## The three panes

**Tree** — the program's view tree, member name and component kind, with the
disclosure arrow on anything that has children. Hovering a row outlines that view *on
screen*. A dot marks an object with at least one constraint-owned slot; a `◈` marks one
a spring or animator is driving right now. Invisible views are dimmed rather than
hidden — the thing that *isn't* showing is usually what you came to find.

**Object** — the selected object, printed as Declare:

```declare
Ev [
  ▾ data = :16 fields          ← the record its `:field` reads land on
      :id = 490
      :title = "Canada Day"
    clip = true                ← set
    cornerRadius = 5           ⟵ constraint
    width = 206.857            ⟵ constraint
  ]
```

Each row says where its value came from — `⟵ constraint` (derived), `← set` (a handler
wrote it), or dim and unmarked (riding the class default, which is itself an answer).
Records, arrays and a `Dataset`'s value fold open one level at a time; a **View**-valued
slot is a link rather than an expansion, because the view graph is cyclic and one
subject at a time is what you want anyway. A view under a `datapath` leads with its
**data record**, since that is where its `:fields` actually read.

**Why** — for the selected slot: its live value, whether it is a constraint / set / a
default, **the authored expression and its line**, and every read-path with its current
value. Hovering a dependency outlines *that* view on screen, so you can see, in space,
what this number depends on. If a spring or animator is driving the slot, its target and
tuning appear here.

## Selecting things

**◎ select** arms the picker: move over the app and the view under the pointer is
outlined and named; click to select it; Escape cancels. It reports what a press would
*actually* reach, which is not always what you meant — a transparent view declared later
covers an earlier one for hit-testing, not only for paint, and this is the fastest way
to see that.

Or walk the Tree, or click a dependency in Why to jump to its target.

## Freezing motion

**⏸ freeze** takes the app's clock, so animation stops where it stands and a spring can
be read mid-flight. **⏭ frame** advances exactly one frame. **▶ resume** hands the clock
back. This is the same driven clock [`verify`](declare-docs:operational:verify) rung 5
uses to make motion assertions deterministic.

## Typing at it

The prompt at the bottom evaluates **in the scope of the selected object** — `parent`,
`classroot`, `app` and a replicated view's `:field` all resolve as they do in source.

| you type | what happens |
|---|---|
| `width` | reads the slot |
| `{ app.width / 2 }` | evaluates the expression here |
| `width = 700` | sets the slot |
| `width = { parent.width / 3 }` | **replaces the constraint** — the slot now tracks |
| `Text [ text = "hi", x = 20 ]` | instantiates a view into the selected object |

Mistakes come back as ordinary Declare diagnostics — the same message, code and named
fix you would get from the compiler. A `:field` that the record does not have is
refused, and the Inspector lists the fields it *does* have, rather than answering `null`
and letting you read an absent field as an empty one.

**Live edits are temporary.** A typed constraint or an added view lives in the running
program and does **not** survive a reload; the Why pane marks such slots
`live-bound · temporary`. There is no write-back to source — carry a value you like
back to the file yourself. Treat the Inspector as a probe and a tuning surface, not an
editor.

## Cost, and when not to reach for it

The Inspector loads the in-browser compiler (it needs it to evaluate what you type), so
on a page that has not already warmed it, first open fetches roughly a megabyte. That is
fine for a deliberate development action, but it makes this a development-time tool by
construction rather than something to leave in a shipped page. Pages served by the dev
server or the static deploy have warmed the compiler shortly after first paint anyway,
so it opens immediately there.

For scripted checks rather than interactive ones, use
[`verify`](declare-docs:operational:verify) rung 5, which drives the same surface with
no browser of your own to steer. For the API underneath both, see
[Introspection](declare-docs:operational:introspection).

## Limits

- **One subject at a time.** The Inspector points at a single app — the page's, or one
  embedded in an island (a live preview, a hosted app in a desktop window); opening it
  again on another re-points it rather than mounting a second Inspector.
- **No write-back to source**, by ruling — see above.
- **The tree is a snapshot on a short refresh**, not a subscription: the Inspector polls
  the subject rather than being woken by it, since the subject is not part of its own
  reactive graph.

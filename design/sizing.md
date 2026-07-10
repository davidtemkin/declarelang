# Declare sizing — content-extent, clamping, and the `readonly` modifier

A view's size is one of three things on each axis, chosen by what the source
says — nothing hidden, no layout "modes":

- **unset** → the axis **auto-sizes** to the bounding box of the view's visible
  children (the *auto-extent* derive, `view.ts`). Yields to a later write.
- **a constant** (`width = 300`) → fixed; never overwritten.
- **a constraint** (`height = { … }`) → whatever the expression computes.

Per-axis and independent: `width = 300` with `height` unset grows vertically at
a fixed width; `clip = true` clips children to the box, `clip` unset lets them
overflow. That already covers auto, fixed, grow-one-axis, and overflow-vs-clip.

## `contentWidth` / `contentHeight` — the extent as a value

The missing case was *clamped* sizing ("grow to a limit, then stop"; "at least
N"). It needs to read what the content *wants* to be, so the two read-only
intrinsics surface exactly that — the same bounding-box extent auto-extent
derives, always live:

```
height = { Math.min(contentHeight, 480) }               // grow to a cap, then stop
height = { Math.max(contentHeight, 200) }               // at least 200 tall
height = { Math.max(200, Math.min(contentHeight, 480)) } // clamp between
// + clip = true   to hide whatever overflows past the cap
```

They are **read-only** (a set is a compile error) and **loop-free** from a size
constraint: `extentOf` excludes percent-bound children on the derived axis — the
same cycle guard auto-extent uses — so `height` reading `contentHeight` never
depends on `height`. That's the whole matrix: **unset ⇒ auto · constant ⇒ fixed
· constraint over `content*` ⇒ any min/max/clamp · `clip` ⇒ overflow vs hidden.**
No `minHeight`/`maxHeight`/`overflow-x` attributes — clamping is arithmetic you
can read.

Reading `contentHeight` in a constraint is a textbook analyzable dependency
(constraints.md §2): one visible reactive read, plus a pure `Math.*` call that
adds none.

## The App fills its host by default

The rule above ("unset ⇒ auto-size to content") is right for an ordinary view,
but wrong for the **root**: the App is sized by its *host*, not by what happens to
be inside it. So `App` retargets the same auto-extent derive — an unset
`width`/`height` follows **`hostWidth`/`hostHeight`**, the App's enclosing extent,
fed reactively at mount (`index.ts`) — instead of the child bounding box:

```
App [ … ]                          // fills its host, resizes with it — no declaration
App [ width = 480, height = 320 ]  // fixed widget — an explicit size overrides the default
App [ width  = { Math.min(hostWidth, hostHeight * 1.6) },  // aspect-locked: a size that
      height = { width / 1.6 } ]                            //   is a function of the host
```

It's the *same* yielding-default derive the content path uses (`view.ts`
`App.bindExtent` over `View.bindExtent`), so a resize repaints like any other
dependency, and an explicit `width`/`height` overrides it exactly as it overrides
content auto-extent. This is why demo apps and the site read `App [ … ]` with no
size line — "the root fills its host" is the default, not boilerplate every app
repeats.

**`hostWidth`/`hostHeight` are read-only reactive intrinsics** — the exact parallel
of a View's `contentWidth`/`contentHeight`. One rule spans the whole system: *a
box's size defaults to a read-only extent — content for a view, host for the App —
and you override with a literal (fixed) or a constraint that may READ that extent.*
A set of `hostWidth` is a compile error (the runtime feeds it); you read it only
for the third shape above (aspect-locked / "as large as fits" apps).

In the common case you never name the host at all: because a filling app's
`width` *is* its host width, responsive reads key off **`app.width`** (a centered
column's gutter, a breakpoint font size) — the `app` noun reaches the root from any
depth. `hostWidth` is reserved for the rare app whose own box is a non-trivial
function of the host that `app.width` can't give (a pinned or aspect-locked app).

The host is the **window** for a top-level app and the **container element** (via a
`ResizeObserver`, box-relative pointer) for an embedded one — an app auto-detects
which at mount (`index.ts`), so "fill my host" is literal in both. Each preview on
the site is an embedded app filling its island.

## `readonly` — the general modifier

`contentWidth`/`contentHeight` are read-only because they're computed. That
read-only-ness is **not a framework privilege** — it's a modifier any class
declares with (schema.ts's principle: built-ins and user classes are one
mechanism). It mirrors TypeScript's `readonly` and means what TS means:

```
class Gauge extends View [
  value: number = 0,
  max:   number = 100,
  readonly percent: number = { value / max },   // consumers bind it; nobody sets it
]
```

A `readonly` attribute's value comes only from its declaration's default/
constraint. Assigning it — in `[ ]`, in a subclass, or imperatively — is refused
(the checker reports it; the runtime setter throws). This sharpens the constraint
model into two honest flavors:

- `x = { … }` — a constraint that is the *default*; a later write or subclass
  overrides it (it yields, as auto-extent does).
- `readonly x = { … }` — the constraint is *permanent*; nothing reassigns it.

Grammar: `readonly` is a contextual declaration modifier (like `prevailing`),
recognized only before a declaration head (`readonly name: Type = …`), so a
member literally named `readonly` still parses. A type annotation is required, as
for every declaration.

## Where it lives

parser (`AttrDecl.readOnly`) → schema (`ComponentSchema.readOnly` name list +
`isReadOnly` chain-walk; `ViewSchema` lists the two intrinsics) → check
(`checkAttr` refuses an assignment) → instantiate (`AttrSpec.readOnly`) →
attributes (the accessor's setter throws) → `view.ts` (the two getters over
`extentOf`). Covered by the `contentHeight`/`readonly` cases in `unit.test.mjs`.
See [[constraints]] for why a `Math.*` clamp is analyzable.

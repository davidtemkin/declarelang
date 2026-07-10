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

## The App fills its stage by default

The rule above ("unset ⇒ auto-size to content") is right for an ordinary view,
but wrong for the **root**: the stage is sized by its *host*, not by what happens
to be inside it. So `App` retargets the same auto-extent derive — an unset
`width`/`height` follows **`stageWidth`/`stageHeight`** (the hosting window's
viewport, fed reactively at mount by `wireStage`, `index.ts`) instead of the
child bounding box:

```
App [ … ]                         // fills its host, resizes with it — no declaration
App [ width = 480, height = 320 ] // an explicit size still wins (isSet skips the derive)
```

It's the *same* reactive derive the content path uses (`view.ts` `App.bindExtent`
over `View.bindExtent`), so a resize repaints like any other dependency, and an
explicit `width`/`height` overrides it exactly as it overrides content auto-extent.
This is why demo apps and the site read `App [ … ]` with no size line — the
near-universal "the root fills the window" is the default, not boilerplate every
app repeats. (`stageWidth`/`stageHeight` remain readable anywhere via `classroot`
for the cases that *do* key off the viewport — a centered column's gutter, a
responsive font size.)

Note the reference is the **window viewport**, not the mount element's box; they
coincide for a full-window mount and for an app in its own iframe (each preview
on the site is one), which covers current usage. Keying the stage to the mount
element (a `ResizeObserver` on the host) is the generalization for an app embedded
in a sub-region of a larger page — deferred until a real embed needs it.

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

# Declare Inspector — a live object browser

**Status:** spec, 2026-07-20. Nothing built. Scope for v1: **one top-level app**, inspected
by an Inspector that is itself a Declare app, in a floating window. The substrate
(`runtime/src/inspect.ts`, `window.__declare`) already exists and is load-bearing; this
spec covers the missing compiler entry points, four small runtime additions, and the
interface.

**On the name.** *Declare Inspector* — matching the family (Declare Calendar, Declare
Viewer, Declare Desktop) and using the exact word macOS, Chrome DevTools and React
DevTools already use, so a newcomer needs to learn nothing to know what it is. The
differentiator lives in the interface, not the name: the **Why** pane. (Considered and
set aside: *Lens* and *Scope* read as jargon; *Mirror* is historically apt — Bracha and
Ungar's reflection work — but reads as screen-mirroring today.)

## 1. What this is

A panel, opened from any running Declare app, that lets a developer:

- **click a thing on screen** and have it outlined, named, and selected;
- read that object **in Declare's own syntax**, with live values;
- ask of any slot **"why is it this value?"** — and get the constraint, its source, its
  file and line, and every dependency it read, each with its current value;
- **type Declare** at it: evaluate an expression, set a slot, install a new constraint on
  a live object, or add a view with a `[ ]` literal — with the result visible immediately,
  no reload.

The one-sentence pitch to a developer who has never heard of Smalltalk: **it is the
Computed Styles panel, for your entire program, and you can type into it.**

## 2. Why Declare can do this and React/Svelte cannot

`explain()` already returns, from the live desktop:

```js
> __declare.explain('app.dock.row.calIcon', 'width')
{ attr: "width", value: 146.58, set: false,
  constraint: { label: "DockIcon.width", static: true,
    deps: [ "this.root.iconEdge", "this.root.dockX", "this.parent.parent.hot",
            "this.root.width", "this.ix", "this.slots", "this.root.miniSpan" ] },
  spring: null }
```

That `deps` array is the **compile-time dependency graph, shipped to runtime and
queryable by name**. A signal-based framework cannot produce it: a signal knows its value,
not what source expression it is or which named paths it read. React DevTools can show you
props; it cannot tell you *why* a value is what it is, because that relationship does not
exist in React's source.

This is the strategic point. Static dependency extraction is usually sold as an
optimisation. Its larger payoff is **tooling**: the causal graph is an artifact, so the
system can explain itself. The Inspector is the interface to that fact.

## 3. Lineage, and how each idea is modernised

The target developer has never heard of Alan Kay, Smalltalk, or Lisp, and should never
need to. Each borrowed idea is presented in vocabulary they already have.

| Prior art | The idea | How it appears here |
|---|---|---|
| Smalltalk-80 **Inspector** | an object shows its own slots, live | the **Object** pane — but printed in Declare syntax, not a property grid |
| Self / Squeak **Morphic halos** | click a live object, get handles on it | the **picker** + on-screen outline; DevTools' element-picker metaphor, which they know |
| Smalltalk **doIt / printIt** | evaluate an expression *in the selected object's context* | the **evaluate strip** — Enter runs it, results print above; no new verbs to learn |
| **HyperCard** message box | one always-available line to talk to the running thing | same strip, always visible, never modal |
| **Glamorous Toolkit** moldable inspector | per-type custom views | v2 extension point (§8): a `Dataset` shows a table, a `Spring` a live curve |
| Bret Victor, *Inventing on Principle* | change it and see it now | live constraint install + clock scrubbing — presented as "edit without reload", no manifesto |
| Chrome **DevTools** | picker, `$0`, breadcrumb | deliberately mimicked so the muscle memory transfers |

What we deliberately **do not** import: the word "browser" (it means something else now),
"image", "workspace", "doIt", and the Smalltalk debugger's edit-and-resume (out of scope —
Declare has no call-stack model to resume).

## 4. Design principles

1. **Product-grade.** This is held to the same bar as Declare Calendar — typography,
   motion, restraint. A dev tool is not licence for a scrappy interface.
2. **The subject is the program, not the DOM.** We show views, slots, constraints. Divs
   are an implementation detail the developer never asked about.
3. **Causality over enumeration.** Any pane that lists values must be one click from
   *why*. This is the whole differentiator; it should never be more than one click away.
4. **One keystroke from any app.** If it is hard to reach, it becomes a thing people read
   about and never see.
5. **Never mutate the subject to observe it.** The Inspector mounts beside the app, never
   inside its tree.
6. **Coexist with DevTools.** Bridge to it (§9) rather than compete with it.

## 5. The interface

### 5.1 Shell — a floating window

The Inspector is a **floating, draggable, resizable window**, not a docked panel. A docked
panel reflows the subject app, which is unacceptable when the subject *is* the thing under
examination — you would be changing the geometry you are trying to explain. Floating also
lets the developer park it clear of the region they are picking at.

Its chrome is the desktop's window rendition (`apps/desktop/desktop.declare`'s `Window`
class) — title bar, traffic lights, drag by the bar, resize from every edge and corner.
Reasons: it is already designed and proven, it makes the tool feel native to the platform
it inspects, and it is a second consumer that will force the chrome out of `desktop.declare`
into a shared component rather than staying app-local (§6.3). A distinct tint or a narrower
bar may be used to mark it as chrome rather than content, but the interaction model should
be identical — a developer should not have to learn a second window.

Only the close light is meaningful in v1: there is nowhere to minimise to and no dock.
Zoom fills the viewport. Since there is exactly one Inspector window it is always the
active window, so the background-window resize interaction documented in
`desktop-vs-macos-web.md` §3 does not arise.

Toggled with **⌥⌘D**, or by adding `?inspect` to any program URL. Opening it never reloads
or disturbs the app. Window position and size are not persisted in v1 (§7).

A slim toolbar across the top of the window's content:

```
◎ Pick   app › dock › row › calIcon        ⌕ filter        ⏸ ⏭ ⟳ 1.0×      ⇱ expand all
```

- **◎ Pick** — the element picker. While armed, moving the pointer outlines the view under
  it; a click selects it and disarms. Escape cancels.
- **Breadcrumb** — the selected object's dotted path (`inspect().path`), each segment
  clickable.
- **⌕ filter** — filters the tree by member name or kind.
- **⏸ ⏭ ⟳ and a rate** — the driven clock (`clock.manual()`, `step(ms)`, `auto()`).
  Pause motion mid-spring and inspect it; step a frame at a time. This alone is worth the
  window for animation work.
- **⇱ expand all** — expands every disclosure in the focused pane (§5.2a).

### 5.2 Three panes

**Left — Tree.** The view tree from `inspect()`: a **disclosure triangle** (▸ / ▾) on any
view with children, member name in the app's accent, kind in muted text, indented,
virtualised. Hovering a row outlines that object on screen; clicking selects it. Two quiet
badges per row: a dot when any slot is constraint-owned, a motion glyph when a spring or
animator is currently driving one. Invisible views render at 45% opacity rather than being
hidden — you often need to find the thing that *isn't* showing.

**Centre — Object.** The selected object printed as Declare, which is the heart of the
design:

```declare
calIcon: DockIcon [                        desktop.declare:1091
    ix     = 4,
    name   = "Calendar",
    hue1   = #FFFFFF,
    width  = 146.58        ⟵ constraint · static
    height = 146.58        ⟵ constraint · static
    hovered = true         ← set
    y      = 12.4          ⟵ constraint  ◈ animating
    ]
```

Every row is `name = value` plus a provenance marker: `⟵ constraint` (owned by a
constraint), `← set` (written imperatively), nothing at all (riding the class default —
rendered dim, because "this is just the default" is itself an answer). `◈` marks a slot a
spring or animator is driving right now. Clicking any row fills the Why pane. Values are
live and update as the app runs.

### 5.2a Disclosure — the rule that keeps a cyclic graph finite

Slot values are not all scalars: `theme` is a record, `menus` is an array of records each
holding an `items` array of records, `miniLayout` is an array of records, a `Dataset`'s
`value` is arbitrary JSON, and `frontWin` is a **View**. The pane therefore renders a value
*tree*, with one rule that keeps it finite:

- **Records, arrays and JSON fold inline** behind a disclosure triangle:
  ```
  ▾ menus = array[6]
      ▾ 0 = { }
          id    = "brand"
          label = "Declare"
        ▸ items = array[5]
      ▸ 1 = { }
  ```
- **Views never fold inline — they are links.** `frontWin = FinderWindow ›` navigates the
  Tree pane's selection to that object. A view's graph is cyclic (`parent`, `children`,
  `frontWin`, `bornFrom`) and inlining it would either recurse forever or need the depth
  guard `safeAttr` already applies. Making views navigational instead of expandable is
  both finite by construction and the behaviour a developer expects — one selected subject
  at a time, with history.

**Expanding.** Click a triangle to toggle. **⌥-click expands the whole subtree** (the
Finder and DevTools convention, so it needs no discovery). The toolbar's **⇱ expand all**
applies to the focused pane. Depth is fetched **lazily**: `inspect()` today snapshots with
a depth cap of 4 and 64 array elements, which is right for transport but wrong for a
browser — see §6.1(5).

The same disclosure model serves the Why pane's dependency list and the evaluate strip's
printed results, so there is one interaction to learn and one component to build.

**Right — Why.** For the selected slot, the causal answer:

```
width  =  146.58                        DockIcon.width · static
────────────────────────────────────────────────────────────────
{ this.rest * (1 + 0.5 * Math.pow(Math.max(0, this.near * this.env), 2)) }
                                        desktop.declare:1125 ↗

depends on
   this.rest              48
   this.near              0.83        → app.dock.row.calIcon
   this.env               1.0         → app.dock            ⌖
```

- The **source expression**, syntax-highlighted with the existing `highlight()` and the
  Viewer's renderer — one highlighter, three consumers.
- **file:line**, clicking opens it in the Declare Viewer (`?viewer=reader`) at that line.
- **Every dependency with its current value.** Each row is clickable to navigate there,
  and hovering **⌖ outlines that view on screen**. This is the feature with no counterpart
  anywhere: *you see, in space, what this number depends on.*
- When a spring or animator drives the slot: target, stiffness, damping, and live progress.
- **Dependents** ("what moves if I change this") once reverse edges land (§6.1).

### 5.3 The evaluate strip

One line across the bottom of the panel, always available, always evaluating **in the
selected object's scope** — so `parent`, `classroot`, `app`, and a replicated view's
`:field` cursor all resolve as they do in the source.

```
app › dock › row › calIcon  ›  width = { parent.width / 3 }
```

Five things you can type, in ascending order of ambition:

| Input | Meaning |
|---|---|
| `width` | read — prints the live value |
| `{ app.width / 2 }` | evaluate an expression in this scope, print the result |
| `width = 700` | set the slot (imperative write, exactly as a handler would) |
| `width = { parent.width / 3 }` | **install a live constraint** on this slot — it now tracks |
| `Text [ text = "hi", x = 20, textColor = #FF0000 ]` | **instantiate a view** into the selected object |

Results print as a transcript above the strip; `↑`/`↓` walk history. A failed compile
prints the ordinary Declare diagnostic — same message, same code, same named fix as the
compiler gives everywhere else.

The fourth and fifth rows are what make this a Smalltalk descendant rather than a viewer:
**you are changing a running program without restarting it.** Tuning a spring or a
magnification curve stops being edit → save → reload → re-navigate, and becomes typing a
number and watching it.

### 5.4 The on-screen layer

Rendered in the overlay, never inside the subject app:

- **Outline** — a 1px accent rectangle on the hovered or selected view, with a small chip
  showing `DockIcon · calIcon` and `146 × 146`.
- **Dependency highlight** — when a dependency row is hovered in the Why pane, its view
  gets a second, distinct outline. Seeing "this width depends on *that* view over there"
  is the moment the language's model becomes visible.
- No box-model diagram: there is no box model. The space that would occupy is spent on
  the dependency relation instead, which is the thing Declare actually has.

## 6. Implementation plan

### 6.1 Phase 0 — runtime additions (small, no UI)

1. **`viewAt(root, x, y): View | null`** in `inspect.ts` — geometric hit-test over the
   tree in root space, topmost visible wins. The picker needs the view under the pointer
   whether or not it has handlers, so the input router's sink resolution is the wrong
   tool.
2. **`dependentsOf(root, path, attr): string[]`** — reverse edges, computed by walking
   owned slots and matching `wiredPaths`. O(slots) per query; fine at 1,950 slots, and
   cacheable per settle.
3. **Overlay mounting.** Two top-level apps on one page currently fight over the Focus and
   Keys singletons and `window.__declare` (`wireInput`). Add a third mode:
   `mountApp(app, host, backend, { chrome: true })` — wires environment and its own input,
   but never seizes the page focus root, the keys adapter, or the bridge. The Inspector
   mounts this way into a sibling host element of the app's own.
4. **Provenance carries source.** `explain().constraint` gains `source: string` (the
   expression text) and `pos: { file, line, col }`. Requires the compiled program to
   retain binding source spans — available in dev today (`stripPos` is a build flag);
   production builds keep stripping them and the Why pane degrades to label + deps.
5. **Lazy value expansion.** `inspect()` reduces values through `safeAttr`, capped at
   depth 4 / 64 elements with a `«…»` tag — correct for transport, wrong for a browser.
   Add `expandValue(path, attrPath, index?)` returning one level of a slot's value at a
   time, so the disclosure model (§5.2a) fetches on demand and a large `Dataset` costs
   nothing until opened.

### 6.2 Phase 1 — compiler entry point

The in-browser compiler currently exposes whole-program `compile`, `compileTracked`, and
`highlight`. The Inspector needs fragments:

5. **`compileFragment(src, opts): Fragment`** in the compiler, exposed through
   `compiler-client.js` and a new `{type:"compileFragment"}` worker message. It classifies
   the input and returns one of:
   - **expression** (`{ … }` or a bare path) → `{ kind: "expr", fn, deps, diagnostics }` —
     the same body-compilation and dep-extraction path every `{ }` slot already takes.
   - **assignment** (`name = value`) → `{ kind: "set", attr, fn|value }`.
   - **binding** (`name = { … }`) → `{ kind: "bind", attr, fn, deps }`.
   - **view literal** (`Tag [ … ]`) → `{ kind: "view", node }`, a program node.

   Scope is supplied as the *shape* of the target (its class, its ancestors' names, whether
   it has a data cursor) so `this`, `parent`, `classroot`, `app` and `:field` resolve and
   typecheck against the real object.

6. **`bindLive(node, attr, fn, deps)`** in the runtime — install a constraint on a live
   slot, replacing any current owner, wired to the extracted deps. This is the existing
   binding machinery with a runtime entry point.

7. **`instantiateInto(parent, node, props?)`** — realise a compiled view node as a child of
   a live view. `App.createView(tag, parent, props)` already covers the flat case; this
   generalises it to a nested `[ ]` literal.

### 6.3 Phase 2 — the Inspector app (Declare)

`apps/inspector/inspector.declare`, structured as: `InspectorWindow`, `Toolbar`,
`TreePane`, `ObjectPane`, `WhyPane`, `EvalStrip`, `Overlay`, plus one shared
`Disclosure`/`ValueTree` component serving all three panes (§5.2a). It reads the subject
through the bridge API — never by reaching into its objects directly — so the same app can
later inspect a subject in another frame or process with only the transport changing.

**Extract the window chrome first.** The Inspector is the second consumer of the desktop's
`Window` class, which is the right moment to lift it out of `desktop.declare` into a shared
component (`library/window.declare` or `apps/shared/`) rather than copying it. The desktop
keeps its subclasses (`FinderWindow`, `AppWindow`, …); the Inspector adds its own. Doing
this as a copy would guarantee drift between two window renditions in the same distro.

Reuse elsewhere, not reinvention: `highlight()` for the source pane, the Viewer's segment
renderer for its display.

### 6.4 Phase 3 — integration

8. **Chrome custom formatter.** Register `window.devtoolsFormatters` so `console.log(view)`
   prints `DockIcon calIcon [ width = 146.58 ⟵ constraint, … ]`, expandable, instead of a
   DOM-ish blob. Cheap, and it meets people where they already are.
9. **`$v`** — the currently selected object exposed as a console global, mirroring `$0`.
10. **Reveal in Elements / reveal from Elements** — a command that selects the DOM node
    realising a view, and its inverse. This is the bridge that makes DevTools a partner
    rather than a rival, and it is exactly the mapping that was missing when this
    repository's own desktop was being tested.

### 6.5 Deferred (v2+)

Embedded child apps (a desktop hosting real apps wants to inspect *into* an island);
moldable per-type views; time-travel over the driven clock; editing a *class* rather than
an instance and having live instances follow; the Inspector inspecting itself.

## 7. Open questions

- **Positions in production.** The Why pane is much weaker without source text. Do we ship
  a `--positions` build flag, fetch the `.declare` source and re-derive spans, or accept
  degradation off dev? Fetching the source is attractive: the static deploy already serves
  it as the source of truth.
- **REPL scope for replicated views.** A `datapath` view's `:field` resolves against a data
  cursor. Binding that correctly in the evaluate strip is the fiddliest part of Phase 1.
- **Tree cost.** 585 nodes and 1,950 owned slots on the desktop; the tree must virtualise
  and throttle rather than re-derive per frame.
- **Constraint install and the static path.** A live-bound constraint is by definition not
  compiler-wired. The Why pane must mark it `static: false` honestly, so a developer is
  never misled into thinking a typed-in constraint has the same standing as a compiled one.
- **Window position/size are not persisted.** Each session opens at a default placement.
  Cheap to add later via the host; deliberately out of v1 along with everything else that
  needs a durable channel.

### 7.1 Ruled out for v1: apply-to-source

Live edits — a set, an installed constraint, an added view — **do not survive a reload and
there is no "apply to source" action.** v1 has no persistence channel, and inventing one
here would mean the Inspector writing `.declare` files, which is a much larger design
(round-tripping formatting, reconciling a live instance edit against a *class* definition,
and an editing authority question that belongs with the language, not with a tool).

The consequence must be stated plainly in the interface rather than left to be discovered:
the evaluate strip's transcript marks live-bound slots as **temporary**, and the developer
is expected to carry a good value back to source by hand. Treat the Inspector as a
**probe and a tuning surface**, not an editor. Edit-the-image is a real and attractive
direction, and it deserves its own ruling later — not a side effect of this spec.

## 8. What this replaces, and what it does not

**Replaces, for Declare work:** the Elements panel (you inspect views, not divs); Computed
Styles (`explain()` is the analogue and strictly better — causal, not cascade); component
devtools; and a large share of `console.log`-for-state.

**Does not replace:** Network, Performance and flame charts, Memory, Coverage, Lighthouse,
Application/storage/service worker, Security — none of which are about the program's
object graph. Nor breakpoint debugging inside `{ }` bodies: those are ordinary JavaScript
and the Sources panel remains the right tool.

**Coexists with `console.log`.** Bodies are TypeScript; logging works and should keep
working. The Inspector is for *state and causality*; `console.log` remains the fastest way
to answer *did this run*. The formatter (§6.4) and `$v` make the two directions cheap.

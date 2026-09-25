<!-- nav: Glossary -->
<!-- part: Appendix -->

# Glossary

Declare gives ordinary words specific meanings, and uses one word per idea. This page is
that list: the term, what it means, and where the guide teaches it. When two words seem to
name the same thing, the one here is the one the platform means.

## The model

- **constraint** — an attribute value written in `{ }`: an expression the runtime
  re-evaluates when, and only when, something it reads changes, and keeps true from then
  on. The word for every `{ }` value. → [Constraints](declare-docs:guide:constraints)
- **relationship** — the plain-English gloss for a constraint: "a standing relationship
  the runtime keeps true." Not a separate mechanism.
- **derive** — the verb for writing a constraint: a value *derives from* what it reads.
- **binding** — reserved for data: **data binding** is pointing views at data with
  [`datapath`](declare-docs:Node.datapath) and `:path`; **two-way binding** is `<->`, a text field editing a record.
  A one-way `{ }` is a constraint, not a binding. → [Data](declare-docs:guide:data)
- **attribute** — a named value on a component, set (`width = 300`) or declared
  (`count: number = 0`). **Declared** attributes are how state enters a program.
- **formula** — a declared attribute whose default is a `{ }`: it reads as the expression
  until something assigns it, and an assignment replaces it. Contrast a *set* constraint
  (`width = { … }`), which refuses a direct write. → [Constraints](declare-docs:guide:constraints)
- **fact** — a value the runtime writes and a program only reads: [`hovered`](declare-docs:View.hovered), [`scrollY`](declare-docs:View.scrollY),
  [`contentWidth`](declare-docs:View.contentWidth), `loaded`, `arrived`. Assigning one is a compile error.
- **settle** — the update step. A handler's writes are applied together when it returns:
  constraints re-evaluate, views appear and leave, layouts place, sizes update, as one step
  run to completion. Nothing paints in the middle of one. → [Constraints](declare-docs:guide:constraints)
- **provided value** — a value an ancestor makes available to its subtree, read with
  `provided("name")`. The text face and `theme` work this way, and so can your own
  declared attributes. → [Paint and themes](declare-docs:guide:paint-and-themes)
- **text face** — the five provided text attributes: [`fontFamily`](declare-docs:Text.fontFamily), [`fontSize`](declare-docs:Text.fontSize),
  [`fontWeight`](declare-docs:Text.fontWeight), [`textColor`](declare-docs:Text.textColor), [`letterSpacing`](declare-docs:Text.letterSpacing). Distinct from a **[`Face`](declare-docs:Face)**, one file of a
  [`Font`](declare-docs:Font).
- **theme** — the token record a program provides once. A **preset** is a library theme
  ([`SanFrancisco`](declare-docs:SanFrancisco), [`Cupertino`](declare-docs:Cupertino), [`MountainView`](declare-docs:MountainView), [`Redmond`](declare-docs:Redmond), each with a `…Dark`); the
  **house look** is what renders when nothing provides one.
- **style** — a top-level `style Name [ … ]`: a named record of literal text attributes
  that a run of prose, or a drawn run, wears by name. → [Text and fonts](declare-docs:guide:text)

## The tree

- **component** — anything a capitalized tag creates: [`View`](declare-docs:View), [`Button`](declare-docs:Button), your own class.
- **class** — how a component is defined: `class Name extends Base [ … ]`. A class with no
  `extends` is a [`Node`](declare-docs:Node). → [Components and the tree](declare-docs:guide:components)
- **control** — an interactive component with a value and a place in the keyboard focus
  order; the library's controls, and any class extending [`Control`](declare-docs:Control). → [Controls](declare-docs:guide:controls)
- **member** — anything declared inside `[ ]`: an attribute set or declared, a method, a
  handler, a child. Inside a [`Table`](declare-docs:Table), the word also names what a selection holds.
- **model class** — a class that does not extend `View`: state and behavior with no pixels.
  It may stand on a record of its own with a `datapath`. → [Data](declare-docs:guide:data)
- **non-visual member** — a child with no pixels that lives and dies with its node: a
  [`Dataset`](declare-docs:Dataset), [`DataSource`](declare-docs:DataSource), [`Spring`](declare-docs:Spring), [`Animator`](declare-docs:Animator), [`Time`](declare-docs:Time), [`Keys`](declare-docs:Keys), [`Focus`](declare-docs:Focus), a stream, a
  model.
- **classroot** — the instance of the class being defined, reachable from any depth inside
  its body.
- **use site** — where a component is instantiated. It configures the component through
  attributes and content, never by redeclaring its named children.
- **retire** — a view's presence ending: its record leaves the data or it is discarded,
  and `onRetire` fires once. A virtualized row scrolling out of view does not retire.
- **island** — a leaf view whose interior is foreign: [`DOMIsland`](declare-docs:DOMIsland) holds host-managed DOM,
  [`AppIsland`](declare-docs:AppIsland) holds another Declare program (the **tenant**). Values cross by name —
  [`provides`](declare-docs:DOMIsland.provides) / `hostProvided` down, [`exposes`](declare-docs:App.exposes) / [`exposed`](declare-docs:App.method.exposed) up — and messages cross with
  [`post`](declare-docs:App.method.post) / `onPost`. → [Embedding](declare-docs:guide:embedding)
- **inline view** — a real view placed in rich text by a tag naming one of the program's
  view classes. → [Text and fonts](declare-docs:guide:text)

## Data

- **dataset** — a node holding a JSON document: embedded, derived (`contents = { … }`), or
  fetched (`DataSource`). Its `value` is read-only; it changes through [`set`](declare-docs:Dataset.method.set), [`insert`](declare-docs:Dataset.method.insert),
  [`removeAt`](declare-docs:Dataset.method.removeAt) and [`move`](declare-docs:Dataset.method.move).
- **cursor / datapath** — the place in a dataset a node and its descendants read relative
  to, set by `datapath`. Any node may have one.
- **record** — the datum at a cursor.
- **`:path`** — a read of a field of the record, relative to the cursor (`:title`,
  `:owner.name`). In a handler, `:field = v` writes it. `:@` is the record itself, and
  `[( expr )]` a key computed by TypeScript (`:@[(field)]`).
- **replication** — one instance per record, produced by a `datapath` ending in `[]`. The
  replacement for generating views from code. Only views replicate.
- **identity** — which instance belongs to which record: the record's `id` by convention,
  `key = :field` otherwise.
- **derived dataset** — a dataset whose document is a constraint over other data: the view
  model. Write the raw truth, not the derivation.
- **schema** — a top-level `schema Name [ … ]`: the shape of data a program relies on, a
  real type, checked by the compiler where it can see and by the runtime at every
  boundary. → [Typed data](declare-docs:guide:schemas)
- **edit session** — a text field's draft under `<->`: [`commitOn`](declare-docs:Editor.commitOn), `validate`, and the
  facts [`valid`](declare-docs:Editor.valid), `error` and [`dirty`](declare-docs:Editor.dirty).
- **stream** — [`EventStream`](declare-docs:EventStream) or [`Socket`](declare-docs:Socket): a source of messages over a live connection,
  connected while `active` is true.
- **virtualize** — build only the instances near the viewport and leave the rest logical.
  → [Large collections](declare-docs:guide:collections)

## Space and motion

- **layout** — the attribute that arranges a view's children; a [`Layout`](declare-docs:Layout) subclass. What a
  layout places, the child does not declare. → [Size, position and layout](declare-docs:guide:layout)
- **content box** — a view's box less its own [`padding`](declare-docs:View.padding): what `x = 0`, `100%` and
  `x = center` are measured in. `{ parent.width }` names the parent's own box instead.
- **padding** — an attribute of the view, not of its layout: the inset between the box and
  the room its children live in. One value or four, clockwise from the top.
- **one-geometry rule** — painting, clicking, layout and sizing all see the same
  transformed box, so a scaled or rotated view is the same size to every reader.
- **scroller** — a view whose [`scrolls`](declare-docs:View.scrolls) axis carries its content. An [`App`](declare-docs:App)'s scroller is
  the page. → [Scrolling](declare-docs:guide:scrolling)
- **Spring** — drives an attribute toward a live target with physics; interruptible by
  construction. **Animator** — drives an attribute from one value to another over a time.
  → [Motion and states](declare-docs:guide:motion)
- **arrived / running** — the facts a spring or animator keeps: in flight, and landed on
  its own at its destination.
- **State** — a named bundle of attribute overrides applied while a condition holds and
  reverted exactly when it lifts.
- **change event** — `onChange` with [`trackChanges`](declare-docs:Node.trackChanges): the rare handler for acting once when
  a value crosses into a new state. → [Time and change events](declare-docs:guide:time)
- **afterDelay** — `afterDelay(ms, fn)`: run `fn` once, later, never in the frame that
  asked. The wait belongs to the node whose handler asked and goes when it goes; the
  handle's `cancel()` drops it sooner. A repeating call is a `Time` with a period
  (`tick = 5000`). → [Time and change events](declare-docs:guide:time)

## Input

- **raw and resolved** — the two pointer layers. Raw handlers (`onPointerDown`, `…Move`,
  `…Up`, the touch family, `onWheel`) report what the pointer did, for manipulation.
  Resolved handlers (`onClick`, `onDblClick`, `onHold`) report what the user meant, for
  commands. → [Pointer and keyboard](declare-docs:guide:pointer-and-keyboard)
- **capture** — a press that began on a view stays that view's until release.
- **claim** — what declaring a handler takes from the browser on a touch screen: exactly
  the gesture that handler needs. → [Touch and gestures](declare-docs:guide:touch)
- **hot / down** — a control's hover and press, gated by `disabled`, with keyboard
  activation folded into [`down`](declare-docs:Control.down).
- **focus-visible** — focused, with the focus arrived by keyboard; what a focus ring shows
  for.
- **light-dismiss** — an overlay closes on a press outside it, and that press is
  swallowed. **Dismiss first, deliver second.** → [Menus, dialogs and overlays](declare-docs:guide:overlays)
- **opener** — the view a menu was opened for; read it in `items` so one menu serves many
  places.

## Location

- **location** — the app's slice of the URL, one two-way reactive string: its shareable
  coordinates. → [URLs, links and history](declare-docs:guide:urls)
- **waypoint** — location's twin that the Back button retraces and the URL never shows.
- **the stranger test** — would you hand this value to a stranger? Yes: [`location`](declare-docs:App.location). No, but
  Back should undo it: [`waypoint`](declare-docs:App.waypoint). Neither: an ordinary attribute.
- **anchor** — a named place inside a destination (`anchor = "story"`, or a heading in
  rendered prose), linked as `#story` and carried in the URL as `@story`.
- **arrival** — a navigation landing: the reference resolved to the view it names, once
  that view exists. A **traversal** is the same landing reached by Back or Forward.

## The toolchain

- **checker** — the compile-time type checker that runs on every `{ }` body, every
  compile.
- **declare-verify** — the six-rung check: parse, resolve, typecheck, boot, behavior,
  pixels. → [Running and checking](declare-docs:guide:run-and-check)
- **declarec** — the packager: one program into a self-contained static folder.
  → [Packaging for production](declare-docs:guide:packaging)
- **the crawl** — the build booting the program headlessly at every location to emit the
  document crawlers read.
- **renderer / host** — a renderer paints a program (DOM, canvas, native layers); a host
  runs it (the browser, the Mac app). → [Renderers and hosts](declare-docs:guide:renderers)

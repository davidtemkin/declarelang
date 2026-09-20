<!-- nav: Comparatives -->
<!-- part: Appendix -->

# Comparatives — your reflex, and the Declare answer

You already know how to build interfaces somewhere else. That knowledge is worth
something here: you know what a card is, what a disclosure feels like, when a list
wants to virtualize. What does not carry over is the *machinery* — and the fastest way
to write bad Declare is to reach for the machinery you have and translate it
mechanically.

So this appendix is a phrasebook, not a mapping. Each row names a reflex from another
stack and says what the same intention is called here. Read the right-hand column as the
whole answer: it is not "the Declare equivalent of X", it is what you write instead, and
in several rows the honest answer is *nothing* — the problem the reflex solves does not
arise. Where a row names something, the reference has it in full
(`node tools/declare-help.mjs <name>`), and the chapter it belongs to teaches it
properly.

One thing holds under every table. A `{ }` value is a **constraint**: the runtime
re-evaluates it when, and only when, something it reads changes, and keeps it true from
then on. Handlers only assign attributes; every constraint that reads them follows. There
is no render pass to schedule, opt out of, or memoize around, and that single fact is
what dissolves most of the left-hand columns below.
→ [Relationships](declare-docs:guide:relationships)

## React

| your reflex | the Declare answer |
|---|---|
| `useState` | a declared attribute, on the node it belongs to: `count: number = 0` |
| `useMemo`, derived state | a `{ }` constraint: `total = { count * price }` — no dependency array, and no staleness to reason about |
| controlled input (`value` + `onChange`) | `text <-> :title` on a leaf editor — the one arrow in the language that writes |
| `useContext` / a provider | `provided("name")`; *providing* is just holding the value on an ancestor |
| `items.map(…)` | `datapath = :items[]` on the node — one instance per record, reconciled for you |
| `key={…}` | the record's `id`, by default and with nothing declared; `key = :field` when identity lives under another name |
| `cond && <Thing/>` | `visible = { cond }` — the view stays constructed and keeps its state; it just paints and hit-tests nothing |
| `useRef` | there are no refs: a named member **is** the handle. `box: View [ … ]`, then `box.width` from anywhere in scope |
| `useEffect` | usually nothing — propagation is the constraint graph's job. `onReady` for the first settle, `afterSettle(…)` for work that must *read* geometry your write just created, `onRetire` for teardown |
| a flex container | `layout: SimpleLayout [ axis = y, spacing = 10 ]` — an attribute of the container, not a wrapper |
| `padding: 16` | `padding = 16` on the view itself — no wrapper, no style object, and a child's `width = 100%` is the room *inside* it |
| `useMediaQuery`, a breakpoint hook | a `ResponsiveLayout` plan: `{ from: 600, flow: "row", share: { … } }` |
| `framer-motion`, a CSS transition | `Spring [ attribute = x, to = { … } ]` to follow a moving target, `Animator` for a timed run, `State` for a bundle that snaps on and off together |
| styled-components, Tailwind classes | attributes on the view — `fill`, `cornerRadius`, `stroke`, `shadow`, `opacity` — with shared values in a `theme` read by `provided("theme")` |

```declare-fragment
count: number = 0,
total: number = { count * 4 },
onClick() { count = count + 1 }
```

**The structural difference: there is no rebuild-and-diff.** React's model is that you
describe the whole UI as a function of state, run it again on every change, and let a
diff find what moved. Declare never runs your tree again. The compiler reads each `{ }`
body — *through* the methods it calls — and extracts its dependencies statically, so the
runtime knows which cells feed which expressions before the program starts and
re-evaluates exactly those. That is why there is no `useMemo`, no dependency array, no
`React.memo`, and no "why did this re-render": nothing re-renders, so nothing has to be
prevented from re-rendering.

The consequence worth internalizing is where your state lives. Because a descendant reads
an ancestor by name (`app.count`, `parent.width`, `classroot.label`), there is no props
plumbing and no reason to lift state — declare it where it belongs and read it where you
need it. `provided(…)` is for values a whole subtree should inherit without being asked
for, which is a narrower job than React context usually ends up doing.

## HTML and CSS

| your reflex | the Declare answer |
|---|---|
| `<div>` | `View [ … ]` — a box with a `fill`, or nothing at all |
| a stylesheet rule, a class name | none: every visual value is an attribute on the view it affects. A repeated look is a **class** in the component sense — subclass `View` and set the attributes once |
| a CSS custom property | a `theme` token, read with `provided("theme").accent` |
| `display: flex` | `layout: SimpleLayout [ axis = x, spacing = 12 ]` |
| `flex-wrap` | `WrappingLayout` |
| `padding` | `padding` on the view — it gives the view a **content box**, and every child's `x = 0` is that box's origin, arranged or absolutely placed alike |
| `box-sizing` | there is no second model: `width` is always the outer box, and `padding` and `stroke` are always inside it — `border-box`, with nothing to set |
| `width: 100%` | `width = 100%` — a percent of the parent's **content box**, as in CSS, so it already stops inside the parent's padding. `{ parent.width }` is the escape hatch that means the parent's literal box |
| `margin` | the parent's own `padding`, the layout's `spacing`, or the child's own `x`/`y` |
| `position: absolute` | the default — a view sits at its `x`/`y` in its parent unless a `layout` is arranging it |
| `position: fixed` | `ignoreScroll = true` |
| `z-index` | source order: a later sibling draws above an earlier one |
| `@media (min-width: …)` | a `ResponsiveLayout` plan, `{ from: 600, … }`; `share: 0` drops a child at a width |
| `:hover`, `:active` | the `hovered` and `pressed` facts, read in a constraint: `fill = { pressed ? … : hovered ? … : null }` |
| `transition`, `@keyframes` | `Spring` and `Animator` |
| `overflow: auto` | `scrolls = y` (an `App` already scrolls `y`) |
| `border` | `stroke(width, color)` — drawn **inside** the box, so it never changes the layout rectangle |
| `border-radius`, `box-shadow` | `cornerRadius`, `shadow(dx, dy, blur, color)` |
| a card/button from a CSS framework | the library's own components, and `Card` for the card case |

```declare-fragment
row: View [ width = 100%, height = 44, fill = { hovered ? 0xEEF2F6 : null },

    layout: SimpleLayout [ axis = x, spacing = 12 ]
    ]
```

**The structural difference: there is no cascade and no stylesheet.** Nothing at a
distance sets a value on a view; the value is written on the view, or inherited by the one
explicit mechanism — `provided(…)`, which the text face and the theme use. Specificity,
selector order, `!important` and "which rule won" have no analogue, because there is only
ever one place a value comes from.

The second surprise is the default. HTML's default is flow layout, and absolute placement
is the thing you opt into; here it is exactly the other way round. A view with no `layout`
places its children at their own `x`/`y` — that is the base case, and it is right for a
diagram, an overlay, a badge on a corner. Arranging is a *job*, done by a `Layout` you
attach to the container. So the CSS instinct "wrap it in a flex container and let the
box model sort it out" becomes "give the container a layout, and let it own the slots" —
and a child that must stay put inside one says `ignoreLayout = true`.
→ [Space](declare-docs:guide:space)

## SwiftUI

| your reflex | the Declare answer |
|---|---|
| `@State` | a declared attribute: `expanded: boolean = false` |
| a computed `var body` value | a `{ }` constraint on the attribute itself |
| `@Binding` | usually just a constraint reading the owner (`checked = { app.muted }`) plus an `input` override; `<->` when the destination is a place in data |
| `@Environment`, `@EnvironmentObject` | `provided("name")` |
| `ForEach` | `datapath = :items[]` |
| `if` inside a `ViewBuilder` | `visible = { … }`, or a `State` whose body holds a conditional subtree |
| `@FocusState`, a view identity you hold onto | a named member; `Focus` for keyboard focus |
| `onAppear` / `onDisappear` | `onReady` (App, first settle), `onRetire` (a view's presence ending) |
| `VStack` / `HStack` | `layout: SimpleLayout [ axis = y ]` / `[ axis = x ]`, with `spacing` and `align` |
| `Spacer()` | `Spacer [ ]` — same idea, same name |
| `.padding(16)` | `padding = 16` on the view — a slot, not a wrapper, so there is no before-or-after-`.background()` to get right: the fill covers the inset either way |
| `.frame(maxWidth: .infinity)` | `width = 100%` — the parent's content box, so inside a padded parent it already stops at the inset |
| size classes, `GeometryReader` | read the geometry directly (`parent.width`, `contentHeight`) — it is always available, no reader view required; `ResponsiveLayout` for whole arrangement changes |
| `withAnimation`, `.animation(…)` | `Spring` on the slot that moves; one spring per motion, with everything else constrained to its value |
| a chain of `.foregroundColor(…).background(…)` | the attributes themselves: `textColor`, `fill`, `cornerRadius`, `stroke`, `shadow` |

```declare-fragment
card: View [ width = 220, cornerRadius = 8, fill = #FFFFFF, shadow = shadow(0, 1, 3, #00000022),

    title: Text [ x = 12, y = 10, fontWeight = medium, text = "Card" ]
    ]
```

**The structural difference: attributes, not modifier chains.** A view's configuration is
a set of named slots, not a pipeline — so there is no order to get right, no wondering
whether `.padding()` goes before or after `.background()`, and no wrapper view
materializing between the one you wrote and the one you meant. Everything you set stays
visible in the header line of the thing it describes.

The second difference is that **layouts are classes, and you are expected to write
them.** SwiftUI gives you a fixed vocabulary of stacks and grids and pushes the unusual
case into `GeometryReader` arithmetic. Here `layout` is a reactive attribute holding a
`Layout` instance; the library ships `SimpleLayout`, `WrappingLayout` and
`ResponsiveLayout`, and when an arrangement is genuinely yours you subclass `Layout` and
override `place()` — the same seam every library layout is built on. Reaching for a
`Layout` subclass is normal practice, not an escape hatch.
→ [Make your own](declare-docs:guide:make-your-own)

## Jetpack Compose

| your reflex | the Declare answer |
|---|---|
| `remember { mutableStateOf(0) }` | a declared attribute: `count: number = 0` — no remember, no key, and no scope it can fall out of |
| `derivedStateOf` | a `{ }` constraint: `total = { count * price }` |
| `rememberSaveable` | no equivalent: there is no state-restoration mechanism, and a value that must outlive the process is yours to store |
| `CompositionLocal`, `CompositionLocalProvider` | `provided("name")` — and *providing* is holding the value on an ancestor, not wrapping the subtree in anything |
| `Modifier.padding(16.dp)` | `padding = 16` on the view — one slot, so a padding "before" and a padding "after" `background` are the same thing: the fill is always the full box |
| `Modifier.fillMaxWidth()` | `width = 100%` — the parent's content box, the inset already taken off |
| `Column` / `Row` | `layout: SimpleLayout [ axis = y ]` / `[ axis = x ]` on the container |
| `Box` | a plain `View` — children at their own `x`/`y` is the base case, with no layout attached |
| `Modifier.weight(1f)` | there is no weight: constrain the child's width, let `Spacer [ ]` absorb the slack, or divide the width by percentage with a `ResponsiveLayout` plan's `share` |
| `LazyColumn` / `LazyRow` | `datapath = :items[]` on the node, plus `virtualize` when the collection is large |
| `items(list, key = { it.id })` | the record's `id`, with nothing declared; `key = :field` to name another |
| `Modifier.clickable { }` | an `onClick()` handler on the view itself |
| `animateFloatAsState`, `animateDpAsState` | `Spring [ attribute = x, to = { … } ]` — it follows a live target and sleeps at rest |
| `AnimatedVisibility` | `visible = { … }` with a `Spring` on `opacity` (the view persists, so nothing is torn down and rebuilt), or a `State` bundle that snaps a set of overrides together |
| `updateTransition`, `Animatable` | `Animator` — a timed `from`→`to` run on a `motion` curve |
| `LaunchedEffect(key)` | usually a constraint. `onReady` for the first settle; `onChange` with `trackChanges = [ … ]` when a change is genuinely an event the program must act on |
| `DisposableEffect` | `onRetire` |
| `MaterialTheme`, `MaterialTheme.colorScheme` | `theme Name [ … ]` set on an ancestor, read anywhere below with `provided("theme")` |
| `Modifier.background(…)`, `.clip(…)` | `fill`, `cornerRadius`, `clip` — named slots on the view, set in any order |
| `BoxWithConstraints` | `parent.width` and friends, read directly in any `{ }` |
| recomposition, `@Stable`, `@Immutable`, skipping | there is none — no recomposition scope, no stability to annotate, and nothing to skip |

```declare-fragment
panel: View [ width = 100%, fill = { provided("theme").surface },
    padding = 16,

    layout: SimpleLayout [ axis = y, spacing = 8 ]
    ]
```

**The structural difference: there is no recomposition.** Compose's unit of work is a
composable function, re-invoked when the state it read changes, with the runtime skipping
subtrees whose inputs it can prove stable. Declare's unit is the **attribute**. The
compiler extracts each `{ }` body's dependencies statically — through the methods it
calls — so the runtime re-evaluates one slot, not a function body, and never calls your
tree again. That removes the whole apparatus around recomposition: no `remember` to keep
a value across invocations (nothing is re-invoked), no positional memoization to reason
about, no stability annotations, no "why did this recompose".

The second difference is that `Modifier` has no counterpart. A chain is a pipeline, so its
order is semantic and a padding before a background means something different from a
padding after it; here `padding`, `fill` and `cornerRadius` are named slots on the view,
and setting them has no order at all. What a shared `Modifier` is for — one look, applied
in many places — is a subclass that sets those attributes once, or a `theme` token that
several views read. → [Style is state](declare-docs:guide:style)

## Svelte

| your reflex | the Declare answer |
|---|---|
| `let count = 0` and assignment, or `$state(0)` | a declared attribute: `count: number = 0`. Every attribute is a reactive slot already, so there is no rune to opt a value into and no distinction between a plain local and a reactive one |
| `$derived(…)`, or a `$:` reactive assignment | a `{ }` constraint: `total = { count * price }` |
| `$:` as a *statement* | usually nothing at all — see below |
| `$effect` | `onChange` with `trackChanges = [ … ]` when a change is an event the program must act on; `afterSettle(…)` when the work is irreducibly a reading of new geometry |
| `$props()`, `export let` | the attributes the class declares; the instance site sets them by name |
| `bind:this`, a component reference | the child's own name — there are no refs. A slot typed by a component class (`panel: Menu = null`) holds an instance |
| a `writable` store, `$store` | an attribute on the `App` or any common ancestor, read by its path (`app.count`); a `Dataset` when the shared thing is a JSON collection |
| `setContext` / `getContext` | `provided("name")` |
| `{#each items as item (item.id)}` | `datapath = :items[]` on the node — one instance per record, keyed by `id`, or `key = :field` |
| `{#if …}` | `visible = { … }` — the subtree stays constructed and keeps its state |
| `{#await promise}` | a `DataSource` and its own facts: `loading`, `loaded`, `failed`, `status` |
| `bind:value` | `<->`, on a leaf editor only: `TextInput [ text <-> :title ]` |
| `on:click` | an `onClick()` handler on the view. Nothing bubbles and there is no dispatcher: a child tells its owner by calling a method on it |
| `transition:fade`, `in:` / `out:` | a `Spring` on `opacity` — the view persists rather than being removed, so there is no outro to coordinate; `Animator` for a timed run, `State` for a bundle of overrides that snaps on and off together |
| `class:` and `style:` directives | the attributes themselves — `fill`, `textColor`, `cornerRadius`, `opacity` |
| `use:action` | no equivalent: there is no element to attach to, and `{ }` bodies never touch the DOM. `DOMIsland` is the door when foreign content is genuinely the point |
| a snippet, `<slot>` | children written inside the instance's own `[ ]`; a component-typed attribute when a subtree is handed over by name |
| `<svelte:window bind:innerWidth>` | `app.width`, read directly |

```declare-fragment
query: string = "",
matches: number = { app.rows.value.filter((r) => r.name.includes(query)).length }
```

**The structural difference: Svelte compiles to DOM updates, Declare compiles to a
graph.** The premise is shared — a compiler that knows your dependencies, and no virtual
DOM — and it is the reason this is the shortest jump on the list. What differs is the
output. Svelte's compiler works out which nodes a variable touches and emits imperative
statements that poke them; the dependency knowledge is spent at build time and is gone by
the time the program runs. Declare's compiler extracts, from each `{ }` body and *through*
the methods it calls, the set of cells it reads, and hands that graph to the runtime as
data the running program holds.

That is what makes a running Declare program answerable. Ask it why a slot holds its
value and it tells you — `__declare.explain("app.dock.calendar", "width")` returns the
expression, every read-path it was wired to, and their live values — because the wiring is
still there to inspect rather than having been compiled away into assignments. The
Inspector is the same answer with a face.
→ [Run, check, ship](declare-docs:guide:run-check-ship)

The second difference is smaller to state and larger in practice: **a constraint is a
value, not a statement.** `$:` is a block that *runs*, in an order, possibly more than
once, possibly with side effects; `width = { parent.width - 40 }` says what `width`
equals, for the life of the program. So there is no execution order to hold in your head,
no question of what else a re-run touched, and exactly one answer to "who set this" — a
set slot owns its cell, and a direct assignment to it is refused rather than quietly
winning. → [Relationships](declare-docs:guide:relationships)

## Vue

| your reflex | the Declare answer |
|---|---|
| `ref()`, `reactive()`, `data()` | a declared attribute: `count: number = 0`. There is no `.value` to unwrap and no deep-vs-shallow question |
| `computed` | a `{ }` constraint |
| `v-model` | `<->`, on a leaf editor only: `TextInput [ text <-> :title ]` |
| `provide` / `inject` | `provided("name")` and, to provide, simply setting the value on an ancestor |
| `v-for` | `datapath = :items[]` |
| `:key` | the record's `id`; `key = :field` to name a different one |
| `v-if` / `v-show` | `visible = { … }` (the `v-show` sense — the view persists and is inert) |
| template `ref` | the child's own name |
| `watch`, `watchEffect` | a constraint, in almost every case. `afterSettle(…)` when the work is irreducibly a reading of new geometry |
| flex/grid wrapper | `layout: SimpleLayout [ … ]`, `WrappingLayout`, or your own `Layout` subclass |
| padding utility | `padding` on the view — an attribute, not a class name or a wrapper element |
| a media query in `<style>` | a `ResponsiveLayout` plan |
| `<Transition>` | `Spring`, `Animator`, `State` |
| scoped CSS | attributes on the view; `theme` for shared tokens |

**The structural difference: there is no template/script/style split.** One file, one
tree, two brackets — `[ ]` holds structure, `{ }` holds a TypeScript expression — and a
component's markup, its state, its methods and its look are all members of the same class
body. There is also no directive vocabulary to learn: `v-if`, `v-for` and `v-model` are
not special syntax here, they are ordinary attributes (`visible`, `datapath`) and one
operator (`<->`).

And reactivity is not a wrapper you opt a value into. Every attribute is a reactive slot
already, so "did I forget to make this reactive?" is not a question the language lets you
ask. → [Two brackets](declare-docs:guide:two-brackets)

## Flutter

| your reflex | the Declare answer |
|---|---|
| `StatefulWidget` + `setState` | a declared attribute and a plain assignment in a handler: `onClick() { count = count + 1 }` |
| `StatelessWidget` | there is no distinction — every component is a `class`, and holding state costs nothing |
| a `build()` method | there is none: the tree is written once, in `[ ]`, and its values change |
| `ValueListenableBuilder`, a derived value | a `{ }` constraint |
| `TextEditingController` | `text <-> :path`, or the editor's own value slot with an `input` override |
| `InheritedWidget`, Provider | `provided("name")` |
| `ListView.builder` | `datapath = :items[]`, plus `virtualize` when the collection is large |
| `Visibility` / a conditional in `build` | `visible = { … }` |
| a `GlobalKey` to reach a widget | the child's name |
| `initState` / `dispose` | `onReady`, `onRetire` |
| `Column` / `Row` | `layout: SimpleLayout [ axis = y ]` / `[ axis = x ]` on the container |
| `Padding(…)` as a wrapper | `padding` on the view — a value, not a node in the tree, and the view's own `fill` still covers it |
| `LayoutBuilder`, `MediaQuery` | `parent.width` and friends read directly; `ResponsiveLayout` for a plan per width |
| `AnimationController`, `AnimatedBuilder` | `Spring` (follows a live target, sleeps at rest) or `Animator` (timed `from`→`to`, with a `motion` curve) |
| `BoxDecoration`, `ThemeData` | attributes on the view; `theme Name [ … ]` for the token record, `provided("theme")` to read it |

**The structural difference: nothing is rebuilt, so nothing is a wrapper.** A Flutter tree
is a description that gets re-created; here a view is a long-lived object whose attributes
change under it. That removes the entire habit of wrapping — `Padding` inside `Center`
inside `Container` inside `Column` — because arrangement, insets, alignment, clipping and
decoration are all attributes of the view they describe. A five-deep wrapper stack in
Flutter is usually one `View` here with five attributes set on it.

It also removes `const` constructors, keys-for-performance, and the question of where to
put a rebuild boundary. Identity is structural: a written child is that child for the life
of the program, and a replicated one is identified by its record. → [The tree](declare-docs:guide:tree)

The sharpest contrast is the layout model itself. Flutter sizes a tree in one pass —
constraints down, sizes up, parent positions — so a child cannot see the width it is
about to be given, and reading anything else about the tree means a `LayoutBuilder` or an
`InheritedWidget`. Here geometry is a set of ordinary reactive attributes: `parent.width`,
`contentHeight`, a sibling's `x` are readable from any `{ }`, at any depth, in either
direction, and the runtime settles the arithmetic. Sizing to content is a constraint
(`width = { Math.min(contentWidth, 480) }`), not a widget you wrap in.
→ [Space](declare-docs:guide:space)

## QML

| your reflex | the Declare answer |
|---|---|
| `property int count: 0` | a declared attribute: `count: number = 0` |
| `width: parent.width - 40` | `width = { parent.width - 40 }` — the same idea, in brackets rather than after a colon |
| `id: root`, and reaching another item by its id | member names: a bare name resolves outward through the enclosing brackets, and `this`, `parent`, `classroot` and `app` say it explicitly |
| `Row` / `Column` / `Grid` | `layout: SimpleLayout [ axis = x ]`, `WrappingLayout`, or a `Layout` subclass |
| `anchors.fill: parent` | `width = 100%, height = 100%`; anchors have no counterpart — position is arithmetic in `x`/`y`, or a layout's job. The percent is of the parent's *content* box, so a padded parent is honored |
| `padding` on a `Control`, `anchors.margins` | `padding` on **any** view — every view has a content box, not only a styled control |
| `Repeater`, `ListView` + a model | `datapath = :items[]`, plus `virtualize` when the collection is large |
| `states` + `PropertyChanges` | `State` — a named bundle of overrides that snaps on and off together |
| `transitions`, `Behavior on x` | `Spring` to follow a live target, `Animator` for a timed run on a `motion` curve |
| `signal` + `onClicked`, `Connections` | the view's own events, answered by `on…` methods. There are no custom signals and nothing bubbles: a child tells its owner by calling a method |
| a context property, a QML singleton | `provided("name")`, or an attribute on the `App` |
| `Loader` | usually a `visible` constraint on a subtree that is already written. `createView(…)` with `use [ Name ]` when structure genuinely has to be built at runtime |
| `Qt.binding(…)` to restore a broken binding | nothing to restore: a set slot owns its cell for the life of the program, and a direct assignment to it is refused rather than silently replacing the binding |

**What is the same:** a dedicated language for a tree of objects, each with named
properties; a value written as an expression over other properties and kept true; states
and transitions as declared things rather than code; and one file that holds structure,
behaviour and look together. A Qt developer reads a Declare program on sight.

**What is not.** Dependency extraction happens at **compile time**, not by watching
property reads as a binding runs, so a `{ }` body may only read things the compiler can
name — the rules are few and the checker states them — and there is no `Qt.binding`,
because a binding is never a value you assign. There is no imperative engine embedded in
the same way either: `{ }` is TypeScript for *expressions*, with no DOM and no side
effects, and plain code lives in a top-level `script` block wholly outside the reactive
system. And a layout is not an item in the tree with children of its own — `layout` is a
reactive attribute of the container holding a `Layout` instance, which is a class you may
subclass when the library's do not arrange what you mean.
→ [Motion is a target; a state is a bundle](declare-docs:guide:motion-and-states)

## When the phrasebook runs out

These tables are deliberately shallow. They exist to get you from "I know what I want" to
"I know what it is called", and no further — every row has a chapter behind it, and the
reference answers the exact form:

```bash
node tools/declare-help.mjs ResponsiveLayout.plan
node tools/declare-help.mjs padding          # it answers the absences too
```

If you catch yourself building something that has no row here, that is usually a good
sign — and if the shape you are reaching for feels like it is fighting the language, the
list of tells is in [Thinking in Declare](declare-docs:guide:thinking-in-declare).

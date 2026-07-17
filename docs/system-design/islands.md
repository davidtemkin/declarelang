# Islands — the boundary concept, its taxonomy, and the environment that crosses it

Status: **DRAFT for ratification** (2026-07-16). Proposes: the `Island` abstract
base and the `HTML` → `DOMIsland` rename (§2–3); the environment boundary and
built-in `themeMode` (§4–5); the attribute-in/event-out messaging contract
(§6); the `AppIsland` trajectory subsuming the live-demo plumbing (§7).
Companion rulings: capabilities.md §3 (the environment vector), §7 (LiveDemo
rider), components-baseline.md (derive-down/deliver-up), the D-2 no-bubbling
ruling, language-design's predictability-beats-magic ruling.

## 1. The principle: an island is a box the tree owns and an interior it doesn't

Declare's doctrine is one tree: structure, data, and reactivity are declared,
and nothing native to the language leaves it. But every real platform needs one
deliberate exit — a place where a view's BOX belongs to the tree (sized by
constraints, positioned by layout, participating in the app like any leaf)
while its INTERIOR belongs to something else. That concept is an **island**.

The definition deliberately does not mention the DOM. The DOM is the current
implementation of "something else" on the browser runtime; the concept — a
constraint-sized box with a host-managed interior and a defined contract at the
boundary — survives a canvas, WebGL, or native runtime unchanged. Naming the
concept, not the mechanism, is what lets the taxonomy grow (§3) without a
second rename.

## 2. The rename: `HTML` becomes `DOMIsland`

The island class is today named `HTML`. Since `HTMLText` landed, that name is a
standing hazard: two capabilities share a prefix while sitting on OPPOSITE
sides of the doctrine. `HTMLText` is native Declare — rich content that happens
to be *authored* in an HTML subset, flowed by the language's own text engine.
`HTML` is the exit from Declare entirely. A model told "no HTML, no CSS, no
DOM" (declare.md §13) then offered a class named `HTML` must resolve the
contradiction by guessing; a person reads twice. The name teaches the wrong
lesson at exactly the place the right lesson matters most.

**Ruling proposed:** rename `HTML` → `DOMIsland`, a concrete subclass of the
abstract `Island` (§3). No deprecated alias — pre-1.0 and one-way-to-write
argue for a clean break; the fence gates and verify-apps catch stragglers
mechanically. §13's negative-knowledge list gains the distinction in one line:
formatted text is `HTMLText` (native); a box of foreign browser content is a
`DOMIsland` (the one place the DOM exists).

The rename makes the doctrine crisper, not weaker: "no DOM — except inside a
`DOMIsland`" is a sentence whose exception documents itself.

## 3. The taxonomy: `Island` is the exported abstract base

The precedent is `RichText`: an exported abstract base (`RichText`) with the
concrete classes authors actually write (`Markdown`, `HTMLText`). Islands take
the same shape:

- **`Island`** (abstract, exported) — the boundary concept of §1: box in the
  tree, interior host-managed, environment crosses by contract (§4). Not
  instantiable bare: an island's *kind* is load-bearing information at the use
  site, and a generic `Island [ … ]` would hide it.
- **`DOMIsland extends Island`** (concrete, today) — the interior is
  host-managed DOM: foreign markup, a chart library, a map.
- **`AppIsland extends Island`** (concrete, planned — §7) — the interior is an
  embedded Declare app: a child App with its own tree, reached only through
  the boundary contract.
- Future kinds subclass rather than rename: a native runtime's platform-view
  island, a WebGL surface, whatever a host someday hands boxes to.

## 4. The environment boundary

An embedded app's environment IS its host. This is already the design's grain:
`hostWidth`/`hostHeight` detect the container instead of the window
automatically, and the headless environment vector (capabilities.md §3) makes
the same facts explicit parameters. The island boundary generalizes it:

**The environment vector crosses the boundary downward, from embedder to
embedded, as ordinary typed attributes of the child App.** Size already does.
Mode joins it (§5): a child's "system" resolves to the HOST's resolved mode,
not the OS — the host is the child's operating system. The docs app's seed
threading (`demoSources`) is an ad-hoc third passenger that `AppIsland`
regularizes (§7).

This rule is what dissolves the embedded-examples dilemma raised during the
theming discussion: the ~53 doc islands need NO per-example declaration to
follow the viewer's theme, and are NOT condemned to pinned-light either — the
one declaration belongs to the EMBEDDER (the docs app's island mount), zero
lines in any example. Whether the demo corpus should visually follow the
viewer's mode is a separate styling decision (the demos are explicit light
artboards by ruling; mode-following them means re-authoring their colors
theme-derived), decoupled from the mechanism.

## 5. Built-in theming: `themeMode`, the resolved fact, and the light default

The platform is already half mode-responsive, incoherently: RichText's
rich-element palette follows `app.dark` by itself while default fills, text
colors, and the controls' house theme sit static. The docs app exhibited the
resulting bug class in the wild (an override switched the chrome while
headings stayed in the OS scheme) and now hand-rolls the fix (`darkUI`), as
the homepage hand-rolls its record swap. One seam replaces the freelancing:

- **`App.themeMode`**: `"light" | "system" | "dark"`, a built-in attribute.
- **The resolved fact** (working name `darkUI`): `themeMode == "dark" ||
  (themeMode == "system" && app.dark)` — read by the theme record, the
  RichText palette, and the controls' house theme. One fact, everything
  agrees; RichText stops following the OS on its own.
- **A house token pair** (light/dark) behind the controls' existing
  zero-configuration theme, so a themed app is possible with one declaration.

**The default is `"light"`, deliberately.** A system-following default would
mean: a developer (or a model — most authors, eventually) builds against a
light machine, sets one literal `fill`, leaves text defaulted, ships — and a
dark-OS user gets white-on-white at a surprising time. That failure is
environment-dependent, silent, invisible to verify (whose canonical
environment is `dark: false`), and retroactive over the existing corpus. It is
exactly the magic the predictability ruling rejects: appearance depending on
an environment variable no line of source mentions. Native platforms took the
opt-out route and broke half-specified apps en masse (iOS 13); the web took
opt-in (`color-scheme`) and was right. With the light default, dark rendering
only ever happens because a declaration says `themeMode = system` — one token,
the honest version of "no source at all."

**The follow-on check (the analyzability card):** other platforms suffer the
half-specified hazard as a runtime surprise; Declare's compiler sees every
color slot. Once `themeMode = system` is declared, a check can flag literal
colors that do not derive from `theme` — "this app opts into mode-following
but pins literal colors; derive them from theme or they will not flip" — a
positioned diagnostic naming the fix. Opt-in plus that check converts the bug
class into a compile-time conversation.

## 6. Messaging across the boundary

Declare does not need a message system; the boundary contract falls out of the
language's grain, in both directions:

- **Downward (environment, configuration):** the embedder sets the child App's
  *declared attributes*. The child's App declaration is therefore the boundary
  SCHEMA — typed, statically checked, readable by the compiler and by a model.
  There is no `postMessage`, no stringly channel: configuring an embedded app
  is assignment, and it is exactly as reactive as any other assignment.
- **Upward (events, deliveries):** the child raises events; the embedder
  subscribes with `<-` or receives method calls — the same deliver-up contract
  the standard library's controls use (`input(v)`), honoring D-2: no bubbling,
  no ambient listeners, an explicit named seam.

The boundary is thus not new surface: it is the existing attribute/event model
applied at an island's edge. What §7's `AppIsland` adds is only the WIRING —
who instantiates the child, when, and against which compile.

## 7. The `AppIsland` trajectory

Embedded Declare apps exist today — the homepage's live panels and the docs'
runnable islands are child apps mounted through hand-rolled host plumbing
(host-client's child mounting, seed threading, the island slot's recursion
gate). The LiveDemo rework rider (capabilities.md §7) already marks this
plumbing for regularization. `AppIsland` is that regularization with a name:

- an `AppIsland` declares WHICH program (source, or a compiled program by
  reference) fills its interior;
- the environment vector (§4) crosses automatically — size, resolved mode,
  and whatever typed attributes the child App declares and the embedder sets;
- deliveries cross per §6;
- the recursion gate (an island whose child embeds the same page) moves from
  host-client convention into the class's own contract.

Not scheduled by this note; the note fixes the DESTINATION so the rename (§2)
and the theming seam (§5) land aimed at it.

## 8. Open questions

1. `darkUI`'s public name (it is the fact apps read; `resolvedDark`?
   `darkMode`? — bikeshed deliberately deferred).
2. Whether `themeMode` participates in the URL/location grammar anywhere
   (probably never built-in; an app that wants a theme deep-link derives it).
3. The demo corpus: stay pinned light (specimen-card aesthetic, status quo) or
   re-author theme-derived to follow the viewer — a styling decision with its
   own audit pass either way.
4. Whether the house token pair is exactly the docs/homepage palette distilled
   or a third, neutral record.

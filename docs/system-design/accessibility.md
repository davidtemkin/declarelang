# Accessibility — one semantic tree, projected to every platform

> **Status, 2026-10-18: phases 1–3 built** (the vocabulary, the role contracts, the
> semantic tree, `declare-look --semantics`, the `accessibility` flag, the library's
> roles, and the DOM: annotations in place, real focus, `inert`, live regions and
> `Accessibility.announce`); phases 4–7 (preferences, the Mac, the canvas, other
> platforms) are design. It supersedes the sketch in
> native-host.md §8 where the two differ (chiefly: no class registry — §3). The rulings
> are §12; what building changed is §13.

## 0. The ask

The Murmur blind review (evals/reports/2026-10-17-murmur-run9) ruled Declare out
for a consumer app on three counts, and accessibility was the first: "0 ARIA
attributes, 0 buttons or links … focus never leaves `<body>`". The guide says the
same more gently ("deeper support such as ARIA roles and announcements is still
growing", 01-what-declare-is.md:264), and SATOR-7 names it as an open gap.

Two requirements from DT shape everything below:

1. **Platforms, not a browser.** Declare must be accessible in the native Mac host
   through the Mac's own API (NSAccessibility), with no browser, and the design must
   extend to the other platforms' APIs (Windows UI Automation, Linux AT-SPI, iOS
   UIAccessibility, Android AccessibilityNodeInfo). Web support alone won't do it.
   The DOM is the **first target**, not the model.
2. **Authors, not just the library.** A component an author writes (a `Waveform
   extends Control`, a drawn gauge, a custom list row) must be able to be fully
   accessible, using Declare's facilities, *by exactly the means the library uses*.
   There can be no path that only system library classes can take.

The two requirements point the same way. The semantics have to live in the
**Declare tree**, as language that any class writes. They can't live in a
renderer, which ties them to one platform, or in a table of library classes,
which ties them to the library. Each platform then gets a **projection** of that
tree.

## 1. Where we stand

| | Today |
|---|---|
| Names, roles, states on controls | none: every view is a `<div>`, text a `<span>` (dom-backend.ts:2166) |
| Semantic HTML | only rich text (`<h1-6>`, `<p>`, `<a>`, `<ul>`, `<table>`: dom-rich.ts:191-471) and linked views (`<a>` with `aria-label` from `label`: dom-backend.ts:1547) |
| Long lists | `aria-rowcount`/`aria-rowindex` already projected (Surface.setRowCount/RowIndex, backend.ts:406) |
| Focus | one fact (`FocusService.current`, focus.ts), scopes (`focusScope = modal/stop/…`), a drawn ring; **DOM focus never moves** except into a TextInput's real `<input>` (dom-backend.ts:2156); keys arrive on `window` (keys.ts:568) |
| Hidden | `visible = false` → `display:none`, which prunes the browser's tree already; `opacity` does not prune (ruled) |
| Canvas renderer | nothing: one opaque element |
| Mac host | no NSAccessibility anywhere (native-host.md §8: "entirely unbuilt") |
| Preferences | no reduced-motion, contrast or text-size fact anywhere (only color scheme and pointer queries, boot.ts:113, :227) |
| Text | DOM text nodes, readable but unstructured; `user-select: none` is the page baseline (dom-backend.ts:493) |

There are three foundations to build on:
- **A single focus fact.** It's what every platform's accessibility focus will mirror.
- **`Control.press()`.** It's already the one activation path that pointer and keyboard share (control.declare). An accessibility "press" becomes a third caller of it.
- **A naming convention that mostly holds.** `label: string` and `checked: boolean` mean the same thing in every library class that has them. The exceptions are `Switch` (no `label`) and `Table.selected` (an object). That makes binding the accessibility attributes (§3.2) mechanical for the library, but those names are not themselves the accessibility vocabulary.

## 2. The model: a semantic tree derived from the view tree

The runtime derives one **semantic tree** from the view tree, once, in JS, for
every platform. That follows the native host's rule: the scene model and the hit
walk stay in JS so that "the two renderers cannot disagree because there is one
implementation of the decision" (mac-backend.ts header). A semantic node is:

```
SemNode {
  id            the view's id
  role          a token from the closed vocabulary (§3.1)
  name          accessible name      — from `accessibilityLabel`, or from content (§3.4)
  hint          longer description   — from `accessibilityHint`
  value         { text?, now?, min?, max?, step? }  per role
  states        checked · selected · expanded · disabled · pressed · busy · required · invalid · modal · level
  actions       the subset of press · increment · decrement · escape · showMenu · scrollIntoView the node supports
  frame         its box in root coordinates (the runtime already has it)
  children      semantic children, in reading order
  live          off · polite · assertive
  rowCount / rowIndex / colCount / colIndex   for windowed lists and grids
}
```

The semantic tree is **not** the view tree. It is a pruned and flattened
projection of it, under rules the runtime applies identically for every
platform (§3.4). Most views (layout boxes, backgrounds, decoration) have no
role and are **transparent**: their children rise to the nearest semantic
ancestor. A typical app's tree is a small fraction of its view count.

## 3. The authoring surface: requirement 2

### 3.1 A role is a contract, not a registry

native-host.md §8 proposed "a registry over the component schemas": runtime code
that knows `Button` means AXButton and `Slider` means AXSlider. That is exactly the
privileged path requirement 2 rules out. An author's `Waveform` would not be in
the registry. The registry would also have to change whenever the library does.

So a class declares its role itself, in Declare, the same way for library and
author code:

```
class Button extends Control [ accessibilityRole = button, … ]
class Slider extends Control [ accessibilityRole = slider, … ]
class Waveform extends Control [ accessibilityRole = slider, … ]     // an author's: no difference
```

**A role is a contract that the compiler checks.** Each role names the
attributes and methods it reads, with their types, all in the `accessibility…`
namespace (§3.2). A class that declares the role must set them, usually by
binding its own attributes with an ordinary constraint (`accessibilityValue =
{ value }`). Missing or mistyped members are a compile error that names the fix,
like any other.

| role | reads (attribute: type) | actions (methods) |
|---|---|---|
| `button` | — | `press()` |
| `toggle` (a pressed/unpressed button) | `accessibilityPressed: boolean` | `press()` |
| `checkbox`, `switch` | `accessibilityChecked: boolean` (`boolean \| null` for mixed) | `press()` |
| `radio` | `accessibilityChecked: boolean` | `press()` |
| `slider` | `accessibilityValue`, `accessibilityMin`, `accessibilityMax`: number; optional `accessibilityStep: number`, `accessibilityValueText: string` | `accessibilityIncrement()`, `accessibilityDecrement()` |
| `progress` | `accessibilityValue`, `accessibilityMin`, `accessibilityMax`: number (or `accessibilityValue: null` for indeterminate) | — |
| `textField` | supplied by the native editable (TextInput); not author-declared | native |
| `link` | `href` (from `linksTo`/`location`) | `press()` |
| `image` | — (name from `accessibilityLabel`; none = decorative, pruned) | — |
| `heading` | `accessibilityLevel: number` (or derived from nesting, seo-and-semantics.md) | — |
| `list`, `listItem` | rows/positions from the replication itself (§7) | — |
| `grid`, `row`, `cell` | `accessibilitySelected: boolean` on `row`/`cell` | `press()` |
| `tabList`, `tab`, `tabPanel` | `accessibilitySelected: boolean` on `tab` | `press()` |
| `menu`, `menuBar`, `menuItem` | `accessibilityChecked` optional on `menuItem` | `press()`, `accessibilityShowMenu()` (a submenu) |
| `dialog`, `alertDialog` | `modal` from `focusScope = modal` | `escape()` (Floating's existing seam) |
| `group`, `toolbar`, `region` | — | — |
| `status` | (implies `accessibilityLive = polite`) | — |
| `none` | transparent (the default) | — |

`disabled` (on Control) and `focused` (on View) are read for every role. No role
needs them declared.

This is a convention the compiler enforces, not a new kind of object. It works
for an author for the same reason it works for `Slider`: the contract is checked
by name and type, and nothing anywhere lists the classes. The type checker already
does this kind of work: a `classFor` must return a View class, and `draw(d: Draw)`
must have that signature.

Because the contract reads its own namespace, a class's ordinary names never
have to fit it. `Table.selected` is an object while its rows' `selected` is a
boolean, and an author's `Waveform` may have a `value` that means something else
entirely; each binds `accessibilitySelected` or `accessibilityValue` to whatever
holds the right fact.

### 3.2 The names: an `accessibility…` namespace on View

Every name the accessibility system adds carries the `accessibility` prefix.
Short words like `role`, `label`, `hint` and `live` are too common to claim on
every View, and they would not always mean what this system means:

- **They collide today.** `Floating.live: boolean` (floating.declare:264) tracks whether an overlay is up. error.declare:31 has `hint: string`. The inspector has a child view named `hint` and the viewer one named `live`. A View-level attribute of the same name would change the meaning of all four.
- **The visible label and the accessible name are different facts.** `Button.label` is the text a Button shows. An icon button shows none and must still be read as "Close", and a button labelled "×" should be read as "Close", not "multiplication sign". So `label` stays the library's visible text, and the library binds `accessibilityLabel = { label }` where they agree.
- **The same applies to a contract's members** (§3.1). A slider contract that read `value` would force an author's class to use that word for that meaning.
- **It is the platforms' own spelling.** UIKit (`accessibilityLabel`, `accessibilityHint`, `accessibilityValue`, `accessibilityIncrement()`), AppKit (`accessibilityLabel`, `accessibilityValue`, `accessibilityRole`) and React Native (`accessibilityRole`, `accessibilityLabel`, `accessibilityHint`) use these names, so they read as what they are to anyone who has met them, an LLM author included.

The universal attributes are:

- **`accessibilityRole`**: the token from §3.1. Default `none`. It is fixed for the view's lifetime: it comes with the view when it is created, from its class, its declaration, the class a `classFor` picks, or the attributes a `createView` passes, and it is never a constraint. A role that changed while the view lived would leave nothing for the contract check to hold, and no case seen so far needs one. Where the compiler knows the class, the contract is checked at compile time; where it cannot (a `createView` whose class name is computed), the same check runs as the view is created and fails in the same words. Views created and removed at run time need nothing more: the semantic tree follows the view tree's child-list changes (§4).
- **`accessibilityLabel: string`**: the accessible name. A library control that shows its label as text (Button, Checkbox, Radio, a segment, a menu item) needs no binding: its role takes its name from that text (§3.4 rule 3). Those whose name is not shown text bind it (Gauge, Field, Pane, Dialog's `title`). `Switch` and `Slider` show no name, so their use site sets it, and the compiler warns when it does not.
- **`accessibilityHint: string`**: a longer description, read after the name and value. It maps to `aria-description` and AppKit's `accessibilityHelp`.
- **`accessibilityLive`**: `off`, `polite` or `assertive` (§3.6).

The contract members (`accessibilityValue`, `accessibilityChecked` and the rest
in the table) are View attributes in the same namespace, unset by default. Every
other semantic fact comes from what the runtime already knows (§3.4).

**Cost.** None of these may cost anything on a view that doesn't use them. They
can't add slots to every View's kernel block, which is performance-sensitive
code that must not regress. The runtime already keeps non-geometric attributes in
lazily created cells (`$cells` in attributes.ts) and class defaults in `$attrs`.
`accessibilityRole` is a class-level constant, and the rest have no cell until
something is written or constrained. This has to be measured, not assumed (§10,
gate). The long names cost nothing at run time either: the compiler resolves
names to slots.

### 3.3 Actions are methods, the same ones the keyboard calls

An assistive technology does things: VoiceOver's "press", a Switch Control
scan, Android's increment gesture, UIA's Invoke and RangeValue.SetValue. Each
platform action maps to one **method** in the role's contract:

| action | method | keyboard path that already calls it, or will |
|---|---|---|
| press / invoke / AXPress | `press()` | Space/Enter on a Control (control.declare) |
| increment / decrement / AXIncrement | `accessibilityIncrement()` / `accessibilityDecrement()` | arrow keys on a slider-like control |
| dismiss / escape / AXCancel | `escape()` (already on Floating) | Esc on an overlay |
| show menu / AXShowMenu | `accessibilityShowMenu()` | the context-menu key, a long press |
| scroll into view / AXScrollToVisible | (runtime) `scrollIntoView` | — |
| focus | (runtime) `Focus.focus(v)` | Tab |

The rule for authors is the same as for `press()` today: **override the method,
not the handlers.** `press()` keeps its short name because it is already the one
activation path pointer and keyboard share; an accessibility press is its third
caller. The adjusting methods are new, so they take the prefix. `Control`'s arrow
keys call `accessibilityIncrement()` and `accessibilityDecrement()` on a `slider`,
so keyboard and screen-reader users get one behaviour; the `slider` contract
requires the class to define them. (Control does not supply defaults: a method is
installed on each instance, so a default would cost every button and checkbox two
closures to serve the few sliders — measured, §13.)

### 3.4 How the tree takes shape

These rules are applied by the runtime, identically on every platform:

1. **Transparent by default.** A view with `accessibilityRole = none` contributes no node, and its semantic children rise to the nearest ancestor with a role. Layout wrappers cost nothing and need no annotation.
2. **Text is content.** A `Text` (and rich text) is a static-text node, unless an ancestor takes its **name from content**.
3. **Name from content.** `button`, `link`, `tab`, `menuItem`, `cell`, `heading`, `listItem`, `checkbox`/`switch`/`radio` and `toggle` with an empty `accessibilityLabel` take their name from the text of their descendants, in reading order, which then contribute no nodes of their own. This is the ARIA and AppKit behaviour, and it makes `Button [ Text [ text = "Send" ] ]` correct with no extra code.
4. **Drawn content is invisible.** A `draw()` paints pixels, not semantics. A drawn control must say what it is with `accessibilityRole`, `accessibilityLabel` and its contract. The compile-time check in §3.7 catches the common omission.
5. **Pruning.** `visible = false` prunes (ruled, and the DOM already does it). An `opacity` of 0 prunes too — the view is pruned from the tree, `aria-hidden` on its element, and names no control it sits in — while any other opacity is paint. Geometry does not prune: what a clip, a size of 0 or a place off screen hides is still read (§13), and the compiler warns where a view clips its content to a size of 0 with no `visible` (§3.7). A decorative `Image` with no `accessibilityLabel` is pruned, and so is a view marked `accessibilityHidden`, with all it holds (seen, not read; `aria-hidden` on the DOM) — which names nothing either. Hiding a control this way is a warning (DECLARE4027): the keyboard still reaches it. Content behind an open `focusScope = modal` is **inert** to assistive technology, as it already is to focus.
6. **Reading order is child order**, the same tree preorder as Tab order (input.md:30). Where the visual order is a layout's and differs, the fix is the child order, not a separate index. That is the same ruling as tabindex. One known defect follows from this: inline views in a paragraph read after the paragraph (text-selection.md:111), which belongs to the rich-text work.
7. **Frames come from the runtime's geometry.** Every platform needs node rectangles for touch exploration, the VoiceOver cursor and magnifiers. The runtime has them (the same transforms the hit walk uses), so no backend measures anything.

### 3.5 Worked example: the Murmur waveform, as an author writes it

```
class Waveform extends Control [
    accessibilityRole = slider,
    accessibilityLabel = "Voice message",
    accessibilityMin = 0,
    accessibilityMax = { duration },
    accessibilityValue = { position },
    accessibilityValueText = { clock(position) + " of " + clock(duration) },
    accessibilityIncrement() { seek(position + 5) },
    accessibilityDecrement() { seek(position - 5) },
    draw(d: Draw) { … } ]
```

VoiceOver reads "Voice message, 0:12 of 1:05, slider". VO-Up seeks forward,
and so does the right arrow. It is the same thing the library's own `Slider` says,
by the same means. The guide's "Your own views" chapter (17) gets this as its
accessibility section.

### 3.6 Announcements and live regions

- **`accessibilityLive = polite | assertive`** on a view: changes to its semantic content are announced. `Toast` (the notice stratum, planes.md §8: "announces politely") sets it, and so can an author's status line.
- **`Accessibility.announce(text, politeness)`**: a body service, like `Focus` and `Keys`, for the one-off announcement with no view: "Message sent", "3 results". It maps to `NSAccessibility.post(.announcementRequested)`, a polite or assertive `aria-live` element, UIA's notification event, `UIAccessibility.post(.announcement)` and Android's `announceForAccessibility`.
- Derived announcements for Dataset changes (native-host.md §8) stay an open question. An automatic "a row was added" is often noise, and `accessibilityLive` already lets a list opt in.

### 3.7 What the compiler can check

A compiled language with a class model can catch at build time what web
accessibility audits catch at run time, if at all:

- a class with a role whose contract it does not meet (an error, naming the missing member);
- a `Control` subclass with no `accessibilityRole`: a warning that says to name one. `button` is the likely fix, but a guessed role is worse than a flagged one;
- a named control (button, checkbox, slider, …) with no `accessibilityLabel` and no text content to take its name from: a warning, which is how location.md:120's rule for content-free links generalizes;
- a view that handles `onPointerDown`/`onClick` but is not a Control (the existing drift check, now with an accessibility reason);
- a `draw()` view that is focusable but has no role;
- a control inside a control (a checkbox inside a button), written or brought in by a plain view's class: the inner is read as the outer's name and cannot be reached (DECLARE4020);
- a view that clips its content to a size of 0 — a literal 0, or 0 as an arm of a choice — and sets no `visible`, so what it hides is still read (DECLARE4021).

A name is judged by what each use site leaves it: a `label` left empty is no words, though the class's caption shows it, and an `accessibilityLabel` that reads an attribute left empty is no name. The checks cover every file of the program — the main file and the files it includes — and leave out only the class library.

Warnings have DECLARE codes and fixes like every other diagnostic, and
`declare-verify` reports them. An LLM author gets them in the same loop as type
errors, which is where they will actually be fixed.

## 4. The runtime: `semantics.ts`

- **Reactive records.** Each view with a role gets a semantic record whose fields are ordinary constraints over its attributes: the contract members, `accessibilityLabel`, `disabled`, `focused`, its frame. A change wakes only that record, as a label change wakes only the text that shows it. A view without a role has no record.
- **Incremental flattening.** The record set plus the view tree gives the semantic tree (§3.4). The tree updates by the same child-list mutations that structure changes already produce (`$sync`, `applyChildrenMutated`), not by a rebuild.
- **One diff per settle.** After settle, the runtime emits the changed nodes (created, updated fields, removed, children reordered) to the platform host. That's the same once-per-settle discipline as the Mac op buffer and the DOM writes. No reads come back on the hot path.
- **Activation on demand.** On platforms that report an assistive client (macOS's first accessibility query, Android's AccessibilityManager, UIA's client connection), the runtime builds the semantic tree only once one is attached. Until then the cost is nil. The DOM cannot know whether a screen reader is running, so there the in-place annotations (§5.2) are always on, and must be cheap enough to be (§10, gate).

### 4.1 Turning it off: the `accessibility` flag

A program or a build can leave the whole layer out. `accessibility` is a fourth
modifier in the flag registry (`compiler/src/flags.ts`, `FLAG_SPECS`), boolean,
default on, spelled like the others: `defaultFlags [ accessibility = false ]` in
a program, `?accessibility=false` in a URL, `--accessibility=false` to
`declarec`: one registry entry, spelled `name=value` on every surface. As with every flag, the request beats the program's block, so
`?accessibility=true` turns it back on for a game under test.

Off, a build:
- carries no `semantics.ts` (the import sits behind a build-time constant, so the bundler drops it);
- compiles every `accessibility…` binding away, the library's included, so a library class costs what it costs today;
- skips the accessibility warnings (§3.7); contract errors stay, since a broken contract is a broken class whether or not the layer ships;
- gives the platform host nothing to build a tree from: no DOM annotations, no AX opcodes, no canvas mirror;
- leaves reduced motion to the program (below).

Focus, keys and `press()` are untouched; they were never the accessibility
layer's. What the flag saves is measured, not assumed (§10).

The games are the first users: each adds `accessibility = false` to its
`defaultFlags` beside `render = canvas`. An arcade game drawn on a canvas has
nothing a screen reader could use, and should not pay for the layer.

It also takes the motion system's reduced-motion handling with it (§12, ruling
8): under `accessibility = false`, springs and animators move as if each declared
`ignoreReduceMotion`. A program that leaves the layer out has declared its
presentation fixed, and an arcade game's motion is the game. A program that
wants the layer off but reduced motion honoured reads `accessibilitySettings`
itself.

## 5. Platform realization: requirement 1

### 5.1 The seam

One new optional interface beside `RenderBackend`, implemented once per platform:

```ts
interface SemanticsHost {
  /** Apply one settle's changes: nodes created/updated/removed, children reordered. */
  apply(diff: SemDiff): void;
  /** Accessibility focus follows the app's one focus fact. */
  focus(id: number | null): void;
  /** A one-off announcement (Accessibility.announce) or a live-region change. */
  announce(text: string, politeness: "polite" | "assertive"): void;
  /** The platform's requests back into the program, on the cold path:
   *  an action (press, increment, …), a focus move, scroll-to-visible. */
  onRequest(cb: (req: SemRequest) => void): void;
}
```

The runtime calls a request's method (`press()`, `accessibilityIncrement()`, …) or service
(`Focus.focus`, `scrollIntoView`) exactly as the keyboard does. Platform hosts
don't interpret roles beyond mapping tokens to their own names (§5.5).

### 5.2 DOM, the first target: annotate in place

The DOM backend has a real element per view (deferred-DOM aside), and browsers
do their own flattening of generic `<div>`s. So the DOM realization **annotates
the existing elements** and does not build a parallel tree:

- `role` (from `accessibilityRole`), `aria-label`, `aria-description`, the role's states (`aria-checked`, `aria-selected`, `aria-expanded`, `aria-disabled`, `aria-pressed`, `aria-valuenow/min/max/valuetext`, `aria-level`, `aria-modal`), `aria-live`, on the view's own element. Transparent views stay plain `<div>`s, which ARIA already treats as generic.
- **Real focus.** A focusable view's element gets `tabindex="-1"` (never a positive index), and the runtime calls `element.focus({preventScroll: true})` when the focus fact changes. A DOM `focus` event the runtime didn't cause (a screen reader moving focus, a browser's own navigation) calls `Focus.focus(view)`. Keys keep arriving on `window`, so the input path does not change, but `document.activeElement` finally tells assistive technology where the user is. That fixes the review's "focus never leaves `<body>`".
- **Modal inertness.** When a `focusScope = modal` overlay opens, the content behind it gets `inert` (or `aria-hidden` where `inert` is unavailable), alongside the focus trap that already exists.
- **Actions.** DOM screen readers act through focus and keys (Enter, Space, arrows), which already reach `press()` and the arrow handlers, so no DOM-specific action path is needed. iOS VoiceOver's increment and decrement gestures on the web send arrow keys to `role=slider` elements.
- **Announcements.** One offscreen `aria-live` element per politeness level, per app root.
- **What the flattener is for on the DOM.** The browser builds its own tree from the annotations. The runtime's semantic tree is the **oracle** a test compares that tree with (§10). A disagreement is a bug in one or the other.

This fixes the web renderer for every program that uses library controls, with
no change to the programs. Murmur's buttons, popovers and waveform become
accessible with a library update. The waveform needs its eight lines (§3.5).

### 5.3 Canvas: a mirror

The canvas renderer has no elements, so it realizes the semantic tree as a
**hidden DOM mirror**: transparent, positioned elements carrying the same
annotations, kept in sync by the diff and placed at the nodes' frames. Flutter
on the web does the same, and declare.md:110 already names "a DOM mirror kept in
sync" as the way. It consumes the same `SemDiff` as the Mac host, so the canvas
renderer is also the browser-side test of the projected path.

### 5.4 Mac: NSAccessibility from the diff

- **Nodes.** One `DeclareAXElement` (an `NSAccessibilityElement` subclass) per semantic node, keyed by id. It is created and updated from the diff, which rides the existing per-settle op buffer as a few new opcodes (`AX_NODE`, `AX_REMOVE`, `AX_CHILDREN`, `AX_FOCUS`, `AX_ANNOUNCE`), not a second channel.
- **Tree.** The program window's content view returns the root nodes as its `accessibilityChildren`. Each element answers `accessibilityRole`/`Subrole`, `Label`, `Help`, `Value`, `MinValue`/`MaxValue`, `isAccessibilityEnabled`/`Selected`/`Expanded`, its children, and its frame: the runtime's root-space box, converted to screen coordinates by the window, much as layers are placed today.
- **Actions.** `accessibilityPerformPress`, `…Increment`, `…Decrement`, `…Cancel`, `…ShowMenu` and `setAccessibilityFocused` post a request back over the bridge's cold path. The runtime calls the method and settles, and the diff comes back as usual.
- **Focus and announcements.** `NSAccessibility.post(element:notification: .focusedUIElementChanged)` follows the focus fact. Value, title and children changes post their notifications, and announcements post `.announcementRequested` with a priority.
- **Native pieces stay native.** TextInput's NSTextField/NSTextView overlay is the text field's accessibility element, with the platform's own value, selection and editing, and it is parented under the semantic tree. Scroll panes become `AXScrollArea` nodes over the embedded NSScrollView.
- **Activation.** The host tells the runtime "accessibility on" at the first accessibility query (§4). Until then the Mac host does no accessibility work.

### 5.5 The vocabulary holds across platforms

The role list was chosen as the overlap of the six platform vocabularies. Each
token has a counterpart everywhere, so a program is not written for one platform:

| role | ARIA (DOM) | macOS | Windows UIA | Linux AT-SPI | iOS | Android |
|---|---|---|---|---|---|---|
| button | `button` | AXButton | Button + Invoke | push button | `.button` | Button |
| toggle | `button` + `aria-pressed` | AXCheckBox / AXToggle† | Button + Toggle | toggle button | `.button`, `.selected` | ToggleButton |
| checkbox | `checkbox` | AXCheckBox | CheckBox + Toggle | check box | `.button` + value† | CheckBox |
| switch | `switch` | AXCheckBox, subrole AXSwitch | Button + Toggle† | toggle button† | `.toggleButton` (iOS 17) | Switch |
| radio | `radio` | AXRadioButton | RadioButton + SelectionItem | radio button | `.button`, `.selected` | RadioButton |
| slider | `slider` | AXSlider | Slider + RangeValue | slider | `.adjustable` | SeekBar |
| spinButton | `spinbutton` | AXIncrementor | Spinner + RangeValue | spin button | `.adjustable` | NumberPicker |
| progress | `progressbar` | AXProgressIndicator | ProgressBar + RangeValue | progress bar | `.updatesFrequently` + value† | ProgressBar |
| link | `link` (`<a>`) | AXLink | Hyperlink + Invoke | link | `.link` | (link span)† |
| image | `img` | AXImage | Image | image | `.image` | ImageView |
| text | text node | AXStaticText | Text | static / label | `.staticText` | TextView |
| heading | `heading` + `aria-level` | AXHeading† | Text + heading level | heading | `.header` | heading flag |
| list / listItem | `list` / `listitem` | AXList / AXGroup† | List / ListItem | list / list item | (container) | CollectionInfo |
| grid / row / cell | `grid` / `row` / `gridcell` | AXTable / AXRow / AXCell | DataGrid / DataItem | table / row / cell | (container) | CollectionInfo |
| tabList / tab | `tablist` / `tab` | AXTabGroup / AXRadioButton, subrole AXTab† | Tab / TabItem | page tab list / page tab | `.tabBar` | TabWidget† |
| menu / menuItem | `menu` / `menuitem` | AXMenu / AXMenuItem | Menu / MenuItem | menu / menu item | — | (popup)† |
| dialog | `dialog` + `aria-modal` | AXWindow / AXSheet, subrole AXDialog† | Window, IsModal | dialog | `accessibilityViewIsModal` | pane title† |
| group / toolbar | `group` / `toolbar` | AXGroup / AXToolbar | Group / ToolBar | panel / tool bar | (container) | ViewGroup |
| status (live) | `status` / `aria-live` | announcement | LiveRegionChanged | live attributes | announcement | `liveRegion` |
| listbox / option | `listbox` / `option` | AXList / AXRow† | List / ListItem + SelectionItem | list box / list item | (container) / `.button`, `.selected`† | CollectionInfo / CollectionItemInfo |
| tree / treeItem | `tree` / `treeitem` | AXOutline / AXRow | Tree / TreeItem + ExpandCollapse | tree / tree item | (container)† | CollectionInfo, expandable† |
| radioGroup | `radiogroup` | AXRadioGroup | Group† | panel† | (container) | RadioGroup |
| combobox | `combobox` | AXComboBox | ComboBox + ExpandCollapse | combo box | —† | Spinner† |
| separator | `separator` (focusable, with a value: a splitter) | AXSplitter | Separator (+ RangeValue) | separator | `.adjustable` | — |
| searchBox | `searchbox` (on the input) | AXTextField, subrole AXSearchField | Edit† | entry† | `.searchField` | EditText |
| landmarks | `navigation` · `main` · `search` · `banner` · `complementary` | AXLandmark* subroles | landmark type ids | landmark† | (the rotor's landmarks) | pane title† |

† = to verify against that platform's SDK before the host is built; the
rest are standard.

The other platforms all expose **virtual node trees**: UIA fragments, AT-SPI
objects, `UIAccessibilityElement`, Android's `AccessibilityNodeProvider`. That
is the shape of the `SemDiff`, so each new host realizes the same diff and none
needs a model of its own. Today only the Mac host exists, so the rest is mapping
work for when they do.

## 6. Focus: one fact, on every platform

The app's focus (`FocusService.current`, readable from Declare as `focused`) is
the only focus. The DOM's `activeElement`, macOS's focused element, UIA's focus
and Android's accessibility focus all *follow* it, and a platform-initiated focus
move *writes* it, through `Focus.focus`. There is no second, accessibility-only
focus to keep in sync.

The review found two focus defects:
- **Focus doesn't move into a popover** (Murmur's reaction picker). That's a library defect: an opened `Popover` with focusable content should focus its first member, as `Dialog` does. Overlays need a consistent ruling on which kinds take focus when opened (planes.md §13).
- **The DOM never saw focus.** §5.2 fixes that.

## 7. Long lists

A virtualized list builds only the rows near the screen. The semantic tree has
nodes only for built rows. The list node carries the full count (`rowCount`, which
the DOM already projects), and each row its position (`rowIndex`), so a screen
reader says "row 4,012 of 30,500" without 30,500 nodes. When assistive technology
moves past the last built row (VoiceOver's next item, a swipe on iOS, Android's
scroll-forward action), the request comes back as `scrollIntoView` of the next
index. The list scrolls, builds the row, and focus lands on it. This is the
"materialize on AT traversal" requirement already in materialization.md:345, and
it reuses the existing scroll and anchoring path instead of a new one.

## 8. User preferences: reduced motion, contrast, transparency, text size

These are not semantics, but they belong to the same promise, and they come from
the same platform settings:

- **Facts, provided by the host.** A host-supplied provided value, `accessibilitySettings`, has fields `reduceMotion`, `increaseContrast`, `reduceTransparency` and `textScale`. Any view reads it like `theme`. It comes from the browser's `prefers-reduced-motion`, `prefers-contrast` and `prefers-reduced-transparency` queries and from NSWorkspace's `accessibilityDisplayShouldReduceMotion` and its siblings. Tests can pin it (chrome-divergences.md:446).
- **Reduced motion is honoured by the motion system, not by apps** (chrome-standardization.md:214's ruling: "either every spring and animator consults it, or none should"). Under `reduceMotion`, a `Spring` arrives at once, or crossfades where a jump would lose the user's place, and so does an `Animator` (or an `AnimatorGroup`): a one-shot animator lands on its end value, and a looping one (a spinner, an attract screen) holds still. A `TweenLayout` moves on springs and follows them. Continuity is the thing Declare does well, so the meaning has to be kept even when the movement is removed. A spring or animator whose motion *is* the information (a scrubber following a drag) declares `ignoreReduceMotion = true` (named like `ignoreScroll`) and keeps moving. Motion a program writes itself, per frame on a `Time [ tick = frame ]` (the games' physics), is not the motion system's to see; that code reads `accessibilitySettings.reduceMotion` if it cares.
- **Contrast and transparency** are theme inputs: library themes swap frost for solid and raise contrast. Authors' themes read the same fact.
- **Text scale** is the open question type-driven-controls.md:95 left. It matters most on iOS (Dynamic Type) and is out of scope until there is a host where it applies.

**Built, and parked (2026-10-19).** The `accessibilitySettings` fact is built: the browser
host feeds it live, and a program reads it. Springs and `TweenLayout` landing at once under
`reduceMotion` (animators never: DT ruled them out, since an animator may be a clock) was
built and measured with reduced motion forced on across the suite. It broke tests that
expect motion, as it must, and also a few behaviours not yet understood: a hosted program's
dialog keeping Tab, the reveal on Tab in a page taller than its window, the files browser
test. It is parked, to be taken up with those understood; the motion system does not act on
the fact.

## 9. Adjacent findings from the review

The review counted three further problems against accessibility. Two belong elsewhere:

- **`user-select: none` on all content** (dom-backend.ts:493). Readers who select text to have it spoken, to translate it or to copy it are blocked. Flipping the default for content text is not yet a proposal: it needs a drill-down first (DT, 2026-10-18), which is not part of this design's phases. Its questions:
  - what a selection drag does to drags and gesture claims that start on text;
  - iOS long-press, where the system's selection callout competes with `onHold`;
  - the canvas renderer, which has no DOM text, so selection there is the runtime's own (text-selection.md);
  - which text is content and which is a control's, without an annotation on every `Text`.
- **No URL for the open conversation.** That's not accessibility: the program used `waypoint` instead of `location`. It's a program and documentation finding.

## 10. Testing and gates

- **The semantic tree as a headless oracle.** `declare-look --semantics` (and a `declare-verify` assertion) prints the tree for a program, with roles, names, values and states. An author or an LLM can check accessibility with no browser and no screen reader, in the same loop as the rest of their checks. This is the most valuable test surface, because it is where programs actually get written.
- **Chrome AX-tree comparison.** In real Chrome, CDP `Accessibility.getFullAXTree` is compared with the runtime's semantic tree, for the library sampler and three apps (Murmur, the tracker, the calendar). It runs in the suite.
- **Authoring parity, enforced.** A test asserts that library sources use no member, service or annotation unavailable to an app. The accessibility vocabulary is public API, and no library class is special-cased in `semantics.ts`: the file names no library class. The `Waveform` example (§3.5) is a test program.
- **Mac.** A Swift probe in mac-host/ walks the running app's tree through `AXUIElement`, the API VoiceOver itself uses, and compares it with the runtime's tree.
- **Manual passes.** VoiceOver in Safari and Chrome, and VoiceOver on the native host, on Murmur and the tracker: each library control, every overlay, a long-list traversal, an announcement. Each pass ends with a written note of what a real user would hit.
- **The flag's gates.** A game built with `accessibility = false` is no bigger than it is today, and a library class's flag-off output carries no `accessibility…` binding. The calendar with the layer on has its own measured, reported band.
- **Gates.** These must not regress. View creation cost and the per-view kernel block size must be unchanged for views with no role (§3.2). The DOM backend's write cost per settle on the tracker filter benchmark must stay within noise. The base gzip delta of the runtime is reported with the change (`semantics.ts` is on every app's path).

## 11. Phasing

1. **The language and the runtime model:**
   - the `accessibility…` attributes; role contracts in the compiler (at compile time, and at creation where the class is computed); the compile-time checks;
   - the `accessibility` flag, and `accessibility = false` in the four games' `defaultFlags`;
   - `semantics.ts` building the tree;
   - `declare-look --semantics`.
   - No platform output yet. This phase fixes the vocabulary.
2. **The library:** every library class gets its role and contract, reviewed one class at a time against the ARIA authoring practices for its pattern. That includes binding `accessibilityLabel` to `label`, the increment and decrement defaults on Control, `Switch.label`, and focus on opening a Popover.
3. **DOM in place (§5.2):** annotations, real focus, `inert`, live regions; the Chrome AX comparison test; a VoiceOver pass. This phase closes the review's main finding for every web program.
4. **Preferences (§8):** the `accessibilitySettings` fact; reduced motion in Spring, Animator and AnimatorGroup.
5. **Mac host (§5.4):** AX opcodes, `DeclareAXElement`, actions over the bridge, the AXUIElement probe, a VoiceOver pass on the native host.
6. **Canvas mirror (§5.3).**
7. **Other platforms,** as their hosts are built: a mapping table entry per role (§5.5) and a realization of `SemanticsHost`.

## 12. Decisions

Ruled by DT, 2026-10-18:

1. **Roles are compiler-checked contracts (§3.1)**, replacing the registry in native-host.md §8. This is the core of requirement 2.
2. **The language additions, all in the `accessibility` namespace (§3.2):** on View, `accessibilityRole` (closed vocabulary), `accessibilityLabel`, `accessibilityHint`, `accessibilityLive` and the contract members (`accessibilityValue`, `…Min`, `…Max`, `…Step`, `…ValueText`, `…Checked`, `…Pressed`, `…Selected`, `…Level`); the methods `accessibilityIncrement()`, `accessibilityDecrement()` and `accessibilityShowMenu()` beside the existing `press()` and `escape()`; the `Accessibility.announce` service; the `accessibilitySettings` provided fact; and `ignoreReduceMotion` on Spring, Animator and AnimatorGroup. That is the whole list. Each goes in docs/system-design/overlay-language-changes.md when made.
3. **A role is fixed for the view's lifetime**, set when the view is created, including views created at run time (§3.2).
4. **DOM in place rather than a mirror** for the DOM renderer (§5.2), with the mirror reserved for canvas.
5. **Missing roles and names are warnings, not errors** (§3.7). Contract violations are errors.
6. **Reduced motion is on by default in the motion system** (§8), with `ignoreReduceMotion` to opt out.
7. **An `accessibility` flag turns the layer off for a build (§4.1)**, and the games set it in their `defaultFlags`.
8. **`accessibility = false` also turns off the motion system's reduced-motion handling (§4.1).** Weighed against it: reduced motion protects people with vestibular disorders, which is not a screen reader's concern. A program that wants the layer off and reduced motion honoured reads `accessibilitySettings` itself.

Open:

9. **`user-select` for content text (§9)**: a drill-down first, outside these phases.

## 13a. Added after the outside evaluation (2026-10-19)

The evaluation of 2026-10-19 (the item a composite's keys are on was silent; a grid's
headers were not headers) added four words to the vocabulary of §12.2:

- **`accessibilityActiveItem: View?`**: the item inside a composite the keyboard is on,
  while the focus stays on the composite (`aria-activedescendant`; the item is marked
  `active` in the semantic tree). `Menu`, `Table`, `DataGrid` and a `Combobox`'s field set
  it. A `Menu` now holds the focus while it is open, so the item it names is heard.
- **`columnHeader`**, a role named by its content, and **`accessibilitySort`**
  (`none`, `ascending`, `descending`) that it may state. A `DataGrid`'s headers are column
  headers, reached by the keyboard from the first row (Up), sorted with Enter or Space.

- **`accessibilityMultiselectable`** on a `listbox`, `grid` or `tree`: more than one item
  can be selected (`aria-multiselectable`). `Table` and `DataGrid` set it from `selects`.

A `Combobox`'s list is a `listbox` of `option`s, not a menu: a `Menu` made with the `listbox`
role at creation and `asList`, whose rows show an option view in place of the menu item
(each view keeps the one role it was made with).

The keyboard's context menu (Shift+F10, the Menu key) goes to the focused view, or to the
item it names: no vocabulary, a route the runtime takes.

## 13. What building phases 1 and 2 changed

Recorded as built (2026-10-18), where the design above met the code:

- **A class's accessibility facts are the class's defaults**, not per-instance constraints. A
  class body's `accessibilityRole = slider` is the class default, and its
  `accessibilityValue = { value }` a live default evaluated when read — nothing writes these
  attributes, and the semantic tree reads them. So a library control costs nothing per
  instance for the layer: one Checkbox builds the same 21 nodes, 65 owned slots and 10
  methods as before it (measured against main). A use site's own value still takes the slot.
- **Every default is null or a string**, so no accessibility attribute takes a slot in the
  per-view kernel block (a test holds it).
- **`accessibility = false` leaves the layer out entirely**: the compiler removes every
  `accessibility…` member after checking it, and the build constant
  `__DECLARE_ACCESSIBILITY__` drops the View attribute specs, their schema and the contract
  table. The four games built with it are no bigger than before (raw bytes; gzip within
  ±21 bytes of minifier renaming). The calendar, with the layer, is about 1 KB gzipped larger.
- **One rule the tree needed** beyond §3.4: a text child that only repeats its node's name
  is not read again. (A geometric rule — prune what a clipping ancestor hides — was built
  and removed: it pruned visible views whenever an animation's geometry lagged, and the
  browser keeps clipped content anyway. Absence is `visible`, as the guide already teaches:
  a closed accordion `Pane` holds its content in a `body` shown only while it is open or
  sliding.)
- **One template, two kinds of row**: a menu's rows are items and dividers from one template,
  and a role is fixed per element, so each row holds a small view that carries the item's
  semantics and is shown only on item rows. An accordion `Pane` likewise holds its header as a
  `button` inside a named `group`, so its content is never inside a button.
- **The wider vocabulary** (ruled by DT, 2026-10-18): `listbox`/`option`, `tree`/`treeItem`,
  `radioGroup`, `combobox`, `separator`, `searchBox`, and the landmarks `navigation`, `main`,
  `search`, `banner` and `complementary` — the roles our own programs reached for and could not
  say. RadioGroup and Segmented are `radioGroup`s, Combobox a `combobox`, a menu's dividers
  `separator`s, and the library's new `SearchField` a `searchBox` (on the DOM, the role and an
  unshown name go on the field's own input). A field's placeholder names it.
- **`accessibilityExpanded`** (ruled by DT, 2026-10-18): whether what a view opens is open,
  read by `button`, `menuItem`, `group` and `row`. Bound by an accordion header, every
  control with a `menu` (to `menuOpen`), a combobox and a menu bar title.
- **The flag's spelling** is `name=value` on every surface (`--accessibility=false`,
  `?accessibility=false`), after the flag registry became one table for all three.
- **The DOM, measured** (300 rows of a checkbox and a button, filtered seven times, real
  Chrome, against main): mounting and each filter's settle are within about 1% — the
  annotations are installed after the frame, about 5 ms for 600 controls and 1 ms per
  filter, never inside a settle. Chrome's own accessibility tree
  (`Accessibility.getFullAXTree`) names every control as the semantic tree does
  (test/accessibility-browser.test.mjs).
- **A focused view's element holds the DOM's focus**, so the keyboard's "a control has the
  keys" test moved from `activeElement === body` to "focus is not in a native field"
  (keys.ts) — Space presses a focused button rather than scrolling the page.


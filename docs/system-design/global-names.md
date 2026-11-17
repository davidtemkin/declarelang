# Global names: a design

*Design note, 2026-11-14. Status: built on the branch `global-names`, except two parts:*

- *§ Collisions: shadowing was ruled out (see there); every Declare name stays refused, with a
  message naming its kind.*
- *§ Color, the second stage: color strings.*

*What was built is listed in `language-changes-2026-11.md`.*

## The rule

Every name the platform puts in a program's scope is capitalized, and is one of four kinds:

| Kind | What it is | How it is used |
|---|---|---|
| **Class** | A kind of node. Its instances are placed with `[ ]` and live in the runtime tree | `Button [ label = "Save" ]` |
| **Type** | A kind of value. Where the platform builds or works on values of a type, it does so through the type's name | `Stroke(1, red)`, `Color.mix(a, b, 0.5)`, `Easing.steps(4)` |
| **Service** | The one instance an app has of something: the clipboard, the keyboard, focus | `Clipboard.copy(text)` |
| **Theme** | A value of type `Theme`. The presets are the platform's themes, as a program's `theme` declarations are its own | `theme = { SanFrancisco }` |

The platform adds **no lowercase names** but two plain functions, `measureText` and
`escapeHtml`, which belong to no type and no class. Otherwise a lowercase name in a body is
one of these:

- the node's own: its attributes and methods, `this`, `parent`, `classroot`, `app`;
- a local;
- a function in the program's script;
- JavaScript's own.

What the platform knows about the program's state is an **attribute**, read in a constraint
and watched with `onChange`, like any other value. A placed listener is only for events
that have no state to read: keys.

## Why

- **A name says where to look.** A capitalized name is a class, type, service or theme:
  `declare-help` answers for it, and its kind says how it is used. A lowercase name is
  this node's, or yours.
- **One spelling in both homes.** Today a bare value in `[ ]` and a body in `{ }` share a
  vocabulary by a special rule. Under this rule, `stroke = Stroke(1, #B0B0B0)` is the same
  text in both places.
- **The ordinary TypeScript shape.** A type's name builds or converts a value (`String(x)`,
  `Number(s)`), and its operations hang off it (`Number.parseFloat`, `Array.isArray`,
  `Date.now()`). A type and a function sharing a name is plain TypeScript.
- **Six special cases go**, each of them a rule a reader must learn and the compiler must
  carry:
  1. The callee-position rule: `stroke(…)` builds a stroke, while a bare `stroke` is the
     attribute (the compile layer skips these names in callee position).
  2. Nine filter words reserved as method names (`blur`, `contrast`, `invert`, …), because
     they are also builders. `blur` is besides a view event.
  3. `Focus`, both a service in `{ }` and a relay class placed with `[ ]`.
  4. `Keyboard`, both a service and an abstract class that `declare-help` presents as a
     class to place.
  5. A function hidden in every body's scope for the compiler's own lowering
     (`colorWithAlpha`).
  6. `performance`, listed as callable everywhere and refused in bodies.
- **Collisions get one rule** (§ Collisions).

## Every global, before and after

The reference lists 40 shared functions, 7 namespaces, 15 type aliases and 44 interfaces,
plus 35 enums, 21 value types, 9 theme presets and the library's classes.

### Paint: the builders move onto their types

| Before | After |
|---|---|
| `stroke(1, red)` | `Stroke(1, red)` |
| `shadow(0, 1, 6, 0x222222)` | `Shadow(0, 1, 6, 0x222222)` |
| `gradient(…)`, `radialGradient(…)`, `conicGradient(…)`, `colorStop(…)` | `Gradient.linear(…)`, `Gradient.radial(…)`, `Gradient.conic(…)`, `Gradient.stop(…)` |
| `blur(3)`, `brightness`, `contrast`, `saturate`, `grayscale`, `invert`, `sepia`, `hueRotate`, `colorize`, `frost` | `VisualFilter.blur(3)`, and the same for each |
| Types `ImageFilter`, `FilterList` | `VisualFilter`, `VisualFilter[]`: one name, as the attribute is `visualFilter` |

The filters keep CSS's words, now under one name: `VisualFilter.blur(3)` reads as "a blur
filter". The word `filter` stays free for what an app means by it.

### Color: the operations live on `Color`

| Before | After |
|---|---|
| `colorWithAlpha(rgb, 128)` (alpha 0–255) | `Color.withAlpha(c, 0.5)` (alpha 0–1, as CSS writes it) |
| `activeTone(accent, surface)` | Retired: it is `Color.mix(surface, accent, 0.22)` |
| A hand-written bit-shifting `mix` (§ Evidence) | `Color.mix(a, b, t)`, `Color.lighter(c, k)`, `Color.darker(c, k)`, `Color.contrast(a, b)`, `Color.components(c)` |

They ship in every program. `lighter` and `darker` work in OKLCH,
so the steps look even. `contrast` is the WCAG ratio.

### Motion: one `Easing`

| Before | After |
|---|---|
| `steps(4)`, `cubicBezier(…)`, `back(…)`, `laszlo(…)` | `Easing.steps(4)`, `Easing.cubicBezier(…)`, `Easing.back(overshoot)`, `Easing.laszlo(beginPole, endPole)` |
| Two types: `Easing` (the tokens) and `EasingCurve` (a built curve) | One type, `Easing`: a token or a built curve. `easing = quadOut` and `easing = { Easing.steps(4) }` are values of the same type |

### Text

| Before | After |
|---|---|
| `measureText(text, style, width)` | Unchanged: a plain function, an exception to the rule. It belongs to no type and no class |
| `escapeHtml(s)` | Unchanged, for the same reason |

### Functions that answer for the node that calls them become its methods

| Before | After |
|---|---|
| `providedTextStyle(…)`: a shared function that "answers for the view that calls it" and cannot be called in a script | A Node method: the face in force where the node is |
| `afterDelay(ms, fn)`: a shared function whose wait "belongs to the node whose handler asked" | A Node method |
| `afterSettle(fn)` | A Node method, beside `afterDelay` |
| `hostProvided(…)`: a shared function that climbs to the top of the tree for a value the same from every node | An App method: `app.hostProvided(name, fallback)` |
| `provided(…)` | Unchanged: a special form, not a method (below) |

A bare name in a body already resolves to the node's members, so **every bare call of the
three Node methods is unchanged**, and each is one method with no hidden twin. What changes is
what the name *is*: the node's own, which is what each of these already behaves as.
`hostProvided` depends on no node, only on the program, so it is the App's, written
`app.hostProvided(…)`.

`provided("name")` stays a special form. Its argument must be a literal name, because the
compiler wires the read to that name's providers at compile time; its type follows the name
(`provided("theme")` is the theme's tokens); it reads the nearest *ancestor* that provides the
name, never the node itself; and a member of the same name cannot shadow it. A method has
none of these properties.

### JavaScript's own

`setTimeout`, `setInterval`, `fetch`, `queueMicrotask`, `structuredClone`,
`encodeURIComponent` and the rest, `console`, `performance`: these are JavaScript's, not
Declare's. The reference lists them as such, with where each may be used, instead of as
Declare's shared functions. It no longer lists `performance` as callable in a body, which
refuses it.

### Services

`Clipboard`, `Commands`, `FilePicker`, `Accessibility`, `Inspect`, `Focus` and `Keyboard`
keep their names. Each name is now *only* the service:

- `Keyboard`'s abstract class becomes internal (the base of `KeyListener`).
- The `Focus` relay goes (next section).

### Facts instead of relays

Two classes are placed only to be told when a state changes. Every use reads the state
back at once:

```
// library/datagrid.declare today
_focusWatch: Focus [ onFocusChange() { classroot._within = Focus.holds(classroot) } ]
```

Under the rule, the states are attributes:

| Before | After |
|---|---|
| `Focus [ onFocusChange(v) { … } ]` | **`app.focusedView`**: the focused view, or `null` |
| `Focus.holds(this)` inside such a listener | **`View.containsFocus`**: true while focus is on this view or anything inside it. DataGrid's `_within` is exactly this |
| `Focus [ onGeometry(g) { … } ]` (FocusRing) | **`app.focusGeometry`**: the focused control's live outline |
| `Tooltips [ onTooltip(e) { … } ]` | **`app.tooltipRequest`**: the tooltip a view is asking for, or `null` |

A program reacts the way it reacts to anything: `x = { app.focusedView == field ? … }`, or
`trackChanges` with `onChange`. The sites are 4 in the library (`window`, `focusring`,
`datagrid`, `tooltip`) and 2 demos. This replaces the earlier ruling that `Focus` is "one
concept a program can ask or listen to" with a simpler one: a state is asked, and listening
is how every fact is listened to. `KeyListener` stays, because a key press is an event,
not a state.

### Types

| Before | After | Why |
|---|---|---|
| `Numerals`, `Text.numerals` | `NumeralStyle`, `numeralStyle` | The shape of the digits, paired with `NumeralWidth` / `numeralWidth` |
| `Axis` | `LayoutAxis` | It is a layout's axis; a chart's `Axis` is the program's. The attribute `axis = y` is unchanged |
| `Percent` (`{ percent: number }`) | Internal | It is how `50%` is represented, not a name a program writes |
| `Touch`, `File` | Kept | The web's names, with the web's model |
| `Scrolls` | Kept | An enum is named for its attribute (`scrolls`), as `Easing` is for `easing` |
| `Fill`, `Length`, `Inset`, `Radius`, `Theme`, … | Kept | |

## Collisions: one rule

**Every name the platform puts in a program's scope is refused as a program's own top-level
name** (a class, schema, theme, style, or a script's function or constant), whatever kind of
name it is. The refusal comes at the declaration and names the kind: a type, a builder's type,
a service, or a theme preset. It suggests the program-prefixed rename.

**Ruled (DT, 2026-11-14): no shadowing.** Letting a program's own declaration shadow a
type-only name (a chart's `LayoutAxis`, as a program's `Pick` shadows TypeScript's) was
considered and rejected. It is the equivalent of operator overloading: a word would mean one
thing in one program and another elsewhere, and the reference and the docs would describe a
`Touch` that is not the one in front of the reader. Every platform name means one thing
everywhere.

`Pick`, `Record` and the rest of TypeScript's type-only names are TypeScript's, not Declare's,
and stay as they are.

## Misuse names the kind

When a name is used as the wrong kind, the compiler says what the name is:

- "`Clipboard` is a service: `Clipboard.copy(…)`".
- "`Stroke` is a type: `Stroke(1, red)` builds one".
- "`stroke(` is not a function: the platform's builders are on their types, `Stroke(…)`".

declare.md states the rule (§ The rule) in a short paragraph, in place of the scattered
notes it has now.

## Color: the second stage

Built with the rest, as one unit (2026-11-15). A color name that arrives at run time is
refused with "use hex", so the names' table never ships. The bit-operation warning is a type
error that names `Color`'s operations, since a `Color` that may be a string is not arithmetic.

1. **A hex string, or a CSS name, wherever a color goes, `{ }` included**:
   `fill = { hovered ? "#4169E1" : "#191970" }`. Hex is how colors are written in CSS, in
   design tools and in JSON. `0x…` remains valid.
   - `Color` becomes `` number | `#${string}` | ColorName | null ``: plain TypeScript, so a
     misspelled literal is a type error.
   - The compiler replaces each literal headed for a color with its number. This is an
     optimization: TypeScript's contextual typing says which literals those are.
   - A string arriving at run time is parsed when it lands. Hex is a few lines of code. A
     name needs the 148-entry table, which stays out of production builds: either a name
     the compiler cannot see is refused with "use hex", or the table ships only in a
     program that needs it.
2. **`Color` as a schema field type.** `tone: Color` is never null, and `tone: Color?` may
   be. The runtime check accepts the `"#RRGGBB"` strings that JSON carries.
3. **A warning when bit operations are applied to a `Color`**, pointing at `Color.mix`.

A color stays a number at run time, so the Mac host and the canvas renderer are unaffected.
A distinct `Color` type, separate from `number`, is not proposed: it would refuse about
1,600 literals.

## Evidence

From the filed eval reports. These incidents bear out the rule; they are not its argument.

| Name | Runs | What happened |
|---|---|---|
| `Stroke`, `TextStyle`, `Fill` | 8 | The agent named its own record after a platform type, and was refused. Presentify 4 asked for the reserved names to be listed |
| `Pick` | 6 | `schema Pick` was refused, and Venue 31's renames went round in a circle. Shadowing fixed it (befff628) |
| `escapeHtml` | 3 | A script helper with the platform's name |
| `filter`, `blend` | 1 | The app's words met the view's. The rename to `visualFilter` freed them |
| `Axis` | 1 (this session) | `class Axis` broke checks inside library files |
| `Focus.getFocus() instanceof …` | 3 | "Is focus in here?" worked out by hand: `View.containsFocus` |
| A bit-shifting color `mix` | 13 Cadence runs, `apps/calendar`, `apps/lzx-dashboard` | Silently wrong for a translucent color: a half-transparent blue mixed with white gave `0xbcebc0`, where about `0x95bbeb` was expected. This is `Color.mix` |

## What changes

- **Programs:**
  - 712 builder calls in 127 files across the library, apps and docs, changed mechanically
    by `declare-changes`;
  - `measureText` (15 calls), `colorWithAlpha` (23), `activeTone` (1);
  - the 6 relay sites;
  - 3 `Axis` annotations;
  - 6 `numerals` uses.

  Each old name is refused, with its new spelling in the message.
- **Compiler and runtime:**
  - **Gone:**
    - the callee-position exception;
    - the reserved filter method names;
    - the hidden lowering function;
    - the `Focus` relay class and its doubling;
    - `Keyboard`'s public class.
  - **Added:**
    - the builders on their types;
    - the four facts;
    - one name registry and one check.
- **Docs:**
  - declare.md: the rule, and its §2 sentence on the bare-value vocabulary;
  - guides 09 (focus), 11 (paint and themes), 12 (text) and 21 (motion);
  - the reference.
- **Record:**
  - a `declare-changes` entry for each moved name;
  - an entry in `language-changes-2026-11.md`.

## Rulings needed

1. **The rule:** four capitalized kinds and no lowercase platform globals.
2. **Facts instead of relays:** `app.focusedView`, `View.containsFocus`, `app.focusGeometry`,
   `app.tooltipRequest`.
3. **The collision rule:** type-only names may be shadowed; run-time names are refused.
4. **Color strings:** as a second stage.

The independent review of the earlier draft is at
`/private/tmp/claude-503/-Users-temkin-Code-Declare/bd868aed-e85d-4519-9e43-4030fb585d8a/scratchpad/global-names-review.md`.
It argued for fewer changes. This revision takes the other side, and explains the choice in
§ Why.

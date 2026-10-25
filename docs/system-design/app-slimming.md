# What a production build carries

A production build (`declarec`, a server's `?build`) carries the runtime a
program can reach and nothing else. Most of the runtime is optional machinery —
data, replication, motion, islands, drawing, effects, rich text, the checker —
and a program that never reaches a piece of it does not ship it. This page is
how that is decided, how the build leaves a piece out, and how it is checked.

## 1. The rule

A piece of the runtime is left out only on a **signal with no exceptions**: a
fact about the program that no code, data or name assembled at run time can get
around. A production build behaves exactly as a development page does, apart
from debugging aids, so a piece the program could reach by any route the
language allows ships. The decision is made at compile time from the program's
source — its tree, its classes, the libraries it pulls in, every `{ }` body and
script block — and never at run time: nothing optional is loaded lazily.

There are four signals:

- **the build's settings**: its renderer, `--debug`, the Inspector, the bridge,
  the in-page compiler, hosting;
- **syntax the source contains**: a replicating path, `<->`, a selector
  segment, a literal the compile could not lower, a wiring it could not decide,
  and, read from the replicated child's own element, `virtualize` and
  `classFor` (rich text cannot make one: a path written as text is refused);
- **a global its code names**: the decoration constructors and the theme
  presets, which a body or script reaches only as identifiers (it cannot index
  its scope or the global object by a string; a direct `eval` keeps them all);
- **a class it uses**: constructed, extended, named as a value (`new X()`,
  `instanceof X`), picked by `classFor`, or kept with `use [ … ]`. A class named
  by a string outside that set is refused in every mode, with the same error
  (`Program.permitted`, enforced where every by-name construction resolves).
  The same holds for an island's program: a name it neither writes as a literal
  nor lists in `ship [ islands ]` is refused everywhere (`Program.permittedIslands`).

What a view's members reach — an attribute, a method, a handler — is not a
signal: they can be set from data (rich text tags, `createView` props) or by a
name code assembles, which no analysis bounds. So drawing, keyboard and focus,
3D, tint and mask, the canvas-filter fallback, files, data and typed data, and
the small pieces ship in every build.

## 2. Capabilities

The unit is the **capability**: one runtime module or a few, plus the triggers
that say a program reaches them. They are listed in one manifest,
`compiler/src/capabilities.ts`, and nothing else in the build decides what
ships.

| field | meaning |
|---|---|
| `id`, `describe` | its name, and what it is (for `--why` and `BUILD.json`) |
| `modules` | the files it stands for: `runtime/dist/<m>.js`, or `browser/<m>.js` |
| `when` | its triggers; it is needed when any one matches |
| `requires` | the capabilities it needs in turn |
| `hostsKeep` | a page that hosts other programs (islands) keeps it |
| `inert` | the exports the core calls whether or not the program uses it |
| `subset` | for a table the program reaches only by name: ship the entries it names |

Needed capabilities are closed over `requires`, the same shape as include and
auto-include: name only A and only A comes in; A requiring B brings both. A
`--debug` build keeps every capability. A page that hosts islands keeps every
`hostsKeep` capability, since a hosted program may need what the page never
names.

A page that compiles programs at run time (`ship [ compiler ]`) hosts too, and
carries the whole class registry, since what such a program constructs is not
known to the build.

What hosting shares, and why it costs: a hosted program runs **in the host's
runtime** — the build compiles each island's program to `programs/<key>.json`,
and the host's bundle hydrates and runs it; it brings no runtime of its own. So
the host carries what its tenants need. The scope is the runtime modules (the
capabilities); component classes are added exactly — the host's registry gains
the classes its tenants construct (`alsoUses`) — and a library `.declare`
component is compiled into each program, never shared. Open: the build compiles
every tenant, so it could keep the union of the host's and its tenants'
capabilities instead of every `hostsKeep` one; a hosting page (desktop, the
homepage) would then slim like any other.

## 3. Triggers

One walk over the program (`programFacts`) reads every fact a trigger can ask
about: its tree, its classes, every `{ }` body and every script block, with
TypeScript's own parser. No capability has analysis code of its own, and every
trigger is one of the four signals (`test/slim-signals.test.mjs` refuses any
other kind).

| trigger | signal | matches when the program… |
|---|---|---|
| `classes` | a class | uses the class or one descending from it: tags, `extends` bases, a class named as a value in a body (the compile writes it `$classes.X`), a `classFor` pick, `use [ … ]`, a literal rich text's tags, and each built-in's own bases (TextInput is an Editor) |
| `ownClasses` | a class | uses the class itself; a built-in descending from it does not count (Spring from Animator) |
| `mentions` | a global | names it as an identifier in a body or a script (`blur`, `Cupertino`, `eval`) |
| `slots` | syntax | writes the slot on an element (`virtualize`, `classFor` on a replicated child) |
| `syntax` | syntax | uses a construct: a replicating datapath, `<->`, a selector segment, an unlowered literal, an undecided wiring |
| `build` | the build | its renderer, `--debug`, `ship [ inspector ]`, `ship [ compiler ]` |

## 4. What stands in for a piece left out

A capability left out has each of its modules replaced by a **stand-in the
build generates** from the real module's exports, so a stand-in cannot drift
from its module:

- an export the core calls regardless is **inert**: a benign value from a
  fixed vocabulary (`noop`, `null`, `false`, `identity`, an empty class, …),
  declared in the manifest;
- every other export **refuses**. Reaching it means the program did need the
  capability, so it throws the coded "not aboard" error (`notAboard`,
  `runtime/src/errors.ts`) naming the capability, rather than misbehaving
  quietly;
- a constant that is neither inert nor refusable is a build error, so every
  export has a decision.

The core is written so the inert set stays small: an optional module is
reached through a call the core makes only when the program uses it (Animator
makes its timed run, `tween.ts`, at its first `start()`; a view arms
`visibility.ts` at the first tracked read of a fact), or through a class the
core only tests with `instanceof`, which an empty class answers.

A **subset** capability is a table the program can reach only by the names it
writes: the built-in component schemas (`schema`, keyed by the classes it
constructs), which a build carries only with the router (§5, "A program arrives
routed"). Unless a debug or hosting build needs it whole, the module ships
as itself with that table cut to the entries the program names. Whatever only
the cut entries referenced is left for the bundler to drop.

The component registry is the same idea: `registry.js` is generated
per program with only the classes it constructs (`slimRegistrySource`), and
the bundler drops the rest.

## 5. Literals ship as values

A compiled program carries no literal text for the runtime to parse. The
checker coerces every literal the program writes, in its slot, to the value it
means — `navy` in a Color slot is `0x000080`, `gradient(#F8F8F8, #D8D8D8)` a
gradient record, `easeOut` a curve, `bold` in a weight slot `700` — and while
the compile checks the program it will ship, the runtime's own coercion reports
each value it produces (`value.ts` `withLiteralSink`). The compile then
replaces each literal with a `value` literal carrying that value
(`compiler/src/lower-literals.ts`). The value is the one the runtime's
coercion computed, so it cannot disagree with what the runtime would have done;
every mode — a dev page, a production build, the Mac host — gets the same
program.

A theme preset named as a literal (`theme = SanFranciscoDark`) is resolved the
same way, to its record (`lowerThemeNames`), so a program ships the one preset it
names and never the table of them; a theme the program declares itself stays a
name, resolved from its own declaration.

So the literal parsers — the parse of a written literal by its slot's type,
with color names and hex, the decoration constructors, motion tokens and
curves, shape paths (`literal-parse.ts`) — are a capability like any other, and
one only rich text needs: its inline-view tags are read from the text as it
arrives, which may be data. A literal the compile could not ship as a value
would keep them too, and so would a wiring the compile could not decide (below);
there is no such literal in the corpus, and `test/lower-literals.test.mjs` holds
that line: every literal in the corpus ships as its value, and a compiled
program, booted, parses none of its own.

### A program arrives routed

How an attribute is wired depends, here and there, on its slot's type: a
`:path` on a cursor slot sets the record context instead of reading a value, a
bare list on an array slot is the list itself, a named child on a class-typed
slot (`layout: SimpleLayout [ … ]`) is that slot's value and not a child, a
State's attribute overrides the enclosing view, and a data read converts what
arrives to the slot's type. Once the compile has checked the program, it
decides all of these from the schemas and writes the answers onto the tree
(`runtime/src/route.ts`): a route on each attribute that needs one, and the
slot's type only where the runtime still converts by it. Instantiation reads
the answers and asks no schema, so a production build carries neither the class
schemas nor the code that registered the program's classes at boot.

The router, and the schemas with it, comes aboard (the `routing` capability)
only for a tree that arrives unrouted: a rich text's inline views, the
Inspector's evaluation, and an override literal in a State class's body, which
coerces by the slot of whatever view each use puts it in.

## 6. The kernel

The reactive kernel is chosen by the `kernel` build modifier: WebAssembly by
default, or JavaScript (`--kernel=js`). A build carries exactly one of them,
inlined. See [kernel.md](kernel.md) §10–11.

## 7. Checking it: the gate

Two checks. `test/slim-signals.test.mjs`, in `npm test`, is generated from the
runtime's own tables: every built-in class reached every way the language
allows (named as a value, tested with `instanceof`, aliased, kept with `use`,
picked by `classFor`, a literal rich text tag) is permitted; every global named
in a body, aliased or named in a script carries what it reaches; each construct
carries its capability; no trigger is keyed on a view's member; and every import
from a core module into a slimmable one is on a reviewed list with what makes it
sound, so a new one fails until it is classified.

`test/slim-corpus.test.mjs` checks behavior: a signal that misses shows up as a
program that behaves differently.

1. **The ladder, on the slimmed build.** Every app with a `tests/` folder has
   its rungs 5 and 6 (`tests/assert.mjs`, `tests/states.mjs` against the
   blessed baselines) run against its production build. The build carries the
   `__declare` bridge (`bridge: true`) so the rungs can drive it, and is
   otherwise unchanged.
2. **The corpus, slim against whole.** Every program — the apps, the docs
   demos, the probes, the eval apps — is built twice: slimmed, and whole
   (`slim: false, keepAll: true`). Both are booted headlessly with the wall
   clock, `performance.now`, frame times and media playback pinned. They must settle to the
   same view tree (every view's box, visibility and text), the same pixels and
   the same page errors. A difference counts only when the program is still:
   a second settle of the whole build must agree with the first.
3. **Slim against development** (`--compare dev`): the whole build with its
   bodies compiled from text, as a development page runs them.
4. **As shipped** (`--no-bridge`): both builds without the bridge, whose imports
   change the module graph; pixels and page errors only, since the tree is read
   through the bridge.

It takes minutes and a browser, so it is not part of `npm test`. Run it after
changing the manifest or splitting a module:

    node test/slim-corpus.test.mjs [--only <substring>] [--skip-ladder] [--skip-corpus] [--render=canvas] [--compare dev] [--no-bridge]

`declarec.test` checks the manifest itself: every module exists, every
stand-in generates, every export is answered, and no inert value names an
export its module lacks.

## 8. Seeing it

A build reports what it carries, and `--why` says what in the program brought
each capability aboard:

    $ node tools/declarec.mjs apps/weather/weather.declare --why
        capabilities: 15 of 47 aboard, 1 cut to what the program names (schema-table) — left out: checker, bridge, …
          themes: names SanFrancisco
          draw: declares draw()
          visibility: required by draw
          editor: constructs TextInput, an Editor
          animator: constructs Spring, an Animator
          …

`BUILD.json` records the same: `capabilities.needed` (each with its reason),
`capabilities.cut` and `capabilities.absent`.

## 9. Adding a capability

1. Put the optional code in a module of its own. The core must reach it only
   through calls it makes when the program uses it, or through `instanceof`.
2. Add the manifest row: its modules, its triggers from the kinds above, what
   it requires, and the exports the core calls regardless, as `inert`.
3. Run `declarec.test` (the manifest check) and the gate.

The compiler does not change.

## 10. What it comes to

Gzipped DOM builds, measured 2026-10-04:

| program | capabilities aboard | gzipped |
|---|---:|---:|
| hello-world (`App [ Text [ text = "hello" ] ]`) | 1 | 71.5 KB |
| marketmap | 11 | 107.7 KB |
| calendar | 15 | 111.1 KB |
| weather | 15 | 115.4 KB |
| sampler | 16 | 126.3 KB |
| tracker | 20 | 132.2 KB |
| desktop (hosts islands, so keeps what they may need) | 40 | 187.1 KB |

A JavaScript-kernel build is about 9 KB smaller again.

What every build carries is the core: the tree (views, instantiation,
attributes, bindings, the reactive glue), the renderer's own core (attachment,
the flush, input routing, text styling, the page scroller, the transform
chain), and the kernel. It is not optional machinery. Reducing it is an audit
of that code, not a capability.

Three candidates stay in every build, because nearly every real program uses
them and the saving would be small: text editing, reveal and anchors (close to
the URL and Back), and pane scrolling.

### Measured, not built

The rest of the candidates measured on 2026-09-26. **None is a capability**, and
none looks worth one: each saves well under a kilobyte, most programs use it, or
it would split code the renderer calls from its core. Figures are gzipped savings
on a hello-world DOM build, measured by emptying the functions' bodies, so they
are lower bounds.

| candidate | saves | trigger it would take |
|---|---:|---|
| raster cache | 0.78 KB | a `draw` method (the library's icons draw, so most apps keep it) |
| effects setters (filter, blend, mask, backdrop, tint) | 0.45 | a value slot of that kind |
| ignoreScroll | 0.27 | the attribute |
| image setters | 0.23 | the Image class |
| selectable text | 0.22 | the `selectable` attribute |
| horizontal scroll | 0.22 | `scrolls` = x or both |
| carved hits (shaped clips) | 0.20 | the `clip` value slot |
| travel, virtual extent, row ARIA | 0.18 | `travelWith`, `virtualize`, replication |
| link | 0.16 | `link` / `linksTo` |
| raise, travel, rich, `createView` (view side) | 0.16 | member read / class |
| negative-size diagnostics | 0.15 | none: production could always drop them, as it drops error prose |
| rotation, scale, matrix; 3D | 0.10; 0.05 | the attributes |

Corrections from measuring: pinch-zoom watching and the root's touch-action run
for every app at attach, so they are core (only carved hit-testing could be
triggered), and the shared transform chain is core (only the rotation, scale and
3D setters could be).

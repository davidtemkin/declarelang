# Declare Styling — the ruled design (2026-07-02)

*This is the single canonical styling document — the exploration that first asked whether Declare should adopt CSS, and the concretization that worked out the mechanism, consolidated into one file. It carries analysis (Part I, the WHY), the settled design (Part II, the WHAT), the mechanism (Part III, the HOW — including edge cases and the weather worked example), and validation (Part IV). Every ruling below was closed in a single live human walk-through plus two follow-up ruling batches, all dated 2026-07-02, except two implementation leans the leads carry forward (`cornerRadius`'s clip behavior, and whether same-named prevailing attributes on unrelated classes unify) — both flagged explicitly where they occur. The implementing rung is in flight; see [`neolang/HANDOFF.md`](../neolang/HANDOFF.md) §"The styling rung — the task" for the live record. For the language surface see [declare-language.md](declare-language.md); for the vision, [declare.md](declare.md); for the runtime, [declare-implementation.md](declare-implementation.md); for the parallel ruled design this one is designed to interoperate with, [animation.md](animation.md).*

---

## Part I — The analysis: why not CSS

*Written 2026-07-01, the day before the design settled. This is the WHY the rest of the document stands on — kept intact.*

### The question, and how to make it tractable

OpenLaszlo 4 adopted CSS — a customer-demanded implementation still in the 4.9 source. The short answer this part argues is **no, Declare should not adopt CSS** — but the reasons clarify what we *should* build instead.

The key move is to separate three things people conflate under "CSS":

- **The model** — the cascade, selectors, specificity, the box model, the units zoo. This is the "wholly different model of the world."
- **The value vocabulary** — `linear-gradient(a,b)`, `#0004`, `0 1 2 #0004`: notation for specific paint values.
- **Familiarity** — that developers (and code-generators) already know it.

The *model* is the only part that colonizes. The *vocabulary* is just notation. *Familiarity* is a separable dial we can balance independently. Keeping these apart is what makes the question answerable.

### 1. What is CSS (and Tailwind) actually *for* — and does LZX's semantics cover it?

Strip familiarity away and ask what *jobs* CSS and Tailwind do, and whether Declare's existing semantics — composition via `class`, reactivity via constraints, `state`, layout-as-attribute — already solve them:

| Job | CSS / Tailwind | Declare's answer | Adequate? |
|-----|----------------|------------------|-----------|
| **Reuse / DRY** ("style many things alike") | classes, `@apply` | `class` — a real component (behavior + structure + style), not a style bag | **Superior** — this is the core of the model |
| **Conditional / variant** (props → style) | `clsx` / `cva` class-juggling | a constraint: `fill = { selected ? a : b }` | **Superior** — real reactive expressions |
| **State variants** (`:hover`, `:disabled`, `:checked`) | pseudo-classes | `state` + events + constraints | **Adequate+** — arbitrary attribute sets, not a fixed list |
| **Layout** | flex / grid / spacing | layout-as-attribute + layout managers + constraints | **Adequate** — constraints ≥ in power; CSS grid is more *ergonomic* for 2-D |
| **Typography** | font properties | font attributes | **Adequate** |
| **Decoration** (color, gradient, shadow, border) | paint properties | attributes — but historically **images** | **Gap** → §3a |
| **Theming / design tokens / re-skin** | custom properties, Tailwind's curated scale, theme switching | constraints → a shared token object | **Semantics yes, ergonomics no** → §3b |
| **The cascade + specificity** | conflict resolution | *rejected* — explicit component model | **Correctly rejected** |

The pattern: **for the jobs, LZX's semantics are adequate — and for the big ones (reuse, variants, state) genuinely better** — because LZX styles through *composition + reactivity*, which subsumes classes + the cascade + value mini-languages.

And the cascade — CSS's *defining* mechanism — is its *worst* feature. Fifteen years of CSS Modules → CSS-in-JS → styled-components → Tailwind's flat utilities have been a steady retreat *from* the global cascade *toward* component-scoped, co-located, reactive styling — i.e. toward LZX's model. Even Tailwind, "the CSS people actually use," discards the cascade. **LZX was right, early.**

What remains is exactly **two real additions — and neither is CSS.** They are capability and ergonomics (§3).

### 2. The OpenLaszlo 4 CSS post-mortem (the cautionary tale)

OL4 shipped a genuine CSS implementation: a full **runtime cascade engine** — selectors, specificity, inheritance over the live component tree (`WEB-INF/lps/lfc/services/LzCSSStyle.lzs`, ~765 lines; a Batik SAC parser on the compile side in `compiler/StyleSheetCompiler.java` + `css/CSSHandler.java`; a `<stylesheet src="…">` element; even dynamic attribute selectors like `button[mouse=down]` with live re-evaluation). Impressively complete on the selector/cascade side.

But it got the trade **exactly backwards**, and the code shows it:

- **It imported the model, not the vocabulary.** The "properties" are an *arbitrary key-bag*, not real CSS properties — no property→attribute mapping, no box model, no `:hover`, no `@media` (thrown), `!important` parsed and then silently ignored (a standing TODO). An attribute responds to a CSS property only if it explicitly opts in via `$style{'prop'}`.
- **Near-zero adoption.** Across the *entire* 5.0 runtime, exactly **five** attributes declare `style=` (`bgcolor` on `LzNode`, plus `margin`/`border-width`/`border-color`/`padding` in `boxmodel.lzx`). The stock component library is essentially not CSS-styleable.
- **It was one of three overlapping styling axes** — `class` inheritance, the SWF-only `lz.style` theme object (dead in DHTML), and this. The specificity engine even reuses LZX class inheritance (`subclassof`) as a tiebreaker, so the two are entangled rather than orthogonal.
- **Stated motivation** (from `docs/.../css.dbk`, verbatim): *"CSS support … helps designers who are not fluent with the LZX scripting language maintain the appearance of Laszlo applications"* — familiarity + deploy-time re-skinning.

So OL4 imported CSS's **model** (the cascade — the problematic half) and skipped CSS's **vocabulary** (real properties — the familiar half designers wanted). Uncanny valley: not real CSS, not idiomatic LZX. The lesson for Declare is the mirror image — borrow the *vocabulary* (as typed values), reject the *model* — and actually build the theming ergonomics OL's CSS was reaching for and never delivered.

### 3. The two real additions

#### 3a. Decoration values (a drawing API)

The one genuine *semantic* gap. OL decoration was **image-based** — rounded corners, gradients, borders, shadows, window chrome all shipped as PNGs, because the SWF/early-DHTML substrate couldn't draw them cheaply. An own-pixels Canvas/WebGL kernel draws them natively, so Declare needs a way to *declare* decoration.

The tension: canvas drawing is *imperative* (a stream of context commands); Declare is *declarative and reactive*. OL4's drawing extension (an imperative `LzGraphics`/drawview context, hand-invalidated, Flash-derived) resolved that by not resolving it — an escape hatch wearing the costume of the API.

Declare inverts it — **declarative-first, imperative-escape** — in three tiers:

**1. Decoration as reactive attributes** (the front door, and ~100% of the calendar/dashboard chrome). Corners, gradients, borders, shadows, fills become *view attributes*, reactive like everything else:

```
View [ width = 80, height = 24,
    fill         = gradient(#f8f8f8, #d8d8d8),
    cornerRadius = 4,
    stroke       = stroke(1, #b0b0b0),
    shadow       = shadow(0, 1, 2, #0004),
    ]
```

Written bare they're static; in `{ }` they're live (`fill = { focused ? a : b }`) — the same static-vs-reactive rule as every other value. They are **analyzable** (read from markup, no execution), **composable**, and **substrate-independent**: the view declares *what*, the kernel decides *how* (canvas `roundRect` + `createLinearGradient` today, a shader on WebGL tomorrow). This replaces the PNGs as a mechanical swap: `resource = button.png` → decoration attributes.

**2. Declarative `path`** for custom vector shapes — an SVG-path string or a segment child-list. Still reactive, still substrate-independent.

**3. A reactive `draw()` escape hatch** for genuinely generative / data-driven art (charts, gauges, sparklines) — where declarative shapes get verbose:

```
class Sparkline extends View [
    values: number[] = [],
    draw(g: Painter) {               // reactive paint: re-runs when `values` changes
        g.moveTo(0, this.height);
        values.forEach((v, i) => g.lineTo(i * this.dx, this.height - v * this.sy));
        g.stroke(theme.accent, 2);
        },
    ]
```

Two non-negotiables that fix OL4's version:
- **Reactive, not hand-invalidated.** `draw()` is a *function of view state*; the runtime re-runs it when its tracked dependencies change — like a constraint, or React's `render` / Flutter's `paint`. No `invalidate()`.
- **An abstract drawing context (`Painter`), never the raw `CanvasRenderingContext2D`.** A small portable interface (`moveTo`/`lineTo`/`arc`/`rect`/`roundRect`/`fill`/`stroke`/`gradient`/`save`/`restore`/`transform`) that canvas *and* a WebGL tessellator can both implement. Hand out the real 2-D context and every chart welds the app to the 2-D backend forever — killing the WebGL path.

**Typed values, not CSS strings.** `gradient(...)` / `shadow(...)` are typed value constructors returning typed `Fill` / `Shadow` values — reactive per field, composable, type-checked, analyzable. A CSS-string parser is the *foothold* that drags in CSS's gravity (`calc`, `var`, the units zoo); typed constructors don't. CSS is a *reference for names and shapes*, not an imported grammar.

**The firewall (architectural, not willpower):** the kernel *renders* these with its own canvas/WebGL primitives. It never sets a DOM element's CSS and lets the browser draw it. The instant rendering is delegated to browser CSS, you have re-imported CSS *and* thrown away own-pixels. So the firewall is the architecture itself — the kernel is the renderer; CSS has nowhere to run.

**Synergy with the compositing roadmap.** A declaratively-decorated view is a *pure function of its attributes* → static when they don't change → it caches and layer-promotes cleanly (the deferred animation-perf optimization: per-subtree layer caching / dirty-rects). Per-frame imperative `draw()` doesn't. Declarative-first also sets up the animation future.

**Extent: tiny and closed.** Color and `cornerRadius` already exist. The entire new vocabulary is roughly three typed values — `gradient`, `stroke`, `shadow` — plus `path` (**RULED: `stroke` over CSS's `border`** — pairs with `fill`, matches the drawing-API vocabulary; full ledger in Part II).

#### 3b. A theming / re-skin primitive

The one job LZX's *semantics* always covered but never *packaged* — and, tellingly, the one it failed to package **twice** (the SWF-only `lz.style` themes died with the SWF runtime; the CSS re-skin got ~5 users).

**The insight: CSS acts as a side-channel mixin.** Styling that lives *outside* the component, is *ambient* (set once, applies broadly), *swappable*, and *composed in* rather than baked in. That external side-channel is the good *idea*. Global selector-matching + the specificity cascade is the bad *mechanism* it ships on — and that mechanism is *why* real-world reskinning is fragile: a global side-channel reaches into things never meant to be reskinned and breaks them. **The reskin superpower and the reskin fragility are the same feature.**

LZX struggles to reskin because its styling is *in* the component (`fill = navy` on the button), welded to structure — there is no external channel to reskin *from*.

Declare rebuilds the side-channel's *good half* from LZX-native parts, dropping the selectors:

- **A prevailing theme, inherited down the hierarchy.** A theme provided at a subtree root that components' style attributes *default to*. This is the *good* half of the cascade — inheritance down the tree — without the *bad* half — global selector matching. Set it at the app root; everything under resolves against it; no per-component wiring. Swap it → the subtree reskins, reactively.

  ```
  class CalButton extends Button [
      fill         = { theme.buttonFill },   // default your look to the prevailing theme
      cornerRadius = { theme.radius },
      stroke       = { theme.buttonStroke },
      ]
  ```

- **Tokens as the theme's contents** — a named, swappable value set (colors, spacing, fonts) — and they can be **external data**: a file a designer edits with no code. Exactly what OL's CSS reached for ("change the hexcodes, no LZX knowledge"), but safer: a *structured* token set, not arbitrary selectors that can hit anything.

- **Style bundles** for reuse and cross-cutting cases (`cardStyle`, `dangerStyle`) — named decoration bundles that reference tokens, applied *explicitly* (`styles = [card]`) rather than matched by a selector. This covers CSS `.class` reuse *and* the "all `.danger` things are red" cross-cut — but you *say which* views are danger, instead of a global rule reaching for them.

**The buried lede: LZX already had the right model and kept the wrong one.** It shipped *two* theming systems — `lz.style` (prevailing, "applies to itself and any component within it" — down the tree) and CSS (global selectors). The `lz.style` *approach* was correct; it died only because it was SWF-only, pre-reactive, and had a fixed slot schema. Declare revives *that* one — prevailing, hierarchical — done right: reactive via constraints, an open token set, cross-runtime, with real decoration values. CSS is the cautionary tale; `lz.style` is the buried lede.

**The principle this encodes:** Declare reskinning is **opt-in by convention, not reach-into-anything.** A component is reskinnable because its look *defaults to the prevailing theme* (which the standard library does by design) — not because a stylesheet can forcibly override it from a distance. That is *why* it will be robust where real-world CSS reskinning is not: you reskin what was built to be themed, and you don't accidentally restyle — and break — what wasn't.

---

## Part II — The settled design

*Settled in design discussion with the human across three sessions, all 2026-07-02: a live walk-through, then two ruling batches. This part is the canonical summary of what shipped: it stands on Part I's analysis, and Part III works its mechanism, edge cases, and worked example in full detail.*

**Status: design fully ruled.** Every ruling below is closed except two leads' leans, flagged explicitly, held for confirmation at implementation time (`cornerRadius` shapes the painted box only, clip stays explicit; no cross-class unification of same-named prevailing attributes). Next step is the implementation rung: the prevailing-attribute walk, decoration values plus the `fill`/`textColor` migration, the stylesheet and bundles, then a weather re-verification against this design.

### Three channels, one spine

A look can arrive at a view from three directions — three channels, each covering one of the jobs §1 credited to CSS, none carried on selectors or the cascade:

1. **Prevailing attributes** — values that flow *down the instance tree* (fonts, the theme). Context, not configuration: provided once at a container, in effect everywhere beneath. This is CSS's inheritance — the good half of the cascade — as a first-class attribute kind.
2. **Style bundles** — *explicit named reuse at the use site* (`styles = [card, danger]`). You say which views are cards; no rule reaches for them. This is CSS's `.class` reuse without the matching.
3. **The type-keyed stylesheet** — *style without source edits*: an external, swappable skin, partitioned by class name, restyling every instance of a kind at once. This is the external-side-channel re-skin — the job §3b said the side-channel was good *for* — rebuilt on a typed handle instead of selectors.

And **one spine carries all three.** Each channel's output is an *offer* for an ordinary attribute slot; the offers are ranked by one fixed precedence chain (below); exactly one installs, through the existing provision/ownership mechanism. There is no second styling system beside the attribute system — there is one attribute system, and three ways a value can arrive at it.

### Prevailing attributes — the one new attribute kind

The semantics, as the human ruled them:

- **Every instance owns the attribute.** No shared storage, no style object off to the side — the slot is an ordinary typed reactive attribute on every view.
- **An unset slot doesn't lack a value — it *follows* the nearest ancestor's effective value, live.** A change up there propagates down reactively.
- **A local set wins**, and makes this instance the provider its unset descendants follow — re-rooting the subtree.
- **The class-chain declaration default is the fallback** — used only when *no* ancestor anywhere above provides.

**Naming — RULED (live walk-through): the keyword is `prevailing`.** The question passed through several families before landing:

- `inherited` / `ancestral` — **rejected**: both collide with OOP class inheritance, which still applies to these attributes' *defaults*. The two are orthogonal axes — the class chain answers *"what am I"* (a Text has a fontSize, default 12); the instance tree answers *"where do I sit"* (this Text sits in a Tahoma-9 app).
- `ambient` (the working keyword up to this point) — **rejected**: it connotes "all over the place" — diffuse, everywhere-at-once — when the semantics is exactly the opposite: hierarchical and regional, a value in force *in this subtree*, overridable by anything more local.
- `environment` / `context` — **rejected**: long, and both are already overloaded terms — though SwiftUI's `Environment` and React's `Context` are the audience's precise recognition anchors for this mechanism, which is why the doc states that connection once (Part III §0), rather than chasing it into the name itself.
- The flow-down family — `cascading`, `propagating`, `flowing`, `standing`, `settling` — **rejected** for CSS toxicity plus internal vocabulary collisions: `cascading`/`flowing` read as importing CSS's own model (the thing this design pointedly is not); `propagating` collides with dispatch (events do *not* propagate in Declare — target-only, R5); `standing` collides with "a standing computation" (the constraint-graph vocabulary); `settling` collides with "the settle" (the one-frame reactive-update vocabulary used throughout for the render pipeline itself).
- **`prevailing` won.** Transparent English with exactly the right regime semantics — a *prevailing wage*, a *prevailing rate*, a *prevailing law*: the value in force in this region, until overridden more locally. It reads naturally at every site it appears — the declaration (`prevailing fontSize: number = 9`), an error message ("following the prevailing value, set on `report`"), ordinary prose ("swap the prevailing theme") — with zero collisions against the rest of the vocabulary. Its one real weakness, no direct software-framework precedent, is neutralized by stating the recognition anchor once: **this is the same mechanism as SwiftUI's `Environment` and React's `Context`: the nearest provider above wins, live.**

**Reading always yields the effective value.** No API hands back "unset"; only `isSet`-introspection distinguishes a local value from a followed one — author code and constraints never care. And resolution is **per-attribute independent**: one instance can follow *different* ancestors for different attributes.

Worked, on the shape of weather:

```
App [ fontFamily = "Tahoma,Geneva,sans-serif", fontSize = 9,   // App provides both

    status: Text [ text = "…" ],                  // fontFamily → Tahoma  (follows App)
                                                  // fontSize   → 9       (follows App)

    forecast: View [ fontFamily = "Helvetica",    // re-provides fontFamily for this subtree only;
                                                  // its own fontSize stays unset → still follows App

        where: Text [ text = "…" ],               // fontFamily → Helvetica (follows forecast)
                                                  // fontSize   → 9         (follows App — per-attribute
                                                  //   independence: two providers, one view)

        temp:  Text [ fontSize = 60, text = "…" ],// fontSize   → 60        (local set wins; temp is now
                                                  //   the provider for its own subtree)
                                                  // fontFamily → Helvetica (follows forecast)
        ],
    ]
```

**Fonts become prevailing on View**: `fontFamily`, `fontSize`, `fontWeight`, `textColor`. This dissolves weather's `Cap`/`HelvCap` — two classes that exist only to simulate font flow-down (Part III §8 works the whole rewrite: the App root provides the Tahoma-9-bold-white quartet once, the two Helvetica subtrees re-provide `fontFamily`, and every attribute still written on a Text is a real, local difference).

**Implementation rides the reactive core** — no new machinery kind. The accessor's unset branch walks the parent chain with *tracked reads* of each level's slot (R8's cursor inheritance — `inheritedCursor` — is the proven in-codebase pattern); a provider's write wakes exactly the followers whose walks passed through it; pay-per-use (a view that never reads a prevailing attribute allocates and walks nothing); a re-root or theme swap is one settle, one frame. Full mechanism, the resolution algorithm, and the reactive implementation sketch are in Part III §1.

### `theme` is just a prevailing attribute — never a global

This was the human's first question, so it is stated explicitly: **the theme reads *as if* global, but nothing about it is.** `theme: Theme` is declared prevailing on View; `{ theme.radius }` in any body resolves via the ordinary bare-name scope rule (language doc §11) to `this.theme.radius` — and *that* follows the tree like any prevailing slot. Scope resolution is what makes it as frictionless as `width`; the tree is what makes it not a global: two subtrees can carry different themes, and providing `theme` anywhere reskins exactly that subtree —

```
App [ theme = light,
    dangerZone: View [ theme = red,     // this subtree, and only this subtree, reskins
        … ],
    ]
```

### Declaration defaults may be bindings

```
labelColor: Color = { theme.buttonText },     // a declaration default that is a binding
```

The default is a **per-instance constraint** — installed, live, tracking `theme` — *unless* something higher-ranked provides the slot, in which case it **never installs** (no cost, no conflict). This is what lets standard components ship theme-deferring looks (the worked flow below) with zero wiring at any use site.

Honesty note: **R6 deferred default bindings** ("an unlock, not a redesign") — declaration defaults are literals-only in the implementation today. **RULED: the unlock lands scoped to the styling rung's consumers first.** Declaration-default bindings ship for the attributes this design actually needs them for (the `labelColor`/`pressedFill`/`cornerRadius`-style theme-deferring defaults below); general binding-valued defaults for arbitrary declarations elsewhere in the language stay refused-with-message, unlocked the same way R6 always intended — when a further consumer needs them.

### The stylesheet — the external channel

A top-level declaration, parallel to `class`:

```
stylesheet Dark [
    theme: Theme [ accent = #4F8EF7, buttonText = #EEEEEE, radius = 6 ],

    Button:     [ fill = gradient(#333333, #222222), labelColor = { theme.buttonText } ],
    WeatherTab: [ fill = #222833, textColor = #CAD0EC ],
    Text:       [ fontFamily = "Inter,sans-serif" ],
    ]
```

The `theme:` entry is the skin's token record — a skin and its tokens travel as one value. The class-keyed entries are attribute sets, validated against each named class's schema; a `{ }` in an entry evaluates with `this` = the styled view (the bundle rule), so `theme.buttonText` resolves through *that view's* prevailing chain.

**Provided as a prevailing value** — because `stylesheet` is itself a prevailing attribute on View:

```
App [ stylesheet = Dark ],                     // the whole app reskins — one line

toolbar: View [ stylesheet = DarkCompact ],    // a subtree re-roots a variant —
                                               // contextual styling, Flutter Theme-style
```

**Bare name in declarative position; a real call inside a body.** `stylesheet = Dark` is the *declarative* form — an intrinsic resolution of a stylesheet name against the program's registry, **compile-checked** (a typo, `stylesheet = Drak`, is a positioned error before the program runs). Inside a `{ }` body you are in real TypeScript, where a bare `Dark` is simply an unresolved identifier — and Declare **never rewrites identifiers inside a TS block** (the `:path` sigil is an opt-in sub-syntax, not identifier rewriting; the only transformation a body gets is the constraint wrapper's dependency-tracking). So a *reactive* swap is written as an honest method call:

```
report: View [ stylesheet = { night ? this.lookupStylesheet("Dark")
                                     : this.lookupStylesheet("Light") } ]
```

`lookupStylesheet(name)` resolves against the same registry and throws **loud + positioned** on a miss (the string argument can't be compile-checked — the honest cost of being in real code). This is deliberately *not* a gap to close with more sugar: the braces *are* the declarative/TS seam, and the surface tracks it exactly. The registry handle is a plain public method, never a `$`-sigil name — `$`-names (`$data`, the internal stylesheet-mark set) are compiler-internal and are never authored.

**Partitioned by class name — because the class is the only stable, typed, non-structural handle.** Instance-name / path keying couples the skin to tree structure — exactly the CSS fragility §3b diagnosed; use-site tags are bundles, which require source edits and therefore can't be the *external* channel. Class keying means "all things of this kind": it survives refactors, and — the decisive asymmetry against CSS — it enables **schema validation of every entry**. Each entry is checked against the named class's attribute schema, so a stale skin fails **loudly, with positioned errors**, where CSS silently ignores an unmatched selector or an unknown property and the app quietly rots.

(To be precise about what this is *not*: a class key is a dictionary lookup on a typed name, not a selector — no structural matching, no descendant/attribute patterns, no specificity. The "no selector system, ever" boundary, Part III §10, stands.)

**Resolution: class-chain lookup with field-wise merge.** A `CalButton` consults the `CalButton` entry, then `Button`'s, then `View`'s — *per field*, nearest class wins, the rest fall through field-by-field. This mirrors how declaration defaults already chain through `extends`, and it involves zero tree-matching. **RULED: field-wise chain-merge** — one mental model with declaration-default chaining, still zero tree-matching; exact-type-only, the recorded alternative, was not adopted.

**Skins as external data.** A `Stylesheet` is a typed record, so it is loadable through the existing data machinery — a `DataSource` whose payload is JSON a designer edits with no code, **validated on arrival** like any schema'd payload; a reskin is one write, one settle. This is the deploy-time re-skin OL4's CSS promised ("change the hexcodes, no LZX knowledge") and never delivered — delivered on a typed record instead of a selector engine.

### Provisions and precedence — one winner installs

For any slot on any instance, several sources may **offer** a value. The offers are ranked by one fixed chain — the canonical, source-visible precedence order for every slot on every view:

```
weakest → strongest

1. declaration default     (the reader's own class chain — the ultimate fallback; may itself be a binding)
2. prevailing follow       (nearest providing ancestor, for attributes declared prevailing — fonts, textColor,
                           theme, and stylesheet itself; not a provision — what an unprovided slot does)
3. stylesheet entry        (the ambiently active stylesheet's class-chain lookup, field-wise merged — above)
4. class-body set          (base → leaf — the class insisting on its own look)
5. bundle                  (use-site, written order — later wins)
6. instance set / binding  (use-site literals and `{ }`/`:path` bindings)
7. active state            (the ruled reversible-override layer — a future rung)
```

**RULED (live walk-through): class-body sets rank above stylesheet entries.** The deciding argument: a type-keyed stylesheet entry (`Text: [ fontFamily = … ]`) reaches *every instance of a class, including component internals* — a Button's caption **is** a Text, so a bare `Text:` entry reaches inside every Button, every CalButton, every future component that happens to contain a Text anywhere in its structure. If skin entries out-ranked class-body sets, a skin could steamroll any component's internals — CSS's reach-into-anything fragility, rebuilt one level down. Ranking class-body sets *above* the stylesheet makes the author's explicit sets **the encapsulation boundary**: what the author pinned in the class body resists the skin; what they left unset (a declaration default that defers to the theme) is the deliberately open surface. The stylable surface of a component, precisely, is *"what its author didn't pin."*

Companion guidance, recorded with the ruling: **base-class stylesheet entries (`Text: […]`, `View: […]`) are legal, but blunt** — the stylesheet's `* { }` analog, reaching every instance of that base class across the whole app. A well-behaved skin targets components (`Button:`, `CalButton:`) and tokens (`theme: […]`), not base classes; the language documentation should carry this as a warning, not a rule the checker enforces.

**Exactly one — the highest-ranked offer present — installs; the rest never touch the slot.** There is no runtime layering and no per-property specificity math: the slot is resolved at construction and re-resolved when a source above it changes (a stylesheet swap, a state activation). If the winner is a binding, it owns the slot — the existing one-owner rule, unchanged. Losers don't error, because they were never installed: a use-site literal quietly outranks a skin entry outranks a default, and none of them ever contended at runtime.

On a **prevailing** slot, rank 1 reads: *follow the nearest providing ancestor, else the declaration default* — following is not an offer, it is what an unprovided slot does; any installed offer from rank 3 up makes the instance a provider for its subtree.

Debugging inherits the clarity: **"why is this blue?" is answered by naming the highest-ranked source that offered blue** — seven ranks to check, in order, each visible in source (or in the one provided skin). (Mechanism-level reconciliation with the pre-existing R6 provision merge, and how active states interact with a prevailing slot, is in Part III §6.)

### The stylable surface is the attribute surface

**RULED: stylesheet entries may set any public attribute, behavioral included.** Uniformity — no style-only subset. A marker would be a second attribute kind on top of the one just added, drawing a style/behavior boundary that cannot be drawn — CSS never drew it (is `visible` style? is `spacing`? is `cursor`?) — and it couldn't protect anyway: every *other* channel (a use site, a subclass body, a bundle) already reaches all attributes, so a stylesheet-only fence guards one door of four. The silent-breakage fear that motivates such markers is answered by the typed validation instead — a skin that names a vanished or retyped attribute fails loudly with a positioned error. The residual risk — an attribute's *meaning* drifting under skins that set it, churn when a library renames — is ordinary API evolution, handled as such. The guardrails are the class-body-sets-outrank-skins ruling (above) plus the underscore convention below — together they fence what needs fencing.

**Privacy is by convention — and RULED as strictly a lint/style issue, the human's exact framing.** Underscore-prefixed attributes (`_pressT`) are internal — a §12-tier style convention. **The language and the checker know nothing of it: zero semantic weight, no compile-layer coupling.** Project-configured lint tooling *may* warn when anything outside the class (a skin entry, a use site, a subclass body) touches one, at whatever severity the project sets — that is a lint-tool policy choice, not a compiler rule. An advisory `styleable` lint remains the reserve option if library experience demands a stronger signal — still advisory, never semantics.

**The human's reservation, recorded honestly:** the human endorsed uniformity but called the unrestricted surface *"iffy"* — an endorsement with reservations. The rulings above are the resolution: uniformity stands (any public attribute is styleable), and the hedge is the encapsulation ruling (class-body sets outrank skins) plus the underscore lint convention — not a second attribute kind.

### The worked flow — standard and custom components

**(a) Standard components ship theme-deferring defaults**, so most restyling is token-only and never names a component:

```
class Button extends View [ cornerRadius = { theme.radius },        // header set defers to tokens

    label:       string = "",
    labelColor:  Color  = { theme.buttonText },     // declaration defaults that are bindings —
    pressedFill: Fill   = { theme.accent },         //   installed per instance unless outranked

    _pressT:     number = 0,                        // internal, by convention (underscore)

    face:    View [ width = 100%, height = 100%,
                    fill = { _pressT > 0 ? pressedFill : theme.buttonFace } ],
    caption: Text [ text = { label }, textColor = { labelColor },
                    x = { (parent.width - this.width) / 2 }, y = 4 ],
    ]
```

A skin that only sets tokens restyles every Button — and everything else that defers — without mentioning any of them:

```
App [ stylesheet = Dark ]        // the whole reskin — radius, accents, button text, everywhere
```

**(b) Custom components are skinnable with zero author cooperation.** `class WeatherTab extends View` has View's entire decoration surface for free — `fill`, `stroke`, `cornerRadius`, the prevailing font attributes — so Dark's `WeatherTab: [ fill = #222833, textColor = #CAD0EC ]` restyles every tab even though WeatherTab's author never thought about skinning. An author who additionally routes internals through declared attributes with theme defaults (as Button routes `labelColor`) makes the component token-responsive too — cooperation buys depth, but the baseline is free.

**(c) One-offs use instance sets and bundles** — the most local, highest-ranked channels, for the view that genuinely is different (`styles = [card]`, `fill = #B00020`).

### Decoration lives on View — no longer a question

**RULED (live walk-through):** decoration is not bolted onto View as an optional add-on; it is part of what a View *is*. The human's box ontology settles it: a View **is** "a colored box with corner radius (default 0, square) and an optional border" — `cornerRadius = 0` and `stroke = null` are default *values* of the box's own geometry, not absences bolted on from outside. No marker interface, no `Decorated` mixin, no "has decoration" flag — every View has these slots the same way every View has `width`/`height`.

**No bloat, because the defaults are prototype defaults.** An unset `cornerRadius` / `stroke` / `shadow` costs zero per-instance storage — the ordinary class-chain declaration default, same mechanism as any other attribute — and unset decoration never touches the paint path: a plain box with nothing set stays the single-`fillRect` fast path it is today. Decoration only enters the recording once a view actually sets one of these slots.

**The substrate precision that came out of the walk-through:** the firewall forbids CSS as a styling **model** — selectors, the cascade, specificity, CSS's own *semantics* for how a value gets its value — never CSS **properties** as one backend's paint primitives. The DOM backend remains free to brush a View's decoration using `border-radius`, `box-shadow`, and friends, exactly as it already brushes `fill` via CSS `background` — that is implementation, not model. Cross-backend perceptual identity is enforced the way it already is everywhere else in this codebase: the test suite's cross-backend pixel diff, with per-view canvas rasterization as the fallback if a given CSS paint property ever proves pixel-unstable. (The full value grammar, fields table, and per-backend rendering mechanism this ruling licenses are worked in Part III §4.)

### Typed decoration values — the ruling, in brief

The decoration surface is **typed value constructors, never CSS strings** — `fill` (a bare `Color` coerces; `gradient(…)` for the rest), `stroke(width, color)`, `shadow(dx, dy, blur, color)`, `textShadow`, `cornerRadius` — immutable plain-data records, reactive by re-production, structurally equality-gated. And the firewall stands architecturally, precisely stated: **the kernel renders decoration with its own drawing, on both backends** — as a synthesized recording that the Canvas backend replays and the DOM backend may realize either through its own canvas rasterization or through equivalent CSS paint primitives (border-radius, box-shadow, …). What the kernel never does is let the browser's *cascade or selector matching* pick the value — the value handed to the DOM element is always the one resolved value the attribute system produced. The instant a stylesheet's cascade or a selector, rather than the kernel's own resolution, were allowed to decide what paints, CSS's model would be re-imported and own-pixels surrendered — that is the line the firewall actually draws. Full grammar, the value/field table, and the per-backend rendering path are in Part III §4.

### The closed ruling ledger

Every decision below is RULED — closed, not open — except the final two, held as leads' leans into implementation. (Full argumentation for each is threaded into the sections above and into Part III.)

1. **The keyword is `prevailing`.** `ambient`, `environment`/`context`, `inherited`/`ancestral`, and the flow-down family (`cascading`/`propagating`/`flowing`/`standing`/`settling`) were all considered and rejected; full reasoning under "Naming," above.
2. **Decoration lives on View — not a bolt-on.** The box ontology: a View *is* "a colored box with corner radius (default 0, square) and an optional border" — `cornerRadius = 0`/`stroke = null` are default *values* of the box's own geometry, not the absence of an optional extra. No bloat: unset slots are ordinary prototype defaults (zero per-instance storage) and never touch the paint path, so a plain box stays the single-`fillRect` fast path. The CSS firewall is against CSS as a styling *model* (selectors, cascade, specificity), never against CSS *properties* as one backend's paint primitives.
3. **Class-body sets outrank the stylesheet.** A type-keyed stylesheet entry (`Text: […]`) reaches *every instance of a class, including a component's internals* — a Button's caption is a Text, so a stylesheet entry keyed on `Text` reaches inside Button whether or not Button's author meant to expose that. Ranking class-body sets above the stylesheet makes the author's explicit sets the encapsulation boundary — a component's stylable surface is exactly *what its author didn't already pin*. A base-class stylesheet entry is legal but blunt.
4. **`textColor` replaces `Text.color`.** One slot, prevailing on View, same name at any level (leaf or provider); `color` retires from Text outright — no alias, no hidden wiring. The rename cost is pre-1.0 (our own apps plus the doc examples).
5. **`fill: Fill` subsumes `backgroundColor`.** `Fill = Color | Gradient`, Color-coercible (`fill = navy`); two slots for "what paints this view's box" would have been deadweight. `fill`/`stroke` is the deliberate design-tool vocabulary pairing.
6. **Alpha rides the color number, in both literal homes.** `#RGBA`/`#RRGGBBAA` (declaration position) and `0xRRGGBBAA` (the 8-hex `0x` twin, valid in `{ }` and other expression position) both carry alpha — a trailing `FF` normalizes to plain opaque RGB. A color is always *one number*: opaque RGB is `0…0xFFFFFF`, an alpha color rides a sentinel encoding above it, so an 8-hex `0x` is *always* an alpha color, never a large integer (a genuine large integer is written in decimal). Colors are non-null by default — a slot is nullable only where its default is `null` (the inherit / "no paint" slots) — and the paint constructors (`stroke`/`shadow`/`gradient`) take `Color`, so a color flows in without a guard. A *computed*-alpha constructor (`rgba(…)`/`alpha(…)`) is still deferred to the first consumer that needs alpha it can't write as a literal.
7. **Design-tool value names.** `fill`/`stroke`/`shadow`/`textShadow`/`cornerRadius`/`gradient(…)` — `stroke` over CSS's `border` (pairs with `fill`, matches the drawing-API vocabulary). Values are constructor calls (`stroke(1, #B0B0B0)`), admitted in literal position and as real functions inside `{ }` — one vocabulary, two lexical homes.
8. **Stylesheet lookup is a field-wise chain-merge** — a subclass entry's fields win, unmentioned fields fall through per-field along the class chain; one mental model with declaration-default chaining, still zero tree-matching.
9. **The underscore convention is strictly lint-tier.** A naming convention only; the language and checker know nothing of it; lint tooling may warn on outside touches at project-configured severity — no semantic weight, no compile-layer coupling.
10. **Stylesheet entries may set any public attribute, behavioral included.** Uniformity — there is no undrawable style-only subset; the class-body-sets-outrank-stylesheet ruling (item 3) plus the underscore convention (item 9) are the guardrails.
11. **Declaration defaults may be bindings** — the R6 unlock, needed for a class to default a value against the ambient theme (`fill = { theme.buttonFill }` as a class-body default, not just a use-site set); scoped to the attributes this design actually needs, general binding-valued defaults elsewhere stay refused-with-message until a further consumer needs them.
12. **Theme representation, v1: a plain immutable TS record, swapped wholesale.** One write replaces the whole record — one settle; no in-place token mutation. First-class theme/token declaration syntax is deferred until calendar-Declare produces evidence it's needed.
13. **The equality gate extends to structural equality for decoration values.** A `{ }` re-producing an equal `Shadow`/`Gradient`/etc. stops the cascade exactly as `===` does for scalars — cheap, since these are a handful of number/color fields.
14. **The bundle surface: top-level `style name [ sets ]` + a `styles: [ … ]` view attribute, written order, merged as provisions.** Only the winner installs — no ownership conflicts reachable through styling. **v1's list is static**; conditional looks are what constraints are for; a reactive `styles = { … }` waits for a real consumer.
15. **An unresolved `:path` on a prevailing slot lands the followed value, not the bare declaration default** — the consistent generalization of R8's rule, since the declaration default is just the chain's end.

**Two open leans — not yet human-ruled, carried into implementation as the leads' recommendation, to be confirmed (or overturned) there:**

16. **`cornerRadius` shapes the painted box only; it does not clip.** Clipping stays the explicit `clip` attribute — a rounded clip is asked for explicitly (both attributes set), never implied by the corner radius alone.
17. **Same-named prevailing attributes on unrelated classes do not unify at follow time.** Two classes with no shared base that happen to declare a same-named prevailing attribute are two different attributes wearing one spelling, not one channel; a user-declared prevailing attribute travels through shared base classes only — this is what prevents accidental cross-component coupling from a name collision alone.

### Non-goals (unchanged)

The rejections stand exactly as before: the CSS cascade, selectors, specificity, the box model, `@media` / `calc()` / `var()`, and any delegation of rendering to the browser's CSS engine. The stylesheet does not reopen them: a class key is a typed lookup, not a selector; field-wise merge is the declaration-default chain, not specificity; and precedence is seven fixed ranks with one winner, not a cascade. (The full boundary list — what this design deliberately does not cover — is Part III §10.)

---

## Part III — The mechanism

*The concretization: the reactive mechanism, the full decoration grammar and fields, style bundles, precedence's reconciliation with the pre-existing provision merge, the enumerated edge cases, and the weather app worked end-to-end. §0 immediately below is the approved introductory text — kept verbatim, as written.*

### 0. Prevailing attributes — the introduction

*Approved by the human, 2026-07-02, live walk-through ("solid, locked in") as the canonical intro-level explanation — the eventual language doc's text for this feature, staged here first.*

Some values aren't really properties of one view — they're properties of a *place in your UI*. The font a screen uses, the theme a panel is skinned with, the label width a form aligns to: you want to say these **once, on a container**, and have everything inside just use them.

That's what a `prevailing` attribute is. Declared with one keyword:

```
prevailing fontSize: number = 12,
```

it behaves like any other attribute, with one extra rule:

> **If a view doesn't set it, its value is whatever the nearest enclosing view set — live.**

You never look it up; you just read the attribute, and the right value is there.

```
App [ fontFamily = "Inter,sans-serif", fontSize = 13,

    title: Text [ text = "Settings", fontSize = 20 ],   // sets its own size: Inter 20
    crumb: Text [ text = "Home ▸ Settings" ],           // sets nothing: Inter 13, from App

    sidebar: View [ fontSize = 11,                      // provides a new size for its subtree
        nav: Text [ text = "General" ],                 // Inter 11 — family from App, size from sidebar
        ],
    ]
```

Three things to notice:

1. **Providing takes no keyword.** Setting a prevailing attribute anywhere (`sidebar`'s `fontSize = 11`) makes that view the source for everything below it. Setting it on a leaf just styles the leaf.
2. **Each attribute travels on its own.** `nav` takes its font *family* from `App` and its *size* from `sidebar` — every prevailing attribute independently follows its own nearest provider.
3. **It's live.** Change `App.fontSize` at runtime and every view still following it updates, in the same frame. A prevailing attribute is a standing relationship, like everything else in Declare — not a value copied at startup.

If no ancestor sets it, the attribute simply has its declared default (`12` above). And a view can always tell the difference between "I set this" and "I'm following" — but code that just *reads* the value never needs to care.

**The theme is the headline use.** `theme` is an ordinary prevailing attribute on every view, holding a record of design tokens. Components write their look against it (`fill = { theme.buttonFill }`), so re-skinning a whole app — or one panel — is a single set:

```
App [ theme = dark, … ]                       // the whole app
dialog: View [ theme = light, … ]             // just this dialog
```

**Don't confuse it with class inheritance — the two answer different questions.** Class inheritance is about *what kind of thing you are*: `CalButton extends Button` gets Button's declarations and defaults. Prevailing values are about *where you're standing*: the same button renders 13px in the header and 11px in the sidebar, because the value comes from the tree around it, not from its class. The two compose — your class says what the attribute *is* and its fallback default; your position says what value *prevails* there.

*(If you know SwiftUI's `Environment` or React's `Context`: this is that mechanism — nearest provider above wins, reactively — as a plain attribute, one keyword, no wrapper types.)*

**One habit worth forming:** if your component's layout *depends* on a value — an icon font, a label sized to fit — set it explicitly rather than following. A local set both protects your geometry and becomes what *your* subtree follows.

#### Worked example: a multi-level hierarchy

View's built-in prevailing declarations (the ones every view already has, §3 below works the full excerpt):

```
class View extends Node [
    prevailing fontFamily: string     = "system-ui",
    prevailing fontSize:   number     = 12,
    prevailing fontWeight: FontWeight = normal,
    prevailing textColor:  Color      = #000000,
    prevailing theme:      Theme      = defaultTheme,
    …
    ]
```

A user class can declare its own — not just View. `Pane`/`Row` below declare `labelWidth`, a form-alignment value with no built-in equivalent, and `Row` inherits it *by extending `Pane`* — the shared-base rule (§2, §11 Q12): two classes with no common ancestor never unify a same-named prevailing attribute by coincidence of spelling, but a subclass shares its base's slot exactly as `Row` shares `Pane`'s here.

```
class Pane extends View [
    prevailing labelWidth: number = 80,     // user-declared, on a non-View class

    layout: SimpleLayout [ axis = y, spacing = 4 ],
    ]

class Row extends Pane [                    // extends Pane — so labelWidth is the SAME slot, inherited
    label: string = "",
    value: string = "",
    layout: SimpleLayout [ axis = x, spacing = -10 ],
    labelText: Text [ width = { labelWidth }, text = { label } ],   // reads its own labelWidth —
                                                                     //  which may be following an ancestor Pane
    valueText: Text [ text = { value } ],
    ]
```

Put together, an App hierarchy exercising all of it — independent per-attribute follow, re-rooting, a `theme` override scoped to one subtree, and `labelWidth` traveling through `Pane`/`Row`'s shared base:

```
App [ fontFamily = "Inter,sans-serif", fontSize = 13, theme = light,

    header: View [ fontSize = 16,                       // re-provides fontSize for this subtree only
        title: Text [ text = "Settings" ],              // Inter 16 — family from App, size from header
        ],

    sidebar: View [ fontSize = 11,                      // a second, independent re-provision
        nav: Text [ text = "General" ],                 // Inter 11 — family from App, size from sidebar
        ],

    dangerZone: View [ theme = red,                     // re-roots theme ONLY — fontFamily/fontSize still
                                                         //  come from App; per-attribute independence
        confirmDelete: Button [ label = "Delete Account" ],   // reads theme.accent etc. through `red`
        ],

    form: Pane [ labelWidth = 100,                      // provides labelWidth for this Pane and its Rows
        nameRow:  Row [ label = "Name:",  value = { user.name } ],   // labelWidth 100 — follows `form`
        emailRow: Row [ label = "Email:", value = { user.email } ],  // labelWidth 100 — follows `form`
        idRow:    Row [ label = "ID:", value = { user.id }, labelWidth = 60 ],  // local set wins — re-roots
                                                                                  //  (would apply to any
                                                                                  //  children idRow had)
        ],
    ]
```

---

### 1. The two-axis model

Styling in Declare composes **two orthogonal inheritance axes** that must never be confused, plus a local override that beats both:

| axis | question it answers | mechanism | example |
|---|---|---|---|
| **class chain** (OOP inheritance) | *what kind of thing am I?* | `class X extends Y` — declaration defaults chain base→leaf (the existing R2/R6 schema walk) | `Text` declares `fontSize: number = 12` |
| **prevailing follow** (tree inheritance) | *where do I sit?* | an unset **prevailing** slot follows the nearest ancestor's value, live | a `Text` under `App [ fontSize = 9 ]` renders at 9 |
| **local set** | *what did the author say here?* | any provision on the view itself (literal, binding, bundle, state) | `Text [ fontSize = 60 ]` |

The core mechanism is **one new attribute kind**, declared with a modifier on the ordinary attribute declaration:

```
prevailing fontSize: number = 12
```

Its semantics, stated precisely:

- **Every instance owns the attribute.** There is no shared storage, no style object off to the side — the slot is an ordinary reactive attribute on every view, with the full existing lifecycle (typed check, equality gate, was-set, one-owner).
- **An unset slot doesn't lack a value — it FOLLOWS the nearest ancestor's, live.** "Unset" is the existing was-set fact (`isSet`); "follows" means reading the slot yields the nearest providing ancestor's *effective* value, and a change up there propagates down reactively.
- **Setting it locally wins, and re-roots what descendants follow.** A local provision (a literal, a `{ }` binding, a bundle set, an active state override) makes this view the value's source for itself *and* the provider its unset descendants follow.
- **The class-chain default is the ultimate fallback** — used only when no ancestor anywhere up the chain provides. Note the fallback comes from the *reader's* class chain (a `Text` with no providing ancestor falls back to `Text`'s declared default, not to anything about its parent).

The two axes genuinely compose rather than collide: class inheritance still supplies the *declaration* and its default (the vertical axis — "a Text has a fontSize, default 12"); the tree supplies the *value in context* (the spatial axis — "this Text sits in a Tahoma-9 app"). The human's naming rejection follows from exactly this: calling the mechanism "inherited" would collide with class inheritance, which already exists and *still applies* to these attributes' defaults.

**The keyword is `prevailing`** — the full naming ruling, with every rejected alternative and the reasoning behind each, is in Part II ("Prevailing attributes — the one new attribute kind"). Every `ambient` that would otherwise appear in this section is that same keyword, `prevailing`; precedents remain apt (WinForms *ambient properties* — the exact semantics, down to the parent-chain walk and local-set override; Jetpack Compose's original *Ambients*; SwiftUI's `@Environment` — just not as the chosen spelling).

#### The resolution algorithm

For a prevailing attribute `a` read on view `v`:

```
effective(v, a):
    if provided(v, a):            # any local provision: literal, binding, bundle, active state
        return local(v, a)        # the merged-provision value (see §6 for the merge)
    for p in ancestors(v):        # parent chain, nearest first
        if hasSlot(p, a):         # p's class (chain) declares a — others are transparent
            if provided(p, a):
                return local(p, a)
    return classDefault(v, a)     # the reader's own declaration-default chain
```

Equivalently and more cheaply: `effective(v) = provided(v) ? local(v) : effective(parent′)` where `parent′` is the nearest ancestor with the slot — the chain collapses recursively, so a follower N levels below a provider reads through N−1 transparent hops, each itself just "unset → ask up."

Reading **always** yields the effective value — there is no API that hands back "unset." Only `isSet`-style introspection (existing runtime surface, `attributes.ts`) distinguishes a local value from a followed one; author code and constraints never need to care.

#### Reactive implementation sketch

The proven in-codebase pattern is **R8's cursor inheritance** (`inheritedCursor`, HANDOFF Decisions §R8): a parent-chain walk in which *every level's slot is a tracked read*, so a value appearing/changing/clearing anywhere above wakes exactly the readers below it. Prevailing-attribute resolution is the same walk over ordinary attribute cells:

- The attribute accessor's **unset branch walks the chain**, registering a tracked read of each level's slot cell en route (when read under tracking; a plain read outside a constraint just walks and returns — one pointer comparison per level, no allocation, the R4 cost model).
- A **provider's write** goes through the ordinary setter → wakes that cell's subscribers → every follower whose walk passed through that level re-runs, equality-gated as always. A **mid-tree set on a previously-following view** is just a write to a cell every deeper follower already tracks — the subtree re-roots in **one settle** (the write wakes them; their re-walk now stops at the new provider). Un-set (if it ever gets surface — see §7.4) is the same wake in reverse.
- **Consumers are the existing kinds, unchanged:** an author constraint reading `someText.fontSize` tracks the chain through the accessor; the leaf's *style push* (Text's font → the seam's `setTextStyle`) becomes a small derive over the effective values — exactly the shape of the existing measure derives; a **draw body** reading `this.fontSize` or `this.theme` tracks the chain like any phase-1 constraint and re-records on a prevailing change, zero new machinery.
- **Pay-per-use, idle-zero:** a view that never reads a prevailing attribute allocates nothing and walks nothing; an app that never sets one pays only the (short) walk at each Text's style derive, once, then sits inert; no polling, no style-recalc pass, no rAF while idle. A theme swap or a font re-root is N tracked wakes → one settle → one frame, the pinned R4 pipeline.
- A **cached resolved value per view** (invalidated by the chain) is a free policy dimension if profiles ever show deep-tree walks mattering; the semantics are the walk.

---

### 2. The `prevailing` declaration surface

`prevailing` is a contextual modifier on the existing attribute-declaration member (the R6 `name: Type = default` shape) — one word of new grammar, no new member kind:

```
// In the self-hosted core (how View declares the built-ins, §3):

class View extends Node [
    prevailing fontFamily: string     = "system-ui",
    prevailing fontSize:   number     = 12,
    prevailing fontWeight: FontWeight = normal,        // value FontWeight = normal | bold
    prevailing textColor:  Color      = #000000,
    prevailing theme:      Theme      = defaultTheme,
    …
    ]

// A user class declaring a new prevailing attribute (any class can):

class Chart extends View [
    prevailing palette: Palette = defaultPalette,      // all Charts in a subtree share a palette

    axis:  ChartAxis [ … ],                         // internal parts read { palette.grid } etc.
    ]
```

Rules:

- **Being prevailing is declared once, with the slot.** A subclass cannot redeclare the attribute (existing R6 rule) and cannot change whether it's prevailing — it is part of the slot's identity, like its type. The checker learns one bit per schema attr.
- **Providing and following both require the slot.** A view provides or follows `fontSize` iff its class chain declares it. Built-ins declared on `View` are therefore providable *anywhere* — any container can say `fontSize = 9`. A user-declared prevailing attribute on `Chart` is providable only on `Chart`-descended views; plain views between two Charts are **transparent** to the walk (skipped — they have no slot to consult).

  **Open lean (not yet human-ruled — ledger item 17, Part II):** if several unrelated classes must share one prevailing attribute, they do **not** unify by name alone — declare it on a shared base class instead (the analyzable coupling, same posture as the `App`-stays-lexical ruling). Two classes with no shared base that happen to declare a same-named prevailing attribute are two different attributes wearing one spelling, not one channel; a user-declared prevailing attribute travels through shared base classes only. The lean exists to prevent accidental cross-component coupling from a name collision alone.
- **Providing is any ordinary provision** — no special "provide" syntax:

```
App [ fontFamily = "Tahoma,Geneva,sans-serif", fontSize = 9,      // literals provide
      fontWeight = bold, textColor = #FFFFFF,

    panel: View [ fontSize = { compact ? 8 : 10 },                // a binding provides, live —
                                                                  // followers below track it
        note: Text [ text = "…" ],                                // unset → follows panel
        big:  Text [ fontSize = 14, text = "…" ],                 // set → wins, and re-roots
        ],
    ]
```

- **No new check machinery**: a `{ }` or `:path` on a prevailing slot checks like any binding; setting a prevailing attribute the class doesn't declare is the existing unknown-attribute error.

---

### 3. Which built-ins become prevailing

**RULED set: the four font attributes + `theme`. Nothing else.**

- **`fontFamily` / `fontSize` / `fontWeight` / `textColor` — declared `prevailing` on View.** This executes the R3 checkpoint ruling ("font attributes will cascade — View-declared, nearest ancestor wins, Text overrides — full design at the styling pass") and closes weather deliberate-divergence #4. The doc's own examples set fonts on container views; the original weather.lzx cascades `font`/`fontsize`; weather's `Cap`/`HelvCap` exist *only* to simulate this — §8 shows them dissolving.
  - **`textColor` is the one slot; `Text.color` retires.** Today Text carries `color`; a View-level prevailing attribute can't be called `color` (ambiguous against background paint), so the prevailing attribute is `textColor` — and keeping *both* names would mean two spellings for one concept plus a subtle asymmetry (which one re-roots?). **RULED (adopted verbatim): one slot, `textColor`, prevailing on View; Text renders with it; `color` on Text is removed** — no alias, no hidden wiring, same name at any level (the rename cost is ours alone — one app). The alternative (keep `color` on Text as a local-only alias whose default follows `textColor`) was not adopted.
- **`theme` — declared `prevailing theme: Theme` on View.** The theme is *just a prevailing attribute*: a typed token record provided at the app root (or any subtree root), followed by everything beneath. Components opt in by referencing tokens in their class-body defaults:

```
class CalButton extends Button [
    fill         = { theme.buttonFill },     // defaults your look to the prevailing theme
    cornerRadius = { theme.radius },
    stroke       = { theme.buttonStroke },
    ]

App [ theme = winterTheme,                   // swap → the subtree reskins, one settle
    …
    dangerZone: View [ theme = redTheme,     // per-subtree override = ordinary re-rooting
        … ],
    ]
```

  This is the exploration's prevailing-theme primitive (Part I §3b) with zero bespoke mechanism — `lz.style` revived on the reactive core. **`Theme` itself, v1:** a plain immutable TS record (defined in module/script land, typed by the tsc path); themes swap **wholesale** (replace the record — one write, one settle), matching R8's snapshot-read posture; in-place token mutation is not surface. First-class theme/token *declaration syntax* is deliberately deferred until calendar-Declare produces evidence it's needed — **RULED, ledger item 12, Part II.**

**Why `fill` (having replaced `backgroundColor`), `opacity`, and `visible` must NOT be prevailing.** The test that separates them: *a prevailing attribute is one whose value is naturally authored at containers but consumed at leaves, and whose effect does not already compose through the render tree.* Fonts and theme pass. The paint/compositing facts fail it twice over:

- **`fill` (`backgroundColor`, retired) is a per-view paint fact, not context.** A child "following" its parent's fill would paint an identical opaque rect over the region the parent already painted — inheritance here doesn't mean anything except redundant double-painting (and with alpha, *visible* double-painting). `null`-means-transparent already composes correctly: an unpainted child shows its parent. CSS agrees — `background` is one of the great majority of properties that do *not* inherit.
- **`opacity` and `visible` already compose structurally through the tree** (group-opacity ruling; visibility prunes the subtree). Making the *values* prevailing would apply the effect twice — a 0.5-opacity parent whose children "follow 0.5" composites at 0.25. The composition IS the inheritance for these; prevailing would be a second, wrong channel.
- Geometry (`x`/`width`…) is obviously per-view. Decoration (`cornerRadius`, `stroke`, `shadow`) is per-view identity — it *themes* through tokens (`cornerRadius = { theme.radius }`), which is the right indirection: the theme names the design decision, the component decides where it applies.

The prevailing set is therefore **small and closed by policy**: fonts + theme now; a future prevailing attribute must pass the container-authored/leaf-consumed/doesn't-already-compose test and gets ruled like any new surface (likely future candidates when their eras arrive: text `Align`, a locale/direction slot, `palette`-style component-family prevailing attributes — all user-declarable meanwhile).

---

### 4. Typed decoration values

The ruling that decoration lives on View as first-class geometry — not a bolt-on — is in Part II ("Decoration lives on View — no longer a question"); this section works its grammar, fields, and per-backend rendering mechanism.

The vocabulary lands as **typed value constructors — never CSS strings** (Part I §3a's own firewall: a CSS-string parser is the foothold that drags in `calc`/`var`/the units zoo). The vocabulary is a reference for names and shapes, not an imported grammar. **RULED: the design-tool vocabulary** (Part II ledger item 7) — `fill`/`stroke`/`shadow`/`textShadow`/`cornerRadius`/`gradient(…)`, `stroke` over CSS's `border` — pairs with `fill` and matches the drawing-API vocabulary; the constructor-call grammar form itself (below) was never contested and stands adopted.

#### The value grammar

**Constructor form, both as literal and as TS.** In literal (bare-value) position the grammar admits `name(args)` where `name` is an intrinsic value constructor and args are literals — parallel to how `50%` and `#354D5B` are typed literal forms. Inside `{ }` bodies the same constructors are ordinary functions in scope, so the human's R6 ruling (bodies are genuine TypeScript — no `#hex` inside TS) is honored with **one vocabulary, two lexical homes**:

```
View [ width = 80, height = 24,
    fill         = gradient(#F8F8F8, #D8D8D8),        // literal position: # colors fine
    cornerRadius = 4,
    stroke       = stroke(1, #B0B0B0),
    shadow       = shadow(0, 1, 2, #00000044),
    ]

fill = { focused ? gradient(0xFFFFFF, 0xF0F0F0) : theme.buttonFill },   // TS position: 0x colors
```

The alternative (bare value-vocabulary literals with no parens, e.g. CSS-flavored `0 1 2 #0004`) was the original open question; **RULED — constructors, adopted as recommended** — they are self-naming, arity-checked, extensible field-by-field, and identical in both lexical homes; the bare positional-literal alternative was not adopted. Rejecting positional bare forms also keeps the literal grammar one rule instead of per-type mini-grammars.

#### The values and their fields

| slot (on View) | type | constructor(s) | fields |
|---|---|---|---|
| `fill` | `Fill` | a bare `Color` coerces (`fill = navy`), or `gradient(…)` | solid: color · gradient: angle?, stops |
| `cornerRadius` | `number` | bare number (uniform) | per-corner form is a future additive field |
| `stroke` | `Stroke` | `stroke(width, color)` | width (px), color; drawn **inside** the view box (border semantics — the box stays the layout/hit fact, per R5's hit-region rule) |
| `shadow` | `Shadow` | `shadow(dx, dy, blur, color)` | offsets, blur radius, color — the CSS `box-shadow` shape, minus spread until a consumer needs it |
| `textShadow` (on Text) | `Shadow` | same `shadow(…)` value | dissolves weather's `ShadowText` (§8) |
| `clip` | `Shape` | exists since R3 | — |
| `path` | `Shape` | exists (`d` mini-grammar); shape *components* stay the later layer the rendering model names | — |

`gradient(stop, stop, …)` is linear top→bottom; `gradient(angle, stop, …)` takes a leading number in degrees; a stop is a `Color` (evenly spaced) or `stop(offset, color)` for explicit placement. Radial and image fills are future constructors — additive, same slot.

**Open lean (not yet human-ruled — ledger item 16, Part II): does `cornerRadius` clip painted content, or only shape it?** The lean: `cornerRadius` shapes the *painted* box only (the fill/gradient/border are drawn with rounded corners); it does not clip. Clipping remains the explicit `clip` attribute, separately — a rounded clip is asked for explicitly (`cornerRadius = 8, clip = …` or the future rounded-rect shape), not implied by the corner radius. This keeps "what paints" and "what's visible" two independently addressable concerns, matching how `clip` already relates to ordinary content.

**Alpha.** Shadows and hairlines without alpha are useless, so alpha lives in the Color number. **RULED: alpha rides the color number, in both literal homes** (ledger item 6) — `#RGBA` / `#RRGGBBAA` in declaration position and `0xRRGGBBAA` (the 8-hex `0x` twin) in `{ }` / expression position both carry alpha (default `FF`; still one number, still `null` for "no color"). A 6-digit `0x` and a computed number stay opaque RGB; an 8-hex `0x` is *always* an alpha color, never a large integer (large integers are written in decimal). This revises the earlier "`0x` stays 6-digit opaque, alpha unrepresentable in `0x`" ruling. Colors are non-null by default (nullable only where the default is `null`), and the paint constructors take `Color` — no `?? 0` guards. A *computed*-alpha constructor (`rgba(…)` / `alpha(…)`) is deferred to the first consumer that needs alpha it can't write as a literal. One `Color` type, no parallel "AlphaColor," and `fill = #00000054` covers the separate-overlay-view-at-opacity idiom. Touches `value.ts`/`colorToCss`, `scaffold.ts`, and both painters.

**`fill: Fill` subsumes `backgroundColor`** (Part II ledger item 5). `Fill = Color | Gradient`; two slots for "what paints this view's box" would have been deadweight — `Fill` admits the solid case by coercion (`fill = #EAEAEA` — every existing use rewrites one word); `backgroundColor` retires (the migration cost is pre-1.0: our own apps plus the doc examples); `fill`/`stroke` is the design-tool vocabulary pairing. The alternative (keep `backgroundColor` as the solid-only slot, add `fill` beside it) was not adopted.

#### Value semantics and reactivity

Decoration values are **immutable plain-data records** (structured-cloneable — they must survive the worker boundary like recordings). There is no `view.shadow.blur = 4` mutation path — one-owner stays clean because the *slot* is the unit of write. Per-field reactivity is expressed the ordinary way: a `{ }` producing a new value whose fields read reactive inputs (`shadow(0, 1, { hover ? 6 : 2 }, theme.shadowColor)` inside a body) re-runs when those inputs change and writes the whole slot. The **equality gate extends to shallow structural equality for decoration types** (a handful of number/color fields — cheap), so a constraint re-producing an equal value stops the cascade exactly as `===` does for scalars (**RULED, Part II ledger item 13**). Being plain numeric records is also the motion-pass synergy: a `Shadow` is interpolable field-wise the day transitions want to animate one.

#### Rendering per backend — the firewall, restated

The kernel renders decoration with **its own drawing, on both backends** — as a synthesized recording, rendered identically either way. Precisely stated per the "Decoration lives on View" ruling (Part II): the firewall is against CSS as a styling **model** (its cascade, its selectors, letting the browser's matching engine decide a value), never against CSS **properties** used as a backend's paint primitives. The DOM backend may realize `cornerRadius`/`shadow`/`stroke` via `border-radius`/`box-shadow`/`background-image`, exactly as it already realizes `fill` via CSS `background` — the value it hands the DOM element is always the one resolved value the attribute system produced, never something the cascade or a selector picked. The firewall is architectural: CSS's *model* has nowhere to run, whether or not a given backend happens to paint through a CSS property.

Implementation sketch (**RULED, adopted as recommended**): decoration attributes compile to a **synthesized recording** — an internal display list (`roundRect` + gradient fill, inset stroke, shadowed fill) regenerated by a phase-1 derive when any decoration slot changes, exactly like a user `draw` body, occupying a *background* layer of the view's existing recording machinery. Then everything already works: the Canvas backend replays it in the composite walk; the DOM backend rasterizes it into the per-view `<canvas>` (the R3 path — bounds machinery already handles ink outside the box, which shadows need) **or**, as an invisible backend optimization, realizes it directly via CSS paint primitives when the test suite's cross-backend pixel diff proves them pixel-stable; recordings cache/layer-promote per the compositing roadmap because a decorated view is a pure function of its attributes. Likely **zero new seam calls** (rides `setDrawing`, or one `setDecoration` twin if keeping user drawings separate proves cleaner). One honest boundary note: the existing flat `backgroundColor` (pre-migration; retiring into `fill`) is currently a CSS `background` on the DOM backend — a flat rect is not a CSS-*model* foothold and both backends are pinned identical, so plain solid `fill` with no other decoration may keep that fast path; any decoration beyond a flat rect goes through the recording, with per-view canvas rasterization as the fallback wherever a CSS paint primitive proves pixel-unstable. Semantics identical either way (that's what makes it a free policy dimension).

---

### 5. Style bundles

The explicit-application half of Part I §3b: named decoration bundles for reuse and cross-cutting looks, **applied by name at the use site — never matched from a distance**. You say *which* views are cards; no rule reaches for them.

#### Declaration

A top-level declaration, parallel to `class` (contextual keyword, one new form — **RULED, adopted as recommended**):

```
style card [
    fill         = white,
    cornerRadius = 6,
    stroke       = stroke(1, #E2E2E2),
    shadow       = { theme.cardShadow },      // bundles may bind — resolved in the applied view's
    ]                                         // scope (this = the view), so tokens/prevailing attributes work

style danger [ textColor = #B00020, stroke = stroke(1, #B00020) ]
```

A bundle's members are **attribute sets only** — no children, no methods, no declarations, no events (a bundle is a look, not a component; anything structural is a class). A `{ }` in a bundle evaluates with `this` = the view it is applied to, so `theme.…` resolves through *that view's* prevailing chain — which is what makes bundles theme-aware.

#### Application

`styles` is a View attribute holding an ordered list of bundles:

```
summary: View [ styles = [card],            … ],
delete:  Button [ styles = [card, danger],  … ],     // written order: later wins on conflicts
```

**v1 keeps the list static** (a literal list of bundle names). Conditional looks are what constraints are for (`fill = { selected ? a : b }` — Part I §1's own jobs table calls this the superior mechanism); a reactive `styles = { … }` can arrive later, additively, if a real consumer shows the constraint form doesn't cover it (**RULED, adopted as recommended**).

#### Conflicts, under the one-owner rule

Bundles never fight at runtime. Their sets enter the existing **provision merge** (R6: class-body chain → use site, nearest provider wins, *only the winner installs*): a bundle set on a slot is a provision like any other, ranked by §6's chain — so an instance literal quietly overrides a bundle's set, a later bundle overrides an earlier one, and the losing provisions **never install**. No two-owner error is reachable through styling, because arbitration happens at merge time, before anything owns anything — the same reason a use-site literal already peacefully replaces a class-body binding. A bundle set on a *prevailing* slot provides (and re-roots) like any other provision.

**Bundles vs classes:** a class is structure + behavior + look; a bundle is look only. weather's `Cap` was a class *because bundles and prevailing attributes didn't exist*; with fonts prevailing it needs neither (§8). `StatRow` stays a class — it is genuinely structure (a layout of two data-bound leaves).

---

### 6. Precedence — mechanism notes

Part II ("Provisions and precedence — one winner installs") states the one canonical, source-visible seven-rank chain — the authority for ranking. This section is its reconciliation with the pre-existing R6 provision machinery, plus how states interact with a prevailing slot.

- **Reconciliation with the existing rules is by construction, not exception.** Ranks 4–6 (class-body sets, bundles, instance sets/bindings) are exactly R6's nearest-provider merge, extended by one member kind (bundles) slotted between class-body sets and instance sets; only the merge winner installs, so the one-owner rule never sees a styling conflict. Rank 2 (prevailing follow) is not a provision at all — it is what an *unprovided* slot does. Rank 7 (active states) is the language's one runtime layering, already designed to suspend and restore a base (§10 of the language doc); on a prevailing slot, a state override provides (re-roots) while active and its lift restores whatever stood before — including *following*, if the base was unset.
- **"Class defaults" genuinely splits in two**, and this is worth being explicit about: the *declaration* default (rank 1, e.g. `prevailing fontSize: number = 12`) is the fallback below the prevailing follow — that is what "the class-chain default is the ultimate fallback when no ancestor provides" means. A *class-body set* (rank 4, e.g. `class CodeText extends Text [ fontFamily = "monospace" ]`) is a **local provision**: it wins over the follow (and over the stylesheet — see Part II's ruling) and re-roots, because a CodeText must be monospace even inside a Tahoma app — that is the class *saying something*, not defaulting.
- A mid-tree write re-roots the subtree **reactively, in one settle** (§1); a theme swap or a stylesheet swap is the same event on one slot. Reading always yields the effective value; only `isSet` sees the seams.

---

### 7. Edge cases, enumerated

1. **Replication (R8).** Replicated instances follow the ordinary parent chain (the block's parent) — the walk is the same tracked-read pattern cursor inheritance already runs under replication, so nothing is new. A template's local set provides per instance; an insert's new instance follows immediately (its first read walks); discard disposes its follow-derives with everything else (`disposeBindings`).
2. **Class boundaries / encapsulation.** A class's internal Text follows the *app's* prevailing value — deliberately; that is the entire reskin story (the standard library is themeable *because* its leaves follow). The encapsulation tool is **re-rooting**: a component that must not inherit context sets its own values at its root (one line), and its interior is sealed. This is opt-out where Shadow DOM is opt-in — justified because the channel is **typed and closed**: a prevailing value can only flow through slots a component's class actually declares, so unlike a CSS selector it *cannot* reach into anything that didn't opt in by having the slot. The reskin superpower without the reach-into-anything fragility.
3. **One-owner: can a prevailing slot be constraint-bound — and does a binding follow or own?** A `{ }` (or percent-shaped, or `:path`) binding on a prevailing slot **owns and provides** — a binding is always a provision; following is exclusively the unset state. All existing ownership rules apply unchanged: direct write to a bound prevailing slot errors naming the owner; a direct write to an *unset* one is an author write — it sets, provides, and re-roots (was-set machinery unchanged). Followers below a bound provider track it live through the ordinary cells.
4. **Un-setting.** There is deliberately **no un-set surface in v1** (LZX had none either): "return to following" is expressible today as binding the parent's value through (`fontSize = { parent.fontSize }`), and states already restore following on revert. If a real idiom demands true un-set, it is explicit new surface for a ruling then — not an implicit behavior now.
5. **Theme swap = one settle; partial derivation.** Swapping is one write (§3). A subtree that wants *mostly the inherited theme, one token changed* derives from the parent's effective value — the explicit spelling is **`parent.theme`** (a tracked read of the parent's effective slot; no new surface):

   ```
   panel: View [ theme = { ({ ...parent.theme, accent: 0xFF3B30 }) } ]
   ```

   Reading one's *own* slot inside one's own provision (`theme = { theme.… }`) is the ordinary constraint-cycle error, correctly.
6. **Prevailing reads inside draw bodies.** `draw(d)` is a phase-1 constraint; `this.fontSize` / `this.theme.accent` inside it are tracked reads through the same accessor walk, so a prevailing change re-records exactly the drawings that read it. Zero new machinery; pay-per-use holds.
7. **`textColor` vs `Text.color`.** Resolved in §3: one slot, `textColor`, prevailing on View; `color` retires.
8. **States.** Covered by the chain (§6): a state override on a prevailing slot provides — and therefore re-roots — while its predicate holds; the revert restores the prior provision *state*, including "unset → following." The duplicate-literal ruling's anticipated revisit ("same slot, different owner across constructs") is exactly this and needs no relaxation — states were always the sanctioned cross-construct override.
9. **`:path`-bound prevailing attributes.** Allowed — a `:path` literal binds any value slot (R8) and counts as a provision (`fontSize = :prefs.size` provides, live from data). One refinement to the R8 unresolved rule: on a *prevailing* slot, an unresolved path should land **the followed value rather than the bare declaration default** — the declaration default is just the chain's end, so "unresolved → effective prevailing value" is the consistent generalization (**RULED, Part II ledger item 15**). A `Theme`-typed slot from data waits for the Schema era (dynamic-mode coercion has no record kind).
10. **Transparent levels.** A view whose class lacks the slot is skipped by the walk (§2) — relevant only for user-declared prevailing attributes; the built-ins live on View, so every view has them and "transparent" simply means "unset."

---

### 8. The worked example: weather rewritten

The app's entire text/style surface, as it becomes. Today's `Cap`/`HelvCap` are font bookkeeping wearing class costumes; `ShadowText` is a decoration value implemented as structure (two stacked Texts); the zip field hand-draws its border. All three dissolve; `StatRow` — legitimate structure — stays.

**The root provides the dominant style once** (today's `Cap` quartet, verbatim):

```
App [ width = 240, height = 320, fill = #EAEAEA,
      fontFamily = "Tahoma,Geneva,sans-serif", fontSize = 9,
      fontWeight = bold, textColor = #FFFFFF,
```

**Every `Cap` becomes a plain `Text`.** The 8 use sites that needed zero overrides shed the class name; the rest keep exactly their real differences:

```
// before                                                          // after
status: Cap  [ x = 15, y = 230, width = 240, color = #000099, …]   status: Text [ x = 15, y = 230, width = 240, textColor = #000099, … ]
entry:  Cap  [ x = 3, y = 4, text = { App.zip }, color = #000000 ] entry:  Text [ x = 3, y = 4, text = { App.zip }, textColor = #000000 ]
zip:    Cap  [ x = 194, width = 100, …, color = #CAD0EC ]          zip:    Text [ x = 194, width = 100, …, textColor = #CAD0EC ]
```

**`HelvCap` becomes two re-rootings** — the Helvetica family lives in exactly two subtrees, so the *containers* say it once and the leaves shed it:

```
form: View [ width = 240, fontFamily = "Helvetica", fontSize = 14,

    where: Text [ x = 15, width = 240, text = { :location.city + ", " + :location.region } ],
    temp:  Text [ x = 95, y = 20, width = 240, fontSize = 60, text = :item.condition.temp ],
    desc:  Text [ x = 15, y = 90, width = 240, text = :item.condition.text ],
    …

class WeatherSummary extends View [ fill = #000000, width = 34, height = 34, x = 10,
    fontFamily = "Helvetica", fontSize = 12,                      // one line; six leaves follow

    icon: Image [ … ],
    day:  Text [ x = 42, width = 140, text = :day ],
    desc: Text [ x = 42, y = 14, width = 120, fontSize = 11, fontWeight = normal, text = :text ],
    hiLabel: Text [ x = 165, text = "Hi:" ],   loLabel: Text [ x = 165, y = 14, text = "Lo:" ],
    hi:  Text [ x = 188, width = 60, text = :high ],   lo: Text [ x = 188, y = 14, width = 60, text = :low ],
    ]
```

**`ShadowText` (9 lines of class + a two-Text tree per use) becomes a `textShadow` value** — and gains a real blur-capable shadow instead of a duplicated glyph run:

```
// before: caption: ShadowText [ text = "Enter Zip Code:", x = 15, y = 7 ]
caption: Text [ text = "Enter Zip Code:", x = 15, y = 7, textShadow = shadow(1, 0, 0, #222222) ],

// the tab title (the dy=1 site), with its selection constraint intact:
caption: Text [ text = { label }, x = 15, y = 4, textShadow = shadow(1, 1, 0, #3B4057),
                textColor = { sel ? 0xFFFFFF : 0xCAD0EC } ],
```

**The zip field's `draw` body becomes two attributes** (the decoration front door doing its job):

```
// before: fill + a 4-line draw() stroking a rect                  // after
field: View [ x = 120, y = 5, width = 80, height = 20,
    fill = #FFFFFF, stroke = stroke(2, #1A1A1A),
    entry: Text [ x = 3, y = 4, text = { App.zip }, textColor = #000000 ],
    ],
```

**The radar's shadow view dissolves into a fill + shadow value:**

```
// before: a #000000 view at (23,23) under the image at (20,20), opacity 0.33.
// Measurement note: the radar art is ~98% transparent, so the offset black
// view read as BOTH a backdrop showing through the art AND a drop shadow —
// so it lands as fill + shadow, not a pure shadow.
radarscan: Image [ x = 20, y = 20, width = 200, height = 135, stretches = both,
                   source = "resources/radar_us.png",
                   fill = #00000054, shadow = shadow(3, 3, 0, #00000054) ],
```

**`StatRow` stays** — structure, not style — but its two `Cap` children become plain `Text` (the fonts arrive as prevailing values through the App root):

```
class StatRow extends View [
    label: string = "",
    value: string = "",
    layout: SimpleLayout [ axis = x, spacing = -10 ],
    labelText: Text [ width = 90, text = { classroot.label } ],
    valueText: Text [ width = 160, fontWeight = normal, text = { classroot.value } ],
    ]
```

**Before/after:** the file drops from 261 lines to roughly **~225** (−14%): the `Cap`+`HelvCap`+`ShadowText` blocks (~26 lines with comments) go entirely, ~20 use sites shed font/color attributes or a wrapper level, the `draw` body and the radar shadow view each become one attribute; the additions are two `fontFamily`/`fontSize` lines on containers and four values on the App line. The qualitative change is bigger than the count: the class section stops being a font manifest (two of four classes were pure style), every remaining attribute on a Text is a *real, local* difference, and the app's typography is legible in one place — the root — instead of reverse-engineered from class definitions. And the reskin story arrives for free: this app recolors from one `theme` provision the day it wants to (calendar-Declare remains the designated theme validation, Part IV).

---

### 9. Comparisons

**vs `lz.style` (the buried lede, revived).** LZX's prevailing theme had the right shape — hierarchical, "applies to itself and any component within it" — and died of implementation, not design: SWF-only, pre-reactive (swap ≠ live restyle), a fixed slot schema. Declare's prevailing attribute is the same idea done right: reactive (a provision change is one settle), **open** (any class declares new prevailing attributes; the token set is whatever `Theme` carries), typed and checked, identical on both backends, and unified with the language's one attribute system instead of being a side registry.

**vs CSS — honest, both directions.** What Declare's model does that CSS can't: fully reactive styling (any slot, any expression, live), typed values with compile-time checking, statically analyzable effective values (read the file, walk the tree — no computed-style oracle), no specificity debugging ever, styles that cannot reach into components that didn't opt in, and one mechanism shared with all other attributes (states, bindings, data). What CSS does that Declare deliberately doesn't: restyle third-party/arbitrary content from a distance (that power *is* the fragility — rejected); `@media` responsiveness (Declare's answer is constraints on the App/canvas size — already more expressive, but less idiomatic until the component library packages it); a colossal property/value surface built over 25 years (Declare's decoration vocabulary is deliberately ~four values and grows per consumer); user/UA stylesheet layering and document-level theming conventions (not applicable to own-pixels apps); and raw familiarity — mitigated by the CSS-echoing value names, not chased further.

**Readability.** The chain (§6, Part II) is short, fixed, and source-visible; "why is this text 9px?" is answered by walking up the file to the nearest provider — the same walk the runtime does. Nothing about a view's look is determined by a rule written elsewhere that names it by pattern.

---

### 10. The styling pass boundary (non-goals)

- **No selector system, ever** — no matching, no pattern-targeted rules, no descendant/attribute selectors; application is by explicit name (`styles = [card]`) or by sitting in a subtree (a prevailing value), or by class-keyed skin entry — all three visible in source, none reaching for a view by shape. Settled in Part I; restated as the boundary.
- **No media queries** — responsiveness is constraints on canvas/App dimensions (`fontSize = { App.width < 400 ? 9 : 11 }` provides as a prevailing value and the subtree follows); any breakpoint *packaging* is future component-library ergonomics, not styling-pass surface.
- **No motion.** Transitioning decoration values (animating a theme swap, a shadow on hover) belongs to the motion pass ([animation.md](animation.md)); this design only ensures decoration values are interpolation-friendly plain records. Hover/pressed styling additionally waits on the hover events R5 deferred.
- **No box model** — no padding/margin/border-box; geometry stays x/y/width/height + layouts + auto-extent. `stroke` paints inside the box precisely so it never becomes layout.
- **No CSS string parsing anywhere**, no `var()`/`calc()` (tokens and constraints are those, natively), no `!important`, no pseudo-elements.
- **Not designed here:** focus-ring/selection styling (focus model era), `Align` (still waits for its first consumer), font *embedding*/`@font-face`-equivalents (the resources/fonts asset-pipeline item — see [formatting.md](formatting.md) for the adjacent formatter-rung sequencing), custom `Painter` extensions.

---

## Part IV — Validation

### Validation: `calendar-Declare`

Copy the calendar source tree to `calendar-Declare` and use it to prove both additions in one app, leaving the original calendar untouched at pixel-parity as the reference — the deliberate "graduate from the oracle" divergence:

- **Decoration:** replace the calendar's image-based chrome (rounded gradient buttons, bordered cells, the gradient header) with declarative decoration attributes, growing the kernel painter (`LzCanvasPainter`) to render gradients / borders / shadows / paths.
- **Re-skin:** resolve the calendar's palette (the blues, the header gradient, the cell borders) from a **token set** via the prevailing theme. Swapping the token object recolors the entire calendar, live.

One demo shows the decoration values *and* the reskin story at once — the thing OpenLaszlo never managed to show in fifteen years. It also validates the design: if the calendar's whole look falls out of a handful of decoration attributes plus a token set, the API is right.

### Where it plumbs into the stack

- **The language** gains the decoration attributes (`fill` / `gradient` / `stroke` / `cornerRadius` / `shadow` / `path`), the reactive `draw()` escape hatch, and the prevailing-theme / token / style-bundle constructs.
- **The LFC (view → sprite plumbing)** forwards the decoration attributes to the sprite — the one place that may need a *non-kernel* LFC touch, to be flagged.
- **The canvas kernel painter** grows to render them — it already does `fillRect` (bg), `roundRect` (corner radius), `drawImage` (resources); gradients / borders / shadows / paths are more of the same.

---

*Companion docs: [`animation.md`](animation.md) (the parallel ruled design; decoration values are designed to be interpolable with it), [`formatting.md`](formatting.md) (the formatter rung queued behind this one), `HANDOFF.md` §R4/§R6/§R7/§R8 (the ownership, provision-merge, and inheritance-walk mechanics this rides) and its dated 2026-07-02 styling entries (the live ruling record).*

# Declare — The Implementation: Compiler, Renderer, and Components

*How Declare is realized — the **compiler** (a new front-end plus in-browser compilation), the **renderer** (an own-pixels runtime plus a managed DOM), and the **component library** — and a concrete, low-risk way to build all three. Instead of starting from zero, bootstrap from OpenLaszlo's existing, runtime-independent core: a new own-pixels **runtime** behind its rendering seam, and a new **syntax** in front of its compiler, reusing the ~25,000-line component engine and every component, example, and app in between. This is the implementation companion to the vision in [declare.md](declare.md) and the language reference in [declare-language.md](declare-language.md); the bridge it describes is a **potential** starting point, not a committed plan — but it is the cheapest path to a working system validated against real programs from day one, and it doubles as the renderer-and-accessibility spike that is the project's highest risk.*

---

## 1. The idea in one paragraph

OpenLaszlo was designed for **render-target independence**: one LZX source compiled to Flash (SWF) *and* to DHTML, because the platform isolates everything runtime-specific behind a clean seam. That seam still exists in the 4.9 source, and the layer above it — the component model, constraint engine, layout, states, data binding, replication, events, animators — is essentially DOM-free. So there are **two independent places to intervene** around a reusable middle:

- a **new back-end** (a `kernel/canvas` runtime that draws its own pixels) — which is the own-pixels rendering bet, *tested against the entire real corpus instead of a greenfield demo*; and
- a **new front-end** (a Declare parser that emits the same AST the compiler already consumes) — which is the new language, *validated differentially against the original as an oracle*.

You can do either independently, in either order. Together they are, almost literally, an incremental bridge from the real OpenLaszlo system toward Declare.

---

## 2. Why this is possible — the architecture (verified against the 4.9 source)

The LFC (the client-side runtime library) splits into two halves with a clean seam between them:

**Platform-independent (the reusable middle).** `core/`, `views/`, `data/`, `events/`, `animators/`, `helpers/` — the component/class system, constraints, layout, states, datasets/datapaths/replication, the event system, animators. A DOM-leakage scan of these directories found **zero** files touching `document`, `createElement`, `.style`, `innerHTML`, or `getElementById`:

| area | files touching the DOM directly |
|---|---|
| `core/` | 0 of 13 |
| `views/` | 0 of 9 |
| `data/` | 0 of 17 |
| `events/` | 0 of 3 |
| `animators/` | 0 of 3 |
| `kernel/` | **15 of 90** — all DOM access lives here |

**Runtime-specific (`kernel/<platform>/`).** This is the seam, and it already has **four backends**: `dhtml/` (the DOM), `svg/`, `swf/` (Flash 8), `swf9/` (Flash 9/10). Each implements the same ~10-class contract:

`LzSprite`, `LzTextSprite`, `LzInputTextSprite`, `LzMouseKernel`, `LzKeyboardKernel`, `LzScreenKernel`, `LzTimeKernel`, `LzBrowserKernel`, `LzContextMenuKernel`, `LzFontManager`.

The **`svg/` backend is the proof**: a non-Flash, non-default renderer was already added behind this seam. A canvas/WebGPU runtime is simply a fifth peer.

**The contract is a scene graph.** Views never touch the DOM; they render through a `this.sprite.*` API — `setX`, `setY`, `setWidth`, `setHeight`, `setRotation`, `setClip`, `getZ`, `setSource`, `setVisible`, `addChildSprite`, … — and it already includes **accessibility hooks** (`setAccessible`, `setAAActive`). The sprite is constructed at just a few generic sites in the base views (`new LzSprite(this, …)` in `LaszloView`/`LaszloCanvas`; `new LzTextSprite` in `LzText`; `new LzInputTextSprite` in `LzInputText`), so swapping the backend means swapping which kernel is compiled in.

**The reuse ratio is the headline.** ~25,000 lines of platform-independent app model is reused unchanged (`core` ~4.2k, `views` ~9.3k, `data` ~8k, plus events/animators/helpers); one backend (`kernel/dhtml`) is ~8k lines, and that is what you parallel. You keep the large majority — and every component and example — and rebuild only the renderer.

> Source tree: `lps-4.9.0-src/lps-4.9.0/WEB-INF/lps/lfc/`.

---

## 3. Three parts: old core + new runtime + new syntax

```
        NEW SYNTAX                         NEW RUNTIME
   Declare parser / front-end          kernel/canvas (own pixels)
   ───────────────┐                    ┌─────────────────────────
                  │                    │
                  ▼                    ▼
        ┌───────────────────────────────────────┐
        │   OPENLASZLO CORE  (reused, ~25k LOC)  │
        │  components · constraints · layout ·   │
        │  states · datasets/datapaths ·         │
        │  replication · events · animators      │
        └───────────────────────────────────────┘
                  ▲                    ▲
        emits the same AST       implements the same
        the compiler consumes    ~10-class sprite contract
```

The two interventions are independent because the core sits behind two stable interfaces it already defines: an **AST** (what the compiler back-end consumes) and a **sprite/kernel contract** (what the runtime implements). Neither knows about the other.

It is not a coincidence that the pieces fit this cleanly. Declare was conceived in [declare.md](declare.md) as *OpenLaszlo modernized* — its `class`/attribute/constraint/state/datapath constructs all have direct OL lineage — and OpenLaszlo was built render-independent on purpose. The new syntax already maps onto this model, and the model is already detached from any renderer.

---

## 4. The reusable middle (what you keep on day one)

Everything that makes an app runtime hard and took OpenLaszlo years to get right, reused as-is:

- the **component/class system** (inheritance, typed attributes, setters, methods);
- the **constraint engine** (fine-grained, auto-tracked reactive bindings — Declare's headline feature, already implemented and battle-tested);
- **layout** (simplelayout, constraint layout, grid) and **states**;
- the **data system** — datasets, datapaths, replication via `LzReplicationManager`, the one-way binding model;
- the **event system** and **animators**;
- and, sitting on top of all of it, the **component library** (button, list, grid, tree, tabs, window, form, …) and the **454-program golden corpus** plus the running apps (Calendar, Dashboard, the Explorer demos).

That corpus is the point: it is a large, real, behaviorally-specified test suite for whatever you put underneath or in front of it.

---

## 5. Swap point B — the new runtime (`kernel/canvas`)

A fifth backend, peer to `dhtml/svg/swf/swf9`, implementing the same contract against a Canvas/WebGPU scene graph instead of DOM elements.

**What's net-new vs. reused.** A canvas backend is not a whole new platform like `swf` — it still runs *in the browser*, so it borrows the non-rendering kernels:

| class | effort | notes |
|---|---|---|
| `LzSprite` (core) | **rewrite** | position/size/transform/clip/z/image against a scene graph. *Sheds* the DOM-quirk bloat that makes dhtml's `LzSprite` 3,650 lines (the `svg` one is 637) while adding render-loop code. |
| `LzTextSprite` (display text) | **rewrite — the hard part, now equipped** | dhtml does "div + `style.font*` + `innerHTML`"; canvas re-solves measure/wrap/line-layout (see building blocks). |
| `LzInputTextSprite` (input/IME) | **rewrite — the other hard part** | cursor, selection, clipboard, IME; the genuinely difficult half. |
| `LzMouseKernel`, `LzScreenKernel` | **rewrite** | hit-testing and the input loop against the scene graph (no DOM event targets). ~460 lines today. |
| `LzFontManager` | **adapt** | font loading/metrics for canvas text. |
| `LzTimeKernel`, `LzBrowserKernel`, `LzKeyboardKernel` | **reuse from dhtml** | timers, browser glue, keystrokes (still from `window`). |
| HTTP/IO services | **reuse** | XHR/data loading unchanged. |
| accessibility | **fill the existing contract** | `setAccessible`/`setAAActive` already exist; implement them with the managed-DOM mirror (see [declare.md §10](declare.md)). The a11y plan becomes *a contract point to fill*, not a bolt-on. |

**Building blocks that shrink the hard parts.**
- **Display text:** [`@chenglou/pretext`](https://github.com/chenglou/pretext) (MIT, ~15KB, zero-dep) does DOM-free measurement + international wrapping + line layout via `Intl.Segmenter` + Canvas `measureText()` — exactly the layout core of `LzTextSprite`. The canvas text sprite becomes "Pretext for layout + `fillText` for paint." This is the **light path** of the tiered text plan, done for free; a WebGPU glyph-atlas path would still add a real shaper (HarfBuzz) for complex-script glyph positioning.
- **Native-wrapping content and interop:** video (no `<video>` inside canvas), and embeds like Stripe/Maps, route through **promote-on-demand DOM overlays** — the same mechanism the original `htmlvideoview` uses to reach `this.sprite.__LZdiv`.
- **Native feel:** own the **input → physics → render loop**. The browser exposes one rectangular scroll and hides momentum from JS, so any app coordinate model (zoom, nested spaces) needs its own physics, stepped per frame from raw timestamped input. The model to copy is Mesa's measured iOS scroll physics (`/Users/temkin/Code/Mesa/docs/touch-physics.md`) — calibrated to ground truth, not tuned by eye.

---

## 6. Swap point A — the new syntax (compiler front-end)

A Declare parser that emits the **same AST** the existing compiler back-end already consumes, so code-generation, semantic analysis, and the whole component model are reused. The syntax is the surface in [declare.md §7](declare.md); here it is purely an additional front-end.

**The conversion is mostly mechanical, with a few hard seams** (full transform list in the migration notes):
- *Structural/lexical* (high-confidence): `<class>` → `class … extends … [ … ]`, `<attribute …>` → typed fields, tags → PascalCase types, `${…}` → `{ … }`, `<simplelayout>` → a layout child.
- *Typed values* (more than un-quoting — the values are polymorphic): dimensions (`width="100%"`), colors (named / `#` / `0x` / null), constraint *timing* (`when=`), and custom setters all need richer representations — this is the fidelity question, §7.
- *Data*: XML datasets → JSON and XPath datapaths → a JSON-path form (JSONPath/RFC 9535 subset + JSON Pointer write-back) — but *losslessly* only through a faithful XML-mirror encoding, not idiomatic JSON; see §7.
- *Script bodies* (the real work, not typing): untyped JS is already valid loose TypeScript, so the cost is the **OL-isms** — `setAttribute`→setter, `classroot`/`canvas` references, `with(this)`, the `Lz*` APIs.
- *Still-open syntax* (which the corpus forces you to settle): events vs. watchers vs. the `<-` subscription form; animation; conditional rendering; the datapath predicate spelling.

**The corpus does double duty.** Converting the 454 golden programs gives you (a) a **differential test** — each Declare program must lower to the same AST/behavior as its LZX twin, with the original compiler as the oracle — and (b) the **parallel LZX↔Declare corpus** that the AI-native bet needs and a greenfield language cannot have.

**In-browser compilation** is viable: *transpiling* TypeScript is trivial and tiny (a type-stripper); *type-checking* is heavier but proven in-browser (the TS Playground, VS Code for the web). The Declare-specific part is the well-trodden vue-tsc/svelte-check pattern: parse the `[ ]` shell, synthesize component types, hand the `{ }` bodies to `tsc`.

---

## 7. Fidelity: what converts losslessly — and what the corpus demands

*Pressure-tested against the LFC type system, the language reference, and the corpus.*

"Isomorphic" has two levels, and they diverge. **Behavioral** isomorphism — the converted program runs identically — is achievable. **Syntactic** round-trip — LZX ↔ Declare identical source — is not, and isn't a goal: a one-way migration normalizes surface forms. The catch is that behavioral isomorphism holds only if Declare's value/type vocabulary is richer than "a bare value is a TypeScript literal plus a color," and only if migrated *data* uses a faithful encoding rather than idiomatic JSON. Both are bounded, nameable requirements — and the corpus is the spec.

**Attribute values are polymorphic — the literal vocabulary must grow** (resolved in §8 as a closed, compiler-owned set). LZX has a real typed-attribute system (corpus `type=` counts: `string` 4030, `number` 3718, `boolean` 1524, `color` 843, `expression` 594, `size` 48, plus `html`/`text`/`css` content types and `http`/`rtmp`/`file` resource types). Three cases the simple model can't hold:

- **Dimensions.** `width="100%"` appears **3,992** times (plus `50%`, `75%`, `20%`…). A dimension is `number | percentage`; `width: number` can't represent it. Declare needs a dimension form — a `100%` literal or a union.
- **Color.** Used as named (`red`, `white` — thousands), `#RRGGBB` (any case), `0xRRGGBB`, the literal `null` (510×), and `${}` constraints. `#RRGGBB` covers one form; a faithful color type also needs named colors, `0x`→`#`, and nullability. Value-isomorphic (same rendered color) yes; form-isomorphic no.
- **Content & resource types.** `expression` maps to `{ }`; `html` is a rich-text content type; `http`/`rtmp` are typed URLs.

**Constraints carry timing — `{ }` is too coarse.** `when=` appears **1,285** times: `always` (579 — reactive, today's `{ }`), `once` (534 — evaluate once), `immediate(ly)` (112 — evaluate during construction). A binding has three timing modes; Declare needs at least a `once` form beside `{ }`-always.

**Custom setters are common.** `<setter>` appears **958** times (getters: 0). It maps cleanly to a TypeScript-style `set x(v) {…}` accessor — but must be a first-class member.

**Data: XML→JSON is faithful, not idiomatic.** The datapaths reveal the data's shape: attribute reads dominate (`@attr`, **1,964×**) and element-text reads are heavy (`text()`, **1,451×**), and service data carries namespaces (`xsd:`/`soap:`/`wsdl:`). Records therefore mix XML *attributes* with child-*element text* (`<employee firstName="Bob"><phone>555-1234</phone></employee>`). To query a JSON mirror *equivalently*, the encoding must preserve the attribute-vs-element distinction, text nodes, and namespaces — a faithful mirror (`{"@firstName":"Bob","phone":{"#text":"555-1234"}}`), not idiomatic JSON. Flattening to clean JSON is lossy: it can't tell an attribute from an element, breaks when an element has both an attribute and a same-named child, and drops order, namespaces, and mixed content. So **clean JSON is right for *new* Declare apps; migrating OpenLaszlo data losslessly needs the faithful mirror** — best supported as two distinct data modes.

**The XPath-for-JSON must mirror XPath's axes — over a small surface.** What the corpus actually uses: `@attr` (dominant), `el/text()` (heavy), positional and **range** predicates (`[1]` 683×, `[1-5]`/`[6-10]` — replication slicing), `/*` wildcard, `.` current, and dataset roots. Value-predicates (`[@x='y']`) are essentially absent. So the path language needs attribute access, text access, index + range/slice, wildcard, and current-node — over the faithful mirror. JSONPath (RFC 9535) covers index/slice/wildcard natively; `@attr`/`text()` become key-accesses into the mirror's `@`/`#text` slots.

**The awkward tail (honest).** Mixed content (text interleaved with elements), strict order among heterogeneous children (JSON objects are unordered — you'd need arrays of tagged nodes), and full namespace fidelity are genuinely awkward. They are rare in *app* data (mostly attribute/text records) and common only in *consumed* SOAP/XSD envelopes — so the common case mirrors cleanly-ish, and full-XML is the minority.

**Bottom line.** Nothing is fundamentally untranslatable, but "lossless" means *behavioral*, and it costs two concrete things: a richer value/type vocabulary — resolved in §8 as a closed, compiler-owned set (dimension/percent, color, constraint-timing, setters, html/resource) — and a faithful data-mirror with a mirror-aware path for migrated data. These findings *are* the specification for the converter and the Declare type system, to be verified against the 454 programs in milestone M4. (Unpinned: whether `width` is typed `number` or `size` — the polymorphism holds either way; and not every dataset's XML was read.)

---

## 8. The value model (specified in the language reference)

§7's finding — the literal vocabulary must grow to hold dimensions, colors, and a few more polymorphic types — is **resolved in [declare-language.md §4](declare-language.md#4-the-value-model)**, and lives there as language, not implementation. In brief: a **closed, compiler-owned vocabulary of value types** (`Color`, `Length`, `Align`, …) with magic literals, plus user-declarable *structural* value types (unions and tables) but **no user-facing coercion logic** — the coercion that turns `navy` into an integer or `50%` into a parent-relative constraint lives in the **compiler/kernel, where imperative code belongs**.

Two consequences matter to the implementation: the converter (§7) targets that compiler-owned coercion directly, rather than emitting per-attribute conversion code; and because a core class only needs to *use* `Color`/`Length`, not *define* them, the core classes can be **declared in Declare itself** — the self-hosting that lets the runtime's own surface be written in the language. See the language reference for the rule and the worked `View` example.

---

## 9. Why start here

- **It is "some work, not from-zero" — quantified.** ~75% reused; you rebuild a renderer, not a platform.
- **It is the #1-risk spike, grounded.** The own-pixels renderer and the accessibility mirror are the project's make-or-break. This builds exactly those — but validates them against every LFC component, the 454 programs, and three running apps, instead of a demo you wrote to flatter the runtime.
- **It de-risks the two big bets separately.** The renderer (back-end) and the language/data model (front-end) are independent interventions; a problem in one doesn't block the other.
- **It bootstraps the AI corpus** as a side effect of the conversion.
- **The pieces were built to fit** — render-independence on one side, an OL-derived syntax on the other.

---

## 10. A staged plan

Smallest-first, so each milestone proves something before the next gets expensive.

| # | milestone | proves |
|---|---|---|
| **M0** | Pin the build-target *selection* mechanism (how the compiler/LPS picks `dhtml`/`svg`/`swf9`); scope `kernel/canvas` class-by-class. | the seam is enterable; a concrete build plan. |
| **M1** | A **non-text** view tree on canvas: `LzSprite` only (rects, images, transforms, clip, z-order) for a real example (the toolbar, or a simple Explorer demo), with `LzMouseKernel` hit-testing a click. | the seam + scene graph + input loop, end to end, in a few hundred lines — *before* touching text. |
| **M2** | **Display text**: `LzTextSprite` = Pretext layout + `fillText`, driving `LzText`'s auto-sizing. | the hard-but-equipped half of text; real components with labels render. |
| **M3** | **Input/IME** (`LzInputTextSprite`) + the **a11y mirror** (fill `setAccessible`). | the genuinely difficult half, and the make-or-break. |
| **M4** | (Parallel track) the Declare **front-end** + corpus conversion + differential test. | the language and data model, on the same core. |
| **M5** | A **wedge demo** in the new runtime — a perf-bound surface (a node/flow editor or a live grid) that the DOM can't keep up with — to show the payoff, not just parity. |

M1–M3 and M4 can proceed independently. M5 is the first thing worth showing anyone.

---

## 11. Honest risks, and the nature of the bridge

- **This validates the renderer on *OpenLaszlo's* engine, not Declare's.** It proves the own-pixels runtime and the a11y mirror against real components; it does **not** benchmark the final system's language or performance. The OpenLaszlo constraint/layout engine is from the SWF/DHTML era.
- **The OL core is a scaffold to evolve, not necessarily the destination.** Reusing it buys a working, proven app runtime on day one — which is exactly what you want to de-risk the renderer. How much of it becomes the *permanent* Declare core, versus gets modernized or replaced over time, is an open decision. Treat it as the bridge that gets you a real system fast; decide later what to keep.
- **Text and input are real, hard engineering.** Pretext shrinks the *display* half; input/IME and (for a WebGPU atlas) glyph shaping remain. The elephant gets a clear box, not a smaller body.
- **The framework-generalization seam is the actual project.** Mesa proves the app-*specific* case (its own physics, a11y, text). A framework has to hand those back to *everyone* as reusable primitives — harder than any single app, and the real work behind "the managed-DOM/text/input layer, not the renderer."
- **Loose ends:** the build-target selection mechanism isn't pinned yet; the sprite contract carries some CSS/`pt`-era vocabulary a canvas backend must interpret (the `svg` backend shows it's tractable); a handful of native-wrapping components route through the overlay rather than rendering natively.

---

## 12. Relationship to the other docs

The thesis lives in [declare.md](declare.md): the web has a **document surface** (the DOM's, permanently) and an **application surface** that has spent two decades contorted onto a document model; Declare is a real **app runtime** for that second surface, now that the browser can finally host one — built for native-app **ergonomics and feel**, accessible by construction, and designed as the best substrate for AI-generated UI. The language itself is specified in [declare-language.md](declare-language.md).

This document is the **implementation on-ramp**: the cheapest, most grounded way to start building the compiler, renderer, and components toward that vision — and to spike its riskiest part — by standing on the one prior system that was already render-independent and already had the app model right: OpenLaszlo's own core.

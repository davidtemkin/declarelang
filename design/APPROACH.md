# neo-LZX — Build Approach

*How the neo-LZX system is built, and **why**. This is the working agreement for the `neolang/` effort and the first thing every contributing agent reads. It complements the product docs in [`../design-docs/`](../design-docs) (vision, language, implementation); those describe *what* neo-LZX is, this describes the *method and architecture* for building it.*

---

## 0. Prime directive

Two things are co-equal and non-negotiable: **elegance/clarity of the source** and **performance**. A piece of work is not "done" until the code is concise, readable, and fast.

- **Difficulty of implementation is not a consideration.** We do the elegant, performant thing even when it's hard. We only reconsider when something is *not reasonably surmountable* — and then we **surface it** for a decision, we do not quietly cut a corner or reach for the easy-but-worse path.
- **No deadweight.** Obsolete overhead, dead abstractions, and cruft are defects, ranked alongside wrong behavior and slow performance. Clarity is part of correctness.

*Why:* the entire value proposition is a concise, analyzable, fast system. Source clarity and the absence of legacy overhead are not polish applied later — they *are* the product, as much as behavior and speed.

## 1. What neo-LZX is (and isn't)

A **new system** that closely resembles — but **is not** — OpenLaszlo. It shares LZX's feel and the kinds of apps it builds. In the end it **will not compile LZX** and **will work differently at runtime**.

So: we do not port LZX. We build a new thing, using LZX as a well-understood reference for *what good looks like*.

## 2. Method: rewrite, with the original as a guide

For each feature: **read the original LZX/LFC source to understand its intent, then rewrite it from scratch** in clean, modern TypeScript / the new language — taking advantage of what today's browser and a typed language offer. The original is a **guide, never a template.**

The cautionary counter-example lives right next door. The byte-parity TS compiler in [`../compiler/`](../compiler) is a near-line-by-line **transliteration** of the Java 4.9 compiler: the Java class structure is preserved wholesale (`NodeModel`, `ClassModel`, `ScriptClass`, `ToplevelCompiler`, `ViewSchema`, `JavascriptGenerator`, `SimpleCharStream`…), comments cite exact Java source lines, and pieces are marked "ported verbatim." That was **correct there** — byte-exact output demands mirroring the Java logic *and its quirks*. It is exactly **wrong here**: transliteration inherits the original's structure, its quirks, and its deadweight. We want the opposite outcome, so we use the opposite method.

## 3. The invariant: perceptual + behavioral, "or better"

An app is correct when **a person sees and feels the same app — or a crisper, faster one.**

- The invariant is **not** pixel-identity and **not** scene-graph identity. In the end neither will match: image-based rendering becomes draw-based, and the node model is cleaner. "**Or better**" is load-bearing — turning a PNG icon into vector draws *should* move pixels; that is the improvement, not a regression.
- **Verification:** the perceptual / vision-level diff + the AE oracle (reused from the canvas track) + interaction parity. Scene-graph diffing is at most a transient debugging convenience while things are still close — never a target.

**Deliberately-not-reproduced ledger** (things we shed on purpose — add entries as found):
1. The Flash-era **text-metric / letter-spacing adjustment**. neo uses the browser's native text metrics: crisper, correct, simpler.

## 4. Render model: DOM **and** Canvas, chosen at runtime

The runtime supports **both** DOM and Canvas rendering.

- A **View** is abstract over a **RenderBackend**; **DOM** and **Canvas** are two implementations.
- The **LFC decides per view / per hierarchy, dynamically, at runtime** which backend to use — the optimizing-runtime idea made first-class. The application never chooses; it never names a substrate.
- **Drawing is first-class in both modes.** The API allows vector drawing (not just image placement) whether a view is DOM- or Canvas-backed: the Canvas backend draws to the shared surface; the DOM backend draws to a per-view `<canvas>`/SVG (and rides HTML-in-Canvas as it matures).

*Why:* flexibility and substrate independence — the DOM's native features (text, input, accessibility, video) where they matter, own pixels where scale/animation win — and it rides the platform's DOM-in-canvas convergence rather than betting against it.

## 5. Compiler: a declarative front-end that drives TypeScript

The compiler parses the `[ ]` declarative layer and **hands `{ }` bodies and typechecking to the TypeScript compiler API** — it does not reimplement TypeScript. Codegen turns the bracket tree into runtime constructor calls (instantiate the view tree, wire constraints and events), with `{ }` emitted through `tsc`. Typechecking then largely *falls out*: attribute types, `:path` data shapes, and every `{ }` expression are checked by TS given the right typed scaffolding.

*Why:* the hard part of "typed, inner-TypeScript, JSON data" is already solved by the TS toolchain; our job is the small declarative grammar around it.

## 6. Reuse posture: primitives yes, model no

- **Reuse only at the primitive / substrate level** — a Canvas2D painter, font metrics, hit-test math, easing. Language-agnostic, genuinely hard to beat, zero LZX semantics, no deadweight.
- **Rewrite everything at the model level** — node/view/attribute/constraint/event/data, the render model, the components. That is where LZX's semantics *and its deadweight* live, and where neo-LZX's elegance has to come from.
- **Default to new.** Justify each reuse ("this is the best code for the job, and it is clean"). If you reuse to move fast, record it as **debt** in `HANDOFF.md` with a replacement note — provisional scaffolds ossify into permanent deadweight otherwise.

## 7. The ladder, and the apps that drive it

Each rung is a **vertical slice** — grammar + typecheck + runtime + a perceptual test — always leaving something that runs. The three flagship apps pull the frontier forward; each is done when it is perceptually + behaviorally at parity (or better) with its LZX original.

- **R0** — parse `[ ]`; a minimal Node/View over an explicit **RenderBackend** seam; **DOM backend**; a view + child renders; perceptual test.
- **R1** — **Canvas backend** for the same View tree (proves the seam).
- **R2** — typed literal attributes + typecheck.
- **R3** — Text + Image leaves (native text metrics; drawing API present in both backends).
- **R4** — `{ }` constraints → the reactive core + scheduler. *(The trickiest runtime piece; get it right and much of the rest is composition.)*
- **R5** — methods + events.
- **R6** — `class X extends View [ ]` (user components).
- **R7** — layout.
- **R8** — JSON data + `:path` + replication + DataSource lifecycle.
- **→ neoweather** — assembles R0–R8; parity-or-better with the weather app.
- **→ neocalendar** — states, richer layout, text input, scrollbars, drag, dialogs.
- **→ neodashboard** — windows, the component-heavy chrome, connection/chat.

## 8. Reuse / new map (starting point)

- **Reused (primitive, as clean guides, rewritten where clarity wins):** Canvas2D painter, font metrics, easing, hit-test math.
- **New (model, fresh, LZX as guide):** the compiler front-end, the node/view/attribute/constraint/event/data core, the render backends, the components.
- **References, not bases:** `../design-docs/` (product spec), `../runtime/lfc-src/` (the LZX LFC — read for intent), `../compiler/` (the transliterated byte-parity LZX compiler — a reference for behavior, never a base to build on).

# neo-LZX — Product Vision

*Working name; provisional — a direction under active design, not a committed build. The language is specified in [neolzx-language.md](neolzx-language.md); the compiler and runtime in [neolzx-implementation.md](neolzx-implementation.md).*

> The web has two surfaces: a **document** surface — content, pages, search — which the DOM owns and always will (more so now that AI-as-search runs on machine-readable documents); and an **application** surface, which has spent two decades contorted onto that same document model. neo-LZX gives that second surface a language of its own — a concise, declarative language with **TypeScript inside**, **compiled in the browser**, over a **runtime-independent** rendering model in a **live, self-contained environment** — the runtime wields the best substrate for each job: the DOM's facilities where they fit, its **own pixels** (Canvas/WebGL) where they win, and off the web a **native kernel** entirely, all invisible to the app. The aim is native-app **ergonomics and feel** — from an app model underneath instead of a document one — and the best substrate there is for **AI-generated and AI-analyzed** interfaces.

---

## 1. What HTML is to documents, neo-LZX is to applications

The document web has a language purpose-built for it: HTML. The application web has no equivalent.

And it never has, because the application surface was never given a foundation of its own — only a non-app substrate pressed into app duty, with a framework layered over it to supply the missing model and fight the substrate. Each new framework is another adapter over the wrong foundation.

What is finally new is not another high-level substrate to adopt, but the **low-level facilities to build the whole thing directly**: **OffscreenCanvas** and **WebGPU** to draw off the main thread, **WebAssembly** for near-native execution, **Web Workers** for real threading, and **high-frequency, timestamped pointer input** for interaction physics. In OpenLaszlo's era the browser exposed none of this — you targeted a plugin and built the application model on top of it. The raw material for building it directly simply wasn't there. Now it is, and own-pixels UI at professional scale is already proven — on the web (Figma, Google Docs, Flutter) and native (Jetpack Compose). neo-LZX is the language built for that surface — plus the runtime-independent system that renders it: own pixels where they win, the DOM's facilities where they fit.

And the toolchain comes with it: the compiler is a runtime citizen, so apps can **compile in the browser** — no build step, no server round-trip, a live image you edit and re-run on the spot (the Smalltalk/Lisp affordance, and the ideal loop for an AI agent). This is shipped, not speculative: OpenLaszlo's Java 4.9 compiler has already been ported to TypeScript and runs **entirely in the browser** — the 5.0 distribution compiles LZX → DHTML on the fly from any static host, byte-for-byte identical to the original, with no JDK or server anywhere. In-browser compilation of this exact language family is a working fact; neo-LZX builds the new language around it.

**OpenLaszlo was right about the model and wrong about the medium.** Its model — a unified declarative language with automatic constraints, a real component/class system, declarative states, data-driven replication — was years ahead. Its medium — XML, a bespoke script compiler, Flash — is obsolete. The tell is that the industry re-discovered the ideas one at a time: fine-grained reactivity (signals, now a TC39 proposal), single-file components, the compiler-as-framework (Svelte), declarative state and transitions. OpenLaszlo had a coherent version of all of it by ~2005. neo-LZX is a clean reimagining on 2026 primitives, **not a port** — that same TypeScript port and its golden corpus stay valuable as a behavioral oracle, but the product starts from the optimal 2026 design.

---

## 2. The language

You compose a tree of components — views, text, buttons, lists, forms — set their attributes, bind them to data, and handle events. The declarative layer is small and novel; **all real logic is ordinary TypeScript**. Two delimiters carry the whole model: **`[ ]` holds a component's members** (its attributes, children, and in a class its declarations), and **`{ }` is TypeScript** — a value expression, a method body, a `script` block. A bare value is a literal; a `{ }` value is a live expression the runtime re-evaluates when its inputs change; a `:path` reads from bound JSON data. Static vs. live data is visible at a glance. 

Components are classes, so when a pattern repeats you define your own — but most of what you write is composition. And the component library is itself written in neo-LZX over a small runtime core: no black-box native widgets, nothing un-forkable.

```
// A reusable component is a class — typed, reactive attributes; { } bodies are TypeScript.
class WeatherCard extends View [ width = 200, height = 56,
    layout: SimpleLayout [ axis = x, spacing = 8 ],

    Image [ source = { weatherIcon(:code) } ],          // :code reads a field from the bound record
    Text  [ color = #FFFFFF, fontWeight = bold,
        text = { `${:day}  ${:high}° / ${:low}°` },     // a constraint — re-derives when the data changes
        ],
    ]

App [ width = 240, height = 320, backgroundColor = #1E3A49,
    zip: string = "94403",                              // declared, reactive state

    // one reactive remote resource; its .loaded / .failed / .value lifecycle drives the UI
    
    weather: DataSource [ url = { `/weather/${zip}.json` } ],

    days: View [ datapath = { weather.value.channel },  // a named instance; sets the data cursor
        WeatherCard [ datapath = :forecast[] ],         // replicates — one card per forecast record
        ],
    ]
```

Nobody wired an update. Change `zip` and the resource refetches, the cursor re-roots, and one `WeatherCard` appears per record — all standing relationships the runtime keeps true. Reactivity is the heart: a binding is not a function you remember to re-run but an edge in a dependency graph, so the measure-once-then-stale bug we fought constantly porting OpenLaszlo cannot occur.

---

## 3. Principles

The same seven values that shape the language ([neolzx-language.md §1](neolzx-language.md#1-design-goals)), stated here as the *why*.

1. **Declarative and reactive by default.** Structure, data binding, and event subscription are declared, not wired by hand. A binding is a relationship the runtime maintains — no effects, no dependency arrays, no re-render. It is the whole ergonomic win, and it makes a class of bug unrepresentable.

2. **Composition is the hierarchy.** The bracket nesting *is* the view tree; you read an app by scanning it. Write one-off structure inline; extract a class only for genuine reuse. Legibility, for humans and machines alike.

3. **Modern and familiar.** All real logic is ordinary TypeScript — the only new thing to learn is the small declarative layer. Names and conventions are TS/React-familiar (`backgroundColor`, `onClick`, camelCase). The surface is optimized for adoption: a language a developer — or a model trained on TypeScript — already mostly knows.

4. **State-of-the-art performance, whole-stack.** Not a late tuning pass but a property the language, the compiler, and *above all the runtime* deliver together: reactivity confined to where it is declared, dependencies wired statically, updates in proportion to what actually changed — no virtual-DOM diff, no reconciliation, near-zero steady-state allocation. The runtime is an *optimizing* one — it uses the platform's fastest facility per job: the DOM where it is fast enough (and for most apps it is), its own GPU pixels where they win. That crossover is *measured*, not assumed — the DOM's per-node layout/style cost scales with the tree while own-pixels stays flat, so own-pixels pulls ahead on large, data-dense, reactively-animated surfaces and on startup at scale. DOM-fast by default, above-DOM where it matters, with real headroom from the typed language and compiler.

5. **A fluid visual experience.** Continuous, not discrete: arrangements, transitions, and state changes *move* rather than jump. Reactivity, animation, and layout ride one reactive core, so any change can animate natively — not a library bolted onto a re-render. This was OpenLaszlo's distinguishing trait; here it is a stated goal, and it needs the headroom of #4.

6. **The render substrate is abstracted — and the runtime is independent.** You write components and attributes; you never name a substrate. The runtime wields whatever renders the app best: the **DOM as a first-class facility** — its text, input, IME, video, and accessibility are hard-won and free, and it is fast enough for most apps — its **own GPU pixels** (Canvas/WebGL) where they win (#4/#5), and, off the web, a **native kernel** entirely. That native path is *not* a layer over platform widgets; it is LZX components rendered by a platform-tuned kernel — one app model delivering a super-optimized experience on iOS, Android, or the web. Runtime-independence is **proven, not aspirational**: one neo-LZX source already runs on both a DHTML kernel and an own-pixels canvas kernel, touching neither directly — the successor to OpenLaszlo running on Flash and DHTML from one source. And it is a first-class attribute *with teeth*, shaping: how the system is built (a thin platform-independent core over a swappable kernel); what may appear in the language and API (nothing substrate-specific — no DOM, no CSS, no platform types leak in); and what a developer must learn (the model, never the medium). Styling serves the same independence — **LZX-native, defined by the use-case rather than by any substrate**; the runtime maps it to CSS where CSS suffices and to drawing where it does not, and the model is free to exceed what CSS can express (see [style.md](style.md)).

7. **AI-native — generable and analyzable without a massive corpus.** Most generation is corpus-bound; neo-LZX is built to be machine-written and -read without that crutch. The logic is TypeScript, so generation rides the largest corpus there is; the declarative grammar is small and regular, so it fits in a prompt and is grammar-constrainable (valid output from a model that never trained on it); the structure is compositional and statically typed, easy to form and to verify. The same dataflow a model reasons about is what powers the tooling.

---

## 4. The real comparison: Flutter, not React

React is a DOM-document library; set beside neo-LZX it mostly compares *languages*. The runtime comparison is **Flutter** — an own-pixels app runtime with its own scene graph, and the one serious attempt at the web's app surface. So state the bet against both: a better *language* than React, a better *runtime* than Flutter-on-the-web. And Flutter on the web *limps* exactly where the app surface is won or lost — heavy download, clunky text and input, bolt-on accessibility, a reflex to *imitate* native toolkits. neo-LZX does neither thing it does wrong: not chasing SEO (a document-surface concern an app does not owe) and not imitating native widgets, but delivering native *feel* by owning the input→physics→render loop. The axes:

| | Renders to | Language & logic | Reactivity | Compile | AI affinity |
|---|---|---|---|---|---|
| **React** | DOM (virtual DOM) | JSX markup *in* TS | Coarse — re-render | Build-time | High corpus; hook dataflow opaque |
| **Flutter** | **Own pixels** (Skia/Impeller) | Dart, no markup | Coarse — `setState` | AOT (offline) | Thin corpus; web a11y weak |
| **neo-LZX** | **Own pixels** + DOM islands | `[ ]` + TypeScript `{ }` | **Fine-grained, default** | **In-browser, live, or AOT** | **High by design** — TS logic + a tiny analyzable grammar |

**Where it wins first.** The long-term bet is that intersection; the beachhead is narrow and concrete — exactly where the DOM already fails and builders have *already abandoned it* for hand-rolled canvas: real-time data-dense surfaces (live grids, trading terminals, observability), node and graph editors (flow editors, AI agent/pipeline builders), canvas-native creative tools (whiteboards, design tools), and heavy data visualization. Each is missing one leg of a tripod — the WebGL viewers have scale but not rich editable nodes; React Flow has rich editing but hits the DOM ceiling; raw-canvas engines have scale but are murder to build and extend (ComfyUI is migrating *back* to the DOM — not for speed, but because every rich node, theme, and hit-test was hand-rebuilt and small changes "took days"). **The unoccupied square is all three at once: own-pixels scale + a clean reactive language + a managed DOM that re-provides text, input, and accessibility.** What is a specialist one-off today becomes something an ordinary developer — or an AI — can build. And because a neo-LZX program runs as an embeddable island in any page, the ask is "try it on one slow view," not "rewrite your app."

---

## 5. AI: the challenge and opportunity

Code generation today is **corpus-bound** — tools emit React + Tailwind because that is what models have seen, not because it is a good target — and a novel language normally starts cold against that. neo-LZX's thesis is that the headwind is beatable *by construction*, and that neo-LZX is the *better* target on the axes that grow in importance as AI writes more of the UI: analyzability and verifiability. Concretely:

- **Logic in TypeScript** puts the hard part of generation on the largest corpus there is; the novel part is a one-page declarative grammar, learnable in-context.
- **Grammar-constrained decoding** lets a model emit *only* parseable neo-LZX with zero training on it — the shape enforced at decode time. (Parseability, not idiomatic correctness; that is what the verify loop is for.)
- **Explicit reactivity and static types** make programs analyzable and the type-checker a precise, in-loop verifier: a model edit's blast radius is computable before it acts, and a broken reference is a compile error *in the exact binding* — not React's dataflow buried in `useEffect` and its perennial *"why did this re-render?"*
- **A live, in-browser image** is the ideal agent loop. The compiler is a runtime citizen, so an agent writes a component, compiles it instantly, runs it in the live image, inspects the object graph *and* the rendered result, and iterates — compile → run → inspect, in-process, no build step. The REPL/inspector affordance that made Smalltalk and Lisp productive, now an agent's.
- **Deterministic source↔AST round-tripping** unifies AI, visual, and human edits on one canonical artifact.

The wager is explicit: as AI-authored UI grows, analyzability and verifiability come to matter more than corpus familiarity — and neo-LZX is built for the former.

---

## 6. Honest risks

A north-star, honestly held.

- **Own-pixels on the web is the hardest path — so the runtime doesn't take it universally.** Text shaping, input/IME, and cold-load weight are the tax own-pixels pays, and even Flutter hasn't fully won them. The optimizing-runtime strategy scopes the risk rather than betting everything on it: own-pixels is applied where it wins, the DOM carries text/input/a11y, and HTML-in-Canvas is closing the gap. Still the central engineering challenge — but a scoped one, not all-or-nothing.
- **Accessibility follows from the substrate strategy.** For DOM-rendered content it is *inherited* — the reason to treat the DOM as a facility, not an enemy. For own-pixels content it is *constructed* — historically the own-pixels camp's universal unsolved problem (Flutter ships it off by default on the web; Figma's arrived ~a decade late), a DOM mirror kept in sync. Two things de-risk it now: the runtime already uses the DOM where text/input/a11y live, and the platform is converging — Chromium's **HTML-in-Canvas** (origin trial, 2026) draws live DOM into a canvas/WebGL surface with the accessibility tree, find-in-page, IME, and text selection *preserved* — the managed-DOM seam done natively. Still worth an early spike, but no longer the likeliest thing to sink the project.
- **A novel DSL starts cold for AI.** Mitigated by construction (TypeScript-inner logic, constrained decoding, shipped spec, a typed verify loop) — but constrained decoding buys parseability, not idiomatic correctness. The wager must be proven against real models on *idiomatic* output, not assumed.
- **Tooling must be built for the declarative layer.** The `{ }` TypeScript layer inherits the world's TS tooling for free; the `[ ]` layer needs its own language server, diagnostics, formatter, and live debugger. "No build step" is not "no tooling."
- **Adopting the canvas drawing vocabulary is a deliberate, flagged commitment.** LZX's visual layer takes on the 2D vector-graphics model — paths, fills, gradients, clips, transforms, text — as an *abstract* `Painter` interface, portable across Skia, Core Graphics, and the web canvas, and pointedly *not* intimate with the DOM or CSS (its only CSS ties are cosmetic value formats LZX defines natively anyway). This sets the expressiveness of the entire visual layer and commits to a bounded imperative escape hatch beside the declarative decoration model — called out as a decision, not slid in.

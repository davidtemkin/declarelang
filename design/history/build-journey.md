# neo-LZX — the build journey

A narrative summary of how neo-LZX was built, distilled from the working docs of the
`openlaszlo-neo/neolang` effort (`APPROACH.md`, `HANDOFF.md`, `PLAN.md`, the animation
relay, and the session-resume notes). Those were process scaffolding — checkpoints,
relays, and decision logs written for the agents building each rung. This is the story
they add up to, kept for provenance. The enduring *design* rulings live in the sibling
`design/` docs; this is the *how we got here*.

## What we set out to build

A **clean-slate successor to OpenLaszlo** — not a port. neo-LZX keeps LZX's feel and
the kinds of apps it builds, but it does not compile LZX and works differently at
runtime. LZX (and the OpenLaszlo 5.0 distro) served throughout as a **reference for
"what good looks like,"** never as code to translate.

## The prime directive

Two things were held co-equal and non-negotiable from day one: **elegance/clarity of
the source** and **performance**. Work wasn't "done" until it was concise, readable,
and fast. Difficulty was not an excuse — the elegant, performant path was taken even
when hard, and the only allowed response to a genuine wall was to *surface it for a
decision*, never to quietly cut a corner. Cruft and dead abstraction were treated as
defects, ranked with wrong behavior and slowness. That discipline is why the runtime is
small and the compiler is thin.

## The method: a checkpointed ladder

The system was built as a **ladder of rungs (R0–R8)**, each a self-contained slice that
had to pass a green gate (build + unit + perceptual tests) and a lead checkpoint review
before the next began. Two flagship apps *drove* the ladder — every rung existed to make
the next piece of a real app work, so nothing speculative got built.

The invariant across every rung was **perceptual + behavioral, "or better"**: neo's
output had to match the OpenLaszlo reference pixel-for-pixel (within AA tolerance) and
behavior-for-behavior — *or improve on it deliberately*, never regress by accident.

- **R0** — parse the `[ ]` declaration syntax; a typed `Node`/`View` core sitting on a
  `RenderBackend` seam; the DOM backend. The seam was the bet: one abstract surface both
  backends implement.
- **R1** — the own-pixels **Canvas backend**, rendering R0 **byte-identically** to the
  DOM (max channel delta 0) with *zero* changes to the core and *no* extension of the
  seam. That the seam already expressed everything Canvas needed was its proof.
- **R2** — typed literal attributes and a separable `check()` typecheck pass; component
  **schemas as data** (name + base + own attrs, inheritance as a chain walk) over a
  value-type vocabulary (Length incl. `%`, Color, number, boolean, string, enum),
  including the full 148-keyword CSS named-color set verified against Chrome's own parser.
- **R3–R4** — the rendering model ruled and made binding: **Text** and **Image** leaves,
  **recorded drawing**, and declarative clip.
- **R5** — the **`{ }` reactive core**: constraints, with dependencies extracted
  *statically by the compiler*, not tracked at runtime.
- **R6** — **methods + events** with cross-backend hit-testing; **user classes** and
  compile-time bare-name scope resolution.
- **R7** — **layout**: a reactive `Layout` attribute and `SimpleLayout` riding the same
  constraint core.
- **R8** — **JSON data**: `Dataset`/`DataSource`, region-precise `:path` bindings,
  replication with live tree mutation; and `View` auto-extent.

## Dual backend, chosen at runtime

A defining departure from OpenLaszlo: neo renders to **DOM *and* Canvas**, picked at
runtime, from one program. The DOM backend gives accessibility and native text; the
Canvas backend gives own-pixel control and performance. The cross-backend perceptual
diff (delta 0) was a standing gate — the two backends must agree.

## Compiler as a declarative front-end over TypeScript

The compiler is a thin, declarative front-end: it parses `.neolzx`, typechecks against
the schemas, extracts constraint dependencies statically, and emits JavaScript. The
runtime stays browser-pure and zero-dependency — and, because neo instantiates and
compiles *in the browser*, the parser and checker live in the runtime, with the compiler
a Node-side orchestration layer on top. (See `../hosting.md` for why the seam falls there.)

## The rulings that shaped the language

The decision logs converged on a consistent set of choices, each written up in `design/`:

- **No magic.** Predictability beats ergonomic special-casing; bare-string sugar and
  other convenience grammar were rejected on principle.
- **States** kept, reframed as **precedence-stack override bundles**.
- **Events** are function-typed attributes, target-only, **no bubbling**.
- **No DOM in bodies** — the language stays a declarative object graph, not markup.
- **Constraints**: `{ }` dependencies are extracted **statically** by the compiler
  (analyzable-expression discipline; dynamic cases drop to primitives + imperative code).
- **Fonts**: a named `font` container owns `Face` children; `fontFamily` is a use-site
  fallback list — replacing an earlier weight-key-map scheme.
- **Text input**: OL5-style static text with a DOM overlay for the caret.

## The flagships

**neoweather** was the first full app — a compact but complete weather app that drove
R0–R8 to closure. **neocalendar** followed as a ground-up, **spec-first** rewrite: a
written SPEC contract plus a suite of oracle screenshots defined the target *before*
implementation, so the app was built to a specification rather than transliterated from
the original — geometry-exact, chrome improved, bugs fixed rather than replicated.

## Where it landed

The ladder and the two flagships proved the language, runtime, and compiler end to end.
The work then graduated out of the `neolang` build tree into a clean, self-contained
distribution — `neolzx/` — with the compiler, runtime, component library, examples,
docs, and design notes in one hostable tree. That is the project you're reading this in.

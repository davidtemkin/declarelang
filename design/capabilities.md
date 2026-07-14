# Capabilities — the environment contract, headless execution, static extraction

Status: ratified 2026-07-13. The headless environment and the static (SEO)
extractor below are BUILT; the `navigate` link model (§6) is ratified design,
implementation pending. Companion to design/constraints.md (analyzability),
design/hosting.md (the program-URL surface), and design/verify-and-evals.md
(rung 4 is the same execution tier).

## 1. The principle

A Declare program cannot reach the browser. The language ruled `{ }` bodies
DOM-free; the runtime is the membrane between the program and whatever hosts
it. So "what the browser provides" is not an API surface the app consumes —
it is a short, closed, *enumerable contract* of inputs and capabilities, every
entry flowing through a designed seam.

That contract will grow: an app that never touches the DOM still wants
storage, the password manager, the camera, files, the clipboard. The rule is
not that the list stays small — it is that growth is *governed*. Every
capability enters in one of three shapes, and never a fourth way (ambient
browser-API access from bodies):

## 2. The three shapes

1. **Ambient data** — environment as reactive attributes. For state the world
   pushes at the app: `hostWidth`/`hostHeight`, `app.dark`, the pointer,
   `scrollY`. One wiring site (`wireEnvironment`, runtime/src/boot.ts) feeds
   them; the program just reads attributes.

2. **Services** — named runtime capabilities with a callable/subscribable
   surface: `Keys`, `Focus`, the pending `navigate`. Each carries a declared
   effect (compiler/src/effects.ts) and a typed surface (scaffold.ts
   LANGUAGE_API), so usage is dep-analyzable and typechecked by the same
   machinery as everything else.

3. **Components** — capabilities that are *view-shaped*: they have geometry,
   compose, clip, participate in layout. `TextInput` is the exemplar, and the
   D-5 ruling (native editables under runtime management) is the pattern
   paying off: IME, autofill, spellcheck, and the password manager ride along
   because the browser sees a real input. Capability through component
   fidelity, zero new language surface.

Mapping the obvious wants:

| want                    | shape     | form it takes                                             |
| ----------------------- | --------- | --------------------------------------------------------- |
| local storage           | data      | a persistent Dataset (persistence is a dataset property)  |
| password manager / IME  | component | already flowing through the D-5 native editable           |
| webcam                  | component | a `Camera` leaf — host-managed interior, Declare geometry |
| file upload             | component | a `FilePicker` / drop target feeding a File into datasets |
| file save               | service   | `save(data, name)`, effect-declared                       |
| clipboard, share, links | service   | one registry row each; `navigate` is the first (§6)       |

Permission-gated capabilities (camera, geolocation) expose their lifecycle as
reactive state in the DataSource idiom (`idle / prompting / granted / denied`),
never as promise chains in app code.

Each addition is one registry row, everywhere: an effect signature, a
LANGUAGE_API entry, a headless-contract entry (§3), a per-backend note. And
the slimming used-set already computes which components an app can
instantiate — extended to services, every app carries a *static capability
manifest*: a compile-time fact for verify, policy, and review.

**The graduation queue.** `BROWSER_GLOBALS` (compile.ts) stays as the pressure
valve for the not-yet-modeled — but the compiler classifies those identifiers
during scope resolution, so "this program touches `navigator.mediaDevices` —
unmodeled capability, not headless-clean" is a statically reportable fact.
The corpus writes the promotion roadmap; each graduation shrinks the
ungoverned surface.

## 3. The environment contract

Everything a program consumes from its host, and where it enters:

| input          | seam                                       | headless supply                        |
| -------------- | ------------------------------------------ | -------------------------------------- |
| host size      | `wireEnvironment` → `hostWidth/hostHeight` | two numbers — the chosen viewport      |
| text metrics   | the ONE measurer (measure.ts, both backends) | `provideMeasurer(ctx)` — a real 2D context, or the deterministic approximation (§4) |
| color scheme   | `app.dark`                                 | a boolean                              |
| pointer        | reactive App attrs                         | at rest                                |
| clock / frames | the animator's scheduler                   | not pumped at t=0; the driven Clock when motion matters |
| network        | `DataSource.fetch`                         | fixtures, or honestly absent (`loading` emitted) |
| keyboard       | the `Keys` service                         | silent                                 |
| navigation     | `navigate` (§6)                            | recorded, not performed                |

The settled tree is a function of **(program, environment vector)**. A browser
fills the vector implicitly; headless execution fills it explicitly. Every
entry already had a designed injection point before extraction needed one —
verify rung 4 and backend parity required the same seams.

## 4. Headless execution — the t=0 snapshot

`settleHeadless(compiledSource, opts)` (compiler/src/headless.ts) is real
program execution: runtime `build()` (parse + check + instantiate), attach to
the `HeadlessBackend` (runtime/src/headless-backend.ts — a no-op `Surface`,
typed against the interface so tsc keeps it complete), write the environment
vector, `settle()`. The same execution tier as the unit suite, prebuild, and
verify rung 4 — not a new kind of phase.

"Executes" is bounded, precisely:

- **Runs**: construction, declaration defaults, constraints, datapath
  replication, layout, state application.
- **Does not run**: event handlers (no input arrives), timers (no clock is
  pumped), network completions (no live fetch).

Deterministic modulo what any initialization admits (a `Date.now()` in a
constraint is the app's own choice of nondeterminism).

**Environment defaults**: `hostWidth 1200 × hostHeight 800, dark false` —
one canonical desktop viewport, the same constant on every host, so the
artifact does not vary by who extracted it. Explicit because geometry leaks
into *content* through responsive constraints (the calendar's compact tabs
render "D" for "Day" at narrow widths); the viewport selects which content
the snapshot contains, so it is a visible parameter, not an accident.

**Metrics**: in a browser the real measurer measures (nothing injected). In
a DOM-less host, `settleHeadless` injects a deterministic approximation
(per-character class widths) through `provideMeasurer` — enough to settle
every tree; geometry is approximate, and only geometry-derived *content*
could shift. For exact typography headlessly, inject a real 2D context at
the same seam (verify §2.8 — a tools-only canvas dependency; the runtime
stays zero-dep).

## 5. Static extraction (the `seo` surface)

**Purpose**: search crawlers and AI chatbots — a working program paired with
a generated HTML document extracted from the program's *text content*,
formatting and semantics carried over. Explicitly NOT an accessibility
feature, and explicitly NOT a language feature: no new syntax, no DOM-think
in Declare source. The extraction is two phases with an ink-line between
them — the *link relation* is compile-time static analysis (§6); the
*content* is the settled tree of §4, serialized.

**Serialization is class semantics, never heuristics.** Each content class
already declares what its text MEANS; the serializer just says it in HTML:

| class               | emits                                                        |
| ------------------- | ------------------------------------------------------------ |
| `Markdown`          | its block tree as HTML (`md.parse` → headings/lists/tables…) |
| `HTMLText`          | the same block tree via `parseHtml`                          |
| `Text`              | `<p>…</p>`                                                   |
| `Image`             | `<img src>`                                                  |
| `TextInput`         | nothing (draft UI state, not content)                        |
| `visible = false`   | nothing — the subtree is skipped                             |
| everything else     | no wrapper; children walked in tree order                    |

No font-size-looks-like-a-heading inference, ever: a heading is a heading
because Markdown said `#`, not because it is large.

**Two artifacts, one extractor** (compiler/src/seo.ts, exported by BOTH
compile-node and compile-browser — full parity, the browser compiler can do
everything the Node one can):

- **Flag `seo`** (flags.ts registry: `--seo` / `?seo` / `{ seo: true }`) —
  the run page ships with the static document embedded in the host element
  (`<div id="declare-static">`), removed at boot before mount. `declarec
  --seo` bakes it into the built index.html; the dev server embeds it
  server-side when the flag rides a run URL.
- **Request type `?view=seo`** (reqtypes.ts) — the extracted document ALONE,
  `text/html`. The dev server extracts in Node; the static host's service
  worker serves a page that extracts in-browser (browser/boot-seo.js) — the same
  extractor module both times. No bare `?seo` shorthand: that spelling is the
  flag.

Crawler math: a crawler that runs no JS reads the embedded block; one that
does run JS sees the real app replace it. Neither path requires the SW
(crawlers don't install service workers), which is why the flag — build-time
embedding — is the SEO surface that matters; the view is the inspectable
artifact.

## 6. Links — the `navigate` ruling (design, pending)

Links deserve first-class extraction, inside the Declare model, with no
voodoo — neither a router that secretly consults an attribute name, nor an
extractor that knows library attribute names.

- `navigate(to)` is a language SERVICE action (shape 2) with a declared
  navigation effect in effects.ts — level with every other analyzable call.
- Link extraction is the existing dep-extraction walk ROOTED at each
  (element, handler) pair: attribution by construction, not caller-tracing.
  The analyzer sees `navigate(this.link)` inside `Button.onClick`, classifies
  the effect, resolves the argument as a read-path, folds literal instance
  values, and the links table rides the `compile()` result exactly as `deps`
  do — compile extracts the symbolic relation, execution binds it to
  instances (§4), the serializer wraps the matched subtree in `<a href>`.
- Only ACTIVATION handlers become anchors; a `navigate` in `onInit` stays in
  the link graph for verify but emits no `<a>`.
- Conditionality lives in the VALUE (`link = { cond ? url : null }`), never
  in imperative cancellation.
- The library `Button [ link = … ]` is sugar whose `onClick` the
  interprocedural analysis sees through — no name is special.

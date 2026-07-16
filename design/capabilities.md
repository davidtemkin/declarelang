# Capabilities — the environment contract, headless execution, static extraction

Status: ratified 2026-07-13. The headless environment, the static (SEO)
extractor, and the `navigate` link model (§6) below are all BUILT. Companion
to design/constraints.md (analyzability),
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
   surface: `Keys`, `Focus`, `navigate` (§6). Each carries a declared
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
*content* is the settled tree of §4, serialized. The t=0 snapshot here is the
DEFAULT location; design/location.md §7 generalizes it to t=0 per reachable
location — the same serializer, cold-booted at each fragment the app links to,
so content hidden at the default (an in-app article, a docs chapter) is
extracted too. The crawl follows the very links §6 extracts.

**Serialization is class semantics.** Each content class already declares what
its text MEANS; the serializer just says it in HTML:

| class               | emits                                                        |
| ------------------- | ------------------------------------------------------------ |
| `Markdown`          | its block tree as HTML (`md.parse` → headings/lists/tables…) |
| `HTMLText`          | the same block tree via `parseHtml`                          |
| `Text`              | `<p>…</p>`, or `<h1>`–`<h6>` when inferred a heading (below) |
| `Image`             | `<img src>`                                                  |
| `TextInput`         | nothing (draft UI state, not content)                        |
| `visible = false`   | nothing — the subtree is skipped                             |
| everything else     | no wrapper; children walked in tree order                    |

**Heading inference from the settled type (2026-07-14 ruling).** A `Text` has no
declared heading level — a content page styles its headline large and bold, it
does not write `# `. So the serializer INFERS the level from the rendered type
of the settled tree: a `Text` set LARGER than the body copy AND at a heading
WEIGHT (semibold+) is a heading, its level by the rank of its size among the
page's heading sizes (largest = h1). Two signals, no more — bigger and bolder;
the weight gate leaves a large-but-light LEAD a paragraph. The body size is the
size carrying the most characters (body copy dominates), which anchors the
comparison. Deliberately IMPERFECT and not special-cased: a big bold display
figure (a gradient "46 KB", a stat "479") reads as a heading, and a two-line
hero reads as two headings — accepted, because chasing a clean outline with
per-shape rules trades a predictable proxy for a pile of exceptions. This
reverses the earlier "no font-size inference, ever" line: it is a deliberate
PROXY, not a contract — undeclared, not controllable from Declare source, so it
lives inside the extractor and never touches the language surface
(`Markdown`/`HTMLText` still carry their own `#` headings, untouched). Byte-
identical on every host: size and weight are SET attributes, never measured
geometry.

**Two artifacts, one extractor** (compiler/src/seo.ts, exported by BOTH
compile-node and compile-browser — full parity, the browser compiler can do
everything the Node one can):

- **Flag `seo`** (flags.ts registry: `--crawler` / `?crawler` / `{ seo: true }`) —
  the run page ships with the static document embedded in the host element
  (`<div id="declare-static">`), removed at boot before mount. `declarec
  --crawler` bakes it into the built index.html; the dev server embeds it
  server-side when the flag rides a run URL.
- **Request type `?extract`** (reqtypes.ts) — the extracted document ALONE,
  `text/html`. The dev server extracts in Node; the static host's service
  worker serves a page that extracts in-browser (browser/boot-seo.js) — the same
  extractor module both times. Distinct from the bare `?crawler`, which is the *flag*
  (embed the document in the run page, not return it alone).

Crawler math: a crawler that runs no JS reads the embedded block; one that
does run JS sees the real app replace it. Neither path requires the SW
(crawlers don't install service workers), which is why the flag — build-time
embedding — is the SEO surface that matters; the view is the inspectable
artifact.

## 6. Links — the `navigate` ruling (BUILT)

Links are first-class extraction, inside the Declare model, with no voodoo —
neither a router that secretly consults an attribute name, nor an extractor
that knows library attribute names.

- `navigate(to)` is a language SERVICE action (view.ts `App.navigate`, typed
  in the scaffold's LANGUAGE_API, pure in effects.ts) — a CALL, not an
  attribute. `app.navigate = url` is a type error now: the surface is the call,
  which is what the analyzer reads.
- Link extraction (compiler/src/links.ts) is a walk ROOTED at each (element,
  activation-handler) pair, the dual of dep-extract's constraint walk:
  attribution by construction, not caller-tracing. It sees `navigate(to)`
  inside `onClick`, resolves the argument — a string literal → an href, or a
  read-path rooted at the element (`this.…`, or `classroot.…` on a class root,
  the same instance, the library-button pattern) → a read evaluated at t=0 —
  and attaches a `LinkTarget` to the element (parser `Element.link`). The
  relation rides the `compile()` result exactly as `deps` do (a sparse
  walk-order side-list, runtime links.ts); execution stamps each instance
  (`_navLink`, instantiate.ts); the serializer (seo.ts) evaluates the target at
  the t=0 snapshot and wraps the matched subtree in `<a href>`.
- Only ACTIVATION handlers (`onClick`) become anchors; a `navigate` in `onInit`
  emits no `<a>`.
- Conditionality lives in the VALUE: `navigate(this.link)` with an empty link
  value emits no anchor — the serializer reads the value and an empty string is
  no link. Never imperative cancellation.
- A library `Button [ … ]` whose `onClick` calls `navigate` is seen through by
  the same walk — no name is special. (Interprocedural see-through, a
  `navigate` reached via a helper the handler calls, is a follow-up; the direct
  call in the activation handler is what the corpus uses and what extracts
  today.)
- `app.location = <expr>` in an activation handler is the IN-app twin (design/
  location.md §5): the same walk resolves it to a FRAGMENT link (`<a href="#…">`)
  — a reachable location — while `navigate(to)` stays the out-of-app link. One
  relation, two href shapes; the crawl of §7 follows the fragment ones.

## 7. Live demo editing — the component ruling (RULED, interim wiring)

Three site apps (docs, homepage, codeviewer) host editable demo cards: an
editor, a preview island the host recompiles into, a diagnostics pane. The
capability originally leaked onto the base App as eight schema attributes —
wrong by this document's own principle: most apps are not code editors, and
the App is the *environment*, not a grab-bag for whatever the fanciest app
needs.

**The ruling: live editing is shape 3 — a component.** An editable demo is
view-shaped (geometry, composition, an editor, a preview, a report pane); the
exemplar is `TextInput`/the `HTML` island, not `navigate`. The target form is
a library `LiveDemo` component (one file, one autoincludes row, a bare tag in
the three apps) owning the whole channel as its OWN attributes:

- `source: string` — the demo's current text; the host seeds each instance
  (killing `demoSources`, the root-level record-typed name→source map, which
  existed only because a singleton channel needs a key).
- `report: string` — that instance's last compile report (killing the global
  `liveReport`, which two open editors would fight over — per-instance is more
  correct, not just cleaner).
- No `liveCard` at all — it was pure multiplexing of the singleton channel.

The host↔component seam is the island mechanism host-client.js already uses
(`data-neo-slot="run:<name>"` — the host finds instances, manages interiors;
the D-5 pattern). The App carries zero editing knowledge.

**Interim state (today).** The app-authored flags (`editing`, `liveCard`,
`liveSource`) are instance-declared on the three apps' roots — off the base
schema. The two host-fed channels the apps still read (`demoSources`,
`liveReport`) remain runtime App slots typed in the scaffold's LANGUAGE_API,
marked interim there; they are exactly what the `LiveDemo` component
dissolves. The rework is deferred until the component set matures (the same
call as the calendar's standard-library pass) — it rewires host-client.js
from root-polling to per-instance channels and reworks the three apps' editor
cards onto the class.

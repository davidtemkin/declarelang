# The Declare Guide — outline, narrative order, and the reasoning

**SUPERSEDED 2026-07-18** by the shipped 13-chapter rewrite (plan: [`guide-proposal.md`](guide-proposal.md); chapters: `docs/guide/01-…13-`). Kept as design history.

**Status:** PROPOSED 2026-07-14 (Fable editorial pass) — the fresh top-to-bottom design
David ruled (supersedes the keep/update table in [`docs-ia.md`](docs-ia.md) §5 and the old
`docs/guide/outline.md`). This is the blueprint another agent fleshes out chapter by
chapter; the **why** remarks exist so that agent inherits the logic, not just the list.
Correctness oracle: **the compiler** — every example is written runnable and passed through
`verify` before it ships; `declare-docs:` linking is a secondary mechanical pass.

## What the guide is (and is not)

The guide teaches a person to **think in Declare**, in one sitting-order, and carries the
intent that per-element reference pages can't. The core doc (`docs/declare.md`) states the
whole surface once; the guide *never restates it* — it sequences, motivates, and
exemplifies. It is also the honest soft sell: every chapter opens with running code whose
payoff is visible, and the argument is carried by the example, never by adjectives.

**The positioning hierarchy governs the arc** (docs-ia.md §7): the headline is what the
language makes *sayable* — continuity as the grain, arrangement that animates, modes that
can't leak — with verifiability/conciseness/speed as consequences, the floor not the point.
The guide's crescendo is therefore the continuity chapter (28) and the calendar capstone
(42), and the opening chapter promises exactly that destination.

**Standing editorial rules** (from docs-ia.md §7, binding on every chapter):
declarative present-tense register, never cute; show-then-gloss (the example first, prose
explains *that example*); one memorable law per chapter, stated once and exactly (it
becomes the chapter's `concept:` ID); negative knowledge placed *after* the positive model,
marginal gotchas late or nowhere; frameworks named precisely to orient, never to sneer;
every fact eventually links up (`declare-docs:`), every fence verifies.

**Salvage policy** (David's ruling): reuse old-guide prose only where it is a *great* fit
for the new structure. The per-chapter salvage notes below mark the candidates; when in
doubt, write fresh against the core doc and the real sources.

---

## Part I — Orientation

### 00 · The shape of Declare
**Why first / why this shape:** the reader has chosen to learn — don't re-pitch the
product (the two-surfaces argument lives on the homepage and its Why essay; link it,
don't repeat it — mirrors the homepage's own demotion of that framing). Open instead with
the mental model and the proof: the counter, whole, before any rules; then the two
delimiters and the one value rule (`bare / { } / :path`); then the **promise** — three
frames of the calendar mid-morph and one sentence: by the end of this guide you can read
(and write) the program that does this in ~700 lines. Orientation ends with how the guide
is ordered and what the core doc / reference are for.
**Law:** *a binding is a standing relationship the runtime keeps true.*
**Key examples:** the counter (core doc §1, verified); calendar frames (static images).
**Salvage:** old `00-overview.md`'s delimiter table and "what is genuinely different" map
are strong — fold the map into a closing "the defaults Declare inverts" section, trimmed,
each line pointing at its chapter.

### 05 · Up and running *(waypoint — the operational front door, in the guide's path)*
**Why (added 2026-07-14, David's comprehensiveness review):** the guide's reading order
must never strand the reader, and chapter 10 assumes a running dev server. This entry IS
`operational/getting-started.md` (clone → `npm start` → `my-apps/` → first program at its
URL — the shape in docs-ia.md §4), surfaced in the guide's TOC as a waypoint: **one file,
two doors, no forked prose.** The guide's nav includes it; the file lives in
`operational/` where its commands stay CI-executable. Chapters 40/41 likewise name their
operational counterparts (`verify.md`, `building.md`) as companion pages.

### 10 · Tutorial: build one small app
**Why:** hands on the keyboard before theory; every Part II chapter then names the moment
the reader already met its concept. Build a stat-card dashboard in ~8 steps, each step one
idea: run a one-file app at its program URL → structure with views → a `Button` and a
`Slider` from the library on step 2 or 3 (*themed, zero config, no import* — the stdlib
payoff shown immediately, not saved for later) → declare state, bind with constraints →
extract a `Card` class → a `Dataset` + replication → a `State` toggle → a `Spring`. Close
by breaking the program deliberately and reading the diagnostic that names the fix — the
loop *is* part of the language.
**Law:** *edit, reload, read the error — the compiler is the teammate.*
**Salvage:** old `10-tutorial.md` structure is close to right; rebuild its steps on the
stdlib-early sequence and the program-URL loop.

---

## Part II — Thinking in Declare
*Dependency-ordered; each chapter uses only what came before it (forward links are fine,
forward dependencies are not).*

### 20 · The tree: composition and classes
**Why first in Part II:** everything else hangs on "the bracket nesting *is* the view
tree." Teach: instances and members; named vs anonymous children; inline one-off members
(the anonymous-subclass move) vs extracting a `class` — with the clean boundary ("the
moment the type needs a name, you've outgrown the one-off"); the where-does-code-live
guide (class / inline function / method / `script { }` — the four-bullet rule from the
core doc §4, expanded with one example each); stacking order = declaration order.
Close with **growing past one file**: apps are one file until they aren't;
`include [ "path.declare" ]` merges top-level declarations (include-once), library
components need no include at all — and where the seams naturally fall (a class file, a
`script { }` model file). *(Added 2026-07-14 — project organization had no home.)*
**Law:** *the brackets are the tree.*
**Salvage:** old `20-composition.md` is the strongest old chapter — much survives.

### 21 · Living values: constraints and the setter
**Why here:** the defining idea, immediately after structure. Teach: `{ }` as a standing
expression; static dependency extraction (and that the compiler reads *through* method
calls — `{ app.buildModel() }` is idiomatic, not cheating); `=` as the setter, reads
symmetric; the one rule (named things only) with the three refusals and their named
rewrites — presented as *the compiler teaching*, not as limitation; the cost model in four
sentences (declared-attrs-only, prewired reads, batched writes, plain-values-for-hot-loops).
**Law:** *reading subscribes; assigning notifies.*
**Evidence:** E-3 lives at the layout chapter, not here; keep this chapter payoff-heavy.
**Salvage:** old `21-constraints.md` partially; the one-rule framing is newer than it.

### 22 · Reach: `this`, `parent`, `classroot`, `app`
**Why this early (moved from late in the old guide):** `classroot` appears in the *first
program of chapter 00*, and this-vs-classroot is the top observed mistake in the eval
record; handlers multiply from 23 on, so the nouns must be settled now. Teach the four
nouns; classroot's lexical resolution (the three cases, with the class-body-reads-App-attr
trap shown failing and `app` fixing it); bare-name reads in class bodies; the reserved
names; `App`-the-class vs `app`-the-instance.
**Law:** *`classroot` is where the code is written; `app` is the root, from anywhere.*
**Evidence:** learnings §8 (re-hit twice), brief mistake #2 — this chapter exists because
of that record.
**Salvage:** old `27-scope-nouns.md` covers the ground; compress and re-motivate.

### 23 · Interaction: events, handlers, and the keyboard
**Why merged (events + input basics):** in the old guide input/focus sat five chapters
from events as an "In Depth" afterthought — an accident of when it was designed. To a
learner they are one subject: how a program hears the user. Teach: `on` handlers as plain
members (no `event` keyword — an event is a member that gets called); pointer handlers and
their event; **target-only delivery, stated plainly and early** (no bubbling; "the whole
panel is clickable" is a handler on the panel's background, and a child delivers upward by
calling a method); keyboard on the focused view; the `Keys` service via `<-` subscription
(lifetime-managed) and when to prefer it (app-level keys) over focused-view handlers;
`<-` vs `<->` disambiguation. Deep focus management (traps, tab order) forward-links to 31.
Also teach *(added 2026-07-14 — used by every real app, taught nowhere)*: **pointer
states by hand** (hover/press via `onMouseOver/Out/Down/Up` + a boolean + a constraint —
and `app.hovering` to give touch devices press feedback instead); and **the drag pattern**
(down/move/up on one node, the movement threshold that discriminates click from drag —
the calendar's `startDrag`/`dragMove`/`dropDrag` shape, taught small here, seen at scale
in 42).
**Law:** *handlers fire where they're declared; children deliver by calling methods.*
**Evidence:** learnings §4 (target-only surprises everyone once — teach it, don't bury it).
**Salvage:** old `23-events.md` core + the input parts of old `34-input-focus.md`.

### 24 · The controls: the standard library
**Why here, this early:** the headline feature the old guide never taught (the confirmed
grievance: mentioned in five chapters, taught in none), placed at the first moment the
reader can wire one up (constraints + handlers exist). Teach: the catalog (seven controls,
bare-tag auto-include, themed by default — *they look right with zero configuration*); the
value pattern as THE contract — standalone / app-owned (`checked = { … }` + `input(v)`) /
data-owned (`<->`, forward-link to 27); focus-for-free and the traveling ring; when there
is no widget (no Modal/Tabs/Select yet — compose or define a class, and that's normal, not
a workaround).
**Law:** *a control's value is a plain reactive attribute — derive down, deliver up.*
**Key examples:** the bound form (core doc §12, verified); `apps/controls/` is the
example bank.
**Evidence:** E-2's `<->`-on-a-non-editor error message lands here as the "don't" example.
**Salvage:** none (write-new).

### 25 · Appearance: drawing, type, and theming
**Why one chapter (was scattered):** E-1 (the CSS-border ghost) happened because drawing
attributes were taught nowhere; appearance needs one home. Teach: the drawing set (`fill`,
`stroke()`, `shadow()`, `cornerRadius`, `opacity`, `scale`/pivots, `visible`); type styling
via the inheriting quartet; `font` declarations and fallback lists; **prevailing** as the
mechanism ("set once high, reskin a subtree"); the `theme` record idiom — palette named
once, partial override by spread, light/dark by swapping the record on `app.dark`. Close
with "there is no CSS" as *relief*, after the positive model: no selectors, no cascade
wars, no specificity — attributes and one record.
**Law:** *styling is attributes; the palette lives once.*
**Salvage:** old `22-prevailing.md`'s mechanism section is good; the drawing-attribute
front half is new; bits of old `33-fonts.md` fold in (deep font embedding → reference).

### 26 · Space: sizing and layout
**Why merged (was two chapters two parts apart):** how a box gets its size and how
children get their places are one subject with one matrix. Teach: the three shapes per
axis (unset ⇒ auto / constant / constraint); `contentWidth`/`contentHeight` clamps as
arithmetic (no min/max attributes); `clip`, `scrolls`; the App fills its host (and reads
`app.width` for responsiveness; `minWidth` floor + native panning); `layout:` as a
reactive attribute — stack, wrap, nested axes — and *because it's a slot, it swaps and
animates* (the continuity seed, paid off in 28). **The responsive idiom, honestly** (E-3):
`axis` takes a literal today; a wide→narrow reflow is a swapped layout by assignment or
per-child constraints on `app.width` — show both, then the `minWidth` floor as the
often-better answer.
**Law:** *unset is automatic, a constant is fixed, a constraint is anything — and layout
is just an attribute.*
**Salvage:** old `25-layout.md` + `32-sizing.md` merge; the host/embedding tail of sizing
moves to 31.

### 27 · Data: cursors, replication, sources
**Why here:** the last structural fundamental; everything before it was about one view,
this is about many-from-data. Teach: `datapath` as a cursor, `:path` relative reads;
replication as *the artifact of a path matching many* (not a loop — contrast `.map()`
directly here, it's the strongest JSX inversion); `key =` reconciliation; `Dataset`
(strict-JSON body) vs `DataSource` (explicit `.fetch()`, lifecycle as reactive state,
screens that derive — "navigation can be a function of data"); schema = validation at the
boundary + statically-checked paths; `data.read`/`data.set` and derived datasets
(`contents = { app.buildModel() }` — the calendar's model pattern, named here, cashed in
42); two-way `<->` for editors as the closing section (the editors' contract with 24's
value pattern).
**Law:** *point a cursor at the data; the tree derives — and repeats — from it.*
**Salvage:** old `26-data.md` is substantial; reconcile against the core doc and keep its
best sequences.

### 28 · Continuity: states, springs, and arrangement that moves
**Why unified (was states ch.24 + animation ch.30, five apart) and why last in Part II:**
they are one mechanism — a state supplies end-states, a spring moves the surface between
them, and the reactive core is what makes every in-between frame coherent — and this is
the chapter the whole book has been building toward: the positioning claim in mechanism
form. Teach: `State` as a reversible override bundle (conditional children, dotted-path
targets, declaration-order precedence, the unleakable-mode argument); `Spring` on an
attribute with a reactive target (interruption = the target changed, no code);
`Animator` in one paragraph (the clock-based sibling); then **the idiom**: spring a few
scalars that geometry *derives from*, and arrangement morphs — build a small
two-view morph live (a card that becomes a row: one sprung scalar, four derived
constraints), then show the calendar's four sprung scalars as the same idea at scale.
**Law:** *declare where things belong; motion is the runtime keeping it true.*
**Key examples:** the states card + spring ball (core doc §8, verified); the mini-morph
(write and verify new); calendar frames.
**Salvage:** old `24-states.md` mechanism prose partially; `30-animation.md` thin — mostly
write-new.

---

## Part III — The rest of the surface

### 30 · Content: text, Markdown, editing, images, islands
**Why grouped:** the content types are one family — what fills views. Teach: `Text`
wrap/pin behavior (mistake #8 preempted); `Markdown` as a native, static-or-live content
type (a streaming bind renders as it grows); `TextInput` in full — two-way editing,
`initial` (the controlled/uncontrolled seam, learnings §1–3, stated as the one-way-bind
warning from core doc mistake #13), placeholder/multiline/spellcheck; `Image`; `HTML`
islands as the deliberate escape, including **embedded child apps** (a preview is an app
inside an app, no iframe) — which the docs and homepage themselves use.
**Salvage:** old `31-text-markdown.md` partially; the rest is newer than the old guide.

### 31 · The environment: hosts, embedding, capabilities
**Why:** the app-meets-world chapter — everything that isn't the tree itself. Teach: the
host contract (top-level = window, embedded = container, auto-detected); deep focus
(traps, tab order) completing 23; the capabilities contract (`docs/system-design/capabilities.md` —
the enumerable environment surface); SEO / static extraction (`?extract`, `?crawler`, what
crawlers see) as a shipped feature with a one-command story; and **the host channel**
*(added 2026-07-14)*: `app.navigate` for links out, and the route-mirroring idiom (an
`app.route` attribute the host reflects to the URL hash — deep links and the back button,
as the homepage's Why page does it).
**Salvage:** none of substance (write-new; sources: capabilities.md, seo-and-semantics.md,
sizing.md's host tail, input.md's focus tail, the homepage's route/navigate usage).

### 32 · The canon: formatting and house style
**Why a chapter at all:** members are order-inert, so one house style is what keeps every
Declare file reading the same — and every published file trains the next model; canon is
infrastructure. Teach: the terminator comma; leaves on one line; header-line config;
hanging closers; comment style incl. `/* */` literate Markdown (the reader view renders
it — the calendar and homepage are *written to be read*); the formatter as enforcement
(`tools/format.mjs`); "one way to write each thing."
**Salvage:** old `28-formatting.md` is close; align to formatting.md's canon and trim.

---

## Part IV — The loop

### 40 · Check it: verify and the diagnostics
**Why:** the working method is a first-class subject, and Declare's version is a genuine
differentiator — but teach it as *craft* (how you work), not as the product's point.
Teach: the program URL as the address of everything (`?view=edit`, `?view=reader`,
`?render=canvas`); the verify ladder as a concept (what each rung catches, why cheap rungs
first) with `node tools/verify.mjs` as the one command; the diagnostic culture — errors
name the fix, all independent errors at once; *trust the message* (E-1's docs-fix →
clean-rerun story can be told here in two sentences as proof the loop works). CLI detail
lives in `operational/` — this chapter is the concepts.
**Law:** *verify climbs as far as it can; what reaches you is only what needs you.*
**Salvage:** write-new (sources: verify-and-evals.md, requests.md, diagnostics.md).

### 41 · Ship it
**Why:** the exit door. Teach: `declarec` / `?build` (self-contained ~50 KB bundle);
hosting the distro vs shipping a build; `--crawler` baking; what prewarm does for curated
apps (one paragraph, so the two "precompiled" senses never confuse). Command sequences →
`operational/building.md`; this chapter is orientation.
**Salvage:** old `35-shipping.md` thins into this + operational.

### 42 · Anatomy of the calendar (capstone)
**Why this close:** the book's claims, cashed against a real program the reader can run,
read, and edit — exemplar-as-pedagogy. **Not a line-by-line read** (ruled 2026-07-14 —
docs-ia.md §5): an excerpt tour of the four load-bearing mechanisms — (1) the focus
rectangle: four sprung scalars all geometry derives from; (2) derived-scalar modes
(`blockness` — a mode is a *number you derive*, not a flag you manage); (3) the derived
model + keyed replication (navigation just sets state); (4) drag-to-reschedule committing
through `data.set` (a drop wakes the derived model like any edit). ~10 quoted lines each,
each excerpt cross-linked to its Part II chapter; the live `?view=reader` page is the
full-source companion. Frame honestly: this is the language's ceiling, not its floor.
**Gate:** blocked on the calendar's stdlib-adoption pass (docs-ia.md §8 — the flagship
must not contradict chapter 24).
**Salvage:** none (write-new).

---

## Deliberately absent (recorded so absence reads as a decision, not an oversight)

- **Debugging / runtime inspection** — the reactive inspector and provenance queries are a
  tooling commitment not yet mature enough to teach; when they land, this is a Part IV
  chapter (between 40 and 41). Until then, 40 teaches the ladder that exists.
- **Performance** — the cost model is taught inline (21) and the discipline restated where
  it bites (27's derived models); a dedicated chapter waits for the inspector, since
  perf guidance without measurement teaches superstition.
- **Accessibility** — no shipped a11y surface yet beyond semantic extraction (31 covers
  what exists); the focus-model/a11y design is open in the language record. The guide
  must not teach promises.

## Coverage cross-check (nothing lost from the old 18 + the missing list)

overview→00 · tutorial→10 · composition→20 · constraints→21 · scope-nouns→22 ·
events→23 · **components→24 (was missing)** · prevailing→25 · fonts→25/reference ·
layout→26 · sizing→26/31 · data→27 · states→28 · animation→28 · text-markdown→30 ·
input-focus→23/31 · **capabilities→31 (was missing)** · **SEO→31 (was missing)** ·
formatting→32 · **verify→40 (was missing)** · shipping→41 · **capstone→42 (new)** ·
**getting-started→05 (waypoint; the file lives in `operational/`)** · docs-internals→
`system-design/` (category A). Two-way/editors deliberately has no chapter: it is 27's
closing section + 24's third form. Added by the 2026-07-14 comprehensiveness review:
multi-file/include→20 · pointer states + drag→23 · host navigation/routing→31 · the
deliberately-absent list above.

## Execution notes for the fleshing-out agent

1. **Order of writing:** 00 and 10 first (they set voice for everything), then Part II in
   sequence, then 40/41, then 30–32, then 42 last (after the calendar's stdlib pass).
2. **Every fence verifies:** write examples as real programs, run
   `node tools/verify.mjs` on each before it enters a chapter; where a chapter claims
   behavior, add an assert script (rung 5). No inert code blocks.
3. **The core doc is the fact source.** If a chapter needs a fact the core doc lacks,
   that's a core-doc gap — fix it there first, then teach it here. Never introduce a fact
   the core doc doesn't state.
4. **Chapter laws are IDs.** State each chapter's law verbatim once, near the top; the
   linking pass will pin `concept:` IDs to them.
5. **File naming:** decade-gapped numbers as above (`00-shape.md`, `10-tutorial.md`,
   `20-tree.md`, …). Old files retire as their replacements land, not before.
6. **When old prose is tempting,** apply the bar: does it fit the new chapter's single
   law and its show-then-gloss shape without surgery? If it needs surgery, write fresh.

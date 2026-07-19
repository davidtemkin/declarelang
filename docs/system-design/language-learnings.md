# Declare language learnings — friction & gaps found while building

A running log of things that were **confusing, surprising, or broken** while
building real UI (the homepage demo cards). Each is a candidate for a language /
runtime adjustment — captured at the point of pain, not yet decided.

---

## Open decisions — TOPICS FOR DISCUSSION (all provisional, may change)

Nothing below is settled. Decisions already *implemented* this session are marked
⚙ and are equally open to being reversed.

**Language / framework**
- **D1 — Map/object attribute kind.** Add a named, per-use record/map type for
  structured **host→Declare data** (independent of the theme system)? UNBLOCKED the
  Declare-native editor by *reusing* the theme `record`/`Theme` kind for
  `App.demoSources` and coercing each read `unknown → string` with `|| ""` (no
  `as` cast — see §13). Works, but the type is still misnamed `Theme` and every
  read needs the coercion. A per-use named map kind remains the clean fix. (§11)
- **D2 — Yielding-default vs hard-constraint `{ }`.** Make the distinction
  *visible* (a marker), or unify so a class-body default is writable-yielding
  unless `readonly`? (§1, §2)
- **D3 — Controlled vs uncontrolled fields.** Formalize the split. ⚙ shipped a
  first cut: `TextInput.initial` (uncontrolled seed). Is `initial` the right
  name/shape? Generalize beyond text? (§3)
- **D4 — Target-only events.** Add opt-in bubble/capture, or a subtree
  "backstop" handler, for "the whole panel is clickable"? (§4)
- **D5 — app↔host channel.** Bless ONE typed concept (host-props in / commands
  out) vs. today's growing pile of single-purpose `App` flags? (§10, §12)
- **D6 — Stage size = window vs. containing element.** ⚙ RESOLVED for EMBEDDED
  apps (2026-07-09, §15): an app rendered inside another app's tree auto-detects
  it is embedded and takes its stage from its container ELEMENT via a
  ResizeObserver (top-level apps still read the window). "Fill my container" is now
  literal where it matters (previews, playground). Open tail: should a *top-level*
  app also size to its mount element rather than the window? (§7)
- **D7 — `classroot` in a class body reads App/stage attrs as `undefined`.**
  ✓ RESOLVED (2026-07-10, §8): added the **`app`** scope noun (§11) — sugar for
  `this.root`, typed `App` — so App/stage state is reached explicitly from any
  depth (`app.hostWidth`) instead of relying on `classroot` coinciding with the App.
- **D8 — HTML-island content measurement.** Let Declare auto-size to foreign content
  (a reported extent), or accept explicit island sizes? (§9)

**Product / UX (all implemented this session, all reversible)**
- **P1 ⚙ — Source editor → Declare-native `TextInput` card. SHIPPED.** The editor is
  now a Declare `CodeField extends TextInput` inside an all-Declare `SourcePanel` card
  (frame · filename · hint · Revert · field) — no host `<textarea>`, no card CSS.
  Host↔Declare rides `App.demoSources` (source in) + `App.liveCard`/`liveSource`
  (edits out); the HTML island is now used ONLY for the compiled preview iframe.
  Verified: seeded from data, editable (yielding), live-recompiles the preview on
  each edit, Revert restores the pristine source, I-beam over the field, no
  spellcheck squiggles, no h-scroll. Still reversible.
- **P2 ⚙ — Editable at the outset** (no Edit/Done mode; always-editable + Revert
  + an "edit — preview runs live" hint). Keep, or bring back an explicit edit mode?
- **P3 ⚙ — Scroll-reveal fade removed from the demo sections** (kept on the
  marketing sections). Keep the demos always-solid, or restore the fade?
- **P4 ⚙ — Code panel wider than preview (58/42) + snug per-demo heights**
  (hand-tuned, since Declare can't measure the field — see D8). Keep the split/sizes?
- **P5 ⚙ — Status/error dot dropped from the card.** Restore a compile-error
  indicator (needs a host→Declare signal, D5)?

---

## 2026-07-09 — building the editable, live-recompiling demo cards

### 1. "Yielding default" vs "hard constraint" is implicit and traps you
The single biggest confusion. A `{ }` on an attribute means *two different
things* depending on how it's written, with no visible marker:

- **`attr: Type = { … }`** (a typed *declaration* of a NEW attr) → a **yielding
  defBinding**: no owner, overridable by a later write. This is what
  `readonly`/theme defaults ride.
- **`attr = { … }`** (a bare *assignment* of an existing/inherited attr) →
  a **hard constraint owner**: a runtime write *throws* ("bound by a
  constraint"); for `TextInput.text` it silently made the field read-only
  (edits reverted).

You cannot tell which you got by looking. And "overridable by a use-site" (true
for both) is a *different* axis from "writable at runtime" (only the defBinding)
— the word "default" conflates them. **Candidate fix:** a visible marker for a
yielding/seed binding, or unify so a class-body `{ }` default is always
writable-yielding unless declared `readonly`.

### 2. You cannot give an INHERITED attribute a yielding default
Consequence of #1. `class CodeField extends TextInput [ text: string = { … } ]`
is refused: *"TextInput already has an attribute 'text' — a declaration
introduces a new one; write 'text = …'."* But `text = { … }` gives the hard
constraint (#1). So there is **no in-language way** to say "seed this inherited
slot from a binding but keep it writable." I had to add a companion runtime attr
(`TextInput.initial`, an uncontrolled seed à la React `defaultValue`) + a
yielding derive in `attach()`. **Candidate fix:** allow a subclass to restate an
inherited attr's default as *yielding* (e.g. `text ?= { … }` or
`text = default { … }`), so this doesn't need a bespoke attr per widget.

### 3. Controlled vs uncontrolled text field was under-served
`TextInput`'s only documented seed was a literal (`text = "hi"`); a *dynamic*
seed (`text = { source }`) silently became a controlled read-only field. Real
editors seed from dynamic data (a file, a fetch) and must stay editable. Added
`initial` for this. Also had to fix `onNativeInput` to only revert on a *hard*
constraint, not any owner (a yielding owner should take the edit). **Learning:**
the controlled/uncontrolled split (React value/defaultValue) is a real need; make
it first-class, not a footgun.

### 4. Target-only events make "whole-surface" handlers awkward
Events are target-only, no bubbling (a ruled decision). So `App [ onMouseDown ]`
("click anywhere to change v") only fires when the click lands on the App's own
*background* — clicking a child (the number, the bar) does nothing, because the
child is the target and there's no bubble. Every "click anywhere" demo is subtly
wrong. **Candidate:** an opt-in capture/bubble, or a subtree "backstop" handler,
for the common "the whole panel is clickable" case.

### 5. A handler-less view is `pointer-events:none`, which silently kills
### foreign content in an HTML island
The pointer-events opt-in (a view with no sink is inert so clicks fall through)
*inherits* onto a foreign island's content — so an iframe didn't receive clicks
and a textarea couldn't focus/select. Non-obvious; cost a long debug. Fixed by
making `setEmbed` opt the island back in (`pointer-events:auto` +
`user-select:text`). **Learning:** an HTML island is interactive foreign content
by nature — the inert-by-default rule shouldn't apply to it (now it doesn't).

### 6. The root App didn't fill its host by default
Every app had to write `App [ width = { hostWidth }, height = { hostHeight } ]`
— boilerplate, and the longest line in every demo. The root's auto-extent
defaulted to its *content* (like any view) rather than its *host*. Fixed: App
retargets auto-extent to its host. **Learning:** the root is special (it fills its
host); its sensible default differs from a child's. **Renamed 2026-07-10:** the
host extent is `hostWidth`/`hostHeight` (was `stageWidth`/`stageHeight`) — read-only
intrinsics that width/height default to; "stage" is retired ([sizing.md](sizing.md)).

### 7. `hostWidth`/`hostHeight` are the WINDOW, not the containing element
They read `window.innerWidth/innerHeight` at top level. Coincides with the
container for a full-window mount or an app in its own iframe (our previews), but
an app embedded in a *sub-region* of a page would wrongly fill the window.
**RESOLVED:** an embedded app auto-detects its container and reads `hostWidth`/
`hostHeight` from it via a `ResizeObserver` (index.ts), so "fill my container" is
literal. (Was: `stageWidth`/`stageHeight`, window-only.)

### 8. `classroot` in a class body silently reads `undefined` for App attrs
(Carried from earlier, re-hit.) A component body's `classroot.scrollY` is
`undefined` (classroot there = the instance, which has no App attrs) with no
error — a silent bug. You must thread App attrs in explicitly. **RESOLVED
(2026-07-10):** added the **`app`** scope noun (§11) — a compile-time rewrite to
`this.root`, typed `App` in the scaffold. It reaches the running App from any
depth (`app.hostWidth`), so App/host state no longer rides `classroot`
happening to be the App; the examples were swept off `classroot`/`this.root` onto
`app`. (A class-body read of an App-only attr through `classroot` is still not
*warned* — that stricter check remains a candidate.)

### 9. Declare can't measure an HTML island's foreign content
Auto-extent measures Declare children, not host DOM inside an island. So the editable
panels can't snug-fit to their code height — every card height is hand-tuned per
demo. (Moot once the editor is a *Declare* TextInput, whose text Declare could in
principle measure — TODO.) **Learning:** foreign content is a sizing black box;
either measure it (a reported extent back from the host) or accept explicit sizes.

### 10. Every app→host action needs a bespoke App flag
Host-side actions (open the source editor, revert a card, recompile a preview)
each require a new reactive `App` attr the host polls (`editing`, `editSource`,
`openCard`, …). There's no first-class "escape to the host" or "action" concept,
so the App schema accretes single-purpose flags. **Candidate:** a sanctioned
host-command channel, or keep it deliberately minimal (bodies stay DOM-free) —
but name the pattern.

### 11. No general object/map attribute to carry host→Declare data
To seed each editor with its (host-read) demo source, I need a per-card string
delivered from the host into Declare. There is no general "object"/"map"/"any" attr
kind — only `record`, which is entangled with the theme/stylesheet system and,
in the `{ }` typegen, is hard-coded to the single open type `Theme =
Record<string, unknown>` (compiler `scaffold.ts`). So a host-set map can only be
typed by *reusing* `name: "Theme"` (semantically wrong) and every read needs an
`as string`. The alternatives are worse: N single-purpose string attrs (accretion,
#10) or embedding the sources in the site (duplicates the demo files). **Candidate:**
a first-class `record`/`map` attr kind that can be *named per use* (its own emitted
type), independent of theme — the clean channel for structured host→app data.

### 12. app→host and host→app both ride bespoke App flags
Composing the Declare-native editor needs BOTH directions over hand-rolled `App`
attrs: host→Declare `demoSources` (seed the fields) and Declare→host `liveCard` +
`liveSource` (an edit asks the host to recompile that preview). Plus the earlier
`editing`/`editSource`. That's five single-purpose flags for what is really "the
app and its host exchange a few values." It works and keeps bodies DOM-free, but
the schema accretes. **Candidate:** name/bless this channel (a typed host-props in,
host-commands out) so it's one concept, not a growing pile of flags.

### 13. A `{ }` body is NOT full TypeScript — no `as` casts / type operators
Writing `src = { (classroot.demoSources.reactivity as string) || "" }` failed to
*parse*: **"Unexpected identifier 'as'."** The `{ }` expression grammar is a
value-expression subset — it has no TS type syntax (`as`, `satisfies`,
`<T>x`, type params). So there is no in-body way to *narrow* a value: reading a
`Record<string, unknown>` (the `Theme`/`record` kind, §11) yields `unknown` and
you cannot assert it to `string`. Workaround: coerce structurally — `x || ""`
(what I used), `x + ""`, `String(x)` — the checker accepts the coerced result for
a string attr. **Learning:** the `{ }`-is-TypeScript story has a real seam —
*expressions* yes, *type operators* no. Either say so plainly (docs), or, if a
map/record read is going to be common, give it a typed-per-use kind (§11/D1) so
the value already has the right type and no coercion/cast is wanted.

### 14. A text field had no way to turn off native spellcheck (code squiggles)
The moment the editor became a real `TextInput`, the browser painted red
spellcheck underlines under every identifier (`whitesmoke`, `classroot.v`, …) —
correct for prose, wrong for code, and there was no attribute to turn it off.
Added `TextInput.spellcheck` (boolean, default `true`; `CodeField` sets `false`),
plumbed through `EditableSpec` → `el.spellcheck`. **Learning:** a text field is
two very different widgets (prose vs. code); the prose-vs-code knobs (spellcheck,
and later autocapitalize/autocorrect/autocomplete) are a small but real surface a
serious field type needs.

### 15. Previews needed an iframe only because an App wired itself to the WINDOW
The live demo previews were iframes purely for ISOLATION: a Declare `App` took its
stage size from `window.innerWidth/Height`, claimed the global `Focus` singleton
(`Focus.setRoot`), and repainted the document `<body>` background. Two apps in one
document therefore collided, so each demo got its own window (an iframe). The
iframe then bit us in Safari/WebKit (a preview that renders standalone AND in
headless WebKit went blank in real Safari — the cross-frame `postMessage`/window-
identity handshake is a known WebKit fragility). **Fix (David's framing — no
explicit "mode"): an app auto-detects it is embedded from ONE DOM signal.** Every
app root is stamped `data-declare-app` at attach; if a mount host has such an ancestor
(it was rendered into an `HTML []` island inside another app), the child wires as
EMBEDDED — stage size from the container element (ResizeObserver), pointer box-
relative, and it does NOT seize the page's focus/keys or repaint `<body>`. Input
routing stops at a nested `data-declare-app` boundary so the outer app doesn't double-
fire a click inside a child (the sink map is process-global). Result: previews are
now embedded child apps in the SAME document — zero iframes on the page, verified
in real WebKit (previews render, single-fire clicks, live-edit re-render, editor
preview inline). New runtime surface: `disposeApp(app)` (tear down an embedded
app's stage listeners before a re-render). **Learning:** "the root App is special
(it IS the stage)" (§6) has a dual — a NON-root app is special the other way; the
window-coupling that is right for the page is exactly wrong for an embed, and the
embed case is common (previews, playground, docs, dashboards-of-apps). The clean
factoring is *App reads its stage from context*, discovered from the DOM, not a flag.

### 16. The whole-page editor is now Declare too — and recursion "just works"
Follow-on to §15: the whole-page "view & edit source" editor was host HTML/CSS/JS
(an overlay + textarea + iframe). It is now a Declare `FullPageEditor` view built from
the SAME parts as the demo cards — a `CodeField` for the page's own source and a
`PreviewFrame` whose preview is an embedded child app (the page it compiles to).
The host lost the whole `#ne` overlay; only Escape-to-close remains (Declare delivers
keys to the focused view, so a page-level key has no Declare form yet). **Recursion is
user-bounded, exactly as predicted:** the page source contains this very editor, so
the preview contains an editor, whose preview would contain an editor… Naive eager
rendering loops forever, BUT a preview island renders only while its editor is OPEN
(a `PreviewFrame.active` gate empties the `slot` when closed), and every embedded
copy's editor starts CLOSED — so nothing renders a level deeper until a user clicks
"view & edit source" inside a preview. Idle ⇒ no growth; one click ⇒ one level.
Verified in WebKit: 5 app roots at rest → 10 open (page + its 4 live demos) → 15 at
a level-2 editor, and stable there. **Learning:** the embedded-app primitive (§15)
composes recursively for free once "renders only when open" gates it — the same
`App reads its stage from context` factoring makes a live editor-of-itself fall out
without a special case. Re-hit §8 hard on the way (a class body's `classroot` has no
stage attrs → `width = { classroot.stageWidth }` was 0×0; thread `stageW/stageH` in
from the use-site) — one more vote for warning on class-body reads of App-only attrs.

## 2026-07-13 — factoring the homepage (the readability pass)

- **Classes cannot extend non-View components.** `class Reveal extends Spring [ … ]`
  compiles to `unknown component 'Reveal'` at the use sites — class registration only
  covers View descendants. The natural use is real: the homepage repeats one
  scroll-reveal Spring (`attribute = opacity, stiffness = 90, damping = 22, to = { … }`)
  in three sections, and the calendar's four focus Springs share their tuning too. A
  named Spring configuration is exactly what `class` is for; today the repetition has
  to stand. TOPIC FOR DISCUSSION: extend `class` to any component, or a dedicated
  "preset" form.

### Minor / to verify
- A string literal with an embedded newline in a `[ ]` slot seemed to derail
  parsing (line-count went off, a trailing `font` decl became "unexpected"). Use
  `"""` blocks for multi-line — but confirm the single-line-literal-with-`\n`
  case. Also unclear if `font` decls must precede `App`.
- `cornerRadius > 0` rasterizes a view's box to a child `<canvas>` (no CSS
  `border-radius`/`background`) — fine, but surprising when introspecting/testing
  (selectors keyed on CSS background/border-radius miss these views).

## 2026-07-14 — E-series (eval-driven findings)

The **E-series** is the eval triage register (docs/system-design/verify-and-evals.md §3.6):
failures a model *actually* made writing Declare from the brief alone, each with an
escalation attempt (docs → diagnostic → language). Only entries with **≥2 models and
≥2 cycles** of evidence earn a language-change discussion — the mutable surfaces
(brief, diagnostics) absorb the churn first; the language stays stable.

**Run 0** (`first-claude-oneshot`, 2026-07-14): 3 shakedown tasks, one-shot, Sonnet
(the canary). 1/3 green (modes ✓; compose, collection ✗ at R1).

- **E-1 — CSS border/shadow instinct** (interference-ghost). *compose*, Sonnet.
  The model wrote `borderWidth = 1, borderColor = #E2E5E9` on Views — CSS attributes
  that don't exist — 6× in one program. Root cause: the brief (`declare-for-llms.md`)
  **never showed `stroke()`** and never mentioned borders, yet a task asking for "a
  subtle border" is routine. TWO gaps in one:
  - *docs gap* (escalation 1, **DONE + CONFIRMED**): added mistake §10.11 naming the
    fix (`stroke = { stroke(1, theme.line) }`, shadow = `shadow(…)`). Reran compose
    one-shot (`compose-after-docsfix`): the model used `stroke` 3× and **zero** border
    attributes — the interference-ghost is gone. The docs→rerun loop provably closed
    this defect. (It then failed one layer deeper, E-3 — that's normal triage peeling.)
  - *diagnostic gap* (escalation 2, **OPEN**): `DECLARE2000 "View has no attribute
    'borderWidth'"` does not name the Declare equivalent. Per diagnostics.md §4 a
    known-CSS-attribute miss should did-you-mean the real slot (`borderWidth →
    stroke`, `boxShadow → shadow`, `className/style → attributes`). A small,
    high-value did-you-mean table keyed on the common CSS names. Candidate compiler
    change once a 2nd model shows the same instinct.

- **E-2 — one-shot has no recovery from well-diagnosed seam/scope errors** (not a
  language gap; a track observation). *collection*, Sonnet. Two errors, both with
  GOOD fix-naming diagnostics: naming a replicated child (`row: … datapath = :rows[]`
  → "a replicated child cannot be named … reach the instances through their data")
  and `<->` on a non-editor (`Checkbox.checked <-> :done` → "the two-way arrow …
  Checkbox is not an editor"). These are exactly the errors the **iterated track**
  should self-recover from — the diagnostics already name the repair. The one-shot
  failure measures nothing wrong with the language; it measures the value of the
  loop. Action: no docs/diagnostic/language change; use as a self-recovery datapoint
  when the iterated track runs.

Method notes for future cycles: Sonnet burned 62K tokens / 245s on collection (heavy
thrash) vs. 45K / 40s on the greens — token/wall time is itself a difficulty signal
worth watching. Building the three tasks *also* surfaced two toolchain bugs before any
model ran (scaffold `Dataset.insert/removeAt/move`; `inspect()` cursor-cycle
serialization) — logged in verify-and-evals.md's status, taxonomy label `toolchain`.

- **E-3 — responsive layout wants to constrain `layout.axis`, which isn't surface**
  (language friction). *compose*, Sonnet (surfaced on the post-docs-fix rerun). Asked
  for a wide→narrow reflow, the model wrote `SimpleLayout [ axis = { app.narrow ? y : x } ]`
  — the natural instinct: responsiveness = a constrained axis. Today a layout attribute
  takes a literal (`DECLARE2000 "a layout attribute takes a literal — constraining it is
  not yet surface (swap the whole layout by assignment instead)"`). The diagnostic
  names a workaround, but the workaround (two layout objects swapped by assignment, or
  the reference's per-child `x/y` constraints on `app.width`) is clunky for what is a
  first-class need. NOT escalated to a language change yet (1 model, 1 cycle — the bar
  is ≥2/≥2). Candidates when evidence accrues: (a) make `axis` (and spacing) a
  constrainable slot; (b) a `WrappingLayout`-based responsive idiom shown in the brief;
  (c) leave it, and teach the per-child-constraint idiom in the brief. Watch whether
  the *iterated* track self-recovers from the diagnostic's named workaround.

**Run 1 — the three-arm re-baseline** (`rebase-brief`/`rebase-core`/`rebase-corpus`,
2026-07-15): 3 tasks × 3 reps × Sonnet one-shot, per arm. Greens: brief **3/9**
(51K tok/cell) · core doc **1/9** (55K) · **corpus 2/9 (1,084K tok/cell)** — the
corpus arm = the walkable category-B docs tree in the sandbox, read agentically
(claude-docs solver; the docs-accessibility measurement). Headline is not the green
count but the FAILURE DEPTH: the corpus moved `collection` — 0-for-12 lifetime, every
prior failure at R1 — to **R4→✗R5 twice** (compiled, typechecked, booted; failed
behavior asserts). Deep-R5 failures: corpus 3, core 1, brief 0. The corpus teaches
the language dramatically better; the brief still wins greens-per-token by ~20×.
Both packagings lose to a hypothetical resident-kernel + selective-reading arm —
the §2.1 remedy ("inject the resident kernel, retrieve the rest"), now with data
pointing at it from both sides.

- **E-4 — dotted child overrides in a `State`** (docs/diagnostic). *collection*,
  Sonnet (corpus arm). Wrote `dim: State [ applied = { done }, t.opacity = 0.4,
  t.textColor = slategray ]` — overriding a CHILD's attributes from a state, the
  natural way to dim a row. Parser: `expected ']', got '.' [DECLARE1000]` — no rule
  named, no fix. States override the OWNING view's attributes only (the D-1 bundle
  ruling); the supported form is constraints on the child reading the flag
  (`opacity = { classroot.done ? 0.4 : 1 }`). Escalations: docs — does ch28/§states
  say own-attrs-only out loud? (check + add the mistake entry); diagnostic — a `.` in
  a state override should say "a state overrides this view's own attributes — put a
  constraint on 't' reading the state's flag instead". Language change (dotted
  overrides) NOT proposed (1 model / 1 cycle).

- **E-5 — bare identifier in a `[ ]` value slot** (diagnostic). *modes* ×2, Sonnet
  (corpus arm — cost both modes cells). Wrote `text = label` meaning the binding
  `text = { label }`. `DECLARE2000 "Text.text expects a string, got 'label'"` states the
  type rule but not the ACTUAL fix. An identifier in a literal slot has exactly two
  plausible intents — did-you-mean both: `{ label }` (a binding) or `"label"` (a
  string). Cheap, surgical, would likely have turned both cells green. The same
  model wrote `text = { label }` correctly elsewhere in the same run — this is
  slot-confusion under pressure, precisely what a fix-naming diagnostic absorbs.

- **E-6 — `layout:` override inside a `State`** (diagnostic misfire + the E-3 want,
  second sighting). *compose*, Sonnet (corpus arm). Wrote the responsive switch as
  `narrow: State [ applied = { app.width < 640 }, layout: SimpleLayout [ axis = y ] ]`
  — swap the layout under a breakpoint: arguably the most idiomatic-LOOKING wrong
  program yet. The diagnostic misfires: "a layout is an attribute, not a child —
  write 'layout: SimpleLayout [ … ]'" tells the model to write exactly what it
  wrote (the problem is the STATE context, not the spelling). Same underlying want
  as E-3 (responsive arrangement) via a different door — E-3's evidence bar note
  applies: this is sighting #2 of the want, still 1 model. Diagnostic fix first:
  inside a state body, name the state rule and the swap-by-assignment idiom.

- **E-7 — `<->` to an attribute** (docs emphasis + diagnostic). *collection*, Sonnet
  (brief arm). Wrote `text <-> classroot.newLabel` — two-way to an attribute, ruled
  out (components-baseline: `<->` binds datapaths only). Parser gives `expected ']',
  got '.'` — opaque. Diagnostic: `<->` followed by a non-`:path` should say "the
  two-way arrow binds a datapath (`:path`); for attribute wiring use `onInput`
  derive-down/deliver-up". Brief/docs: state the restriction where `<->` is taught.

- **E-8 — rows with no width** (docs — the inverted-default gotcha, measured).
  *collection*, Sonnet (corpus arm, both R5 cells). The generated rows declare
  `height = 30` and never `width` → 0-wide → invisible → the behavior probe honestly
  finds no list. The guide *teaches* width-defaults-to-0 (ch00 "defaults Declare
  inverts") — but the lesson didn't transfer into a replicated-row context. Candidate:
  the mistakes section gains "a row class needs a width — usually
  `width = { parent.width }`"; also a possible verify-rung-4 WARNING when a
  replicated template settles to zero area (toolchain, cheap, catches the whole
  class).

Method notes: corpus cells cost 0.6–1.8M tok (mostly cache re-reads of the same
docs) and 2.5–9 min; a 15-min stall kill-switch bounded the run (never fired).
`modes` INVERTED under the corpus (brief 2/3 green → corpus 1/3): the whole-guide
read appears to bury the one pattern the easy task needs — token-efficiency and
attention-dilution are real costs of raw-corpus packaging, not just money. All six
prompt-arm `collection` failures remain R1 walls (DECLARE1000/2000 syntax-shape), so the
brief alone still cannot express that task's needs (`<->` restriction, replication
naming) — consistent with E-2's read that iterated recovery is where those die.

**Run 2 — iterated track, post-diagnostic-fixes** (`iterated-postdiag`, 2026-07-15):
3 tasks × 3 reps × Sonnet, brief arm, harness-owned repair loop (≤8 rounds). Result:
**7/9 green** (one-shot same arm same day: 3/9) — collection G@3 / ✗ / ✗, compose
G@2 / G@5 / G@1, modes G@1 / G@1 / G@2. Iterations-to-green: 1,1,1,2,2,3,5.
**First `collection` green in eval history** (0-for-15 lifetime before it).

The controlling variable, visible cell by cell: **every green is a loop that only ever
saw fix-naming diagnostics** (each named error consumed exactly one round — the new E-7
message was hit and cleared in one round in two separate cells; E-8's found-0-rows
behavior report likewise); **both failures are the same unnamed-parse-error
oscillation** — `expected ')', got ':'` ⇄ `unexpected character '-'` on a method
signature, the model flip-flopping between TS-isms (typed params / return annotation)
for 3–5 rounds until budget death. E-2's Run-0 prediction (well-diagnosed errors
self-recover in iteration) is CONFIRMED with the sharpest possible contrast.

- **E-9 — typed params / return annotations in `[ ]` signatures oscillate** (diagnostic,
  the top-leverage fix on the board). *collection* r1+r2, Sonnet — ~8 iterations burned
  across two cells on one production family. `toggleTask(label: string)` and
  `f(...) -> T` / `f(): T` must name the rule: a method's params are bare names, types
  live in `{ }` bodies. Beyond the message, David-endorsed direction (recorded as the
  **TS-ism recognition layer**): recognize-never-accept — parse THROUGH a small
  evidence-driven table of known foreign productions (E-9 sigs, E-4 dotted member,
  E-7 `<->` non-path, E-1's checker-level CSS names), push a fix-naming error each,
  resume at the member comma (the natural sync point), so one iteration surfaces the
  whole error list the way check() already does. Unrecognized junk still stops the
  parse — blind recovery manufactures cascades.
- **Token-accounting anomaly (harness, OPEN):** the FINAL successful iteration of
  multi-round green cells reports ~1–1.9M tok while sibling iterations report ~50K
  (collection r3 iter-3: 1.88M; compose r1 iter-2: 1.01M). Clean-first-shot greens
  report normally (46–48K). Raw run total 6.6M is inflated by these; treat per-cell
  token claims as suspect until the `claude -p` usage-JSON semantics on those calls
  are pinned down.

**The recognition layer — BUILT** (2026-07-15, same day as Run 2; David-endorsed):
parser.ts now RECOVERS through recognized TS-isms instead of dying on the first
character — each consumed whole, given its fix-naming error, parse resumed at the
member comma; all recovered errors raised together (DeclareErrors) and flattened by
compile() into individual positioned diagnostics. Productions: typed params (one
error per signature), `(): T` and `-> T` return annotations (`->` is now a TOKEN,
not a lexer fatal), dotted members, `<->` non-path. Unrecognized junk still stops
the parse (blind recovery manufactures cascades); a hard stop with recovered
errors pending reports all of them. Checker side: `CSS_ATTRIBUTE_HINTS` (E-1
escalation 2 CLOSED) — border*/boxShadow/background*/borderRadius/color/zIndex/
overflow/display/flex*/gap/margin/padding/onChange each name the Declare slot on
an unknown-attribute miss; and a raw `:path` decl-default names the `{ :path }`
binding form (Run-2 finding). Probe: the three-TS-ism program that cost eval
iterations 2–6 now reports ALL THREE fixes in one compile. Worst case is two
rounds (parse clears, then check reports), not one-error-per-round. Measuring
run: `iterated-postrecognition` (same protocol as Run 2) — the claim under test
is that Run 2's two E-9 oscillation deaths flip green.

**Run 3 — iterated, post-recognition-layer** (`iterated-postrecognition`, 2026-07-15):
same protocol as Run 2. Greens 6/9 (Run 2: 7/9 — within noise at n=9 with coin-flip
cells); the REAL result is the failure floor: **zero R1 deaths** (Run 2 had 2; every
Run-3 failure is ✗R5 — a real, booting program failing behavior asserts). The E-9
target cell flipped (collection r2: ✗R1@8 → G@4); syntax repair now costs 1–3 rounds
total (the multi-error reports collapse it), and the new messages were all observed
firing in the wild. **Syntax is no longer the binding constraint. The frontier is
rung-5 semantic repair**, with three named residents:

- **E-10 — the responsive-arrangement want, sighting #3** (language candidate,
  strongest evidence yet; still 1 model). *compose* r1: the model tried ALL THREE
  wrong doors in one loop — `layout.axis = { … }` dotted (E-4 message fired),
  `axis = { … }` constrained (E-3 message fired), layout-in-State (E-6 message
  fired) — every diagnostic named its rule and the model still circled, because the
  INTENT has no spelling. When a solver exhausts every wrong door of one intent, the
  intent is the finding. Decision input for the language discussion once the
  small-model canary corroborates: (a) constrainable `axis`/`spacing`, (b) a blessed
  swap idiom taught in the kernel, (c) status quo + teaching.
- **E-11 — Dataset mutation is under-taught** (docs). *collection* r1 spent 4 rounds
  stuck on "adding a task should grow the list" — the `insert`/`set` surface from a
  handler. The brief's Data section shows shape, not mutation verbs. Kernel/docs fix:
  one add-remove-toggle example in the brief §6 and the skill kernel.
- **E-12 — rung-5 reports name the failure, not the direction** (harness/report).
  Behavior reports ("expected list to grow past 3 rows") lack the where-to-look the
  syntax rungs now have. Candidate: rung-5 report lines gain a routing pointer
  (data-shaped assertion → "see docs/guide/08-data.md §editing"), which the
  skill-arm sandbox can actually follow.

Token anomaly RESOLVED as accounting, not spend: the captured usage detail shows
1–4.5M-token iterations are ~99% cache-side (creation+read of the session context);
raw input/output stay ~50K-shaped. Cost concern downgraded; keep quoting output+raw
input, not the headline total.

**Run 4 — skill arm, kernel v1** (`skill-oneshot`, 2026-07-15): one-shot ×3, kernel
(~1.3K tok: model + instinct-breakers + routing table) in prompt, corpus in sandbox,
selective reading. **1/9 green** — worse than the plain brief (3/9). The autopsy is
the finding, not the score:

- **E-13 — the kernel dropped the INVENTORY, and routing cannot compensate** (the
  packaging lesson of the arm). Characteristic misses were CONFIDENT INVENTIONS:
  `contentWidth: number = …` redeclaring the read-only intrinsic (2 cells);
  `fontWeight = { … ? 700 : 400 }` (CSS numeric weights vs the token vocabulary);
  an undeclared helper name used as if declared. None triggers retrieval, because
  **models don't retrieve what they don't doubt** — a routing table fixes
  known-unknowns; only a RESIDENT catalog fixes unknown-unknowns (built-in attr
  names, read-only intrinsics, enum token values, library signatures). The 5.8K
  brief beats the 1.3K kernel exactly by carrying that catalog. Kernel v2 adds a
  condensed inventory section (+ E-11's Dataset mutation verbs); rerun pending.
- **Diagnostic bug found & FIXED**: redeclaring a READ-ONLY intrinsic advised
  "write 'contentWidth = …' to set the existing one" — wrong fix (setting is also
  an error). isReadOnly branch now says: computed for you, choose another name.
- Cost profile confirmed the architecture's promise even as v1 lost: ~50K fresh
  reads/cell (vs 600K–1.8M raw-corpus) — the routing table DID bound reading; the
  misses were resident-knowledge gaps, not retrieval failures.

**Run 5 — skill arm, kernel v2 (inventory)** (`skill-v2-oneshot`, 2026-07-15): 2/9
green; the result is the FLOOR — six of seven failures at ✗R5 (one ✗R2), the deepest
one-shot failure profile of any packaging measured (brief: five ✗R1). E-13's
correction verified: zero confident-invention deaths (v1 had four). Synthesis of the
five packaging runs: **packaging sets the floor; the loop converts floors into
greens** — one-shot green counts at n=9 are behavior-rung luck, failure depth is the
discriminative metric. Next: E-11 (mutation verbs → brief §6) + E-12 (rung-5 report
routing pointers) stacked, then skill-v2 × iterated as the combined confirmatory run.

**Run 6 — the confirmatory run: skill-v2 × iterated (+E-11/E-12)** (`skill-v2-iterated`,
2026-07-15): **7/9 green** — collection 2/3 (lifetime best; 0-for-15 before today),
compose 2/3, modes 3/3; iterations-to-green [1,1,1,2,3,5,7]. The synthesis held:
best-floor packaging × the repair loop = the strongest configuration measured.
**RULED the standard eval configuration** for the matrix ahead (comprehension track,
tasks 3→8, small-model canary). Both residual ✗R5s are behavior-rung repair walls —
the next docs/report iteration targets them with full transcripts on file.

**Instrument calibration (David, 2026-07-16):** the small-model canary is a
PACKAGING-SENSITIVITY assay and regression tripwire, NOT a language-change gate —
small models aren't how code gets written today, so a Haiku failure is informative,
never dispositive. The E-10-style language-change evidence bar is hereby "a second
FRONTIER-class model trips on the same shape": first Opus (no run to date has used
it; affinity-bias asterisk noted — the teaching materials are Opus-authored — judged
marginal), later cross-vendor (Gemini via GCP; the solver seam already admits it —
one runGemini() + a makeSolver row; NOT pressing). Canary early read: Haiku reached
✗R5 on collection (the packaging carried a small model through all of syntax on the
wall task — the floor is real, not model-flattered).

**Comprehension track BUILT** (`evals/harness/comprehend.mjs`, 2026-07-16): items are
GENERATED, the compiler is the answer key — settled-value questions keyed by
settleHeadless geometry, provenance questions keyed by the dep extractor's read-paths
(zipped per deps.ts's walk-order contract), replication counts keyed by the settled
tree; ~40K tok/program, no judge, regenerable forever. Baseline (Sonnet, 3 reference
programs): 39/42 — settled-value 23/24, provenance 12/12 (read-analyzability measured
and confirmed), replication 4/6 where the misses are ITEM ambiguity (keys counted
library-internal instances; fixed to user-declared classes only).

- **E-14 — the Dataset JSON body vs the JS-object instinct** (diagnostic). *canary
  collection r3*, Haiku — wrote `{ rows: [ … ] }` (unquoted keys) inside
  `Dataset { … }`; "the Dataset body is not valid JSON — Unexpected token" states
  the rule, not the instinct or the fix. Name both: a Dataset { } body is JSON, not
  a JS object literal — quote the keys (`{"rows": …}`). Universal-instinct class
  (like E-1/E-9); land post-runs. Canary method note: Haiku's failure signature is
  REGRESSION-UNDER-REPAIR (reached R5 by iter 6, then broke its own green Dataset
  while fixing behavior) — capacity, not packaging; supports the calibration.

**Run 7 — the Haiku canary** (`canary-haiku`, skill-v2 × iterated, 2026-07-16):
**5/9 green at 2.1M tok total** (Sonnet same config: 7/9 at ~8× the spend). compose
3/3 — ALL first-shot (Sonnet one-shot: 1/3 on this arm; the small model follows the
kernel more literally and improvises less). modes 2/3 (one G@3 = a real repair-loop
success). collection 0/3 — the regression-under-repair signature throughout (reaches
R4/R5, then breaks green parts while patching; capacity, not packaging). Calibration
CONFIRMED: the packaging carries a small model to real programs; repair-stability at
program size is the capability line. Also: Haiku-per-token is the obvious future
bulk-generation arm if repair stability improves a tier.

**Run 8 — the second frontier: Opus** (`frontier2-opus`, skill-v2 × iterated,
2026-07-16): **9/9 — the first perfect run** (4.7M tok). collection SWEPT (G@3/G@8/G@7
— the 0-for-15 lifetime task; r2 used the whole budget and landed on the last
iteration: long grinds CONVERGE, no regression), compose 3/3 all first-shot, modes
3/3. **E-10 RESOLVED as teaching, not language**: Opus never attempted the illegal
doors — its first-shot compose used the taught idiom verbatim (`narrow` flag +
per-child x/y/width constraints). Given identical materials, the stronger model finds
the legal spelling immediately → the want is real but the remedy is the kernel/brief
carrying this exact pattern (DONE in kernel v2's inventory; add to brief §canon-idioms
next docs touch). Language change CLOSED at this evidence level (cross-vendor could
reopen). Affinity asterisk on file (Opus-authored materials); judged marginal.

**The model matrix, one packaging (skill-v2) × one loop (iterated ≤8):**
| model | green | cost | signature |
| Haiku 4.5 | 5/9 | 2.1M | literal kernel-following; first-shot strength; regression-under-repair at size |
| Sonnet 5 | 7/9 | ~16M | deep repair; R5 behavior walls |
| Opus 4.8 | 9/9 | 4.7M | converges always; finds legal idioms first-shot |
Reading: the LANGUAGE + packaging + loop are sufficient for frontier models and nearly
sufficient one tier down; every remaining failure mode is repair-stability (capacity)
or behavior-rung teaching (E-11/E-12 landed, unmeasured at N). The triage engine has
cleared its backlog: remaining register items are E-14 (Dataset JSON did-you-mean,
land next compiler touch) and the task-corpus expansion (3→8) for statistical power.

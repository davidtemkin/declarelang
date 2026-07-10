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
  structured **host→neo data** (independent of the theme system)? UNBLOCKED the
  neo-native editor by *reusing* the theme `record`/`Theme` kind for
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
- **D8 — HTML-island content measurement.** Let neo auto-size to foreign content
  (a reported extent), or accept explicit island sizes? (§9)

**Product / UX (all implemented this session, all reversible)**
- **P1 ⚙ — Source editor → neo-native `TextInput` card. SHIPPED.** The editor is
  now a neo `CodeField extends TextInput` inside an all-neo `SourcePanel` card
  (frame · filename · hint · Revert · field) — no host `<textarea>`, no card CSS.
  Host↔neo rides `App.demoSources` (source in) + `App.liveCard`/`liveSource`
  (edits out); the HTML island is now used ONLY for the compiled preview iframe.
  Verified: seeded from data, editable (yielding), live-recompiles the preview on
  each edit, Revert restores the pristine source, I-beam over the field, no
  spellcheck squiggles, no h-scroll. Still reversible.
- **P2 ⚙ — Editable at the outset** (no Edit/Done mode; always-editable + Revert
  + an "edit — preview runs live" hint). Keep, or bring back an explicit edit mode?
- **P3 ⚙ — Scroll-reveal fade removed from the demo sections** (kept on the
  marketing sections). Keep the demos always-solid, or restore the fade?
- **P4 ⚙ — Code panel wider than preview (58/42) + snug per-demo heights**
  (hand-tuned, since neo can't measure the field — see D8). Keep the split/sizes?
- **P5 ⚙ — Status/error dot dropped from the card.** Restore a compile-error
  indicator (needs a host→neo signal, D5)?

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

### 9. neo can't measure an HTML island's foreign content
Auto-extent measures neo children, not host DOM inside an island. So the editable
panels can't snug-fit to their code height — every card height is hand-tuned per
demo. (Moot once the editor is a *neo* TextInput, whose text neo could in
principle measure — TODO.) **Learning:** foreign content is a sizing black box;
either measure it (a reported extent back from the host) or accept explicit sizes.

### 10. Every app→host action needs a bespoke App flag
Host-side actions (open the source editor, revert a card, recompile a preview)
each require a new reactive `App` attr the host polls (`editing`, `editSource`,
`openCard`, …). There's no first-class "escape to the host" or "action" concept,
so the App schema accretes single-purpose flags. **Candidate:** a sanctioned
host-command channel, or keep it deliberately minimal (bodies stay DOM-free) —
but name the pattern.

### 11. No general object/map attribute to carry host→neo data
To seed each editor with its (host-read) demo source, I need a per-card string
delivered from the host into neo. There is no general "object"/"map"/"any" attr
kind — only `record`, which is entangled with the theme/stylesheet system and,
in the `{ }` typegen, is hard-coded to the single open type `Theme =
Record<string, unknown>` (compiler `scaffold.ts`). So a host-set map can only be
typed by *reusing* `name: "Theme"` (semantically wrong) and every read needs an
`as string`. The alternatives are worse: N single-purpose string attrs (accretion,
#10) or embedding the sources in the site (duplicates the demo files). **Candidate:**
a first-class `record`/`map` attr kind that can be *named per use* (its own emitted
type), independent of theme — the clean channel for structured host→app data.

### 12. app→host and host→app both ride bespoke App flags
Composing the neo-native editor needs BOTH directions over hand-rolled `App`
attrs: host→neo `demoSources` (seed the fields) and neo→host `liveCard` +
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
The live demo previews were iframes purely for ISOLATION: a neo `App` took its
stage size from `window.innerWidth/Height`, claimed the global `Focus` singleton
(`Focus.setRoot`), and repainted the document `<body>` background. Two apps in one
document therefore collided, so each demo got its own window (an iframe). The
iframe then bit us in Safari/WebKit (a preview that renders standalone AND in
headless WebKit went blank in real Safari — the cross-frame `postMessage`/window-
identity handshake is a known WebKit fragility). **Fix (David's framing — no
explicit "mode"): an app auto-detects it is embedded from ONE DOM signal.** Every
app root is stamped `data-neo-app` at attach; if a mount host has such an ancestor
(it was rendered into an `HTML []` island inside another app), the child wires as
EMBEDDED — stage size from the container element (ResizeObserver), pointer box-
relative, and it does NOT seize the page's focus/keys or repaint `<body>`. Input
routing stops at a nested `data-neo-app` boundary so the outer app doesn't double-
fire a click inside a child (the sink map is process-global). Result: previews are
now embedded child apps in the SAME document — zero iframes on the page, verified
in real WebKit (previews render, single-fire clicks, live-edit re-render, editor
preview inline). New runtime surface: `disposeApp(app)` (tear down an embedded
app's stage listeners before a re-render). **Learning:** "the root App is special
(it IS the stage)" (§6) has a dual — a NON-root app is special the other way; the
window-coupling that is right for the page is exactly wrong for an embed, and the
embed case is common (previews, playground, docs, dashboards-of-apps). The clean
factoring is *App reads its stage from context*, discovered from the DOM, not a flag.

### 16. The whole-page editor is now neo too — and recursion "just works"
Follow-on to §15: the whole-page "view & edit source" editor was host HTML/CSS/JS
(an overlay + textarea + iframe). It is now a neo `FullPageEditor` view built from
the SAME parts as the demo cards — a `CodeField` for the page's own source and a
`PreviewFrame` whose preview is an embedded child app (the page it compiles to).
The host lost the whole `#ne` overlay; only Escape-to-close remains (neo delivers
keys to the focused view, so a page-level key has no neo form yet). **Recursion is
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

### Minor / to verify
- A string literal with an embedded newline in a `[ ]` slot seemed to derail
  parsing (line-count went off, a trailing `font` decl became "unexpected"). Use
  `"""` blocks for multi-line — but confirm the single-line-literal-with-`\n`
  case. Also unclear if `font` decls must precede `App`.
- `cornerRadius > 0` rasterizes a view's box to a child `<canvas>` (no CSS
  `border-radius`/`background`) — fine, but surprising when introspecting/testing
  (selectors keyed on CSS background/border-radius miss these views).

# Open items — language, library, runtime

**Status:** register opened 2026-07-20. Each item is something a *program* could not
express, or expressed only by working around the platform. App-level bugs are not
here; they belong with their app.

Most were surfaced by building the Inspector (`inspector.md`) — a Declare program
mounted over another Declare program, which exercised overlay, identity, and
live-evaluation paths nothing else touches — and several were independently
re-derived from `desktop.declare`. Where two unrelated programs produced the same
workaround, that is said explicitly: it is the strongest evidence a register like
this can carry.

Narrative context and the session in which each was found lives in
`language-learnings.md` §17–23; this file is the actionable list.

| ID | Area | Item | Weight | Status |
|---|---|---|---|---|
| L-1 | language | Structural collection change is not a reactive event | **high** | **largely addressed** (2026-08-25) |
| L-2 | language | No typed child collection → `any`-seams and dead guards | high | open — narrowed |
| L-3 | runtime | Component identity rides `constructor.name` | medium | worked around |
| L-4 | compiler | No fragment-compile entry point | medium | open |
| L-5 | runtime | A slot cannot be rebound, only bound once | medium | worked around |
| L-6 | language | `:field` on a cursor-less view yields null silently | medium | open |
| L-7 | language | Declared order is z-order and hit order | — | **RULED — document** |
| L-8 | language | Record/array literal illegal as a declaration default | low | open |
| L-9 | library | `TextInput.text` will not two-way bind to a plain attribute | low | open |
| L-10 | library | No `pointerEvents` attribute | — | **done** (this branch) |
| L-11 | runtime | Overlay app read its environment from a no-pointer host | — | **done** (this branch) |
| L-12 | tooling | `declarec` omitted the runtime body-services | — | **fixed** |
| L-13 | tooling | `appName` never reached the page title in AOT builds | — | **fixed** |
| L-14 | language | User `prevailing` needs a shared base class | low | open |
| L-15 | runtime | No bridge into an embedded child app | medium | **half done** (island bridge 2026-08-20) |
| L-16 | naming | `HeadlessBackend` means engine-less, not headless | low | open |
| L-17 | compiler | A shadowed name silently dropped a dependency | — | **fixed** |
| L-18 | library | A house component's themed self-chrome falls back silently | medium | open |
| L-19 | platform | Unknown URL parameters pass silently | — | **RULED — leave** |
| L-20 | language | Component-typed slots cannot be constrained (DECLARE2000) | **high** | **built** (2026-09-01): pointer slots; layout excluded |
| L-21 | compiler | Method calls resolve by NAME when the receiver is unknowable | high | **built** (2026-09-01) |
| L-22 | language | Datapath/record edges are untyped — the coercion tax | **high** | **built** (2026-09-01): typed data |
| L-23 | language | Plain `.value` property reads wire only the value slot | high | **built** (2026-08-30) |
| L-24 | compiler | The projection refusal (7001) could degrade to tracking | low | **built** (2026-09-01): ruled must-fix |
| L-25 | library | `Time` — wall-clock as a source component | medium | **built** (2026-08-29) |
| L-26 | language | `host = browser` marking for DOM-touching script files | — | **RULED — no marking; name the failure** |
| L-27 | compiler | Alias/closure reads silently dropped from static deps | — | **fixed** (6e13f2e3) |
| L-28 | data | Dataset persistence — IndexedDB-shaped (GH #23) | design | open |
| L-29 | compiler | Chain classification breaks at inner calls and computed-default segs | high | open — found building L-21 |
| L-30 | compiler | Method BODIES are never checked against their written return type | medium | open — found building typed data |
| L-31 | runtime | Layout↔author slot conflict: contained + one clear message across all 3 sites | — | **done** 2026-09-03 |

---

## L-1 — Structural collection change is not a reactive event · **high**

Adding, removing or reordering children does not wake anything. Attribute writes do.
So any list derived from a collection must be invalidated by hand.

**Evidence, from two unrelated programs.** `desktop.declare` bumps
`winSeq = winSeq + 1` in **11 places** so the Window menu, the ⌘-key registry and the
dock's minimised section re-derive. Writing the Inspector, the same workaround was
re-invented four more times without noticing — `openSeq`, `vseq`, `lineSeq`, and a
`tick` interval. Same shape, same week, no shared code.

It also forces a second wart: the deps-as-arguments idiom
(`windowItems(this.winSeq, app.frontWin)`) exists *only* so the extractor can see the
counter. The method never reads `seq`. A reader who tries to understand the parameter
learns nothing about the domain and something about the compiler.

**Not merely cosmetic.** This is the exact pattern (`array.push()` then
`array = array`) that PuruVJ's Svelte-5 write-up names as the *diagnostic symptom* of
compile-time dependency detection, and it is what pushed Svelte to runtime signals.
A sophisticated critic will read `winSeq` as proof the compiler is guessing.

**Candidate.** Do *not* abandon static extraction — it is what buys `?extract`, the
crawl, verification, and the Inspector's own `deps` list. Svelte kept a compiler and
made the data structures notify. Same move here: static extraction of *which*
collection is read, plus runtime notification on structural change. Eleven manual
bumps and the argument-threading idiom both disappear.

**Interim mitigation** (no language change): funnel every structural change through
one or two methods that bump the counter once, so 11 sites become 2.

**Update 2026-08-25 — largely addressed, from two directions.** `childViews` is now a
tracked (structural-cell) read, and `desktop.declare`'s windows became RECORDS in a
Dataset (windows-as-data): every `winSeq` bump site, `nudge()`, and the
deps-as-arguments idiom (`windowItems(seq, front)`, `seatCheck(...)`) are gone — the
consumers derive from the records (through the tracked `read`) and from `childViews`
walks. What remains of this item: the extractor still silently tolerates plain
`.children` walks in constraint-reachable code (see the NOTE in dep-extract's
classifyChain); with `winSeq` retired, that tolerance should become a refusal
pointing at `childViews` — the ruled follow-up (David, 2026-08-24).

## L-2 — No typed child collection · high

`wins.children` is `View[]`, so every subclass attribute is invisible and each read
goes through an `any` seam — which then invites a defensive guard.

**Evidence.** `desktop.declare` carries **11 accessor methods** that exist only for
this: `pathOf`, `isPlain`, `titleOf`, `isMin`, `ixOf`, `setIx`, `parkOf`, `homingOf`,
`setHoming`, `sizeOf`, `labelFor`. Look at what they guard: `dockSlot` is declared
`dockSlot: number = -1` and can never be null; `title: string = ""` can never be null.
The `!= null` checks and `"" +` coercions defend against the *type system's*
uncertainty, not against anything the program can produce — so each one teaches the
reader a false fact about the state space.

**Candidate.** A container declares what it holds (`wins: View [ holds: Window ]`), so
`children` is typed and the scaffold follows. Removes the seams, the guards, the
coercions, and most of the accessors at once.

**Available today, no language change:** most of the queried attributes (`title`,
`dockSlot`, `miniT`, `plain`) already live on the base `Window`; hoisting the three
stragglers (`appPath`, `forApp`, `homing`) would let ~8 of the 11 methods collapse to
direct reads. Keep the *names* (`isMin` reads better than `w.dockSlot >= 0` at nine
call sites); drop the defensiveness.

**Update 2026-08-25:** windows-as-data removed "the one cast"
(`wins.children as Window[]`) — the views resolve through typed `WinSlot.win` slots —
and the accessor count shrank with the records refactor. The general ask (a container
declaring what it `holds`) stands; the sharper modern form of this item is now
[L-22](#l-22) (untyped record edges), where the same disease costs more.

**Update 2026-09-01:** L-22's record half is BUILT (typed data — named schemas as
types). What remains of L-2 proper is the typed CHILD collection (`holds:`/childViews
synthesis) — narrower still now that record-shaped state is typed.

## L-3 — Component identity rides `constructor.name` · medium · worked around

`explain()`'s label, `inspect()`'s node kind, and `desktop.declare`'s own `appOf(w)`
dispatch all key off `constructor.name`. Under minification the runtime's `App`
becomes `Pe`, so the Inspector's tree read **"Pe"** for the root and labels read
`t.width`.

Name *shape* cannot discriminate: the calendar has a real two-letter class `Ev`,
indistinguishable from a minified `Pe`. The current workaround checks the property
**descriptor** — `instantiate.ts synthesize()` stamps authored names with
`Object.defineProperty` (non-configurable) while JS-inferred names are configurable.
It works; it is a trick, not a design.

**Candidate.** Stamp the authored component name on the instance (`$kind`) at
materialize time; have `inspect`, `explain` and anything else read that. Also retires
the stringly-typed `w.constructor.name == "ViewerWindow"` dispatch in the desktop,
which silently returns the wrong application if a class is renamed.

## L-4 — No fragment-compile entry point · medium

`compileExpr` is the runtime half only. The **compiler** rewrites free identifiers
(`width` → `this.width`, `app` → the root) before any body compiles, so a tool holding
only the runtime rejects the very spelling the language teaches.

**Evidence.** The Inspector's evaluate strip needed a hand-written `qualify()` that
re-does that rewrite against the live object — duplicated logic that can drift from
the compiler it imitates.

**Candidate.** `compileFragment(src, scope)` (spec: `inspector.md` §6.2) —
expression / assignment / binding / view-literal — returning `{ fn, deps,
diagnostics }` from the *same* free-identifier and dep-extraction path a `{ }` slot
takes. Wanted by any REPL, any live-editing surface, and any agent evaluating against
a running program.

## L-5 — A slot cannot be rebound · medium · worked around

`bindConstraint` refuses a slot that already has an owner ("already bound by …"), so
installing a constraint at runtime means calling `disown()` first. Correct for compile
time; but "replace this slot's constraint" is the central verb of live editing and has
no public spelling.

## L-6 — `:field` on a cursor-less view yields null, silently · medium

Documented behaviour (an unresolved `:path` is null) and correct inside a constraint.
In a REPL it is a lie: the developer cannot distinguish *the field is null* from
*there is no data here* from *you typo'd it*.

The Inspector now refuses both cases explicitly and lists the keys the record does
have — but it had to reach past the language to do it (`inheritedCursor` plus the
cursor record). The same ambiguity is silently present in every app.

**Candidate.** A strict read, a compile-time warning when a `:path` cannot exist on
the reachable shape, or an accepted ruling that null-means-absent is final and
tooling compensates.

## L-7 — Declared order is z-order and hit order · **RULED: keep, and state it**

**Ruling (David, 2026-07-20): the semantics stand.** Declared order *is* z-order in
the initial state; that is the language's model and it is defensible. The resolution
is **documentation and a clear statement**, not a language change.

Recorded because the diagnosis cost is real and should inform where the statement
goes. Two programs, one day:

- `desktop.declare`'s resize strips are unreachable on a **background** window: the
  first-click `veil` (`visible = { !active && … }`, raised last by `raiseChrome()`)
  spans the content area and covers them. Resize works on the active window; on an
  inactive one the press correctly only activates.
- The Inspector's column seam could not be grabbed because `whyCol` was declared after
  it. Same shape, unrelated code.

Both follow the rule exactly, and both are invisible where you would look: the
covering view is elsewhere in the file. It cost an hour and one **wrong bug report**
("resize is broken") before the veil was found.

**Therefore the doc statement should carry, not just the rule, but its two
consequences:** (a) a later sibling covers an earlier one for *hit-testing*, not only
for paint — that is the half that surprises; and (b) when chrome must stay above
subclass content, the base class has to re-assert order (`raiseChrome()` is the
desktop's name for it) — so the idiom is named rather than rediscovered.

**Tooling half (cheap, and not a language change):** the Inspector should answer
"what would a press here hit?" directly. It already has `viewAt`; surfacing it as a
probe turns this class of bug from an hour into seconds.

## L-8 — Record/array literal illegal as a declaration default · low

`open: object = ({ })` is refused, so state that wants to begin as an empty record
must default `null` and be initialised in `onInit`, and every reader needs
`|| ({ })`. Cf. `language-learnings.md` §11, whose general object attribute landed;
this is its remaining edge.

**Re-hit 2026-08-25:** the desktop's `borns` side-channel (windows-as-data) needed
exactly this — `borns: object` with `onInit() { this.borns = ({}) }` — because a
`{ ({}) }` computed default would mint a fresh object per read. Twice-independent
evidence; the item stands.

## L-9 — `TextInput.text` will not two-way bind to a plain attribute · low

`text <-> app.entry` is refused (datapaths only). The diagnostic names the workaround
— derive down with a `{ }` constraint, deliver up in `onInput()` — which is good, but
"a field editing a plain attribute" is the common case in a tool, and the Inspector
ended up reading `this.text` in `onEnter()` instead.

## L-10 — `pointerEvents` · **done in this branch**

Did not exist. Overlay chrome, decoration and highlight layers all need it. Added:
`schema.ts`, `View`, `Surface`, DOM backend (canvas/headless no-op). Note
`language-learnings.md` §5 ("a handler-less view is `pointer-events:none`") is the same
subject from the other side — the two should be reconciled into one stated rule when
L-7's documentation lands.

## L-11 — Overlay app environment source · **done in this branch**

A chrome/overlay app wired its environment to the **host element**, which carries
`pointer-events: none` by construction — so it never saw `pointermove`, `app.pointerX`
never updated, and every drag it owned silently did nothing (window drag, window
resize, both seams). Fixed with a `chrome` mount mode that reads the *window*.

General lesson, and it rhymes with §7 and §15: where an app's environment comes from
should be an explicit mount decision, not inferred from where it happens to sit.

## L-12 — `declarec` omitted the runtime body-services · **fixed**

The generated entry imported `runtime/dist/boot.js` but never `index.js`, where
`setBodyServices({ Focus, Keys, Themes })` runs. **Any** app whose `{ }` bodies name
`Themes`, `Keys` or `Focus` died at boot with `ReferenceError`; `desktop.declare` uses
both, so its production build did not run at all. One-line import, `+0.3 KB` gzip.
(The prewarm/static path was never affected — it boots through `host-client.js`.)

## L-13 — `appName` never reached the page title in AOT builds · **fixed**

The mirror lived only in `host-client.js`, which `declarec` output bypasses. Moved the
mapping into the runtime as `reflectAppName(app, served, reflected)` — one rule, two
hosts driving it. Deliberately wired into `renderProgram*` and **not** `mountApp`,
since islands mount through `mountApp` and an embedded child must never retitle the
page.

## L-14 — User-declared `prevailing` needs a shared base class · low

Verified: `prevailing` on a user class works, but only for readers that *extend the
declaring class* — a slot has to exist on every participant. A bare read from a class
outside that chain fails with DECLARE4001.

So the "descendant reads an ancestor's value" case (the dock's `hot` envelope, read as
`this.parent.parent.hot`) cannot use it without inventing a shared base. Available
today: give the dock and its citizens one. The language ask is prevailing slots
declarable against `View` from user code — what other systems call context.

## L-15 — No bridge into an embedded child app · medium

`bridgeFor` installs `window.__declare` for **top-level** apps only, and the Inspector's
`Inspect` service targets a single subject. So nothing can inspect *into* an island: a
live preview, or a real app hosted in a desktop window.

Two consequences, one of them commercial. The desktop hosts genuine applications in its
windows and they are opaque to the tool built to explain them — which is exactly where
integration bugs live. And the homepage's strongest available demo (the Inspector
explaining one of the page's own live panels) is blocked on it.

**Cost** is two parts, not three — see `inspector.md` §6.6. Targeting a child app is
small (`host-client` already keeps `box.__childApp`). The real work is **coordinate
mapping**: `at()` and the highlight rects live in the subject's root space, which for an
island is the box rather than the viewport, while the Inspector's pointer is
viewport-based. An offset threaded both ways — and if it is wrong the outline lands
somewhere plausible and false, which is the kind of error that passes a casual check.

## L-16 — `HeadlessBackend` names the wrong axis · low

The class is not "headless" in the sense everyone means — headless Chromium is headless
*and* a fully real engine. What it actually is, is **engine-less**: no DOM, no CSS, no
layout engine, approximated text metrics. The name invited exactly that confusion while
this register was being written, and it briefly put a wrong claim into
`operational/introspection.md`.

`SyntheticBackend` would say what it is, and matches the vocabulary the tool already
prints (`synthetic metrics`). Purely a rename; not worth churning on its own, worth
doing the next time that file is opened.

## L-17 — A shadowed name silently dropped a dependency in the extractor · **fixed**

The dep extractor **inlines** a constraint's reads through intermediate constraints —
a computed `{ }` default has no cell to subscribe to, so its formula's reads must become
the reader's. The decision of *what is a computed default* was keyed on the bare NAME,
with no regard for the receiver. An inner view declaring a name that also exists on the
app therefore captured every read of that name in the program — including `app.<name>`
inside the very default that defines it.

Reduced from the real case (the Inspector's pane seams, which would not drag):

```declare
App [ colA: number = 250,                              // written by the drag handler
    panes: View [
        colA: number = { Math.min(app.colA, parent.width - 340) },   // shadows it
        treeCol: View [ width = { parent.colA } ],
        ],
    ]
```

`this.root.colA` matched the name, so the default inlined **into itself**; the recursion
guard returned an empty summary, and what survived was `this.root.parent.width` — not a
path that means anything (`root` has no `parent`). The edge to `app.colA` was gone. The
handler wrote the slot, `panes.colA` re-derived because `parent.width` woke it, and every
consumer of `parent.colA` never re-ran. The panes did not move.

This was the nastiest failure mode in this register: **silent and wrong**, not loud and
absent. Rungs 1–4 passed, the app booted, the value visibly changed in the Inspector —
only the propagation was missing, which reads as "the drag doesn't work" rather than
"a dependency was dropped".

**Fixed** in `compiler/src/dep-extract.ts`: the inline decision now resolves the
RECEIVER to an element and inlines only if that element actually declares a computed
default of that name. `this` is the owner, `this.root` (and the `app.` spelling) is the
program root, `classroot` is the enclosing class root, and `parent` is the owner's parent
in the instance tree. Where the receiver cannot be resolved statically — `parent` inside a
class body names the *use* site, which varies per instantiation — it falls back to the
name-only test, so the change only ever narrows over-eager inlining. The same resolution
is applied when a default's own summary is built, which is where the self-inline happened.

Extracted reads for the case above are now
`panes.colA ⟵ ["this.root.colA", "parent.width"]` and
`treeCol.width ⟵ ["parent.root.colA", "parent.parent.width"]`.

Guarded by two cases in `test/dep-extract.test.mjs` — the shadowing case itself, and two
sibling elements declaring the same default name, each consumer inlining its own. The
Inspector carries the natural shadowing spelling again; the rename that worked around it
is reverted.

Still open, and worth doing separately: nothing refuses an impossible read path. A
residue check rejecting `root.parent` and friends at compile time would have caught this
from the other direction.

## L-18 — A house component's themed self-chrome falls back silently · medium

`TextInput` carries **self-chrome**: `text-input.ts` derives its own `fill`, `stroke`,
`cornerRadius` and `padding` from the prevailing theme, reading the v1 role names
`components-baseline.md` §5 rules — `surface`, `line`, `accent`, `fieldRadius`. When the
theme does not carry a role, it falls back to a hardcoded constant:

```ts
bindDerived(this, "fill", () => tok("surface", 0xFFFFFF));
```

An app that hand-rolls a palette in its OWN vocabulary therefore gets a **white box** —
in a dark rendition, near-invisible text on white. Found in the calendar, whose palette
names roles `pageBg`/`cellBg`/`sectionBg`/`hairline` and never says `surface`. The
calendar uses exactly one house component, and it is the only thing that broke: the
failure is precisely at the seam between an app's private vocabulary and a component
expecting the house one.

The same anti-pattern as [L-17](#l-17): a missing input yields a plausible-looking wrong
value rather than a diagnostic. A theme is an untyped `object`, so an absent role and a
role deliberately left out are indistinguishable.

Latent in other programs on the same seam — none of these define the roles, and each is
one dark rendition away from the same white box:

```
calendar-sample    TextInput×2   surface=0  line=0
component-sampler  TextInput×3   surface=0  line=0
controls           TextInput×1   surface=0  line=0
desktop            TextInput×1   surface=0  line=1
```

**Not the fix applied.** The chrome is a *yielding* derive — `if (!isSet(this, "fill") &&
ownerOf(this, "fill") === null)` — so assigning `fill`/`stroke` displaces it entirely,
which is what `SearchField` did ("displaced by author nulls"). **Retired 2026-07-27:**
`SearchField` is gone from `library/` — it had exactly one instantiation (desktop's Help
menu, a focus fixture), and its whole delta over a bare `TextInput` was a capsule radius
plus a magnifier glyph. Worse, nulling the field's chrome to redraw it on a wrapper
*displaced the focus-reactive edge* along with it, so the wrapper's own header admitted
"focus shows as the caret." The lesson generalizes and belongs to the library charter: a
wrapper that displaces a component's derives to restyle it loses the behavior riding
those derives. The calendar now
styles its two fields in its own vocabulary (`fieldBg`/`fieldEdge`) and will move onto
the house rendition wholesale when it adopts the component library. There is no rawer
editable to reach for and none is needed: `TextInput` IS the base (`Editor` above it is
abstract), and displacement is the supported escape.

What should change:

1. **A component should declare which theme roles it reads**, so a theme missing one is a
   compile-time diagnostic rather than a white box. The roles are already ruled; nothing
   checks them.
2. **The fallback constants are the wrong shape.** A light-mode constant is not a neutral
   default — it is a guess that is wrong half the time. Refusing, or deriving from the
   App's `dark` intrinsic, both beat a hardcoded `0xFFFFFF`.

**Fixed alongside:** `focused` was maintained by the runtime and read by the house focus
edge, but absent from `EditorSchema` — so a component could style on focus and an author
who displaced that chrome could not. Now declared, and the calendar's fields render their
own focus edge with it. Also `dom-backend.ts` now sets `color-scheme` on the editable
element from its resolved fill, so the chrome only the BROWSER draws — the scrollbar in a
multiline field, the selection highlight, the placeholder, autofill — follows the field's
own background instead of rendering light inside a dark box.

## L-19 — Unknown URL parameters pass silently · **ruled: leave it**

A mistyped platform flag loads the app and does nothing — a typo is indistinguishable
from not passing the flag at all. Two things were considered and both declined.

**No aliases (David, 2026-07-20).** One word per thing. Accepting a near-miss teaches
that near-misses work generally, which is a worse contract than a flag that plainly does
not exist. The Inspector's flag is now spelled **`?inspector`** — the one word, matching
what the tool is called everywhere else — and `?inspect` is simply not a flag.

**No strict checking, for now (David, 2026-07-20).** Erroring on unrecognized parameters
looked tenable on paper: the top-level query string is entirely platform-owned. Verified
— a top-level app's `app.env` is `{}` no matter what the URL carries; `env` is the
*embedding* environment and arrives only through an island's slot spec
(`data-declare-slot="run:name|k=v&k=v"`, host-client.js), which is how the desktop passes
`program=` to a hosted Viewer and `base=` to a hosted Calendar. No app reads the query
string at top level, so there is no app namespace for a checker to collide with.

It was declined anyway, and the reason is the good one: **the obvious scoping does not
hold.** The plan was strict in development and silent in production, on the grounds that
the flags presuppose a compiler or the dev server and mean nothing in a `declarec`
artifact — and that a deployed page must tolerate `?utm_source`, `?fbclid`, `?gclid`,
which every shared link picks up. But you may perfectly well want to run a **development**
page with a tracking parameter attached before switching to a production build. The
dev/production line is not the same line as the platform/foreign-parameter line, so
strictness in dev would refuse legitimate URLs. Too much change, and the unknowns bite
later.

If it is ever revisited, the shape that would work is a **single registry both the reader
and the checker consume** (the one-source/many-consumers discipline `tools/internal/ops.mjs`
already uses for procedures), plus an explicit way for an app to *declare* the parameters
it reads — which is also what would make them typed and reactive instead of a stringly
lookup. Same medicine as [L-18](#l-18). For the record, the surface today is 15 keys read
across four layers:

```
?inspector            inspector-boot.js
?render               serve-core.js · boot-uniform.js
?viewer ?debug ?profile   server (index.mjs, serve.mjs)
?extract ?build       tools (ops.mjs)
?segments ?file       prewarm.mjs
?src ?mode            boot-extract.js · boot-source.js
?etag                 boot-uniform.js
?backtrace ?lzbacktrace ?lzprofile   (legacy/debug)
```

plus one **non-keyed** form any future checker must not misread: the launcher's bare
path, `index.html?apps/calendar` (boot-uniform.js `launchTarget()`), positional and
distinguished by a `/` before any `=`.

## L-20 — Component-typed slots cannot be constrained (DECLARE2000) · **high**

`forApp = { app.launcher.files }` is refused: "a component slot takes a member or
null — constraining it is not yet surface." The ruled interim idiom (2026-08-25):
**ids flow through constraints, nodes are stored only by assignment** — and it works,
but its cost is visible in `desktop.declare` as the *accessor farm*: `DockIcon`/
`AppGlyph` hold an `appId` string plus an `ap()` resolver, and `Launcher` carries six
near-identical attribute-returning accessors (`hue1Of`, `hue2Of`, `glyphOf`,
`gsizeOf`, `drawnOf`, `labelOf`) that exist only because a constraint may read an
attribute *through a method that returns it* but not off a returned node (see L-24).
An independent cold read (2026-08-25) called this "pure ceremony; in any conventional
framework you'd pass the object." The application-as-node pattern — now the house
model-layer idiom — runs into this on day one.

**Built (2026-09-01; DT: "why *not* fix L-20?").** Not a semantics change — both
halves already existed (slots hold node references via assignment; `{ }` computes
values); only the combination was refused. The `{ }` now computes WHICH existing
node a component-typed slot points at: a pointer, re-derived like any value —
never creation, never ownership; repointing tears nothing down. The ONE slot
kept member-or-null is `layout` (a layout ATTACHES — kernel lifecycle, not a
pointer; check.ts gates on `type.of === "Layout"` with its own message).
Correctness rule, enforced in dep-extract: reads THROUGH a node-typed slot keep
the SLOT as their wired edge and take the `~dynamic` sentinel for the rest — a
prewired edge would pin the PREVIOUS node's cells across a repoint (NODE_SLOTS,
name-keyed over program classes + builtin tags; the arm sits BEFORE the
computed-default inline, which would otherwise silently drop the tail — L-29's
shape). Note: a DECL-form pointer slot (`ap: Doc = { … }`) is a computed
default — per-read evaluation, no cell of its own — which is exactly right for
a pointer: always fresh, liveness through the reader's tracking. The desktop is
the proof: DockIcon/AppGlyph carry `ap: DesktopApp = { app.launcher.byId(this.appId)
?? app.launcher.files }` (total — the transient first-settle read before a
replicated row's id lands must not throw) and every face/hue/glyph/dot read goes
through the slot. Pins in dep-typed: repoint wakes; the NEW node's cells are
live after; the OLD node's no longer stir.

## L-21 — Method calls resolve by NAME when the receiver is unknowable · high

Typed residence exists (the 2026-08-20 `open` collision fix): a resolvable receiver
gets exactly its class-chain's method. But an *unresolvable* receiver falls back to
following **every same-named candidate in the merged source** — so declaring an app
verb can change the analysis of unrelated library code. Re-hit verbatim 2026-08-25:
a `DesktopApp.open(v)` verb re-collided with the combobox's `open()`, resurfacing the
phantom ".start() unresolved [in included library source, line 1245]" — with the
position misattributed into the prelude (the file:line rebaser fix exists in the
declare-ben tree and arrives with its merge). The desktop now documents "the verb is
`launch`, not `open`" as a trap comment, which is the wrong place for that knowledge
to live.

**RULED (DT, 2026-09-01): adopt TS semantics, no deviation.** Method calls have
exact OOP/TS resolution and the TS compiler ships in every configuration (the
in-browser compile included) — the deviation was never a design, only an artifact:
the extractor uses TS's parser but not its checker, and grew its own receiver
resolver with a by-name fallback. The fix: extraction resolves a call the way TS
does — the receiver's static type from the typecheck's own `ts.Program` → that
class chain's method (plus same-family overrides, the standard sound closure);
a receiver TS types as `any` is genuinely unresolvable and takes the `~dynamic`
sentinel to the tracking path — no unions, no followed strangers, no phantom
errors. Engineering shape: share (or query) the typecheck's program from the
extractor instead of running an independent text pass. Interaction: L-22's typed
records shrink the `any` receivers, so static resolution widens as it lands.

**Built (2026-09-01).** `typecheckBodies` keeps its `ts.Program` and returns a
TYPE ORACLE beside its errors; `compile()` threads it into `annotateProgram`.
The extractor's unknown-receiver arm asks the oracle — it locates the call in
the check-block's own AST (position mapping is line-keyed by each body's `{`,
immune to the datapath/type-strip splices) and hands back the receiver's
static type — then follows ONLY that family: the declared class through the
extractor's chain plus the OVERRIDE CLOSURE over its descendants, or the exact
instance method by its body's brace. A receiver TS types `any` takes the
`~dynamic` sentinel to the tracking path. The all-candidates union — and the
single-candidate and name-keyed fallbacks — are deleted: no stranger's body is
ever walked, no phantom can leave its family. Pins in dep-typed (a CAST
receiver wires its family and provably not the stranger's; an `any` chain goes
dynamic and stays LIVE through tracking). Desktop: 439/462 wired, unchanged;
corpus 42/42; compile cost unchanged (~1–2% checker queries on an
already-run program). REACHABILITY, learned while building: with typed
signatures (params can't be untyped), the alias door (L-27), and the
param-lenient tier, the arm's real customers are cast receivers, chains
through object/record members, and indexed receivers — class-body `parent.*`
calls are refused earlier by the resolver. Two ADJACENT breaks discovered en
route are filed as L-29, not silently absorbed.

## L-22 — Datapath and record edges are untyped — the coercion tax · **high**

Every replicated read pays it: `"" + (:id ?? "")`, `Number(:ix ?? 0)`,
`!!:hasKids` — dozens of sites in `desktop.declare` alone — and record-shaped state
(`pendingItem: object`, the window records, `props as Record<string, unknown>`)
crosses every boundary as an untyped bag. The independent cold read named this one of
the two things "the platform should fix" ("TypeScript being placated rather than
used"). The machinery half-exists: a `DataSource.schema` already type-checks `:path`s
against a declared shape at compile time. Records built *in the program* (windows-as-
data rows, launcher rows) have no way to declare a shape at all, and datapath reads
without a schema default to stringly-null.

**Candidate.** Declared record shapes (`type WinRec = [ id: string, cls: string, … ]`
or schema-on-Dataset made ergonomic for program-built data), with `:path` reads typed
from them — retiring the `""+` tax and the `!`/cast escapes in one move. Related:
component-typed attr reads scaffold as `T | null` even where provably fed
(`activeApp!`).

**Built 2026-09-01 — TYPED DATA (DT's ruling: "the whole language uses the same type
system; dataset schemas are limited but they are a proper subset").** The elegant form
ran the subset relation forward: a `schema Name [ … ]` top-level declaration IS a type —
projected as an ambient TS interface (scaffold), resolvable in decl type positions
(`sel: Task = null` → record kind, data-flagged), legal in method signatures and as a
field of another schema (refs resolve by reference, so recursion is free), extended
with literal unions (`status: "open" | "closed"` — JSON can say it, so the subset can).
A dataset declares its document by type (`schema = [ tasks[]: Task ]`, `schema = TaskDoc`,
or `schema = Task[]` for a bare-array response) and its `.value` NARROWS to the document
type in every `{ }` body — the `as Task[]` casts retire at the source, and `t.don` dies
at compile with the field named. The runtime enforces the same declaration at arrival,
at the embedded body, and now at the VERBS (`set`/`insert` refuse a non-conforming write
with the pointer path; extras still pass — permissive by design). One namespace of type
names: a schema/class collision refuses. What remains open here: `{ }`-body `:path`
ISLANDS are still unchecked/untyped (the attribute surface is where paths concentrate;
schema-check's honesty-of-scope note), and a `:`-path cannot begin with an array
selector, so a bare-array document replicates only through a derived wrapper. Guide
ch. 9 "Schemas — the shape you rely on, declared once" is the teaching surface (with
the enforcement map as its closing table); pins in dataschema/databinding tests.

**Round 2 (2026-09-02, after the fresh-eyes review + DT's rulings):** number-literal
unions (`col: 0 | 1 | 2` — JSON Schema's answer over JTD's strings-only); the `<->`
SCHEMA FLOOR (the edit session commits the draft READ AS the field's declared type —
"42" lands as 42; an unreadable draft is an invalid session, never a thrown write;
boolean/record/array `<->` targets refuse at compile naming the right tool); the
PRODUCER'S WALL (`contents` on a schema'd derived dataset checks against the document
type at compile — the runtime guards data the program didn't construct, the compiler
guards data it did); seven crossing diagnostics naming their rewrites (TS array
spelling, type-suffix `?` both directions, field defaults, methods-in-schema,
schema-extends, schema-as-tag). Related gap FILED below as L-30.

**Round 3 (2026-09-02, second fresh-eyes review + DT's rulings):** SCHEMA-TYPED SLOTS
ARE LIVE past their identity — the L-23 tracked-view rule extended: a record slot's
tracked reader gets the tracking view, so `app.sel.title` in a { } wires the record's
region cell and a verb write wakes it (the review's stale-view finding, killed at the
root; raw normalizes on assignment, the Dataset.value push pattern). Verbs RULED
permissive on undeclared keys (JSON culture; the trap documented in the guide's verbs
paragraph along with the thrown-refusal semantics). The enforcement map moved to the
chapter's end. NAMED NEXT INCREMENTS of the shape grammar, in standards order (both
JSON Schema and JTD carry them): tagged record unions (`discriminator` — the one
essential composite), dynamic-key maps (`values`); DEFERRED BY RULING: literal unions
on attribute/parameter types (schema-only today), compile-checking literal verb
writes; a JSON Schema/OpenAPI → `schema` import tool is the noted interop seam.

## L-23 — Plain `.value` property reads wire only the value slot · high · **built 2026-08-30**

`{ list.value.wins.length }` compiles, works at boot, and **goes silently stale**
under `insert`/`removeAt`/`move`/`set` — mutations wake region cells, which only the
tracked accessors (`:path`, `read([…])`) subscribe to; a plain JS property chain
wires the `value` slot alone, and mutation never replaces `value`'s identity. Found
building windows-as-data (the desktop's `recs()` must read
`list.read(["wins"])`, and says why in a comment — again the wrong home for the
knowledge). Same silent-staleness family as L-17/L-27, and the extractor can SEE the
`.value.` chain statically.

**Built (2026-08-30, GH #15):** the spelling is CORRECT now, not warned about.
`Dataset.value` hands TRACKED readers a memoized proxy of the tree
(data.ts trackedView, via the new `AttrSpec.tracked` hook — `live`'s dual):
each property step tracks the same per-key region cell `read([…])` uses, nested
containers proxied lazily; untracked readers (handlers, methods) keep the raw
tree, so structuredClone and identity checks are untouched. bind.ts routes
`.value.`-shaped deps to the tracking path (region cells are recreated with the
value; fixed prewired edges cannot follow them). Boundaries unwrap (RAW symbol):
toCursor — so `datapath = { d.value.rss.channel }` still resolves — and the
verbs/value-push, so a tracked view is never stored. Null guards keep their
meaning (`value != null ? … : -1` never collapses — the reason the .read()
rewrite option was rejected). Pins in databinding.

## L-24 — The projection refusal could degrade to tracking · low · sketched

**Built (2026-09-01; DT: "an immediate must-fix, that's pretty glaring").** The
7001 projection refusal (opaque return / unresolvable argument, read through) is
retired: such a constraint takes the `~dynamic` sentinel to the tracking path,
where the real read is observed each run. Statically nameable projections keep
the wired path (the join still wires `pick().hue` when pick's returns are
paths). The desktop's accessor farm — hue1Of/hue2Of/glyphOf/gsizeOf/drawnOf/
labelOf — is DELETED; `byId(id).hue1`-shaped reads (find over roster) are legal
and live. Desktop wiring: 428 of 464 static (was 439/462 — the delta is the
through-slot reads, honestly on tracking). Pins in dep-typed (opaque find, live)
and dep-projection (the old refusal pin flipped to the new contract).

## L-25 — `Time`: wall-clock as a source component · medium · **built 2026-08-29**

Any `{ }` reading `new Date()` / `Date.now()` is a stopped clock: an ambient read
with no cell behind it evaluates once and never again (same anatomy as
`Math.random()` in the tilt egg). The desktop's hand-rolled `Clock` node is the
worked example of the correct shape — ambient state sampled by a node that owns
cells. Design settled in discussion (David, 2026-08-26):

- **A source component, cadence in the declaration**: `Time [ every = minute ]`,
  with `frame | second | minute | hour | day`. The calendar tiers are
  **calendar-aligned flips** (aim at the next boundary, not an interval) — correct at
  the flip, drift-free, sleep-safe. No arbitrary periods: those are timing rules
  (`setTimeout`) by doctrine.
- **`every = frame` unlocks `time.now`** (revised on David's push-back, 2026-08-28 —
  the first design wrongly banished this to Heartbeat): wall-clock ms at display
  cadence, riding the one shared clock, ticking only while subscribed and visible.
  It exists because *derivation from the current time* is not integration — a
  stopwatch readout, a countdown, progress toward a deadline are pure functions of
  `now` (`text = { fmt(time.now - app.startedAt) }`), and forcing them through a
  Heartbeat accumulator makes an integrator imitate a formula. The three-way split,
  keyed to the shape of the dependence: derive from **Time** when the value is a
  pure function of the current time; integrate with **Heartbeat** when the next
  value depends on the previous; declare a destination with **Spring/Animator**
  when it is motion. (`x = { time.now * v }` as motion remains the taught
  anti-pattern — a teaching line, not a withheld primitive.)
- **Live getters** for the facts (`clock.minute` computes from the ambient clock at
  the read), so a handler read is always fresh regardless of subscriptions — no
  demand-dependent freshness, no magic. Demand controls only whether the alarm is
  armed (idle-zero thrift, zero observable semantics). The demand-*inferred*
  cadence variant was considered and rejected: a source's declaration must state its
  subject.
- **Surface, settled 2026-08-29 (David: "I buy this")** — `tick` (not `every`; a
  noun, pairs with `onTick`) · `running` · the facts `now` (the instant, epoch ms)
  and `year month day hour minute second weekday` (numeric, local zone —
  Temporal's Instant/PlainDateTime split) · `onTick(dt)`. **Numbers, never
  strings**: no `text`, no `dayName` — formatting and localization are the app's,
  as a subclass attribute (`class DesktopClock extends Time [ tick = minute,
  text: string = { new Date(this.now).toLocaleTimeString(…) } ]` — legal and
  reactive today, since `now` is the tracked input and `new Date(value)` +
  `toLocale…` are pure projections). `onTick` stays on Time (sources fire on
  themselves, like Keys/EventStream). Visibility: the PAGE hidden pauses Time
  (idle-zero; facts refresh and `dt` clamps on return); a merely hidden VIEW does
  not (visibility gates layout and input, never derivation — an author who wants
  the pause writes `running = { this.visible }`).
- **Heartbeat folds in** (David, 2026-08-29): it is exactly `Time [ tick = frame ]`
  through the handler door; `running`, the dt clamp, the three-throws auto-stop,
  and DECLARE4006 transfer verbatim, and `onTick` on a calendar tier gains the
  "when the minute turns" event that had no spelling. A rename, not an alias
  (L-19); its docs sweep (declare.md §10, guide 14, concepts.json, Heartbeat.md)
  rides the build.

Companions: a compile-time warning for `new Date()`/`Date.now()`/`Math.random()` in
`{ }` bodies (the DECLARE4006 family — "this reads the ambient world; derive from a
Clock, or from a seed"), and optionally a prelude `rand(seed, key)` so the pure
seeded-random idiom reads as one call instead of inline mulberry32.

**Built 2026-08-29** — `runtime/src/time.ts` (Heartbeat retired across the corpus): a
Node component on the GENERIC construction path (registry `TAGS`, like `Node`), which is
what lets it carry declarations and be subclassed — the source path would have sealed
both; the facts get an `AttrSpec.live` hook (attributes.ts) so an untracked read samples
the real clock while a tracked read keeps the slot's contract; the clock protocol lives on
a delegate ticker because `tick` is the attribute. DECLARE4006 (`onTick` ignoring `dt`)
is judged only at `tick = frame`; DECLARE4007 warns on `Date.now()` / `new Date()` /
`performance.now()` inside a `{ }`. NOT built: the `Math.random()` arm of that warning and
the `rand(seed, key)` prelude — the desktop's tilt egg samples `Math.random()` in a `{ }`
on purpose (a fresh roll per toggle), and a warning there needs the prelude to point at.

## L-26 — `host = browser` for DOM-touching script files · **RULED 2026-09-02: no marking; name the failure instead**

A `script [ "file.ts" ]` that touches the DOM runs on exactly one renderer; nothing
marks that fact or protects the canvas/native paths from it. Deferred from the
2026-08-24 script/module ratification.

**Ruled (DT): nothing — no tag, no lint.** A tag's only honest reader is a build
refusal, and a refusal that depends on voluntary confession is weaker than a failure
that names itself: an UNTAGGED DOM-touching file would behave exactly as today, so
the protection covers only authors diligent enough not to need it. The sanctioned
repair is the DIAGNOSTIC: when script evaluation or a script call throws a
ReferenceError naming a known browser global (document/window/navigator/…) on a
host that has none, the error re-says itself with the file and the fact — "this
script touches browser APIs; this host has none; feature-detect with `typeof
document`, or keep browser-only script in browser-only programs." Repair pending
(small; the script-eval and handler/constraint error paths).

## L-27 — Alias/closure reads silently dropped from static deps · **fixed** (6e13f2e3)

The L-17 family's biggest member. `const a = roster.find(…); a.running` and
`team.filter((p) => p.online)` produced reads the extractor could SEE but not NAME as
static paths — and dropped them silently, so a prewired constraint missed the edge
forever. Found as the desktop's vanished running-dot (caught only by the R6 pixel
gate); the records-array design it replaced had been *load-bearing* precisely because
array replacement is a directly-read wake. Fixed with the `~dynamic` sentinel: such a
body is marked dynamic, flows up the summary graph, and the constraint stays on the
runtime-tracking path where every one of those reads is live — the seam the module
header always reserved for "genuinely dynamic reads". Pinned three ways in
`test/static-constraint.test.mjs` (find-alias wakes; iterator-closure wakes; a pure
projection off an alias *keeps* the static path). Measured cost: ~8% of each large
app's constraints move to tracking — exactly the ones that were stale before.

## L-28 — Dataset persistence, IndexedDB-shaped · design · GH #23

The offline-notes request (ultrasaurus, 2026-08-19): a persisted Dataset should serve
its last-known value at boot, independent of any fetch resolving. The issue's four
design questions are the right ones and the data round starts from them: (1) single
value vs keyed COLLECTION (a notes store keyed by filename, secondary index on tags —
IndexedDB-shaped): which is `persistence`'s unit? (2) offline-first read at boot;
(3) WRITE DURABILITY before a same-tab navigation — an awaitable commit, not
fire-and-forget; (4) graceful degradation where storage itself throws (private
browsing, quota) as a documented, handleable state, not a defensive wrap. localStorage
is ruled out by the mirror case (~5–10MB cap). Interim path, verified 2026-08-30: a
`script [ "store.ts" ]` module is plain bundled TypeScript outside the { }
host-global rule — an app keeps its own IndexedDB mirror there and feeds a Dataset
from handlers (the teach hints for localStorage/indexedDB now say so).

## L-29 — Chain classification breaks at inner calls and computed-default segs · high · found 2026-09-01

Two `break`s in the extractor's seg loop cut a chain short, discovered while
probing L-21's oracle (both PREDATE it; the oracle made them visible):

1. **Inner call**: `a.b().c()` classifies `b()` and stops — `c()` is never
   recorded. The call-RESULT receiver family therefore never reaches method
   following at all; it rides the PROJECTION JOIN (`pick().titled()` wires
   pick's return paths joined with the tail — `a.titled`/`b.titled` — so the
   conditional's INPUTS are live but titled's own body-reads are not: a
   `label` change does not wake). The join is a designed approximation, but
   now that the oracle can TYPE a call result (the checker knows
   `pick() -> Doc`), extending classification past the inner call would make
   these fully wired — the door L-21 opened.
2. **Computed-default seg**: a chain THROUGH a `{ }` declaration default
   (`bag: object = { … }` read as `bag.x.open()`) inlines the default and
   `break`s — everything past it is silently DROPPED, reads and calls alike.
   That is the L-17 silent-family: no error, no dynamic sentinel, a
   permanently stale edge. Probed live 2026-09-01. The narrow fix: on a
   computed-default seg with a longer tail, add the `~dynamic` sentinel
   instead of breaking clean — honest tracking rather than a dropped edge.

## L-30 — Method bodies are never checked against their written return type · medium

Found 2026-09-02 building typed data's producer wall: `f() -> number { return "x" }`
compiles clean — for EVERY return type, not just schemas. The method's check-block is
emitted without a return annotation (the scaffold header's §R5 note), so the written
`-> T` binds callers but never the body. The typed-data chain is still closed at the
CALL SITE (`contents = { app.mk() }` checks mk's declared return against the document
type), but the body-vs-signature seam is open. **Candidate:** annotate the emitted
check-block function with the written return type — one line in emit(); the cost is a
corpus sweep, since any existing method whose signature lies would start (correctly)
erroring.

## L-31 — Layout↔author slot conflict · **half done** 2026-09-02

Found via a field report's secondary note (a market-map storm). DUG IN and ruled:

**Non-uniform boxes are NOT the bug.** They are SUPPORTED by design (layout.ts header:
"shape may vary per child — a Spacer carries its flexed size, a plan-shared child its
width, a plain sibling only its position"). The corpus's own MasonryLayout relies on
it; a uniformity check at install() breaks weather at R4 (tried, reverted). The
report's "non-uniform is illegal" inference was wrong.

**The real bug: a layout claiming a slot its CHILD authored** (`width = { … }`), thrown
UNCONTAINED. Discovered mid-settle on a shape-driven rearm it re-fired every reactive
wave (365× in the streaming app). RULED: a layout↔author slot conflict is resolved in
the AUTHOR's favour — the layout leaves that slot to its author, arranges the rest, and
reports ONCE (dedupe per child+slot), never a settle-aborting throw. End state is
unchanged (the throw fired before the layout claimed, so the author always kept the
slot) — only survivable. `ignoreLayout = true` stays the blessed geometry opt-out.
BUILT (layout.ts install() pre-filter + reportConflict); pins in components +
unit (#16).

**RESOLVED 2026-09-03 (DT: keep it comprehensible via good errors, not a behaviour
rework).** The boot-direction STATIC conflict stays a throw (fail-fast on a
statically-visible mistake); the rearm/dynamic direction stays contained (don't wedge a
running app). What was missing was CLARITY: all three surfaces — the layout's own claim
(reportConflict), the general one-owner guard when an author binding installs over a
layout claim (attributes.ts own()), and a direct write to a layout-owned slot (the
setter) — now speak ONE wording via `layoutConflictMessage` (errors.ts), naming the
LAYOUT as arranger, the child+slot, position-vs-size, and the resolution (let the layout
do it, or `ignoreLayout = true`). Layout claim constraints carry `arrangedBy` (reactive.ts)
so the general guard/setter recognize a layout owner — message-only, no behaviour change.
COMPILE-TIME detection investigated and DECLINED: `place()` is arbitrary runtime code, so
which slots a layout claims per child is unknowable statically without a declared policy
attribute (not worth the contortion). Pins in unit + components.

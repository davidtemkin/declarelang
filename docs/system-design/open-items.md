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
| L-1 | language | Structural collection change is not a reactive event | **high** | open |
| L-2 | language | No typed child collection → `any`-seams and dead guards | high | open |
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
| L-15 | runtime | No bridge into an embedded child app | medium | open |
| L-16 | naming | `HeadlessBackend` means engine-less, not headless | low | open |

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
which is what `SearchField` already does ("displaced by author nulls"). The calendar now
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

## L-19 — Unknown URL parameters pass silently · medium · **proposed: strict in dev only**

`?inspector` instead of `?inspect` loads the app and does nothing. Every platform flag
behaves this way: a typo is indistinguishable from not passing the flag at all.

**Ruled (David, 2026-07-20): no aliases.** One word per thing. Accepting a near-miss
teaches that near-misses work generally, which is a worse contract than a flag that
plainly does not exist. The right answer to a typo is a loud error.

### Is erroring tenable? — yes, because the namespace is closed

The top-level query string is **entirely platform-owned**. Verified: a top-level app's
`app.env` is `{}` no matter what the URL carries. `env` is the *embedding* environment
and arrives only through an island's slot spec (`data-declare-slot="run:name|k=v&k=v"`,
host-client.js), which is how the desktop passes `program=` to a hosted Viewer and
`base=` to a hosted Calendar. **No app reads the query string at top level**, so there is
no app namespace for a checker to collide with — an unknown key is unambiguously a mistake.

The surface is 15 keys, read across four layers:

```
?inspect              inspector-boot.js
?render               serve-core.js · boot-uniform.js
?viewer  ?debug ?profile   server (index.mjs, serve.mjs)
?extract ?build       tools (ops.mjs)
?segments ?file       prewarm.mjs
?src     ?mode        boot-extract.js · boot-source.js
?etag                 boot-uniform.js
?backtrace ?lzbacktrace ?lzprofile   (legacy/debug)
```

Plus one **non-keyed** form the checker must not misread: the launcher's bare path,
`index.html?apps/calendar` (boot-uniform.js `launchTarget()` — it is positional, and is
distinguished from a key by having a `/` before any `=`).

### Why it must be development-only

The flags are a *development* surface — `?render`, `?extract`, `?build`, `?viewer`,
`?segments`, `?file`, `?src` all presuppose a compiler or the dev server, and mean nothing
in a `declarec` artifact. That is what makes strictness safe, and it is also what makes
it **mandatory** to scope: a deployed page must tolerate `?utm_source=`, `?fbclid=`,
`?gclid=` and every other tracking parameter a shared link picks up. Erroring on those
would break every link anyone shares. So:

- **dev server + in-page compiler present → refuse**, naming the near-miss
  (`unknown ?inspector — did you mean ?inspect?`), which is what serves the ruling above:
  typos become loud instead of becoming aliases.
- **production build → ignore, silently**, exactly as today.

### Prospects as the flag set grows

Good, if the list is a **single registry both the reader and the checker consume** — the
same one-source/many-consumers discipline `tools/internal/ops.mjs` already uses for
procedures. Adding a flag is adding an entry; forgetting to is loud (your new flag errors
in dev) rather than silent. The real work is that the 15 keys are read in four different
layers today, so the registry has to cover all of them or the checker will reject a flag
some other layer honours.

One forward-looking gap: if a third-party app ever wants its own top-level query
parameter, strictness blocks it. The answer is not to loosen the check but to let an app
*declare* the parameters it reads — which is also what would make them typed and reactive
instead of a stringly-typed lookup. Same medicine as [L-18](#l-18): make the contract
explicit and checkable rather than guessing.

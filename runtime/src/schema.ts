// Component schemas — the typed-attribute declarations of the built-in
// components, shared by the checker (check.ts) and the runtime bridge
// (instantiate.ts). A schema is pure data: the component's name, its base
// schema, and its *own* attributes' types drawn from the value vocabulary
// (value.ts). Inheritance is a chain walk — exactly the shape a user-defined
// `class X extends Y` plugs into at R6, with no new mechanism.
//
// Deliberately independent of the runtime classes (view.ts): the compiler
// front-end (APPROACH §5) reuses check — and therefore these schemas — with
// no runtime import. instantiate.ts keeps the twin tag → class table.

import { enumType, type AttrType } from "./value.js";

// The formalized weight vocabulary (CSS 100–900 tokens + normal/bold aliases),
// shared by View's `fontWeight`/`headingWeight` and the `font` face keys.
const FONT_WEIGHT = enumType("FontWeight", "thin", "extralight", "light", "regular",
  "normal", "medium", "semibold", "bold", "extrabold", "black");

export interface ComponentSchema {
  readonly name: string;
  readonly base: ComponentSchema | null;
  readonly attrs: Readonly<Record<string, AttrType>>;
  /** Which of this schema's OWN attrs are `prevailing` (styling rung): an
   *  unset slot follows the nearest providing ancestor's value, live. Being
   *  prevailing is declared once, with the slot — part of its identity, like
   *  its type (a subclass can neither redeclare nor change it). Absent =
   *  none of its own. */
  readonly prevailing?: readonly string[];
  /** Which of this schema's OWN attrs are `readonly` — a computed/intrinsic
   *  value a constraint may READ but nothing may set (checkAttr refuses an
   *  assignment; the runtime accessor's setter throws). Like prevailing, it is
   *  part of the slot's identity. Absent = none of its own. */
  readonly readOnly?: readonly string[];
  /** Events this component itself fires — a handler member `on<Event>` must
   *  answer one (language §8: a class *declares* the events it fires, and
   *  the checker verifies against the declaration, so a typo'd handler is a
   *  compile error, not a silent no-op). Inherited events come from the
   *  `base` chain; absent = declares none of its own. */
  readonly events?: readonly string[];
}

// View's literal attributes (the language reference's View header, §6):
// Length for the geometry — px, or a percent awaiting R4's resolution —
// plain number/boolean for the rest. `clip` (R3) is the first Shape-typed
// attribute: any view can clip its subtree to a declarative shape —
// pay-per-use, no special clipping class (the rendering model's ruling). It
// ALSO accepts the boolean box-clip (tabslider-gaps.md gap 1): `clip = true`
// clips the subtree to the view's own box (0,0,width,height), reactively on
// width/height; `false`/unset = no clip. Both forms ride the one slot — the
// runtime branches on the value's type (view.ts).
//
// Decoration lives on View (ruled — the box ontology): a View IS a colored
// box with a corner radius (default 0, square), an optional inside border,
// and an optional drop shadow. `fill: Fill` subsumes the retired
// backgroundColor (ruled: Fill = Color | Gradient, the solid case by
// coercion); cornerRadius shapes the PAINTED box only — clipping stays the
// explicit `clip` (the recorded lean).
// Node is the root of the whole tree — the plain atom every other kind of
// member descends from at RUNTIME (`class View extends Node`, and likewise
// Layout / Dataset / Animator / AnimatorGroup / Heartbeat / State / the Sources).
// Declared first so those schemas can name it as their base: the chain the
// runtime has always had, finally recorded here too (2026-07-28) — before
// this, every one of them was a schema ROOT and Node's members were
// unreachable through any of them.
const NodeSchema: ComponentSchema = {
  name: "Node",
  base: null,
  attrs: {},
};

const ViewSchema: ComponentSchema = {
  name: "View",
  base: NodeSchema,
  attrs: {
    x: { kind: "length" },
    y: { kind: "length" },
    width: { kind: "length" },
    height: { kind: "length" },
    fill: { kind: "fill" },
    cornerRadius: { kind: "number" },
    // pointer-interaction intrinsics (interaction.ts) — read-only (readOnly below):
    // on the live hit chain (hovered) / on the chain captured at pointer-down (pressed)
    hovered: { kind: "boolean" },
    pressed: { kind: "boolean" },
    stroke: { kind: "stroke" },
    shadow: { kind: "shadow" },
    visible: { kind: "boolean" },
    // The two parent-regime OPT-OUTS, declared on the child (one family):
    // `ignoreLayout` — this child is not arranged by the parent's layout (a
    // decoration/overlay owns its own position, both axes); `ignoreClip` —
    // this child is not cut by the parent's clip (paint AND hit — frame
    // chrome that straddles the frame: a window's resize halo, a badge
    // poking out of a clipped card), and it does not count toward the
    // parent's auto-extent (frame geometry derives FROM the parent's bounds
    // and cannot also define them — the percent-slot rule's sibling). An
    // ancestor's clip above the parent still applies.
    ignoreLayout: { kind: "boolean" },
    ignoreClip: { kind: "boolean" },
    // …and `ignoreScroll` — the third member (ruled 2026-07-29): the scroll
    // carries everyone but me. The child rides its nearest enclosing scroll
    // FRAME — the window when the page is the regime, the pane's frame inside
    // a `scrolls` view — and contributes nothing to the scroll range. Fixed
    // headers, pinned toolbars, and the overlay LAYER that stages parked
    // furniture (a sheet waiting beyond the frame's edge) are all this one
    // attribute.
    ignoreScroll: { kind: "boolean" },
    opacity: { kind: "number" },
    // Uniform scale transform (painted only — never layout, like opacity): the
    // view's subtree renders scaled about the pivot point (pivotX/pivotY, in the
    // view's own coordinates; default the top-left corner). Animate it with a
    // Spring for zoom effects; 1 = no transform. Both backends realize it (DOM
    // CSS transform, canvas ctx.scale), and hit-testing follows the visible
    // geometry so a scaled view stays correctly clickable.
    scale: { kind: "number" },
    pivotX: { kind: "number" },
    pivotY: { kind: "number" },
    // Rotation in DEGREES, clockwise, about the same pivot scale uses —
    // painted only, like scale and opacity: the box the tree reasons about
    // never rotates, layout is untouched, and hit-testing follows the
    // VISIBLE geometry through the inverse transform (interaction.ts), so a
    // rotated control stays honestly clickable. Composes with scale in one
    // documented order: scale, then rotate, about the shared pivot (for
    // uniform scale the two commute; the order is stated so nobody has to
    // prove that). 0 = unrotated.
    rotation: { kind: "number" },
    // How this view COMPOSITES against what has already painted beneath it
    // within the nearest isolating ancestor (compositing.md §4.1: the App
    // root, a group-opacity subtree, a scroller's content group, an island
    // boundary — plain containers are transparent to blending, so a multiply
    // chip inside three nested layout Views blends against the card under
    // them). Declaration order — the language's own z-order — is also the
    // blending order. A blending view lands as a UNIT, children included;
    // compositing is paint, never input. Tokens are camelCase (`colorDodge`),
    // the W3C mode set every renderer carries natively.
    blend: enumType("Blend", "normal", "multiply", "screen", "overlay",
      "darken", "lighten", "colorDodge", "colorBurn", "hardLight", "softLight",
      "difference", "exclusion", "hue", "saturation", "color", "luminosity",
      "plusLighter"),
    // The frost (compositing.md §3.2): sample what has already painted
    // beneath this view's own painted shape — box, cornerRadius, or shape
    // clip, over-scanned by the blur radius so edges do not bleed dry —
    // filter it (`frost(radius, saturation?)`), and paint the view's own
    // `fill` OVER the result: the platform-material shape. Samples within
    // the same isolating ancestor blending sees (§4.2); re-samples as
    // content moves beneath — that is the point of frost. null = none.
    backdrop: { kind: "backdrop" },
    clip: { kind: "shape" },
    // Scroll: which AXES of interior overflow this view scrolls (ruled
    // 2026-07-29, the axis-enum form — the Stretch shape): `none` (the View
    // default — overflow is out of frame), `y`, `x`, or `both`. A scrolling
    // view clips to its box; overflow along a declared axis becomes its scroll
    // range (live `scrollY`/`scrollX`), overflow along any other axis is
    // simply gone. Chrome stays fixed for free by being a SIBLING of the
    // scroller — or a child that declares `ignoreScroll`. Both backends
    // realize scrolling natively (DOM `overflow`; canvas clip+translate+wheel).
    scrolls: enumType("Scrolls", "none", "y", "x", "both"),
    // The axis a declared drag CLAIMS (D8 RULED; claim-surface.md): `both`
    // (default — the whole single-finger gesture, today's semantics) or
    // `x`/`y`, scoping the claim to one axis so the cross axis stays the
    // enclosing scroll regime's. The forcing cases: a grid column's header
    // drag and edge-resize on touch.
    claim: enumType("Claim", "both", "x", "y"),
    // the tooltip text — planes.md tier 1; "" (the default) = no tip
    tip: { kind: "string" },
    scrollY: { kind: "number" },
    scrollX: { kind: "number" },
    // Styling: the ruled prevailing built-ins — the four text-style slots
    // (declared on View so any container can provide them; Text renders with
    // the effective values) and the theme token record. NOT prevailing, by
    // ruling: backgroundColor/opacity/visible (their effect already composes
    // through the render tree — a followed copy would apply it twice).
    textColor: { kind: "color" },
    fontSize: { kind: "number" },
    fontFamily: { kind: "font" },
    // fontString maps each weight token to its numeric CSS weight, which also
    // PICKS the matching web face when a `font` provides several.
    fontWeight: FONT_WEIGHT,
    // Tracking (canvas-native: ctx.letterSpacing / CSS letter-spacing), in px;
    // 0 = the browser's natural advances (the Flash auto-tracking stays shed).
    letterSpacing: { kind: "number" },
    // The size an Icon takes from its context — prevailing, so a HOST states
    // it once (a menu row 16, a button 18) and every icon beneath answers.
    // A use site may still override it; this is a default, not a rule.
    iconSize: { kind: "number" },
    // Rich-text STRUCTURE overrides (the prose-specific styling slots — the twin
    // of the text-style slots above, for the parts a `Text` doesn't have). A
    // `Markdown`/`HTMLText` renders its headings/links/inline-code from these;
    // like the text slots they are prevailing (set once on a container → all
    // prose below picks them up) and declared on View so any ancestor provides
    // them. Colors default `null` = the theme-aware house token; `headingWeight`
    // defaults to the house `bold`.
    headingColor: { kind: "color" },
    headingWeight: FONT_WEIGHT,
    linkColor: { kind: "color" },
    codeColor: { kind: "color" },
    // Code face + size — the twin of `codeColor` for monospace regions (inline
    // code, fenced/`<pre>` blocks). Default `0`/`""` = the house code style
    // (PROSE.codeSize / PROSE.mono). Prevailing, so one ancestor sets the code
    // rendition for all prose below it.
    codeSize: { kind: "number" },
    codeFamily: { kind: "font" },
    // The code-BLOCK box paint (fenced ``` and highlighted `<pre>`): a background
    // tint and a left accent bar. Both `null` = the house look (fenced code keeps
    // its themed tint, a `<pre>` stays bare) — so unset changes nothing. Setting
    // `codeBackground` gives a `<pre>` the same tinted box a fenced block has;
    // setting `codeRule` draws a left bar on BOTH (the `buildQuote` bar, reused).
    // Prevailing, the twin of `codeColor`/`codeSize` for the block's chrome.
    codeBackground: { kind: "color" },
    codeRule: { kind: "color" },
    // Per-block-type layout geometry for rendered rich text (Markdown/HTMLText):
    // a plain record keyed by block type (`paragraph`/`heading`/`code`/`pre`/
    // `list`/`table`/`blockquote`/`rule`, plus `default`), each entry giving a
    // `maxWidth` (0 = unbounded), a `margin` ([left, right]), and an `align`
    // (left|center|right). Defaulted IN the consumer (like `theme`): an unset map
    // — or an unset key/field — is today's full-width, left-aligned flow. A `pre`
    // block with no own entry shares the `code` entry. Set it to give prose a
    // reading measure while code fills the column (code wider than prose). Set via
    // a `{ }` object; prevailing, so one ancestor sets the flow geometry below it.
    richTextLayout: { kind: "record", name: "RichTextLayout" },
    // The `theme` slot's runtime default is the HOUSE theme — populated in
    // value.ts (DEFAULT_THEME, the single source; view.ts wires it as the
    // slot's def), so `theme.role` in library components always resolves.
    theme: { kind: "record", name: "Theme" },
    // Native text selection — a prevailing slot so a whole subtree opts in from
    // one place: `selectable = true` on a container makes all its Text (including
    // a `Markdown` component's rendered runs) selectable/copyable. Defaults by
    // SPECIES (ruled 2026-07-30): off for Text and views (a label is chrome), ON
    // for the RichText family (a flowing document is selectable by its nature —
    // markdown.ts effSelectable); any declaration beats any default, in either
    // direction, so a control inside prose vetoes with `selectable = false` and
    // the unusual non-selectable document is one explicit line. Declared on View
    // so any container provides it, like the text-style slots.
    selectable: { kind: "boolean" },
    // The pointer cursor while over this view (a CSS cursor keyword; "" =
    // inherit) — resize affordances, drag handles. Meaningful on views that
    // take input (the sink is the hit target on both backends).
    cursor: { kind: "string" },
    // Whether this view (and its subtree, CSS-inheriting) takes pointer
    // events at all: "auto" (the default) or "none". A view that is pure
    // decoration over live content — a highlight rectangle, a full-viewport
    // chrome overlay — declares "none" so presses reach what is beneath it.
    pointerEvents: { kind: "string" },
    // The other two styling channels: an ordered bundle list (static, ruled
    // v1 — consumed at construction) and the prevailing stylesheet slot
    // (provide it anywhere → that subtree reskins; swap = one settle).
    styles: { kind: "styles" },
    stylesheet: { kind: "stylesheet" },
    // R7: how the view arranges its children — a component-typed slot
    // (language §5: "a reactive Layout attribute you set on the view",
    // Appendix A: "Layout is an attribute, not a child"), written as the
    // member `layout: SimpleLayout [ … ]`, or `layout = null` for none.
    layout: { kind: "component", of: "Layout" },
    // R8: the data cursor (language §9: "`datapath = …` sets the cursor;
    // descendants read relative to it"). Written as a `:path` (relative to
    // the inherited cursor — `:arr[]` replicates this element), a `{ }`
    // expression yielding a place in a dataset, or null.
    datapath: { kind: "cursor" },
    // Keyboard focus (docs/system-design/input.md, Layer 2): `focusable` = a tab stop;
    // `focusTrap` = a self-contained focus group (Tab cycles within, escapes at
    // the boundary). Traversal order is the view tree (no numeric tabindex),
    // customized by overriding the `tabOrder()` method.
    focusable: { kind: "boolean" },
    focusTrap: { kind: "boolean" },
    // Anchor name (location.md §6): give a view a name and a fragment `@name`
    // brings it into view. This is the "named view" half of the reveal namespace
    // (heading slugs are the other); resolution is views-before-slugs, preorder,
    // `-2` on duplicates. "" (the default) = not an anchor. A plain string the
    // reveal walk reads after settle — no rendering effect.
    anchor: { kind: "string" },
    // The linking triple (location.md §0). `link`: this view IS a link to the
    // reference — "#name" in-app, a URL out; "" = not a link (no interest, no
    // focus stop, nothing for the crawl); any view can carry it, and interest
    // derives from it the way it does from a declared handler. `replace`:
    // following this link overwrites the current history entry instead of
    // pushing — fine-grained movement WITHIN a place (a deck's arrows).
    // `shows`: this view manifests the named location — visibility derives
    // from it (the location's destination part equals the name), and the name
    // joins the program's link registry; literal, App-tree only (check.ts).
    link: { kind: "string" },
    replace: { kind: "boolean" },
    shows: { kind: "string" },
    // Read-only intrinsics — the auto-extent computation (view.ts), surfaced:
    // the bounding-box extent of this view's visible children on each axis. A
    // constraint may READ them to clamp a size (`height = { Math.min(
    // contentHeight, 480) }`); they are never set (see readOnly below — the
    // runtime backs them with getters, not stored slots).
    contentWidth: { kind: "length" },
    childViews: { kind: "array" },
    virtualized: { kind: "boolean" },
    // Replication metadata, declared on the replicated child and consumed by
    // the Replicator (stripped from the template — not a live slot on the
    // instance). It is in the schema so it DOCUMENTS ITSELF (the reference is
    // generated from these tables) and so a `{ }` body has a declared type to
    // check against; check.ts gates it to a replication template.
    //
    // `key` is deliberately NOT here, though it is the same kind of metadata.
    // Being a View attribute would take the name out of every author's reach —
    // no member and no child could be called `key` again — and the corpus
    // proved that immediately: library/menu.declare has a child named `key`.
    // A common English word is too expensive to spend on a rare override, so
    // `key` stays a special case in check.ts and is taught in the guide's
    // identity ladder rather than the reference.
    virtualize: { kind: "boolean" },
    contentHeight: { kind: "length" },
  },
  prevailing: ["textColor", "fontSize", "fontFamily", "fontWeight", "letterSpacing", "headingColor", "headingWeight", "linkColor", "codeColor", "codeSize", "codeFamily", "codeBackground", "codeRule", "richTextLayout", "theme", "stylesheet", "selectable", "iconSize"],
  // `scrollX` is a platform fact: the backend mirrors the user's pan into it,
  // and the program asks for a change with the `scrollToX(x)` verb (or drives
  // it with a declared Animator — the sanctioned driver door). `scrollY` is
  // the same shape and WANTS to be here too (platform-authorship.md), but the
  // perceptual probe test/probe/ignorescroll.declare declares an at-rest
  // initial offset (`scrollY = 120`), which a readOnly listing would refuse —
  // it joins when the declared-initial form has a ruled replacement.
  readOnly: ["contentWidth", "contentHeight", "childViews", "virtualized", "hovered", "pressed", "scrollX"],
  // R5: the pointer trio (click = press and release on the same view — the
  // shared router's rule, input.ts) plus the construction-complete lifecycle
  // event `init` (Appendix A's onInit). Hover (pointerOver/Out) waits for its
  // consuming rung — it needs retained enter/leave tracking, not just a
  // per-event hit test.
  // The pointer events come in two layers (input.ts): the RAW facts —
  // pointerDown/Move/Up, the multi-finger `touch*` family, and `wheel` (the
  // wheel stream, trackpad pinch included) — report what the pointer
  // physically did, immediately; the RESOLVED ones — click, dblClick,
  // hold — report what the user MEANT, after the router has watched the whole
  // gesture. Activate on the resolved layer, manipulate on the raw one.
  // Declaring a raw-family handler is also a gesture CLAIM (backend.ts
  // InputWants): it takes from the browser exactly what that handler needs
  // to fire, nothing more.
  events: ["click", "dblClick", "hold", "pointerDown", "pointerUp", "pointerMove", "pointerOver", "pointerOut",
    "touchStart", "touchMove", "touchEnd", "touchCancel", "wheel",
    "pinchStart", "pinch", "pinchEnd",
    "init", "retire", "contextMenu", "focus", "blur", "escapeFocus", "keyDown", "keyUp"],
};

// App is the root View plus the app's reactive environment. `hostWidth`/
// `hostHeight` are its enclosing extent — the window at top level, the container
// element when embedded — READ-ONLY intrinsics (see readOnly below) that the
// App's own width/height DEFAULT to (view.ts bindExtent), so a plain app fills
// its host and an aspect-locked one reads them. The rest is the free environment
// a full-window app reads — the page scroll offset (reveal/parallax/appearing
// chrome) and the free pointer (cursor effects, hover-at-a-distance). All are
// plain reactive attributes fed from window/container listeners at mount
// (index.ts); read the App from any depth via the `app` noun (`app.scrollY`).
const AppSchema: ComponentSchema = {
  name: "App",
  base: ViewSchema,
  attrs: {
    hostWidth: { kind: "number" },
    hostHeight: { kind: "number" },
    scrollY: { kind: "number" },
    pointerX: { kind: "number" },
    pointerY: { kind: "number" },
    pointerDown: { kind: "boolean" },
    hovering: { kind: "boolean" },
    pointerOverText: { kind: "boolean" },
    // the OS color-scheme, `prefers-color-scheme: dark` — the runtime feeds it and
    // keeps it live as the system theme flips, so an app themes off `app.dark`.
    dark: { kind: "boolean" },
    // "am I running on a touch device?" — true when the device's PRIMARY pointer
    // is coarse (`pointer: coarse`), a phone or tablet. A stable device fact (kept
    // live if the input changes), distinct from the transient `hovering`:
    // mouse-only affordances (a cursor-chasing dot, a hover reveal) switch off with
    // `visible = { !app.touchDevice }`.
    touchDevice: { kind: "boolean" },
    // The rest of the device profile (boot.ts wireTouchDevice). `hasTouch` /
    // `hasPointer` are what the device HAS (`any-pointer`), not what is
    // primary: a touch laptop is both, with touchDevice false. Size from
    // `touchDevice`; use `hasTouch` for a hit-target FLOOR on hybrids.
    hasTouch: { kind: "boolean" },
    hasPointer: { kind: "boolean" },
    // What the user JUST used — "mouse" | "touch" | "pen", live. The honest
    // answer on a hybrid, where the truth changes per gesture: drive hover-only
    // affordances from it, never layout.
    lastPointerType: { kind: "string" },
    // THE SAFE AREA — the region the device guarantees free of its own chrome
    // (a phone's notch/Dynamic Island, the home-indicator bar, rounded
    // corners). By default an app is LETTERBOXED inside it — the browser keeps
    // the box clear of the system chrome, the letterbox bars wear the app's
    // own fill (dom-backend attachRoot), and the four insets read 0. Declaring
    // `edges = cover` extends the app's box under the system chrome
    // (viewport-fit=cover, patched into the page's viewport meta at mount) and
    // the insets become live numbers — pinned chrome then places itself with
    // them (`y = { app.safeTop }`, a bottom bar's height + `app.safeBottom`).
    // Read at mount: `edges` is a fact about the app, not a runtime toggle.
    edges: enumType("Edges", "safe", "cover"),
    // The live safe-area insets, in pixels — 0 while letterboxed (edges=safe,
    // or any desktop browser), the device's real insets under `edges = cover`,
    // re-read on rotation. Fed by the runtime (boot.ts wireSafeArea).
    safeTop: { kind: "number" },
    safeBottom: { kind: "number" },
    safeLeft: { kind: "number" },
    safeRight: { kind: "number" },
    // How much of `hostHeight`'s bottom is the browser's own RETRACTABLE
    // chrome — the band a collapsed toolbar will re-cover, and where a tap
    // summons it back instead of reaching the app. Fed by the runtime
    // (boot.ts): `hostHeight` minus the layout viewport, never negative.
    underlapBottom: { kind: "number" },
    // The EMBEDDING ENVIRONMENT's parameters — a record the HOST provides and
    // keeps live (an island's slot marker carries `|k=v&k2=v2` after the
    // program path; host-client parses, coerces, and writes the whole record).
    // A hosted app reads them REACTIVELY (`app.env.dark`) exactly as it reads
    // `app.dark` — the clean pass-through for a desktop hosting a child app
    // and pushing its appearance (or anything else) down. `{}` when top-level
    // or when the host passes nothing, so reads never null-crash.
    env: { kind: "object" },
    // `location` — the app's slice of the URL, the FRAGMENT (docs/system-design/location.md).
    // A two-way built-in the host wires with `TextInput.text`'s echo discipline:
    // seeded from the URL fragment BEFORE first settle (a deep link is just an
    // initial state), mirrored outward per-settle (push history), and written back
    // by the host on back/forward. The app OWNS the grammar — an opaque string it
    // parses (`location.split("/")`) and produces (`app.location = "why"`). The
    // declared initial is the DEFAULT: the fragment is omitted whenever the app is
    // at it (§3), so a plain app that never writes it keeps a clean URL. Writable
    // by user code (navigation IS a write) and by the host (the seed / back-forward)
    // — a SCHEMA attr on purpose: §3's `App [ location = "home" ]` needs a checkable
    // [ ] slot (unlike the host-fed read-only channels, which live in LANGUAGE_API).
    location: { kind: "string" },
    // `waypoint` — the STEP: session state the Back button retraces but the URL
    // never shows. The second half of the history entry (the pair is location +
    // waypoint): the host carries it in the History entry's state object —
    // invisible to the address bar, autocomplete, sharing, and the crawl — and
    // writes it back on back/forward exactly as it writes `location`. The
    // dividing test: would you hand the value to a stranger? Yes → location
    // (it's an address); no, but Back should undo it → waypoint; neither →
    // an ordinary attribute. The app owns the grammar, same as location. A
    // pasted URL carries no waypoint (a recipient starts at the declared
    // initial); reload and session restore resume it (the entry survives).
    // Coordinates, never data: derive the data from the waypoint.
    waypoint: { kind: "string" },
    // NOTE: live demo editing is NOT a base-App concern (capabilities.md §7 —
    // RULED shape 3, a component). The app-authored state (editing / liveCard /
    // liveSource) is instance-declared on the demo-hosting apps; the host-fed
    // channels the apps still read (demoSources / liveReport) are interim App
    // runtime surface in scaffold.ts LANGUAGE_API (like navigate), never schema
    // attrs. pageWeight / sourceLines are host-client writes with no Declare
    // reader — not language surface at all.
    // NOTE: app→host navigation is the `navigate(to)` METHOD (view.ts App), not an
    // attribute — a link/button CALLS it in an activation handler (capabilities.md
    // §6). The runtime channel it writes (`pendingNav`) is a plain host-polled
    // field, deliberately not a schema attribute, so no Declare source names it.
    // the app's size floor: the auto-extent never derives below it — in a
    // narrower host the app holds the floor and the stage pans natively.
    // A declared policy (readable statically), not clamp math in a constraint.
    minWidth: { kind: "number" },
    minHeight: { kind: "number" },
    // `appName` — the app's human name; hosts surface it where names go (today:
    // the browser page title, mirrored per settle by host-client; the extractor
    // reads the SETTLED value for the crawled page's <title>). A literal
    // (`appName = "Declare Calendar"`) or a constraint (the viewer derives the
    // viewed file's name) — an ordinary reactive attr, so "dynamic title" is
    // not a mechanism, just a binding. "" (the default) = no opinion; the host
    // keeps its served title.
    appName: { kind: "string" },
    // `revealInset` — the scroll-margin analogue (location.md §0.5.4): a reveal
    // lands this many pixels short of the viewport top, clearing fixed chrome
    // (a 56px sticky header) without per-page marker views. One knob, app-wide.
    revealInset: { kind: "number" },
    // `crawlSeeds` — extra references the extraction crawl seeds beyond the
    // registry (location.md §0.8.2): computed locations worth emitting that no
    // rendered link reaches. An ordinary attribute; the extractor reads it at
    // t=0. Meaningless at runtime, harmless to set.
    crawlSeeds: { kind: "array" },
  },
  // The host-fed environment is read-only to user code (the runtime feeds it;
  // a set is a compile error) — like View's contentWidth/contentHeight. That
  // includes the page scroll offset and the free-pointer facts (boot.ts writes
  // them), and `env` (the HOST's record, delivered live — a program that wrote
  // it would be arguing with its host). `scrollY` here is App's OWN spec
  // (view.ts) — a dead write before this listing: App's spec shadows View's
  // pusher, so assigning it never moved the page anyway.
  readOnly: ["hostWidth", "hostHeight", "dark", "touchDevice", "hasTouch", "hasPointer", "lastPointerType", "safeTop", "safeBottom", "safeLeft", "safeRight", "underlapBottom", "scrollY", "pointerX", "pointerY", "pointerDown", "hovering", "pointerOverText", "env"],
  // `onFollow(ref) -> ref'` — the app-scoped arrival hook (location.md §0.6):
  // follow() applies it ONCE to every arrival — a linked view, a prose href, a
  // cold URL, back/forward — before routing. Return the reference to proceed
  // with; "" vetoes. Declared as an EVENT so the checker admits the handler;
  // unlike the pointer family it is called BY follow and returns a value.
  events: ["follow"],
};

// Text (R3): a text run sized by native browser metrics when width/height
// aren't given. Its style — textColor/fontSize/fontFamily/fontWeight — lives
// on View since the styling rung (prevailing: any container provides, the
// run renders with the effective values); `Text.color` is RETIRED into the
// one `textColor` slot (ruled — no alias). FontWeight is deliberately the
// two-token set the language doc uses; CSS's numeric weights can widen the
// union later without breaking these.
const TextSchema: ComponentSchema = {
  name: "Text",
  base: ViewSchema,
  attrs: {
    text: { kind: "string" },
    // The glyphs' drop shadow — the same shadow(…) value as the box slot.
    textShadow: { kind: "shadow" },
    // Wrapping (docs/system-design/text-and-markdown.md): a bounded-width run wraps by
    // default; `wrap = false` forces a single line. `textAlign` pairs with it.
    wrap: { kind: "boolean" },
    textAlign: enumType("TextAlign", "left", "center", "right"),
    italic: { kind: "boolean" },
    // Fill the glyphs with a gradient (or solid Fill), like the box `fill` —
    // overrides `textColor` when set. `textFill = { gradient("90deg", …) }`.
    textFill: { kind: "fill" },
    // Leading, as a MULTIPLIER of fontSize (the Markdown/RichText convention:
    // the line box is round(fontSize × lineHeight)). `0` — the default — means
    // the font's natural line box (ascent + descent), which is also what keeps
    // a single-line label's geometry byte-identical to the pre-attribute
    // rendering. Wrapped height, contentHeight, and the `y = center` ink band
    // all follow it.
    lineHeight: { kind: "number" },
    // Author-facing font metrics (compositing.md Part III) — read-only,
    // reactive intrinsics of the EFFECTIVE font, measured (not read from
    // tables — see text.ts). `baseline` is the y of the first baseline
    // inside the view, the cross-font/cross-size alignment fact.
    ascent: { kind: "number" },
    descent: { kind: "number" },
    capHeight: { kind: "number" },
    xHeight: { kind: "number" },
    baseline: { kind: "number" },
  },
  readOnly: ["ascent", "descent", "capHeight", "xHeight", "baseline"],
};

// Image (R3): an async-loaded bitmap. `stretches` is the first built-in
// enum-typed attribute — exactly the doc's `value Stretch = none | width |
// height | both` (language §6). The doc sketches `stretches` on View; it
// lives on Image until a plain View has something to stretch.
const ImageSchema: ComponentSchema = {
  name: "Image",
  base: ViewSchema,
  attrs: {
    source: { kind: "string" },
    // `cover`/`contain` (2026-08-06, assessment 1.1): the aspect-PRESERVING
    // fits — contain letterboxes inside the box, cover fills and crops it —
    // beside the axis stretches, which distort by design.
    stretches: enumType("Stretch", "none", "width", "height", "both", "cover", "contain"),
    // A color multiplied over the bitmap's ALPHA (compositing.md §3.4): the
    // one-mask-asset, many-colors idiom — result color = tint, shape = the
    // bitmap's alpha, exactly template-image rendering. null (the default) =
    // the untouched bitmap. `tint = { theme.accent }` is the canonical read.
    tint: { kind: "color" },
    // READ-ONLY (below): the load lifecycle as two facts, surfaced 2026-07-30
    // (David's ruling) when the network-transport tests found them unreadable
    // from constraints. `loaded` = a bitmap has landed (the placeholder
    // derives from it: `visible = { !pic.loaded }`); `failed` = the CURRENT
    // source's load failed (the broken-avatar fallback), reset when a new
    // load starts.
    loaded: { kind: "boolean" },
    failed: { kind: "boolean" },
    // The bitmap's intrinsic size — zero until `loaded`. What an aspect-true
    // layout derives from: `height = { pic.width * pic.naturalHeight / Math.max(1, pic.naturalWidth) }`.
    naturalWidth: { kind: "number" },
    naturalHeight: { kind: "number" },
  },
  readOnly: ["loaded", "failed", "naturalWidth", "naturalHeight"],
};
// Media (2026-08): the transport family's abstract base — the Editor/Stream
// arrangement (documented, inheritable, uninstantiable; in this table, not the
// tag registry). The transport is ATTRIBUTES rather than controls: `playing`
// and `position` are the two-way pair (author writes, runtime writes back, on
// the `scrollY` pattern); `duration`/`buffering` are facts to derive from. No
// player chrome ships here: a scrubber is an application. Video adds the
// picture; Audio adds nothing, which is the point.
const MediaSchema: ComponentSchema = {
  name: "Media",
  base: ViewSchema,
  attrs: {
    source: { kind: "string" },
    playing: { kind: "boolean" },
    loop: { kind: "boolean" },
    muted: { kind: "boolean" },
    position: { kind: "number" },
    volume: { kind: "number" },
    playbackRate: { kind: "number" },
    // READ-ONLY: the clip's own facts, for constraints to derive from
    ended: { kind: "boolean" },
    duration: { kind: "number" },
    buffering: { kind: "boolean" },
    loaded: { kind: "boolean" },
    failed: { kind: "boolean" },
  },
  readOnly: ["ended", "duration", "buffering", "loaded", "failed"],
  events: ["ended"],
};

// Video: Media plus the picture — Image's twin. The natural size arrives with
// the metadata; `stretches` is Image's vocabulary, same meanings.
const VideoSchema: ComponentSchema = {
  name: "Video",
  base: MediaSchema,
  attrs: {
    stretches: enumType("Stretch", "none", "width", "height", "both", "cover", "contain"),
  },
};

// Audio: Media with nothing to look at — a faceless leaf whose box means
// nothing. Its one schema-visible difference is behavioral, not structural:
// `muted` defaults FALSE (sound is its only product; autoplay refusal is
// handled by `playing` snapping back, not by shipping it silent).
const AudioSchema: ComponentSchema = {
  name: "Audio",
  base: MediaSchema,
  attrs: {},
};

// DOMIsland (foreign-content island): a leaf View whose BOX is owned by Declare — it
// lays out and obeys constraints like any view — but whose INTERIOR is
// host-managed foreign DOM (an iframe, a textarea, a <video>, a map widget).
// `slot` is a host key: the DOM backend reflects it as `data-declare-slot`, the
// host mounts DOM into the Declare-sized div, and Declare's width/height drive the
// tenant's size with no coordinate sync (canvas realizes it as a positioned
// DOM overlay — deferred). The one sanctioned escape to raw DOM, kept behind a
// named view so bodies stay DOM-free.
const DOMIslandSchema: ComponentSchema = {
  name: "DOMIsland",
  base: ViewSchema,
  attrs: {
    slot: { kind: "string" },
    // the reverse of `env` (host→child): the mounted child app's `appName`,
    // reflected UP by the host so a hosting window can title itself by the
    // child (the viewer names its window by the file it is showing). Host-fed,
    // like the read-only environment channels; "" until a child is up.
    childName: { kind: "string" },
  },
  // The host mirrors the child's name up (dom-backend name-mirror); a program
  // write would be overwritten at the child's next settle.
  readOnly: ["childName"],
};

// TextInput (Layer 3, docs/system-design/input.md): an editable text field — the first
// EDITOR (language §9, the leaf-input exception). `text` is the model/draft slot,
// realized as a native editable element (DOM in-box, canvas overlay) so
// caret/selection/IME/a11y are native (D-5). Two-way bound with `text <-> :path`:
// the draft reads the datapath and commits edits back into the dataset. Fires
// `input` on each edit and `enter` on a single-line submit.
// Editor (language §9, the leaf-input exception): the base for a component that
// two-way edits a dataset value via `<->`. Carries the edit-session surface — the
// draft's validity/error/dirtiness and WHEN it commits — so any editor (TextInput
// today, a Picker/DatePopup tomorrow) inherits it. Not written directly.
const EditorSchema: ComponentSchema = {
  name: "Editor",
  base: ViewSchema,
  attrs: {
    commitOn: { kind: "string" }, // "input" (live) | "blur" | "enter" | "manual"
    error: { kind: "string" },    // the current validation error, "" when valid
    valid: { kind: "boolean" },   // does the draft pass validate()?
    dirty: { kind: "boolean" },   // does the draft differ from the committed value?
    // Does the field hold keyboard focus? Maintained by the runtime, and the
    // fact the house field-chrome's own focus edge derives from — declared here
    // so an author who DISPLACES that chrome (assigning `fill`/`stroke`, the
    // yielding-derive escape) can still render the focus affordance. Read-only
    // (readOnly below): writing it would not move platform focus, `Focus.focus(v)` does.
    focused: { kind: "boolean" },
  },
  // The edit session's facts (editor.ts maintains them; user code reads and
  // derives — a write would silently be recomputed on the next keystroke).
  readOnly: ["error", "valid", "dirty", "focused"],
};

const TextInputSchema: ComponentSchema = {
  name: "TextInput",
  base: EditorSchema,
  attrs: {
    text: { kind: "string" },
    placeholder: { kind: "string" },
    multiline: { kind: "boolean" },
    spellcheck: { kind: "boolean" },
    wrap: { kind: "boolean" },
    padding: { kind: "number" },
    // The UNCONTROLLED seed (cf. React's defaultValue vs value): `text` follows
    // `initial` until the user edits, then holds the edit — for a field started
    // from a value (a pristine source) that must stay writable. Being one-shot
    // is the point AND the limit: once edited it stops following, so an app
    // cannot reset a field this way. A bound `text` is the CONTROLLED form —
    // the edit reverts and arrives as `onInput` instead, and a handler writing
    // the bound slot closes the loop (that is the shape that CAN clear a
    // field). Prefer `text <-> :path` for a field editing a dataset record.
    initial: { kind: "string" },
  },
  events: ["input", "enter"],
};

// RichText (docs/system-design/text-and-markdown.md): the ABSTRACT family of flowing,
// structured, styled text. Like `Layout`, it names no format — `RichText [ ]` is
// deliberately NOT in the name table (writing it reports "unknown component") —
// but it anchors the chain and holds what `Markdown` and `HTMLText` share: the
// prose tuning attributes and the `link` event. You always write one of its two
// concrete formats, which differ ONLY in how they parse their source.
export const RichTextSchema: ComponentSchema = {
  name: "RichText",
  base: ViewSchema,
  attrs: {
    // Prose tuning: `lineHeight` is a leading multiplier on the natural line box
    // (1 = tight, the default; 1.5 = airy); `bodyColor` overrides the running-text
    // color (null = the theme-aware house body). Body size/weight/tracking follow
    // the ambient text style (fontSize/fontWeight/letterSpacing), like a `Text`.
    lineHeight: { kind: "number" },
    bodyColor: { kind: "color" },
    // `scale` multiplies the house structure sizes (headings, code) — a font-size
    // zoom a reader control can drive; 1 = the natural sizes.
    scale: { kind: "number" },
    // `dark` overrides which color scheme the house rich-element palette (the
    // inline-code chip, the fenced-code box, rules, quotes) is drawn from. Unset
    // (null) follows the root App's OS `dark`; set it to an app's OWN effective
    // theme when a Light/Dark selector can differ from the OS: `dark = { app.isDark }`.
    dark: { kind: "boolean" },
  },
  // A link (`[text](url)` / `<a href>`) was clicked — `onLink(href)`. The runtime
  // supplies mechanism only (the click + href); the app dispatches policy (scroll,
  // route, or `app.navigate(href)`). Unhandled links fall back to `app.navigate(href)`.
  events: ["link"],
};

// Markdown: rich content authored in Markdown (`text`), parsed (md.ts) to the
// block tree the RichText engine renders — literal or computed/streamed, reactive.
const MarkdownSchema: ComponentSchema = {
  name: "Markdown",
  base: RichTextSchema,
  attrs: {
    text: { kind: "string" },
  },
};

// HTMLText: the sibling of Markdown for content authored (or LOADED) as a
// WHITELISTED HTML subset. `html` is parsed at render time against a fixed tag
// set (html.ts) into the SAME block tree Markdown renders. `unsupported` chooses
// the behaviour for a tag outside the set — `strip` (unwrap, keep text) or
// `error` (throw) — so loaded/untrusted content is never silently mangled.
const HTMLTextSchema: ComponentSchema = {
  name: "HTMLText",
  base: RichTextSchema,
  attrs: {
    html: { kind: "string" },
    unsupported: enumType("Unsupported", "strip", "error"),
    // Named text fills a `<span class="…">` can reference — a map of name → Fill
    // (`accents = { { accent: gradient("90deg", 0x…, 0x…) } }`). The one styling
    // hook: content names a fill the app defines; it never carries CSS itself.
    accents: { kind: "record", name: "Accents" },
  },
};

// Layout strategies (R7). The abstract base IS in the name table so a class
// may extend it (`class X extends Layout [ place() { … } ]` — a strategy
// authored in Declare, library or app); writing `layout: Layout [ ]` as a USE
// names no arrangement and reports a pointed error (checkComponentValue).
// SimpleLayout is the stacking idiom: siblings along `axis`, `spacing` apart
// (negative overlaps), invisible skipped.
const LayoutSchema: ComponentSchema = {
  name: "Layout",
  base: NodeSchema,
  attrs: {},
};

// TweenLayout (R7) — the animated-reflow base a custom layout extends to glide
// its children between two whole layouts through one scalar `t` (layout.ts). A
// subclass supplies place() and its own state attributes; `from`/`to` are
// MACHINERY, not surface: `retarget()` overwrites both from the children's live
// geometry on every transition, and no program reads them — they live in cells so
// the layout can react, which is not the same as being an attribute. (Not for want
// of a kind: `array` would express them. The test is whether an author reads it —
// which is where DataSource's lifecycle differed, being taught in the guide and
// read across the corpus while declared nowhere.) `t` and `duration` are the knobs. The primary
// forcing case for user-written layouts (§5 "…and ones you write").
const TweenLayoutSchema: ComponentSchema = {
  name: "TweenLayout",
  base: LayoutSchema,
  attrs: {
    t: { kind: "number" },
    duration: { kind: "number" },
  },
};

// Data nodes (R8, language §9). A Dataset holds embedded JSON — its body is
// the raw `{ }` region — OR derives its value from `contents = { … }`, a
// constraint over other reactive state (a derived collection: recompute is
// dep-gated, and keyed replication turns the new value into O(changed) view
// work). A DataSource is a Dataset whose value arrives from `url`. Their
// lifecycle state is DECLARED, and marked `readOnly` — read-only is exactly
// what that field is for (View.hovered, App.dark and Stream.status all do
// this). It was once omitted instead, reasoning that "not author-settable"
// meant "absent"; the cost was that `.value`, `.loaded` and the rest reached
// no generated reference at all, so declare-model.json denied attributes the
// guide teaches. Neither is a View: they
// sit in the tree as named members with no visual incarnation (descendsFrom
// "Dataset" is the checker's data-node test, like "Layout" for strategies).
const DatasetSchema: ComponentSchema = {
  name: "Dataset",
  base: NodeSchema,
  // `contents` is a derived Dataset's value, always a `{ }` constraint (the
  // JSON body is the literal alternative). checkDataNode enforces the `{ }`
  // form and a code value bypasses `kind` in checkAttr — but the TYPED
  // surface flows from this kind, so it is `object` (any): a derived
  // dataset computes arbitrary structure (the records door made the old
  // `string` formality a real typecheck error).
  attrs: {
    contents: { kind: "object" },
    // The optional data shape (B4, language §9): validate on receipt, check
    // `:path`s statically, declare the identity field. Presence is the only
    // switch — the `:path` surface never changes.
    schema: { kind: "dataschema" },
    // The parsed data itself. `contents` is the author's WRITE slot; this is
    // the read one, and the structural verbs (set/insert/removeAt/move) are
    // how it changes.
    value: { kind: "object" },
  },
  readOnly: ["value"],
};

// Node — the plain object-graph atom, exposed as a user-subclassable base. A
// `class X [ … ]` (base defaulting to Node) or `class X extends Node [ … ]` is
// a non-visual node with author-declared attributes and methods: a controller,
// a service, a coordinator (the base schema is empty; the CLASS supplies its
// own decls, exactly as a View subclass does). `descendsFrom "Node"` is the
// test that admits these — and ONLY these: View/Layout have their own roots,
// and Dataset/Animator/State keep theirs, so this does not silently open them.
const DataSourceSchema: ComponentSchema = {
  name: "DataSource",
  base: DatasetSchema,
  attrs: {
    url: { kind: "string" },
    // "json" (default) or "text" — what the fetched bytes are (data.ts).
    format: { kind: "string" },
    // "GET" (default) or a body-carrying verb — a non-GET sends `body` (A9).
    method: { kind: "string" },
    // the non-GET request payload: an object/array (JSON-encoded) or a string.
    body: { kind: "object" },
    // auto-fetch on url arrival/change (data.ts maybeAuto) — the opt-in for
    // REACTIVE addresses; explicit fetch() stays the default discipline.
    auto: { kind: "boolean" },
    // "same-origin" (default) or "include" or "omit" - how to handle auth, 
    // matches the Browser's Fetch API's credentials modes,
    credentials: { kind: "string" },
    // ── the lifecycle, read-only (see the note above DatasetSchema) ────────
    // One fact, four spellings: `status` is the state and the booleans derive
    // from it, so they can never disagree. Constraints read these — an entry
    // screen is `visible = { !data.loaded }`, not a flag someone remembers to
    // flip.
    status: enumType("DataStatus", "idle", "loading", "loaded", "failed"),
    idle: { kind: "boolean" },
    loading: { kind: "boolean" },
    loaded: { kind: "boolean" },
    failed: { kind: "boolean" },
    // What went wrong as one line, and what the SERVER said, kept apart:
    // `statusCode` is 0 until a reply arrives (distinct from every real code),
    // `errorBody` is the refusal's payload, parsed when it is JSON.
    error: { kind: "string" },
    statusCode: { kind: "number" },
    errorBody: { kind: "object" },
  },
  readOnly: ["status", "idle", "loading", "loaded", "failed", "error", "statusCode", "errorBody"],
  // fired when a fetch lands, after value+status settle — the imperative
  // arrival hook (constraints keep deriving from .loaded)
  events: ["load"],
};

// Animation v1 (animation.md §1). An Animator is an ordinary twin-table
// component — schema here, runtime class in instantiate.ts — NOT a keyword.
// Like Dataset it is a non-visual node (base null: it descends from nothing,
// and `descendsFrom(schema, "Animator")` is the checker's animator test), but
// unlike Dataset it carries the on* handlers (its `events`) and built-in
// start()/stop(). `attribute` is the one slotref (the target slot it drives,
// numeric-checked against the target at the element walk); `target` is not
// surface in v1 (it defaults to the parent node). `from` is number-typed —
// omit it to sample the target's current value; the runtime default is null.
const AnimatorSchema: ComponentSchema = {
  name: "Animator",
  base: NodeSchema,
  attrs: {
    attribute: { kind: "slotref" },
    to: { kind: "number" },
    from: { kind: "number" },
    duration: { kind: "number" },
    repeat: { kind: "number" },
    motion: { kind: "motion" },
    relative: { kind: "boolean" },
    started: { kind: "boolean" },
    paused: { kind: "boolean" },
    // ARRIVAL as a reactive fact (animator.ts) — the animation twin of a
    // DataSource's .loaded: true only at an uninterrupted destination.
    settled: { kind: "boolean" },
  },
  // The animator computes arrival; a program write would be overwritten by the
  // very next tick. Start/stop are the verbs; `settled` is the fact.
  readOnly: ["settled"],
  // Bare event names (like View's ["click", …]); handlerName() prefixes `on`,
  // so these answer the onStart / onStop / onRepeat handlers (animation.md §1).
  events: ["start", "stop", "repeat"],
};

// AnimatorGroup (animation.md §1, §4) — coordinates several animators, running
// them `sequential` (default) or `simultaneous`. Its own animatable attrs (to /
// from / duration / motion / relative / attribute) are the LZX default-cascade:
// a member that omits one inherits the group's. A separate twin-table entry
// (base null, like Animator) with its own family test `descendsFrom(schema,
// "AnimatorGroup")`; the checker routes a group to checkAnimatorGroupNode (its
// members are animators, not arbitrary children) with the group's target in
// context, and cascades the target through to its members.
const AnimatorGroupSchema: ComponentSchema = {
  name: "AnimatorGroup",
  base: NodeSchema,
  attrs: {
    attribute: { kind: "slotref" },
    to: { kind: "number" },
    from: { kind: "number" },
    duration: { kind: "number" },
    repeat: { kind: "number" },
    motion: { kind: "motion" },
    process: enumType("Process", "sequential", "simultaneous"),
    relative: { kind: "boolean" },
    started: { kind: "boolean" },
    paused: { kind: "boolean" },
  },
  events: ["start", "stop", "repeat"],
};

// Spring (the follow half of the animation family) — a twin-table component
// that DESCENDS FROM Animator (base below), so the checker validates its
// `attribute` slotref against the target through the same animator path and it
// inherits `attribute`/`to`. Unlike Animator it drives its slot toward a LIVE,
// reactive `to` via spring physics; its own controls are the spring constants.
const SpringSchema: ComponentSchema = {
  name: "Spring",
  base: AnimatorSchema,
  attrs: {
    stiffness: { kind: "number" },
    damping: { kind: "number" },
    mass: { kind: "number" },
    epsilon: { kind: "number" },
  },
};

// Heartbeat (heartbeat.ts) — the frame heartbeat as a component: a non-visual member
// that calls `onFrame(dt)` once per animation frame while `running`. Springs and
// Animators are the DECLARATIVE half of motion (say where a thing belongs); this
// is the raw heartbeat an app running its own integrator needs — custom gesture
// physics, a simulation, a game loop. A component rather than a new subscription
// operator: an event is just a member that gets called, and non-visual members
// are a category the language already has.
const HeartbeatSchema: ComponentSchema = {
  name: "Heartbeat",
  base: NodeSchema,
  attrs: {
    running: { kind: "boolean" },
  },
  events: ["frame"],
};

// The runtime SERVICES as components (sources.ts): non-visual members whose
// handlers are called from outside the tree. Each declares the events it calls;
// a handler for one it doesn't is the ordinary typo'd-handler error. Fan-out is
// by instance — a menu, a dialog, and a menubar each holding a `Keys` member
// all hear the keyboard at once.
const KeysSchema: ComponentSchema = {
  name: "Keys",
  base: NodeSchema,   // via the abstract Source (sources.ts)
  attrs: {},
  // navClaim: an overlay took (true) / released (false) the navigation keys
  // (keys.ts navClaim) — what a focus indicator stands down for.
  events: ["keyDown", "keyUp", "navClaim"],
};

const FocusSchema: ComponentSchema = {
  name: "Focus",
  base: NodeSchema,   // via the abstract Source (sources.ts)
  attrs: {},
  events: ["focusChange", "geometry"],
};

const TipSchema: ComponentSchema = {
  name: "Tip",
  base: NodeSchema,   // via the abstract Source (sources.ts)
  attrs: {},
  events: ["tip"],
};

// Streams (docs/system-design/streams.md, RULED 2026-07-29) — SSE and
// WebSocket as sources. One family, three names: the abstract `Stream` base
// carries the whole shared surface, and sits in this table but NOT the tag
// registry — documented, inheritable, uninstantiable, exactly the Editor
// arrangement. `EventStream` is SSE; `Socket` is WebSocket plus send().
// status/error/open/last are READ-ONLY lifecycle intrinsics (the
// DataSource.status/.loaded design: one fact, boolean views, never in
// disagreement) — computed for you, a compile error to assign. `retry` is
// the ruled reconnect policy: seconds between attempts after a loss the
// platform won't repair itself, visible in the declaration; 0 = none.
const StreamSchema: ComponentSchema = {
  name: "Stream",
  base: NodeSchema,
  attrs: {
    url: { kind: "string" },
    active: { kind: "boolean" },
    retry: { kind: "number" },
    status: enumType("StreamStatus", "closed", "connecting", "open", "retrying", "failed"),
    error: { kind: "string" },
    last: { kind: "string" },
    open: { kind: "boolean" },
  },
  readOnly: ["status", "error", "last", "open"],
  events: ["message", "open", "close", "error"],
};

const EventStreamSchema: ComponentSchema = {
  name: "EventStream",
  base: StreamSchema,
  attrs: {
    // the named SSE event types to deliver (`listenTo = ["delta", "done"]`)
    // — EventSource cannot hear a named `event:` it was not asked for
    // (streams.md §2), and omission is SILENT, which is why the name carries
    // the contract: you hear what you listen to. Unnamed (default) messages
    // always arrive.
    listenTo: { kind: "array", of: "string" },
  },
};

const SocketSchema: ComponentSchema = {
  name: "Socket",
  base: StreamSchema,
  attrs: {},
};

// State (docs/system-design/states.md) — a twin-table component like Animator:
// non-visual (base null; family test descendsFrom(schema, "State")), carrying
// the one control attribute `applied` and the built-in verbs apply()/remove()/
// toggle() + on* handlers. Its BODY is special and does NOT check through the
// generic walk: `name = value` entries are OVERRIDES validated against the
// ENCLOSING view's schema, and `id: Type [ … ]` entries are a conditional
// child subtree destined for that view — so the checker routes a State node to
// checkStateNode (increment 1b), with the enclosing view's schema in context.
const StateSchema: ComponentSchema = {
  name: "State",
  base: NodeSchema,
  attrs: {
    applied: { kind: "boolean" },
  },
  events: ["apply", "remove"],
};

/** Tag → schema: the checker's component registry. Must stay in step with
 *  instantiate.ts's tag → class table (layout strategies with its layout
 *  table, data nodes with its data table, animators with its animator table);
 *  R6 registers user classes into both. */
export const SCHEMAS: Readonly<Record<string, ComponentSchema>> = {
  View: ViewSchema,
  App: AppSchema,
  Text: TextSchema,
  Image: ImageSchema,
  // Media — the abstract transport base Video and Audio extend (playing/
  // position/duration/volume live here). In the table so the reference can
  // give it a page and the leaves inherit from a documented class; NOT in the
  // tag registry, so it stays uninstantiable — exactly Editor's arrangement.
  Media: MediaSchema,
  Video: VideoSchema,
  Audio: AudioSchema,
  DOMIsland: DOMIslandSchema,
  TextInput: TextInputSchema,
  Markdown: MarkdownSchema,
  HTMLText: HTMLTextSchema,
  Layout: LayoutSchema,
  // Editor — the abstract editing base TextInput extends (commitOn/error/valid/
  // dirty and commit()/revert() live here). In the table so the reference can
  // give it a page and TextInput can inherit from a documented class; NOT in the
  // tag registry, so it stays uninstantiable — exactly Layout's arrangement.
  Editor: EditorSchema,
  TweenLayout: TweenLayoutSchema,
  Dataset: DatasetSchema,
  DataSource: DataSourceSchema,
  Animator: AnimatorSchema,
  AnimatorGroup: AnimatorGroupSchema,
  Spring: SpringSchema,
  Heartbeat: HeartbeatSchema,
  Keys: KeysSchema,
  Focus: FocusSchema,
  Tip: TipSchema,
  // Stream — the abstract base EventStream/Socket extend (url/active/retry +
  // the read-only lifecycle intrinsics live here). In the table so the
  // reference documents it once and subclasses inherit checkably; NOT in the
  // tag registry, so it stays uninstantiable — the Editor arrangement.
  Stream: StreamSchema,
  EventStream: EventStreamSchema,
  Socket: SocketSchema,
  State: StateSchema,
  Node: NodeSchema,
};

/** Does `schema`'s inheritance chain pass through a component named
 *  `ancestor`? The checker's kind test — "is this tag a Layout?", "may a
 *  class extend this base?" — kept name-based so per-program schema copies
 *  need no object identity discipline (names are unique per program). */
export function descendsFrom(schema: ComponentSchema, ancestor: string): boolean {
  for (let s: ComponentSchema | null = schema; s !== null; s = s.base) {
    if (s.name === ancestor) return true;
  }
  return false;
}

/** The declared type of `name` on `schema`, walking the inheritance chain;
 *  null when no ancestor declares it. Own-key lookups, so an attribute named
 *  `toString` can't resolve through Object.prototype. */
export function attrType(schema: ComponentSchema, name: string): AttrType | null {
  for (let s: ComponentSchema | null = schema; s !== null; s = s.base) {
    if (Object.hasOwn(s.attrs, name)) return s.attrs[name];
  }
  return null;
}

/** Is `name` a read-only attribute anywhere on this schema's base chain — a
 *  computed/intrinsic slot a constraint may read but nothing may set? Walks the
 *  chain exactly like attrType (a subclass inherits its base's read-only slots). */
export function isReadOnly(schema: ComponentSchema, name: string): boolean {
  for (let s: ComponentSchema | null = schema; s !== null; s = s.base) {
    if (s.readOnly?.includes(name)) return true;
  }
  return false;
}


/** Is `name` a prevailing attribute on `schema` (or its chain)? Asked of the
 *  schema that DECLARES the name — being prevailing is part of the slot's
 *  identity, so the declaring schema's word is the whole answer. */
export function isPrevailing(schema: ComponentSchema, name: string): boolean {
  for (let s: ComponentSchema | null = schema; s !== null; s = s.base) {
    if (Object.hasOwn(s.attrs, name)) return s.prevailing?.includes(name) ?? false;
  }
  return false;
}

/** The handler member name for an event: click → onClick (language §8's
 *  `on` prefix — the one naming rule, shared by the checker and dispatch). */
export const handlerName = (event: string): string =>
  "on" + event[0].toUpperCase() + event.slice(1);

/** The event a handler-shaped name answers (onClick → click), or null when
 *  the name is not handler-shaped. Handler-shaped is exactly `on` + a
 *  capital (the doc's rule — what keeps handlers out of the plain-method
 *  namespace), so `once` or `onward` are plain method names. */
/** EVENT NAME → the payload type its handler receives, as a TYPE NAME the
 *  scaffold can emit. Absent = the handler takes nothing.
 *
 *  Flat and global rather than per-schema because event names mean one thing
 *  across the language: `keyDown` is a KeyEvent whether it fires on a focused
 *  View or on a `Keys` member; `start`/`stop`/`repeat` mean the same on an
 *  Animator and an AnimatorGroup. The payload shapes themselves live in
 *  events.ts (the pointer family), keys.ts (KeyEvent), tip.ts (TipEvent) and
 *  focus.ts (FocusGeometry) — this table is only the mapping.
 *
 *  This is what makes a handler's parameter checkable: the scaffold emits each
 *  event's handler on the declaring class with this signature, so a user
 *  handler that writes a WRONG type is an override mismatch (TS2416), exactly
 *  as TypeScript treats any other override. */
export const EVENT_PAYLOAD: Readonly<Record<string, string>> = {
  // the single-point pointer family — view-local or root-space per handler
  click: "PointerEvent", dblClick: "PointerEvent", hold: "PointerEvent",
  contextMenu: "PointerEvent",
  pointerDown: "PointerEvent", pointerMove: "PointerEvent",
  pointerOver: "PointerEvent", pointerOut: "PointerEvent",
  pointerUp: "PointerUpEvent",                       // …plus `canceled`
  touchStart: "TouchEvent", touchMove: "TouchEvent",
  touchEnd: "TouchEvent", touchCancel: "TouchEvent",
  pinchStart: "PinchEvent", pinch: "PinchEvent", pinchEnd: "PinchEvent",
  wheel: "WheelEvent",
  // the keyboard — the same normalized payload on a View and on `Keys`
  keyDown: "KeyEvent", keyUp: "KeyEvent",
  // value-carrying events
  input: "string",                                 // TextInput: the new text
  navClaim: "boolean",                             // Keys: an overlay took/released the nav keys
  link: "string",                                  // RichText: the href
  follow: "string",                                // App: the reference being followed (onFollow returns the one to proceed with; "" vetoes)
  frame: "number",                                 // Heartbeat: dt, in SECONDS
  focusChange: "View",                             // Focus: the newly focused view
  geometry: "FocusGeometry",
  tip: "TipEvent",
  message: "StreamMessage",                        // Stream: data/type/id (streams.ts)
  // payload-free: focus, blur, escapeFocus, init, enter, load,
  // start, stop, repeat, apply, remove, open, close, error
};

/** The payload TYPE NAMES, for "is this a legal written signature type?".
 *  Derived from the table so the two cannot drift. */
export const PAYLOAD_TYPE_NAMES: ReadonlySet<string> = new Set([
  ...Object.values(EVENT_PAYLOAD),
  "Touch",                      // reachable through TouchEvent.touches
  "Draw", "DrawGradient",       // the `draw(d: Draw)` context (draw.ts)
]);

export function eventOfHandler(name: string): string | null {
  if (name.length < 3 || !name.startsWith("on") || name[2] < "A" || name[2] > "Z") return null;
  return name[2].toLowerCase() + name.slice(3);
}

/** Every event `schema` answers, base-first — the inheritance walk of
 *  attrType, over the events half of the declaration. */
export function eventsOf(schema: ComponentSchema): string[] {
  const out: string[] = [];
  for (let s: ComponentSchema | null = schema; s !== null; s = s.base) {
    if (s.events !== undefined) out.unshift(...s.events);
  }
  return out;
}

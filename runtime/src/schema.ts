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
const ViewSchema: ComponentSchema = {
  name: "View",
  base: null,
  attrs: {
    x: { kind: "length" },
    y: { kind: "length" },
    width: { kind: "length" },
    height: { kind: "length" },
    fill: { kind: "fill" },
    cornerRadius: { kind: "number" },
    stroke: { kind: "stroke" },
    shadow: { kind: "shadow" },
    visible: { kind: "boolean" },
    opacity: { kind: "number" },
    clip: { kind: "shape" },
    // Scroll: a view that scrolls its overflowing content — clips to its box and
    // scrolls the vertical overflow, exposing `scrollY` (reactive: read it for
    // scroll-driven effects — a fading header, reveals). Chrome stays fixed for
    // free simply by being a SIBLING of the scroller, not a child of it. Both
    // backends realize it natively (DOM `overflow`; canvas clip+translate+wheel).
    scrolls: { kind: "boolean" },
    scrollY: { kind: "number" },
    // Styling: the ruled prevailing built-ins — the four text-style slots
    // (declared on View so any container can provide them; Text renders with
    // the effective values) and the theme token record. NOT prevailing, by
    // ruling: backgroundColor/opacity/visible (their effect already composes
    // through the render tree — a followed copy would apply it twice).
    textColor: { kind: "color" },
    fontSize: { kind: "number" },
    fontFamily: { kind: "font" },
    // The formalized weight vocabulary (shared with the `font` declaration's
    // face keys): the CSS 100–900 tokens plus the `normal`/`bold` aliases.
    // fontString maps each to its numeric CSS weight, which also PICKS the
    // matching web face when a `font` provides several.
    fontWeight: enumType("FontWeight", "thin", "extralight", "light", "regular",
      "normal", "medium", "semibold", "bold", "extrabold", "black"),
    // Tracking (canvas-native: ctx.letterSpacing / CSS letter-spacing), in px;
    // 0 = the browser's natural advances (the Flash auto-tracking stays shed).
    letterSpacing: { kind: "number" },
    theme: { kind: "record", name: "Theme" },
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
    // Keyboard focus (design-docs/input.md, Layer 2): `focusable` = a tab stop;
    // `focustrap` = a self-contained focus group (Tab cycles within, escapes at
    // the boundary). Traversal order is the view tree (no numeric tabindex),
    // customized by overriding the `tabOrder()` method.
    focusable: { kind: "boolean" },
    focustrap: { kind: "boolean" },
    // Read-only intrinsics — the auto-extent computation (view.ts), surfaced:
    // the bounding-box extent of this view's visible children on each axis. A
    // constraint may READ them to clamp a size (`height = { Math.min(
    // contentHeight, 480) }`); they are never set (see readOnly below — the
    // runtime backs them with getters, not stored slots).
    contentWidth: { kind: "length" },
    contentHeight: { kind: "length" },
  },
  prevailing: ["textColor", "fontSize", "fontFamily", "fontWeight", "letterSpacing", "theme", "stylesheet"],
  readOnly: ["contentWidth", "contentHeight"],
  // R5: the pointer trio (click = press and release on the same view — the
  // shared router's rule, input.ts) plus the construction-complete lifecycle
  // event `init` (Appendix A's onInit). Hover (mouseOver/Out) waits for its
  // consuming rung — it needs retained enter/leave tracking, not just a
  // per-event hit test.
  events: ["click", "mouseDown", "mouseUp", "mouseMove", "mouseOver", "mouseOut", "init", "focus", "blur", "escapeFocus", "keyDown", "keyUp"],
};

// App is a View with stage-level behavior; it declares nothing extra yet
// (its title/stage attributes arrive with the rungs that give them meaning).
// App is the stage: beyond a root View it carries the reactive environment a
// full-window app reads — the viewport size (responsive layout), the page
// scroll offset (reveal/parallax/appearing chrome), and the free pointer
// (cursor effects, hover-at-a-distance). All are plain reactive attributes,
// so `{ classroot.stageWidth }` / `{ classroot.scrollY }` just work; the
// runtime feeds them from window listeners at mount (index.ts wireStage).
const AppSchema: ComponentSchema = {
  name: "App",
  base: ViewSchema,
  attrs: {
    stageWidth: { kind: "number" },
    stageHeight: { kind: "number" },
    scrollY: { kind: "number" },
    pointerX: { kind: "number" },
    pointerY: { kind: "number" },
    hovering: { kind: "boolean" },
    pointerOverText: { kind: "boolean" },
    pageWeight: { kind: "number" },
    sourceLines: { kind: "number" },
    editing: { kind: "boolean" },
    editSource: { kind: "string" },
    // Host↔app data channel for the live demo cards: the host seeds every
    // editor from `demoSources` (a name→source map), and an edit publishes the
    // new text on `liveSource`/`liveCard` for the host to recompile that preview.
    // (Typed as the open `Theme` record for `{ }` reads — see language-learnings
    // §11: neo lacks a purpose-named map attr kind yet.)
    demoSources: { kind: "record", name: "Theme" },
    liveCard: { kind: "string" },
    liveSource: { kind: "string" },
    // app→host navigation: a link/button sets `navigate` to a URL; the host
    // opens it and clears the flag (bodies are DOM-free, so navigation rides a
    // flag like `editing`, not window.location).
    navigate: { kind: "string" },
  },
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
    // Wrapping (design/text-and-markdown.md): a bounded-width run wraps by
    // default; `wrap = false` forces a single line. `textAlign` pairs with it.
    wrap: { kind: "boolean" },
    textAlign: enumType("TextAlign", "left", "center", "right"),
    italic: { kind: "boolean" },
    // Fill the glyphs with a gradient (or solid Fill), like the box `fill` —
    // overrides `textColor` when set. `textFill = { gradient("90deg", …) }`.
    textFill: { kind: "fill" },
    // Opt back into native text selection: `selectable = true` makes this run
    // selectable/copyable; off by default so the app doesn't feel like a document.
    selectable: { kind: "boolean" },
  },
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
    stretches: enumType("Stretch", "none", "width", "height", "both"),
  },
};

// HTML (foreign-content island): a leaf View whose BOX is owned by neo — it
// lays out and obeys constraints like any view — but whose INTERIOR is
// host-managed foreign DOM (an iframe, a textarea, a <video>, a map widget).
// `slot` is a host key: the DOM backend reflects it as `data-neo-slot`, the
// host mounts DOM into the neo-sized div, and neo's width/height drive the
// tenant's size with no coordinate sync (canvas realizes it as a positioned
// DOM overlay — deferred). The one sanctioned escape to raw DOM, kept behind a
// named view so bodies stay DOM-free.
const HtmlSchema: ComponentSchema = {
  name: "HTML",
  base: ViewSchema,
  attrs: {
    slot: { kind: "string" },
  },
};

// TextInput (Layer 3, design-docs/input.md): an editable text field. A focus
// client whose `text` is the model source of truth (no two-way operator — D-6
// dropped), realized as a native editable element (DOM in-box, canvas overlay)
// so caret/selection/IME/a11y are native (D-5). Fires `input` on each edit and
// `enter` on a single-line submit; inherits View's focus/keyboard events.
const TextInputSchema: ComponentSchema = {
  name: "TextInput",
  base: ViewSchema,
  attrs: {
    text: { kind: "string" },
    placeholder: { kind: "string" },
    multiline: { kind: "boolean" },
    spellcheck: { kind: "boolean" },
    wrap: { kind: "boolean" },
    padding: { kind: "number" },
    // The UNCONTROLLED seed (cf. React's defaultValue vs value): `text` follows
    // `initial` until the user edits, then holds the edit — for a field started
    // from a value (a pristine source) that must stay writable. A bound `text`
    // stays the CONTROLLED form (edits revert).
    initial: { kind: "string" },
  },
  events: ["input", "enter"],
};

// Markdown (design/text-and-markdown.md): rich content authored in Markdown.
// `text` is parsed (md.ts) to a block tree and rendered as a vertical stack of
// wrapped, prose-styled views — literal or computed/streamed, rendered
// reactively. A View subclass, so it carries the box/layout surface too.
const MarkdownSchema: ComponentSchema = {
  name: "Markdown",
  base: ViewSchema,
  attrs: {
    text: { kind: "string" },
  },
};

// Layout strategies (R7). The abstract base is deliberately NOT in the name
// table — `layout: Layout [ ]` names no arrangement, so writing it reports
// "unknown component" — but it anchors the chain descendsFrom() walks and the
// strategies' shared surface. SimpleLayout is the stacking idiom: siblings
// along `axis`, `spacing` apart (negative overlaps), invisible skipped.
const LayoutSchema: ComponentSchema = {
  name: "Layout",
  base: null,
  attrs: {},
};

const SimpleLayoutSchema: ComponentSchema = {
  name: "SimpleLayout",
  base: LayoutSchema,
  attrs: {
    axis: enumType("Axis", "x", "y"),
    spacing: { kind: "number" },
  },
};

// WrappingLayout — a horizontal flow that wraps to new rows as the view narrows
// (SimpleLayout[x] when there's room). `lineSpacing` defaults to `spacing`.
const WrappingLayoutSchema: ComponentSchema = {
  name: "WrappingLayout",
  base: LayoutSchema,
  attrs: {
    spacing: { kind: "number" },
    lineSpacing: { kind: "number" },
  },
};

// TweenLayout (R7) — the animated-reflow base a custom layout extends to glide
// its children between two whole layouts through one scalar `t` (layout.ts). A
// subclass supplies place() and its own state attributes; `from`/`to` are
// runtime-internal (arrays, set by retarget — no author-settable kind, so not
// surface here), leaving `t` and `duration` as the settable knobs. The primary
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
// the raw `{ }` region, so it declares no attributes; a DataSource is a
// Dataset whose value arrives from `url`. Their lifecycle state (value,
// status, error) is runtime surface read from bindings, not author-settable
// attributes — hence absent here. Neither is a View: they sit in the tree as
// named members with no visual incarnation (descendsFrom "Dataset" is the
// checker's data-node test, like "Layout" for strategies).
const DatasetSchema: ComponentSchema = {
  name: "Dataset",
  base: null,
  attrs: {},
};

// Node — the plain object-graph atom, exposed as a user-subclassable base. A
// `class X [ … ]` (base defaulting to Node) or `class X extends Node [ … ]` is
// a non-visual node with author-declared attributes and methods: a controller,
// a service, a coordinator (the base schema is empty; the CLASS supplies its
// own decls, exactly as a View subclass does). `descendsFrom "Node"` is the
// test that admits these — and ONLY these: View/Layout have their own roots,
// and Dataset/Animator/State keep theirs, so this does not silently open them.
const NodeSchema: ComponentSchema = {
  name: "Node",
  base: null,
  attrs: {},
};

const DataSourceSchema: ComponentSchema = {
  name: "DataSource",
  base: DatasetSchema,
  attrs: {
    url: { kind: "string" },
  },
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
  base: null,
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
  },
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
  base: null,
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

// State (design-docs/states.md) — a twin-table component like Animator:
// non-visual (base null; family test descendsFrom(schema, "State")), carrying
// the one control attribute `applied` and the built-in verbs apply()/remove()/
// toggle() + on* handlers. Its BODY is special and does NOT check through the
// generic walk: `name = value` entries are OVERRIDES validated against the
// ENCLOSING view's schema, and `id: Type [ … ]` entries are a conditional
// child subtree destined for that view — so the checker routes a State node to
// checkStateNode (increment 1b), with the enclosing view's schema in context.
const StateSchema: ComponentSchema = {
  name: "State",
  base: null,
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
  HTML: HtmlSchema,
  TextInput: TextInputSchema,
  Markdown: MarkdownSchema,
  SimpleLayout: SimpleLayoutSchema,
  WrappingLayout: WrappingLayoutSchema,
  TweenLayout: TweenLayoutSchema,
  Dataset: DatasetSchema,
  DataSource: DataSourceSchema,
  Animator: AnimatorSchema,
  AnimatorGroup: AnimatorGroupSchema,
  Spring: SpringSchema,
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

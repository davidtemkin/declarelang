// RichText — the engine under the rich content components, Markdown (markdown.ts)
// and HTMLText (html-text.ts); docs/system-design/text-and-markdown.md. Each
// component reads its own source into the one block tree (md.ts, html.ts) and
// this module renders it: styled by the `prose` defaults and the face slots,
// REACTIVE (a Constraint over the source and the width re-renders when either
// changes, so a computed or streamed value renders live and a resize re-flows).
//
// Block layout is a deterministic y-cursor (measure each block, place at an
// absolute offset — no nested auto-size ordering). The INLINE tier is a
// multi-run flow (TextFlow): a paragraph's styled runs (strong/em/code/link/
// strike) wrap together across style boundaries. A renderer with a text engine
// of its own (the DOM, the Mac) is handed the runs and flows them natively; on
// canvas the flow lays them out itself, one `Text` per styled piece (plus a
// chip behind code, a rule through strike), by the same arithmetic.

import { View, onDiscard, fireEvent, inlineViewHost } from "./view.js";
import { Image } from "./image.js";
import { isStructural, type RenderBackend, type RichBlock, type RichNode, type RichRun, type SlotBox, type Surface } from "./backend.js";
import { Layout, type Box } from "./layout.js";
import { Cell, Constraint } from "./reactive.js";
import { defineAttributes, isSet, ownerOf, provideWrite, providedDefault, providedRead, setBound } from "./attributes.js";
import { DeclareError } from "./errors.js";
import { coerce, isAlign, isAuthoredUnion, type AttrType } from "./value.js";
import { fontMetrics, fontString, type FontWeight, type TextTransform } from "./measure.js";
import { featureFamily, featureTags, type Numerals, type NumeralWidth } from "./font-features.js";
import { faceGeneration } from "./face-table.js";
import { heldFamily, type FamilyValue } from "./font-value.js";
import type { Block, Inline, ReadOptions } from "./md.js";
import { headingSlug } from "./slug.js";
import type { Unsupported } from "./html.js";
import { resolveAsset } from "./asset-base.js";
import type { Fill, Shadow, Outline, Color } from "./value.js";
import type { Attr, Literal } from "./parser.js";
import { percentAxis } from "./bind.js";
import { styleBundles, bundleRecord } from "./style-bundles.js";
import { budgetTruncated, flowRichCanvas, layoutBlocks, startBudget, type ImageInfo } from "./rich-views.js";
import { docNodes } from "./rich-doc.js";

// ── prose style map ──────────────────────────────────────────────────────────
// The role → style map that makes rendered Markdown look good with zero author
// effort, on the theme tokens. A design artifact, deliberately data (not code).
export const PROSE = {
  heading: [32, 24, 20, 18, 16, 15], // px by level 1..6
  headingGap: [40, 38, 30, 24, 20, 18], // space ABOVE a heading (not first), by level
  headingBelow: 10,                    // space below a heading, before its content
  body: 16,
  codeSize: 13,   // the house code rendition size — shared by inline, fenced, and <pre> code
  codeRadius: 8,
  codePad: 14,
  codeRuleWidth: 2,   // the `codeRule` left accent bar's thickness
  codeRuleGap: 12,    // extra left padding for code text when a `codeRule` bar is present
  mono: "ui-monospace, SFMono-Regular, monospace",
  blockGap: 16,
  itemGap: 6,
  indent: 28,     // list item body's hanging indent (text left)
  markerGap: 7,   // gap between the marker's right edge and the item text
  quoteIndent: 20,
  cellGap: 18,
};

// The rich-element colors (headings, code, links, rules, quotes) come in a dark and
// a light set; `C` points at the one matching the app's color scheme, chosen per
// rebuild from the root App's `dark` (below). Body text is themed separately via the
// `bodyColor` attribute, so a caller can dim prose independently of the scheme.
const COLORS_DARK = {
  headingColor: 0xffffff, bodyColor: 0xc7d0d6,
  code: 0xb8cfef, codeChip: 0x172b39, codeFg: 0xb8c4cc, codeBg: 0x121f2a,
  rule: 0x24394a, link: 0x6aa4ff, quoteRule: 0x2f4a5c, quoteColor: 0x9fb0ba,
};
const COLORS_LIGHT = {
  headingColor: 0x111c24, bodyColor: 0x33424e,
  code: 0x2c5578, codeChip: 0xe6edf3, codeFg: 0x2e3b46, codeBg: 0xe6ecf2,
  rule: 0xd3dce4, link: 0x2f6fe0, quoteRule: 0xc4d0da, quoteColor: 0x5a6874,
};
export let C: typeof COLORS_DARK = COLORS_DARK;        // active set; set at the top of each rebuild
let SCALE = 1;                                   // font-size multiplier (the `fontScale` attr), set per rebuild
// A named style a `<span class="…">` selects: a bundle of TEXT'S OWN style
// attributes, named exactly as on `Text` (no terse parallel vocabulary — the skin
// pattern), applied to the run. All optional; absent = inherit. `accents` retired
// into this (a fill is just `textFill`, one field among many).
export interface RunStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  italic?: boolean;
  textColor?: number;
  textFill?: Fill;
  letterSpacing?: number;
  // typographical treatments (paint/decoration; a run wears them like any Text)
  textShadow?: Shadow | null;
  outline?: Outline | null;
  textTransform?: TextTransform;
  smallCaps?: boolean;
  numerals?: Numerals;
  numeralWidth?: NumeralWidth;
  slashedZero?: boolean;
  underline?: boolean;
  strike?: boolean;
}

let STYLES: Record<string, RunStyle> = {};       // named styles (HTMLText local `textStyles`), set per rebuild

// A `<span class>` resolves the by-name cascade: LOCAL inline `textStyles` first,
// then a global `style` bundle (from style-bundles.js) — so `style hero [ … ]`
// serves a `<span class='hero'>` anywhere in the program with no palette. A field is read
// into the run from the bundle's record (style-bundles.ts) — plain literal values,
// like a theme's tokens — so a run style is read once per Element (a WeakMap,
// collected with it).
type BundleEl = { attrs: readonly { name: string; value: Literal }[] };
const bundleCache = new WeakMap<object, RunStyle>();

/** Set one RunStyle field from a runtime value (shared by static + dynamic). */
function assignRunField(rs: RunStyle, name: string, val: unknown): void {
  switch (name) {
    case "fontSize": if (typeof val === "number") rs.fontSize = val; break;
    case "letterSpacing": if (typeof val === "number") rs.letterSpacing = val; break;
    case "fontFamily": if (typeof val === "string") rs.fontFamily = val; break;
    case "fontWeight": if (typeof val === "string" || typeof val === "number") rs.fontWeight = val as FontWeight; break;
    case "italic": rs.italic = val === true; break;
    case "smallCaps": rs.smallCaps = val === true; break;
    case "numerals": if (typeof val === "string") rs.numerals = val as Numerals; break;
    case "numeralWidth": if (typeof val === "string") rs.numeralWidth = val as NumeralWidth; break;
    case "slashedZero": rs.slashedZero = val === true; break;
    case "underline": rs.underline = val === true; break;
    case "strike": rs.strike = val === true; break;
    case "textColor": if (typeof val === "number" || val === null) rs.textColor = val as number; break;
    case "textFill": rs.textFill = val as Fill; break;
    case "textShadow": rs.textShadow = val as Shadow | null; break;
    case "outline": rs.outline = val as Outline | null; break;
    case "textTransform": if (typeof val === "string") rs.textTransform = val as TextTransform; break;
  }
}

const TEXT_ATTR = new Set(["fontSize", "fontFamily", "fontWeight", "italic", "textColor", "textFill", "letterSpacing",
  "textShadow", "outline", "textTransform", "smallCaps", "numerals", "numeralWidth", "slashedZero",
  "underline", "strike"]);
/** A `style` bundle's text attributes read into a RunStyle — from the bundle's
 *  record (style-bundles.ts), the same values a drawing or a body reads by name. */
function bundleToRunStyle(el: BundleEl): RunStyle {
  const rs: RunStyle = {};
  const rec = bundleRecord(el as unknown as Parameters<typeof bundleRecord>[0]);
  for (const [name, val] of Object.entries(rec)) if (TEXT_ATTR.has(name)) assignRunField(rs, name, val);
  return rs;
}
// The running-text style pulled from the provided text slots (fontSize/
// fontWeight/letterSpacing), set per rebuild — so ALL prose body (paragraphs
// AND list/quote/table text) obeys the ambient text style, like a `Text`.
export let BODY: { size: number; weight: FontWeight; tracking: number } = { size: 16, weight: "normal", tracking: 0 };
// The rich-text STRUCTURE style, resolved per rebuild from the provided
// structural slots (headingColor/headingWeight/linkColor/codeColor) with the
// theme-aware house token as the fallback — so headings/links/inline-code obey
// an app-wide override but look right with zero config.
export let HEADINGW: FontWeight = "bold";
export let HEADINGC = 0, LINKC = 0, CODEC = 0;
let LINKU = true;                                // underline links (schema `linkUnderline`)
// Code face + size — resolved per rebuild from the provided codeSize/codeFamily
// slots, with the house code style (PROSE.codeSize / PROSE.mono) as the fallback.
// One value drives every monospace region: inline code, fenced blocks, and the
// `<pre>` HTMLText path — so the reader view and fenced code share one rendition.
export let CODESIZE = 0, CODEFAM = "";
// Code-block box paint, resolved per rebuild from the provided codeBackground/
// codeRule slots (null = the house look). CODEBG null ⇒ fenced code keeps its
// themed tint and a `<pre>` stays bare; CODERULE null ⇒ no left bar on either.
export let CODEBG: number | null = null, CODERULE: number | null = null;
// Resolve an inline image's `src` against the document's asset base (the same
// rebase an `Image [ source ]` gets), set per rebuild from the component's root.
// Absolute/protocol-relative/root-relative/data: srcs pass through untouched.
let RESOLVE_SRC: (src: string) => string = (s) => s;
// Per-block-type layout geometry (the richTextLayout map), set per rebuild — an
// empty map means every block flows full-width and left-aligned, exactly as before.
type BlockGeo = { maxWidth?: number; margin?: readonly [number, number]; align?: "left" | "center" | "right" };
let LAYOUT: Readonly<Record<string, BlockGeo>> = {};

/** Resolve a block type's geometry from the map: its own entry, then `default`,
 *  field by field (a `pre` with no own entry shares `code`). Zero maxWidth = the
 *  full track; the house result for an empty map is full-width, left, no margin. */
export function geoFor(t: string): { maxWidth: number; ml: number; mr: number; align: "left" | "center" | "right" } {
  const d = LAYOUT.default ?? {};
  const own = LAYOUT[t] ?? (t === "pre" ? LAYOUT.code : undefined) ?? {};
  const margin = own.margin ?? d.margin ?? [0, 0];
  return {
    maxWidth: own.maxWidth ?? d.maxWidth ?? 0,
    ml: margin[0] ?? 0,
    mr: margin[1] ?? 0,
    align: own.align ?? d.align ?? "left",
  };
}

/** Place a built block-view in its track: given the column `width` and the block
 *  type's geometry, size it to the (possibly measure-capped) content width and set
 *  its x by the alignment. `apply(width, geo)` returns the content width the block
 *  should be BUILT at; then `pos` offsets the finished view. One helper so the flow
 *  group and every structural block share identical geometry. */
export function contentWidth(width: number, g: ReturnType<typeof geoFor>): number {
  const track = Math.max(0, width - g.ml - g.mr);
  return g.maxWidth > 0 ? Math.min(track, g.maxWidth) : track;
}
export function placeX(width: number, cw: number, g: ReturnType<typeof geoFor>): number {
  if (g.align === "center") return g.ml + (width - g.ml - g.mr - cw) / 2;
  if (g.align === "right") return width - g.mr - cw;
  return g.ml;
}
/** The geometry of a whole-document flow: the full width (its blocks carry their own). */
const WHOLE: ReturnType<typeof geoFor> = { maxWidth: 0, ml: 0, mr: 0, align: "left" };
export const geoEqual = (a: ReturnType<typeof geoFor>, b: ReturnType<typeof geoFor>): boolean =>
  a.maxWidth === b.maxWidth && a.ml === b.ml && a.mr === b.mr && a.align === b.align;

/** Resolve a `<span class="…">` name through the by-name cascade — local inline
 *  `textStyles` first, then a global `style` bundle — the whole class, else its
 *  first matching token (`"hero big"`); no match ⇒ undefined (plain text). */
function resolveStyle(name: string): RunStyle | undefined {
  const bundles = styleBundles();
  for (const tok of [name, ...name.split(/\s+/)]) {
    if (tok in STYLES) return STYLES[tok];               // local inline (nearest)
    const b = bundles.get(tok);
    if (b !== undefined) {                               // global `style` bundle
      // A bundle is a record of literals: its run style is read once per Element.
      let rs = bundleCache.get(b as object);
      if (rs === undefined) { rs = bundleToRunStyle(b as BundleEl); bundleCache.set(b as object, rs); }
      return rs;
    }
  }
  return undefined;
}
export const sz = (n: number) => Math.round(n * SCALE); // scale a prose size, keeping whole pixels

export const FALLBACK_FAMILY = "system-ui, sans-serif";

// ── inline views ─────────────────────────────────────────────────────────────
// A tag whose name is a class the program declares (`<Issue id='142'/>`) is ONE
// REAL VIEW of that class, placed inline in the flowing text — an atomic box the
// text flows around, exactly like an inline image. Runs of text are NOT views;
// only the embedded views are.
//
// THE ARCHITECTURE, which is the whole of the design here: a Declare `Layout`
// computes from values and may never query the DOM. So the RENDERER measures,
// publishes a geometry fact (slot → box; TextFlow.slots below), and a private
// Layout places the views from that fact — the same path a `Text`'s measured
// size and a flow's own height already take. The DOM emits one inline-block
// placeholder per slot and reads back where the browser put it; the manual flow
// (canvas, and the Mac) computes the same boxes as it wraps the line.
//
// The views are children of the RICH TEXT, not of a flow: a flow is rebuilt
// whenever the content changes, and a matched view must OUTLIVE that (its hover,
// a running spring, focus). So the identity cache lives here, and the boxes are
// composed into the rich text's own coordinates by the Layout.

/** One live inline view: its identity, its class, the SHAPE of the tag that
 *  made it, and the plain attribute values last written — what makes a content
 *  change rewrite only what actually changed. `flow` is the flow that laid it
 *  out (its box is published there).
 *
 *  `shape` is which slots the tag CLAIMS (plus a percent's number, which is a
 *  standing relationship rather than a value). Claiming is an instantiation
 *  fact: the tag is the use site of the merge, so which names it carries decides
 *  which class-body sets and `{ }` constraints install at all. A content change
 *  that keeps the shape rewrites values in place and the view keeps its
 *  identity; one that changes the shape is a different instantiation, and the
 *  view is rebuilt — which is also what makes a dropped attribute revert to the
 *  class's own behaviour, constraint included. */
interface Slot {
  cls: string;
  view: View;
  shape: string;
  values: Map<string, unknown>;
  flow: TextFlow | null;
}

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const HEXCOLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const HEXNUM = /^0[xX][0-9a-fA-F]+$/;
const PERCENT = /^[+-]?(?:\d+\.?\d*|\.\d+)%$/;
const TOKEN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NOPOS = { line: 0, col: 0, offset: 0 };

/** A tag attribute's string as THE LITERAL ITS DECLARED TYPE EXPECTS, so the one
 *  coercion (value.ts `coerce`) converts it exactly as it converts a literal
 *  written in source — no second vocabulary. Type-directed because the same text
 *  means different things in different slots: `text='142'` is the string "142"
 *  while `id='142'` is the number 142, and a bare token is an enum member in an
 *  enum slot and a named color in a Color one. A bare attribute (`<Chip loud/>`)
 *  is `true`. */
function literalFor(type: AttrType, raw: string | true): Literal {
  if (raw === true) return { kind: "ident", name: "true", pos: NOPOS };
  const t = raw.trim();
  // A string slot takes the text AS WRITTEN (untrimmed) — it is the value.
  if (type.kind === "string" || type.kind === "font" || type.kind === "faceSource") return { kind: "string", value: raw, pos: NOPOS };
  if (type.kind === "enum") {
    // A declaration's own spelling (the ruling): a built-in vocabulary declares
    // bare tokens, an authored literal union declares quoted members.
    if (isAuthoredUnion(type.name)) return { kind: "string", value: t, pos: NOPOS };
    if (type.numeric !== undefined && NUMERIC.test(t)) return { kind: "number", value: parseFloat(t), hex: false, pos: NOPOS };
    return { kind: "ident", name: t, pos: NOPOS };
  }
  if (HEXCOLOR.test(t)) return { kind: "hexColor", raw: t, pos: NOPOS };
  if (HEXNUM.test(t)) return { kind: "number", value: parseInt(t.slice(2), 16), hex: true, hexLen: t.length - 2, pos: NOPOS };
  if (PERCENT.test(t)) return { kind: "percent", value: parseFloat(t), pos: NOPOS };
  if (NUMERIC.test(t)) return { kind: "number", value: parseFloat(t), hex: false, pos: NOPOS };
  return TOKEN.test(t) ? { kind: "ident", name: t, pos: NOPOS } : { kind: "string", value: raw, pos: NOPOS };
}

/** The five provided face names an inline view inherits from the run it sits in
 *  — so a chip in a heading is heading-sized unless it sets its own size, and
 *  `providedTextStyle()` inside the view answers the run's style. */
function runFace(s: Style, family: string): Record<string, unknown> {
  return {
    fontSize: s.size,
    fontFamily: s.family ?? family,
    fontWeight: s.weight,
    textColor: s.color,
    letterSpacing: s.tracking,
  };
}

/** THE BASELINE AN INLINE VIEW SITS BY, measured down from the top of its own
 *  box — the number both flows place it with.
 *
 *  An inline view is not a picture: a chip whose content is a label reads as a
 *  word in the sentence, so it must sit on the sentence's baseline, not hang
 *  its bottom edge off it. The rule is CSS's for an inline-block and the
 *  library's for `align = baseline` at once: the view's OWN `baseline` if it
 *  declares one (Button, Checkbox, Field, RadioGroup, a Text, a RichText, or any
 *  class that says `baseline: number = { … }`), else the FIRST descendant that
 *  claims one, in paint order, carried up into the view's coordinates. A view
 *  whose subtree claims nothing has no baseline, and its bottom sits on the
 *  line's — what a replaced box (an `<img>`) gets, and what this did before.
 *
 *  A baseline is CLAIMED, never discovered (check.ts's rule for a baseline row):
 *  nothing here measures glyphs or asks a renderer — it reads the declarations,
 *  and every read is tracked, so a font arriving or a label's text changing
 *  moves the answer and re-flows the line. */
function claimedBaseline(v: View): number | null {
  const own = (v as unknown as { baseline?: unknown }).baseline;
  return typeof own === "number" ? own : descendantBaseline(v, 0);
}

/** The first baseline claimed anywhere under `v`, in declaration (paint) order,
 *  offset into `v`'s coordinates. An invisible child paints nothing and carries
 *  no line, so it is passed over. */
function descendantBaseline(v: View, dy: number): number | null {
  for (const c of v.children) {
    if (!(c instanceof View) || c.visible === false) continue;
    const y = dy + (c.y || 0);
    const b = (c as unknown as { baseline?: unknown }).baseline;
    if (typeof b === "number") return y + b;
    const deeper = descendantBaseline(c, y);
    if (deeper !== null) return deeper;
  }
  return null;
}

/** THE SLOTS of one rich text: resolve each `<Name …/>` to a live view, keep a
 *  matched one across content changes, prune the vanished. The persistent
 *  inline-image cache (TextFlow.imageFor) is the pattern; this generalizes it
 *  one level up, because a view — unlike an image — must survive the rebuild
 *  that a new `html`/`text` triggers. */
class SlotHost {
  private readonly slots = new Map<string, Slot>();
  private used = new Set<string>();
  private seq = new Map<string, number>();
  /** Diagnostics already spoken, so a refusal that is re-read on every rebuild
   *  says its sentence once instead of storming. */
  private readonly said = new Set<string>();
  private policy: Unsupported = "strip";

  constructor(private readonly owner: View) {}

  /** Does the program declare a VIEW class called `name`? The one gate that
   *  turns a tag into a view — everything else stays the text it is today. */
  declares(name: string): boolean {
    return inlineViewHost(this.owner)?.declares(name) ?? false;
  }

  /** The reader options for this rich text's parse. */
  readOptions(policy: Unsupported): ReadOptions {
    this.policy = policy;
    return { isClass: (n) => this.declares(n), refuse: (m) => this.refuse(m) };
  }

  /** Refused, through the component's own `unsupported` policy: `error` throws
   *  naming the offence, `strip` drops it, keeps going, and says so once. */
  private refuse(message: string): void {
    if (this.policy === "error") throw new DeclareError(message);
    if (this.said.has(message)) return;
    this.said.add(message);
    console.error("[Declare] " + this.owner.constructor.name + ": " + message);
  }

  begin(): void { this.used = new Set(); this.seq = new Map(); }

  /** Resolve one inline-view tag against the program's classes: create or match
   *  the view, convert the attributes by their DECLARED types, hand the run's
   *  face down as provided values. Returns the slot key the run carries, or null
   *  when the tag is refused whole. */
  resolve(node: Extract<Inline, { t: "view" }>, style: Style, family: string): string | null {
    const host = inlineViewHost(this.owner);
    if (host === null) return null;                  // no program table: not a view
    const cls = node.name;
    // IDENTITY: the `key` attribute, else the class name plus the ordinal of
    // this tag among the class's UNKEYED tags — so inserting a keyed tag before
    // an unkeyed one cannot shift what the unkeyed one is.
    let key = node.key;
    if (key === undefined) {
      const n = this.seq.get(cls) ?? 0;
      this.seq.set(cls, n + 1);
      key = cls + "#" + n;
    } else if (this.used.has(key)) {
      const n = this.seq.get(cls) ?? 0;
      this.seq.set(cls, n + 1);
      this.refuse(`two inline views share key='${key}' — a key is an identity, and identities are unique`);
      key = cls + "#" + n;
    }
    // READ THE TAG FIRST, as the LITERALS its slots' declared types expect: the
    // tag is the USE SITE of the ordinary attribute merge (instantiate.ts
    // mergeAttrs — class bodies base → leaf, then the use site; only the winner
    // installs), so `<Box width='120'/>` means `Box [ width = 120 ]` and a
    // class-body `width = { 40 }` on the same slot never installs. Every
    // attribute is vetted before anything is created: a refusal under `error`
    // must throw first, and nothing a tag says may be quietly dropped.
    const attrs: Attr[] = [];
    // The plain values that landed, for the rewrite comparison below. A percent
    // is deliberately absent: it lands as a standing constraint, not a value,
    // and `shape` is what decides whether it is still the same one.
    const values = new Map<string, unknown>();
    for (const [name, raw] of Object.entries(node.attrs)) {
      // The flow owns placement, exactly as a layout owns its children's.
      if (name === "x" || name === "y") {
        this.refuse(`<${cls} ${name}='…'/>: the text flow places an inline view — '${name}' is not yours to set here`);
        continue;
      }
      const type = host.attrType(cls, name);
      if (type === null) {
        this.refuse(`<${cls} ${name}='…'/>: ${cls} has no attribute '${name}'`);
        continue;
      }
      // A computed slot (View's `hovered`, `contentWidth`, a class's own
      // `readonly`) refuses assignment from anywhere; through a tag that would
      // throw out of the render, so it is a refusal like any other.
      if (host.readOnly(cls, name)) {
        this.refuse(`<${cls} ${name}='…'/>: ${cls}.${name} is read-only — it is computed from its declaration and cannot be set`);
        continue;
      }
      const lit = literalFor(type, raw);
      const c = coerce(type, lit);
      if (!c.ok) {
        this.refuse(`<${cls} ${name}='${raw === true ? "" : raw}'/>: ${name} expects ${c.expected}${c.found === undefined ? "" : ` — found ${c.found}`}`);
        continue;
      }
      // A percent resolves against the parent's extent on its own axis, like
      // any child's — the parent here is the rich text, so `width='50%'` is half
      // the content width. A slot with no axis to resolve against is refused
      // rather than bound (bindPercent would throw mid-render).
      if (lit.kind === "percent" && percentAxis(name) === null) {
        this.refuse(`<${cls} ${name}='${String(raw)}'/>: no axis to resolve a percent against — ${name} is not a width or a height`);
        continue;
      }
      // `center` / `end` align a view against its parent's box; the flow places
      // an inline view, and x/y are refused above, so an align literal has no
      // reading here (it would silently bind the wrong axis).
      if (isAlign(c.value)) {
        this.refuse(`<${cls} ${name}='${String(raw)}'/>: the text flow places an inline view — center and end have no meaning on ${name}`);
        continue;
      }
      attrs.push({ name, value: lit, pos: NOPOS });
      if (lit.kind !== "percent") values.set(name, c.value);
    }
    // Which slots this tag claims (a percent's number included — see Slot).
    const shape = attrs.map((a) => a.name + (a.value.kind === "percent" ? `=${a.value.value}%` : "")).sort().join(" ");
    // The run's face, and `selectable = false`: an inline view is a view, not
    // text — a selection passes over it and a copy carries nothing for it, as
    // for an image or a control in a browser's paragraph (text-selection.md §6).
    const provides = { ...runFace(style, family), selectable: false };
    let slot = this.slots.get(key);
    // A key reused for a DIFFERENT class is a different thing — and so is a tag
    // that claims a different set of slots: what the use-site layer covers is
    // decided when the view is built. Either way, retire the old.
    if (slot !== undefined && (slot.cls !== cls || slot.shape !== shape)) { slot.view.discard(); this.slots.delete(key); slot = undefined; }
    if (slot === undefined) {
      const view = host.create(this.owner as View, cls, attrs, provides);
      slot = { cls, view, shape, values, flow: null };
      this.slots.set(key, slot);
    } else {
      // A MATCHED view keeps everything it has; only what changed is written.
      // Its shape is unchanged, so every name here is a slot the tag already
      // claimed at build time — an ordinary write to an unowned slot.
      for (const [name, v] of values) {
        if (slot.values.get(name) === v) continue;
        (slot.view as unknown as Record<string, unknown>)[name] = v;
        slot.values.set(name, v);
      }
      // The face travels with the run: a chip that moved into a heading is
      // heading-sized. Equality-gated inside provideWrite.
      for (const [name, v] of Object.entries(provides)) provideWrite(slot.view, name, v);
    }
    slot.flow = null;
    this.used.add(key);
    return key;
  }

  /** Bind the flow that lays these slots out — called as each flow is built, so
   *  the Layout knows whose published box to read. */
  bind(flow: TextFlow, keys: readonly string[]): void {
    for (const k of keys) {
      const s = this.slots.get(k);
      if (s === undefined) continue;
      s.flow = flow;
      flow.slotViews.set(k, s.view);
    }
  }

  /** The view a slot holds (the flow's size watch reads these). */
  viewOf(key: string): View | undefined { return this.slots.get(key)?.view; }

  /** Retire the views the new content no longer names, and answer the placement
   *  table the rich text's Layout arranges from. */
  end(): Map<View, { key: string; flow: TextFlow }> {
    for (const [key, s] of [...this.slots]) {
      if (this.used.has(key)) continue;
      s.view.discard();
      this.slots.delete(key);
    }
    const out = new Map<View, { key: string; flow: TextFlow }>();
    for (const [key, s] of this.slots) if (s.flow !== null) out.set(s.view, { key, flow: s.flow });
    return out;
  }

  /** Every live inline view — the teardown sweep. */
  views(): View[] { return [...this.slots.values()].map((s) => s.view); }
}

/** The slot host of the rich text being built, for the duration of the build —
 *  the same per-rebuild module scope `C`, `STYLES` and `RESOLVE_SRC` use. */
let SLOTS: SlotHost | null = null;

// ── inline tier ────────────────────────────────────────────────────────────
// A run's resolved style, flattened from the inline tree for the seam.
export interface Style { size: number; weight: FontWeight; italic: boolean; mono: boolean; strike: boolean; color: number; tracking: number; link?: string; fill?: Fill; family?: string; shadow?: Shadow | null; outline?: Outline | null; transform?: TextTransform; smallCaps?: boolean; numerals?: Numerals; numeralWidth?: NumeralWidth; slashedZero?: boolean; underline?: boolean }
export function base(size: number, weight: FontWeight, color: number, tracking = 0): Style {
  return { size: sz(size), weight, italic: false, mono: false, strike: false, color, tracking };
}

/** Apply a named `RunStyle` (Text's own attribute names) onto the ambient
 *  style. Each field maps to its internal Style twin; a size is SCALE-multiplied
 *  like every prose size so the `fontScale` attr still governs. */
function applyStyle(style: Style, rs: RunStyle): Style {
  const s: Style = { ...style };
  if (rs.fontSize !== undefined) s.size = sz(rs.fontSize);
  if (rs.fontFamily !== undefined) s.family = rs.fontFamily;
  if (rs.fontWeight !== undefined) s.weight = rs.fontWeight;
  if (rs.italic !== undefined) s.italic = rs.italic;
  if (rs.textColor !== undefined) s.color = rs.textColor;
  if (rs.textFill !== undefined) s.fill = rs.textFill;
  if (rs.letterSpacing !== undefined) s.tracking = rs.letterSpacing;
  if (rs.textShadow !== undefined) s.shadow = rs.textShadow;
  if (rs.outline !== undefined) s.outline = rs.outline;
  if (rs.textTransform !== undefined) s.transform = rs.textTransform;
  if (rs.smallCaps !== undefined) s.smallCaps = rs.smallCaps;
  if (rs.numerals !== undefined) s.numerals = rs.numerals;
  if (rs.numeralWidth !== undefined) s.numeralWidth = rs.numeralWidth;
  if (rs.slashedZero !== undefined) s.slashedZero = rs.slashedZero;
  if (rs.underline !== undefined) s.underline = rs.underline;
  if (rs.strike !== undefined) s.strike = rs.strike;
  return s;
}

type Atom = { text: string; style: Style } | { br: true } | { img: { src: string; alt: string; title?: string; href?: string } }
  // An inline view's SLOT — resolved to a live view as the tree is walked (the
  // run that reaches the renderer carries only the slot's identity and size).
  | { slot: string };
/** Walk the inline tree, resolving each leaf's effective style. */
function flatten(ns: Inline[], style: Style, out: Atom[], family: string): void {
  for (const n of ns) {
    switch (n.t) {
      case "text": out.push({ text: n.value, style }); break;
      case "code": out.push({ text: n.value, style: { ...style, mono: true, color: CODEC } }); break;
      case "br": out.push({ br: true }); break;
      case "strong": flatten(n.inline, { ...style, weight: "bold" }, out, family); break;
      case "em": flatten(n.inline, { ...style, italic: true }, out, family); break;
      case "strike": flatten(n.inline, { ...style, strike: true }, out, family); break;
      case "link": flatten(n.inline, { ...style, color: LINKC, link: n.href }, out, family); break;
      // An inline image is an atomic box, not styled text; it carries the ambient
      // link (an image that is a link's content) so the box is clickable.
      case "image": out.push({ img: { src: RESOLVE_SRC(n.src), alt: n.alt, title: n.title, href: style.link } }); break;
      // An inline VIEW is an atomic box too, and not styled text at all: the tag
      // becomes one real view of that class, which sees THIS run's face as its
      // provided values. A refused tag yields nothing and the text flows on.
      case "view": { const key = SLOTS?.resolve(n, style, family) ?? null; if (key !== null) out.push({ slot: key }); break; }
      case "styled": { const rs = resolveStyle(n.name); flatten(n.inline, rs !== undefined ? applyStyle(style, rs) : style, out, family); break; }
    }
  }
}

// ── rich text: native flow ───────────────────────────────────────────────────
// A flowing run of styled text — the read-only sibling of the editable field.
// The DOM backend realizes it as real flowing HTML, so selection, copy, find,
// a11y and baselines are the browser's own; where that is unavailable (canvas)
// RichText lays the same runs out as child views itself. EVERY text region is one
// of these — a paragraph/heading group, but also each list item, table cell and
// quote line — which is what makes prose selection contiguous per region instead
// of word-by-word. Only the STRUCTURE around them (markers, rules, the code box)
// is plain views.

/** Flatten an inline tree to fully-resolved runs for the seam — the effective
 *  font, color, and (for `code`) chip are baked in so a backend just realizes
 *  what it is told. Mirrors `flatten`, then bakes the per-run family. */
export function richRunsOf(inline: Inline[], style: Style, family: string): RichRun[] {
  const atoms: Atom[] = [];
  flatten(inline, style, atoms, family);
  return atoms.map((a): RichRun => {
    if ("br" in a) return { br: true };
    if ("img" in a) return { img: a.img };
    // The size is stamped from the live view on every render (TextFlow.render):
    // the flow needs a box to reserve, and the view owns how big it is.
    if ("slot" in a) return { view: { slot: a.slot, width: 0, height: 0 } };
    const s = a.style;
    const run: RichRun = {
      text: a.text, size: s.size, weight: s.weight, italic: s.italic,
      // THE FEATURES RIDE THE FAMILY NAME (font-features.ts), so deriving it
      // once here is all the plumbing there is: every fontString in the flow,
      // the DOM run block and the Mac payload all read `run.family`.
      family: featureFamily(s.mono ? CODEFAM : (s.family ?? family), featureTags(s)),
      strike: s.strike, color: s.color, tracking: s.tracking,
    };
    // inline code reads as a colored mono word, not a filled chip/button
    if (s.link !== undefined) { run.href = s.link; if (LINKU) run.underline = true; }
    if (s.fill !== undefined) run.fill = s.fill;   // a themed accent fill (gradient/solid) overrides `color`
    // typographical treatments carried through to the backend (paint/decoration)
    if (s.underline) run.underline = true;
    if (s.shadow != null) run.shadow = s.shadow;
    if (s.outline != null) run.outline = s.outline;
    if (s.transform !== undefined && s.transform !== "none") run.transform = s.transform;
    if (s.smallCaps) run.smallCaps = true;
    return run;
  });
}

/** TextFlow — the internal native-flow renderer (NOT a user component; see the
 *  RichText family below). A flowing block of styled text: `content` (resolved
 *  runs) and `flowWidth` are set by its owner before attach; it renders natively
 *  (DOM) or manually (canvas) and auto-sizes its height to the flowed content. */
export class TextFlow extends View {
  content: RichNode[] = [];
  /** True when `content` is a whole document (structural nodes among its
   *  blocks) — handed only to a backend that lays documents out (`richBlocks`). */
  structured = false;
  flowWidth = 0;
  /** The INLINE VIEWS this flow lays out, by slot key. The views are children
   *  of the RICH TEXT (they outlive this flow, which a content change rebuilds);
   *  this flow reads their sizes and publishes where it put them. */
  readonly slotViews = new Map<string, View>();
  /** THE GEOMETRY FACT: each slot's box inside this flow, as the renderer
   *  measured it — the DOM read it back off the placeholders it emitted, the
   *  manual flow computed it while wrapping the line. The rich text's Layout
   *  places the views from exactly this, which is how a `Layout` arranges
   *  DOM-flowed text without ever asking the DOM anything. */
  private slotBoxes: Record<string, SlotBox> = {};
  private readonly slotCell = new Cell();
  slots(): Readonly<Record<string, SlotBox>> { this.slotCell.track(); return this.slotBoxes; }
  private publishSlots(boxes: Record<string, SlotBox>): void {
    if (sameSlots(this.slotBoxes, boxes)) return;
    this.slotBoxes = boxes;
    this.slotCell.changed();
  }
  /** The lines this flow may show under its document's `maxLines`, allotted
   *  when the document was BUILT and reused by every render after; 0 = all. */
  clampLines = 0;

  /** Re-flow at a new width, keeping the view and its content.
   *
   *  ⚠ THE EARLY-OUT IS THE WHOLE POINT. Prose is capped at a reading measure,
   *  so most flows in a document do NOT change width when the window does —
   *  and re-laying them out is the expensive part (on the native host
   *  `setRichContent` runs a synchronous AppKit text layout). Rebuilding used
   *  to re-lay every flow unconditionally: ~40 of them per drag step, 699ms of
   *  a 712ms resize frame, nearly all of it for flows whose width was
   *  identical before and after. */
  reflow(w: number): void {
    if (this.flowWidth === w) return;
    this.width = w;
    this.flowWidth = w;
    // A flow with nothing that wraps (a `pre` — fixed lines, scrolled
    // horizontally) cannot change its layout or its height when the container
    // width changes, so it needs no re-flow at all. Skipping it here also skips
    // serializing its blocks across the seam, which for a document of code
    // fences was megabytes per drag.
    // A whole document re-wraps in place: nothing in it depends on the width,
    // so the backend takes the new width and answers the height.
    if (this.structured && this.surface?.setRichWidth !== undefined) {
      const h = this.surface.setRichWidth(w);
      if (typeof h === "number" && h >= 0) { this.height = h; this.rereadBaseline(); return; }
    }
    if (this.content.every((b) => !isStructural(b) && b.pre === true)) {
      // ... but the HOST box must still adopt the width (it bounds the pre's
      // native horizontal scroller — stuck at a boot-time 0 it clips the flow
      // to nothing). Width-only, no re-flow; no backend hook ⇒ full render.
      if (this.surface?.setRichWidth !== undefined) { this.surface.setRichWidth(w); return; }
    }
    this.render();
  }

  /** The right edge of this flow's widest line at its current width — read
   *  off the renderer's own layout where it offers one (richMetrics), else the
   *  manual flow's arithmetic. */
  widestLine(): number {
    const m = this.surface?.richMetrics?.();
    if (m !== undefined) return m.widest;
    return flowRichCanvas(this.content as RichBlock[], this.flowWidth, undefined, undefined, { measure: true }).widest;
  }

  onLink: ((href: string) => void) | null = null;
  /** The default link behavior (location.md §0.5). §12.2's mechanism, closed:
   *  a Markdown/HTMLText instance is a RichText PARENT holding TextFlow
   *  children — an author's declared `onLink` installs on the parent, while
   *  each flow reads its own `this.onLink`, so no handler ever arrived and
   *  every authored href was dead. The default therefore walks UP: the
   *  nearest ancestor with a declared onLink wins whole (the docs app's
   *  openDocLink keeps its custom routing untouched); with none, the href
   *  goes into the app's follow — "#story" navigates in-app, a URL leaves
   *  through navigate. Bound, so either backend can take it as a bare fn. */
  private followLink = (href: string): void => {
    for (let n = this.parent; n !== null; n = n.parent) {
      const h = (n as unknown as { onLink?: (href: string) => void }).onLink;
      if (typeof h === "function") { h.call(n, href); return; }
    }
    const app = this.root as unknown as { follow?: (ref: string) => void } | null;
    app?.follow?.(href);
  };
  private manual: View[] = [];
  /** The first line's baseline inside this flow (the RichText's `baseline`
   *  fact). On the native path the renderer flowed the text: it reports the
   *  baseline off its own layout where it can (richMetrics), else the manual
   *  flow measures the FIRST block alone by the arithmetic the canvas path
   *  paints by. Null until rendered, and when the flow opens with no line of
   *  text. */
  firstBaseline: number | null = null;
  /** Inline images are PERSISTENT children keyed by (resolved) src — created once
   *  and kept across reflows so a bitmap's async load survives, and pruned when
   *  the content no longer references them. Each installs a constraint that
   *  reflows this flow when its natural size (or failure) lands, so an image pops
   *  into place the frame it loads — the Canvas/mac twin of the DOM `<img>`'s
   *  native reflow. (Text/rect views live in `manual` and are rebuilt each pass;
   *  images must not be, or every reflow would restart their load.) */
  private imageViews = new Map<string, Image>();
  private imageUsed = new Set<string>();
  private imageSeq = new Map<string, number>();   // per-pass occurrence counter, by src
  // Keyed by OCCURRENCE, not src: two images with the same URL are two boxes in
  // the flow (as two `<img>` on DOM), so each needs its own view — sharing one
  // would let only the last placement survive. The occurrence order is stable
  // across reflows, so the key `src#n` is stable too.
  private imageFor = (src: string): ImageInfo => {
    const n = this.imageSeq.get(src) ?? 0;
    this.imageSeq.set(src, n + 1);
    const key = src + "#" + n;
    let im = this.imageViews.get(key);
    if (im === undefined) {
      im = new Image();
      im.stretches = "both";     // fill the aspect-correct box the flow sizes it to
      im.source = src;
      this.imageViews.set(key, im);
      this.appendChild(im);
      if (this.backend !== null && this.surface !== null) im.attach(this.backend, this.surface);
      const view = im;
      const c = new Constraint("TextFlow.img", () => `${view.loaded} ${view.naturalWidth} ${view.naturalHeight} ${view.failed}`, () => this.render(), 0);
      c.run();
      onDiscard(im, () => c.dispose());
    }
    this.imageUsed.add(key);
    return { view: im, nw: im.naturalWidth, nh: im.naturalHeight, loaded: im.loaded, failed: im.failed };
  };
  /** Canvas only: each heading anchor's y offset inside this flow, captured on
   *  the manual layout (the DOM path finds the tagged element instead). */
  private anchorYs: Map<string, number> = new Map();

  /** The heading anchor slugs this flow renders — read from `content`, so it is
   *  the same on both backends and available as soon as the content is set (before
   *  a native measure). The reveal walk (view.ts) collects these. */
  anchorSlugs(): string[] {
    const out: string[] = [];
    eachBlock(this.content, (b) => { if (b.anchor !== undefined) out.push(b.anchor); });
    return out;
  }

  /** Bring heading `slug` into view (location.md §6). Backend-split at the seam:
   *  DOM finds the `data-anchor` element and scrolls it natively; Canvas passes the
   *  recorded y offset so the surface clamps the scroll ancestor. Returns whether
   *  it revealed — false before the flow has realized that heading. */
  revealAnchor(slug: string, inset = 0): boolean {
    const within = this.anchorYs.has(slug) ? this.anchorYs.get(slug)! : -1;
    return this.surface?.revealRichAnchor(slug, within, inset) ?? false;
  }

  /** True while this flow's height is a PROVISIONAL number — rendered (or just
   *  un-hidden), with the backend's asynchronous measurement still outstanding
   *  (§12.1: the DOM's ResizeObserver reports a frame after layout; a flow
   *  inside a display:none subtree measures 0 until re-shown). The reveal
   *  machinery HOLDS an anchored arrival while any flow reports true
   *  (location.md §0.5.3 — the component-sourced veto). Set at render and at
   *  visibility-flip (view.ts markRichPending); cleared by the measurement
   *  callback. Synchronous backends (headless, canvas) never set it. */
  measurePending = false;

  /** The flow's EFFECTIVE `selectable` — the species default (ruled
   *  2026-07-30): a flowing document is selectable BY ITS NATURE, so when
   *  nobody on the ancestor chain says otherwise, the answer is true — the
   *  Jots shape (a Markdown note, no declaration anywhere) reads as the
   *  document it is. Any provision still wins over this default, in either
   *  direction: `selectable = false` on the instance, a container, or a
   *  Control ancestor vetoes it (the unusual non-selectable document, one
   *  explicit line); the ambient default stays false for everything that is
   *  not a flow (a `Text` is a label). The provided read is tracked, so a
   *  provision appearing later re-flows. */
  private effSelectable(): boolean {
    // A flowing document is selectable by nature: DEFAULT true, so a bare
    // Markdown/HTMLText selects, yet a provider above — a container's
    // `selectable = false`, or `selectable = false` on the Markdown instance
    // (a provision, since RichText declares no such slot) — overrides. Read as
    // a provided value, tracked, so a provision appearing later re-flows.
    return providedRead(this, "selectable", true, true) as boolean;
  }

  override attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    super.attach(backend, parentSurface, before);
    // Re-flow when the width or the effective `selectable` changes.
    const c = new Constraint("TextFlow.flow", () => `${this.flowWidth} ${this.effSelectable()}`, () => this.render(), 0);
    c.run();
    onDiscard(this, () => c.dispose());
    // AN INLINE VIEW'S OWN SIZE is the flow's input: the view owns its width and
    // height (literal, derived, auto-sized, sprung), and when either changes the
    // text has to flow again around the new box — so the words move. Its claimed
    // BASELINE rides the same constraint: it is what the line sits the box by, and
    // it moves when a font arrives or a label's text changes (`faceGeneration()`
    // is in the key because the baseline a Text claims is measured from the
    // effective font, which a late face replaces). One constraint over every slot
    // this flow holds; a flow with no inline views reads nothing and never wakes.
    if (this.slotViews.size > 0) {
      const sc = new Constraint("TextFlow.slotSizes",
        () => faceGeneration() + " " + [...this.slotViews.values()].map((v) => `${v.width}×${v.height}@${claimedBaseline(v)}`).join(" "),
        () => this.render(), 0);
      sc.run();
      onDiscard(this, () => sc.dispose());
    }
  }

  private clearManual(): void {
    for (const v of this.manual) { this.removeChild(v); v.discard(); }
    this.manual = [];
  }

  /** The backend re-measured the native flow (font load, or becoming visible
   *  after attaching under a zero-sized ancestor). Track it so the stack re-flows. */
  private onMeasured(h: number): void {
    this.measurePending = false;   // the settled height has arrived (the veto lifts)
    if (this.surface !== null && h >= 0) this.height = h;
    this.rereadBaseline();
  }

  /** Told when `firstBaseline` changes after the render that set it — the
   *  owning rich text re-claims its `baseline` fact. */
  onBaseline: (() => void) | null = null;
  /** A baseline READ off the renderer's layout is only as good as that layout:
   *  a flow rendered before it was laid out (inside a hidden or zero-sized
   *  ancestor, before its face arrived) reads it again when the renderer
   *  reports the settled layout, as its height does. */
  private rereadBaseline(): void {
    const first = this.content[0];
    const m = this.surface?.richMetrics?.();
    if (m === undefined || first === undefined || isStructural(first) || m.firstBaseline === this.firstBaseline) return;
    this.firstBaseline = m.firstBaseline;
    this.onBaseline?.();
  }

  private render(): void {
    const s = this.surface;
    if (s === null) return;
    // The DEFAULT for a rich-text link is the app's own follow (location.md
    // §0.5): a plain click on an authored href reaches the app with no wiring —
    // "#story" navigates in-app, a URL leaves through navigate — and an
    // explicit onLink handler still wins whole. This closes §12.2 (every
    // authored .md link was dead unless each flow hand-wired a handler).
    const link = this.onLink ?? this.followLink;
    // Arm the veto BEFORE the flow: on a deferred-measure backend the settled
    // height arrives through onMeasured a frame later; until then this flow's
    // height is provisional and an anchored reveal must hold (§0.5.3).
    this.measurePending = s.deferredRichMeasure === true;
    // THE VIEW'S OWN SIZE, stamped into the runs: the flow reserves this much
    // room for the box, and a change to it re-ran this render (the slotSizes
    // constraint in attach).
    if (this.slotViews.size > 0) {
      eachBlock(this.content, (b) => {
        for (const r of b.runs) {
          if (!("view" in r)) continue;
          const v = this.slotViews.get(r.view.slot);
          if (v === undefined) continue;
          r.view.width = v.width; r.view.height = v.height;
          // …and the baseline it claims, which is where the LINE sits it: both
          // flows read this one number (the DOM turns it into the placeholder's
          // vertical-align, the manual flow into the box's offset from the line
          // baseline), so the two agree by construction.
          const bl = claimedBaseline(v);
          if (bl === null) delete r.view.baseline; else r.view.baseline = bl;
        }
      });
    }
    // A NATIVE FLOW THAT CANNOT PLACE INLINE VIEWS is not asked to: this flow
    // lays its content out manually instead (the Canvas path, which places every
    // slot itself). Correct pixels through the other path, rather than a native
    // engine silently dropping the boxes it was never taught about.
    const native = this.slotViews.size === 0 || s.richInlineSlots === true;
    const h = native
      ? s.setRichContent(this.content, this.effSelectable(), this.flowWidth, (nh) => this.onMeasured(nh), link,
          this.slotViews.size > 0 ? (boxes) => this.publishSlots(boxes) : undefined)
      : -1;
    if (h >= 0) {                       // native path: the backend flowed + measured
      this.clearManual();
      this.height = h;
      const first = this.content[0];
      const m = s.richMetrics?.();
      this.firstBaseline = first === undefined || isStructural(first) ? null
        : m !== undefined ? m.firstBaseline
        : flowRichCanvas([first], this.flowWidth, undefined, undefined, { measure: true }).firstBaseline;
      // THE CLAMP, on a renderer that wraps for itself (RichText.maxLines). The
      // document allotted this flow its lines when it was built; the engine is
      // handed that count on every render, so a later render cannot drift.
      if (this.clampLines > 0) {
        const clamped = s.setRichClamp?.(this.clampLines) ?? -1;
        if (clamped >= 0) this.height = clamped;
      }
      return;
    }
    // Canvas: lay the runs out as child views ourselves.
    this.clearManual();
    this.imageUsed.clear();
    this.imageSeq.clear();
    this.measurePending = false;   // the manual flow measured synchronously
    const { views, height, anchors, firstBaseline, slots } = flowRichCanvas(this.content as RichBlock[], this.flowWidth, this.onLink ?? this.followLink, this.imageFor,
      this.clampLines > 0 ? { keep: this.clampLines } : undefined);
    this.publishSlots(slots);
    // Prune image children the content no longer references (a re-pointed `text`).
    for (const [key, im] of this.imageViews) if (!this.imageUsed.has(key)) { this.removeChild(im); im.discard(); this.imageViews.delete(key); }
    this.anchorYs = anchors;
    this.firstBaseline = firstBaseline;
    let at = 0;
    for (const v of views) { this.insertChild(v, at++); this.manual.push(v); if (this.backend !== null) v.attach(this.backend, this.surface); }
    this.height = height;
    this.childrenMutated();
  }
}

// ── block → reactive view ─────────────────────────────────────────────────────
// Each structural block becomes its OWN sub-view, stacked in a reactive `yStack`
// so a TextFlow measuring late (font load, becoming visible) re-flows the blocks
// below it and grows its container through auto-extent — no synchronous height
// guess. Every text region (paragraph, list item, table cell, quote body) is a
// native TextFlow: one contiguous, selectable run, not a word-per-view scatter.
// Style globals (C/BODY/HEADING/SCALE) are set per rebuild and read directly; the
// per-render family, body line-height, and link dispatcher ride this Ctx.
export interface Ctx { family: string; lead: number; onLink: (href: string) => void }

/** The vertical stacking spine every prose container uses. Owns only its children's
 *  y (SimpleLayout leaves the cross axis and sizes alone), so a child growing after
 *  an async measure re-flows the stack through the ordinary reactive wake. */
/** The prose block stack — a PRIVATE strategy over the Layout kernel (the
 *  language-facing SimpleLayout is a library class now; the runtime keeps its
 *  own tiny y-stack for rendered blocks — same place() shape, no surface). */
class ProseStack extends Layout {
  spacing = 0;
  /** THE INLINE VIEWS this stack also places — view → (its slot, the flow that
   *  laid it out). Empty for every prose container but the rich text's own
   *  stack, where the inline views live. A slot child takes no room in the
   *  column: its box comes from its flow's published geometry, offset into these
   *  coordinates. This is the Layout the design calls for — it computes from
   *  values (the published fact, the flow's own position) and asks the DOM
   *  nothing. */
  slotOf: ReadonlyMap<View, { key: string; flow: TextFlow }> = EMPTY_SLOTS;

  place(): Box[] {
    const kids = this.laid();
    if (this.slotOf.size === 0) {
      let pos = 0;
      return kids.map((c) => {
        const box: Box = { y: pos };
        if (c.visible) pos += c.height + this.spacing;
        return box;
      });
    }
    // Pass one: the column, over the BLOCK children only.
    const pos = new Map<View, number>();
    let y = 0;
    for (const c of kids) {
      if (this.slotOf.has(c)) continue;
      pos.set(c, y);
      if (c.visible) y += c.height + this.spacing;
    }
    return kids.map((c) => {
      const s = this.slotOf.get(c);
      if (s === undefined) return { y: pos.get(c) ?? 0 };
      const box = s.flow.slots()[s.key];
      if (box === undefined) return { x: 0, y: 0 };   // not yet flowed
      // Compose the flow-local box into these coordinates: the offsets of every
      // container between the flow and the top-level block (a list row, a quote
      // body, a table cell), then the block's own place in the column.
      //
      // ⚠ The top-level block's `y` is taken from `pos` above, NOT read off the
      // view — this pass WRITES that slot, and a pass that reads what it writes
      // is its own dependency.
      let ox = box.x, oy = box.y;
      let n: View = s.flow;
      while (n.parent instanceof View && n.parent !== this.view) { ox += n.x; oy += n.y; n = n.parent; }
      return { x: ox + n.x, y: oy + (pos.get(n) ?? n.y) };
    });
  }
}
const EMPTY_SLOTS: ReadonlyMap<View, { key: string; flow: TextFlow }> = new Map();

/** Do two slot-geometry facts say the same thing? The equality gate on the
 *  publish, so a re-measure that moved nothing wakes nothing. */
function sameSlots(a: Record<string, SlotBox>, b: Record<string, SlotBox>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = a[k], y = b[k];
    if (y === undefined || x.x !== y.x || x.y !== y.y || x.width !== y.width || x.height !== y.height) return false;
  }
  return true;
}

export function yStack(spacing: number): ProseStack {
  const s = new ProseStack();
  s.spacing = spacing;
  return s;
}

/** Visit every run-bearing block in `nodes`, in reading order — through list
 *  markers and items, quotes, code boxes and table cells. */
function eachBlock(nodes: readonly RichNode[], fn: (b: RichBlock) => void): void {
  for (const n of nodes) {
    if (!isStructural(n)) { fn(n); continue; }
    switch (n.tag) {
      case "list": for (const it of n.items) { fn(it.marker); eachBlock(it.blocks, fn); } break;
      case "quote": eachBlock(n.blocks, fn); break;
      case "code": fn(n.block); break;
      case "table": for (const c of n.header) fn(c); for (const r of n.rows) for (const c of r) fn(c); break;
      case "rule": break;
    }
  }
}

/** A native flowing block of styled text — one contiguous, selectable region on the
 *  DOM backend. `content` is the resolved RichBlock(s); `width` is the flow width. */
export function flowView(content: RichNode[], width: number, ctx: Ctx): TextFlow {
  const rt = new TextFlow();
  rt.width = width; rt.flowWidth = width; rt.content = content; rt.onLink = ctx.onLink;
  rt.structured = content.some(isStructural);
  setRewidth(rt, (w) => rt.reflow(w));
  // Whose inline views these are: the slot host binds each key to THIS flow, so
  // the rich text's Layout knows where to read its box from.
  if (SLOTS !== null) {
    const keys: string[] = [];
    eachBlock(content, (b) => { for (const r of b.runs) if ("view" in r) keys.push(r.view.slot); });
    if (keys.length > 0) SLOTS.bind(rt, keys);
  }
  return rt;
}

/** Re-widthing a view without rebuilding it. Registered by whatever built the
 *  view, because only the builder knows its internals; `RichText.relayout`
 *  looks one up per top-level block. A view with no entry forces the old full
 *  rebuild, so an unconverted block type is safe, just not fast. */
type Rewidth = (contentWidth: number) => void;
export const REWIDTH = new WeakMap<View, Rewidth>();
export function setRewidth<T extends View>(v: T, f: Rewidth): T { REWIDTH.set(v, f); return v; }

/** The plain text of an inline sequence — for a heading's anchor slug. Drops
 *  emphasis/link wrappers and keeps the readable characters (matches what a
 *  reader sees, so the slug reads like the heading). */
function inlineText(inline: Inline[]): string {
  let s = "";
  for (const n of inline) {
    if (n.t === "text" || n.t === "code") s += n.value;
    else if (n.t === "br") s += " ";
    else if (n.t === "image") s += n.alt;
    // An inline view contributes no text to a heading's slug: it is a view.
    else if ("inline" in n) s += inlineText(n.inline);
  }
  return s;
}

/** One paragraph or heading resolved to the seam's RichBlock shape. A heading
 *  also carries its `anchor` — the deterministic slug of its text (location.md §6:
 *  a heading IS its anchor) — so a fragment `@name` can bring it into view. */
export function proseBlock(b: Extract<Block, { t: "paragraph" }> | Extract<Block, { t: "heading" }>, gapBefore: number, bodyColor: number, ctx: Ctx): RichBlock {
  if (b.t === "heading") {
    const size = PROSE.heading[b.level - 1];
    return { tag: `h${b.level}`, runs: richRunsOf(b.inline, base(size, HEADINGW, HEADINGC), ctx.family), gapBefore, lineHeight: 1.2, fontSize: sz(size), family: ctx.family, weight: HEADINGW, anchor: headingSlug(inlineText(b.inline)) || undefined };
  }
  return { tag: "p", runs: richRunsOf(b.inline, base(BODY.size, BODY.weight, bodyColor, BODY.tracking), ctx.family), gapBefore, lineHeight: ctx.lead, fontSize: sz(BODY.size), family: ctx.family, weight: BODY.weight };
}

/** A laid-out top-level block: the view, and the geometry its width/x derive
 *  from — kept so a width change can redo that arithmetic without rebuilding. */
export interface Laid { view: View; geo: ReturnType<typeof geoFor> }

/** Apply a new container width to a laid-out set of blocks, in place.
 *  Returns false if any block has no re-width — the caller then rebuilds. */
export function relayoutEntries(entries: Laid[], width: number): boolean {
  // ⚠ CHECK ALL, THEN APPLY. Bailing part-way through leaves the blocks before
  // the un-re-widthable one already re-laid — and re-widthing a flow costs a
  // full text layout — only for the caller's fallback rebuild to throw that
  // work away. A document with a `pre`, `code` or `table` in it (any Viewer
  // reader page) would then do strictly MORE work per resize than the plain
  // rebuild it replaced. This way it is either all-rewidth or straight to
  // rebuild, never both.
  for (const e of entries) if (REWIDTH.get(e.view) === undefined) return false;
  for (const e of entries) {
    const cw = contentWidth(width, e.geo);
    REWIDTH.get(e.view)!(cw);
    e.view.x = placeX(width, cw, e.geo);
  }
  return true;
}

// The code text's left indent inside a box: the base pad, plus room for the
// `codeRule` bar when one is drawn.
const codePadLeft = (bar: boolean): number => PROSE.codePad + (bar ? PROSE.codeRuleWidth + PROSE.codeRuleGap : 0);

/** The code box's chrome — tint (`codeBackground`, else the themed house
 *  tint), rounding, padding and the optional `codeRule` bar — shared by a
 *  fenced block and a highlighted `<pre>`, and by both flows. */
export function codeChrome(): { fill: number; radius: number; pad: number; padLeft: number; bar: { width: number; color: number } | null } {
  const bar = CODERULE !== null ? { width: PROSE.codeRuleWidth, color: CODERULE } : null;
  return { fill: CODEBG ?? C.codeBg, radius: PROSE.codeRadius, pad: PROSE.codePad, padLeft: codePadLeft(bar !== null), bar };
}

/** Code as a `pre` block: whitespace kept, the runs' own `\n`s the line breaks,
 *  set at the code face's natural line box (ascent + descent), not the prose
 *  lead. The runs carry the code family and each token's color. */
export function codeBlock(runs: RichRun[]): RichBlock {
  const fm = fontMetrics(fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" }));
  return { tag: "pre", runs, gapBefore: 0, lineHeight: (fm.ascent + fm.descent) / sz(CODESIZE), fontSize: sz(CODESIZE), pre: true };
}

/** An item's marker: its number in an ordered list, else a bullet, or a task box. */
export function listMarker(b: Extract<Block, { t: "list" }>, it: Extract<Block, { t: "list" }>["items"][number], i: number): string {
  return b.ordered ? `${b.start + i}.` : it.task === null ? "•" : it.task ? "☑" : "☐";
}

/** One table row's cells as blocks, each in its column's GFM alignment. */
export function tableCells(b: Extract<Block, { t: "table" }>, cells: Inline[][], weight: FontWeight, color: number, ctx: Ctx): RichBlock[] {
  const out: RichBlock[] = [];
  for (let c = 0; c < b.header.length; c++) {
    const al = b.align[c];
    out.push({
      tag: "p", runs: richRunsOf(cells[c] ?? [], base(BODY.size, weight, color, BODY.tracking), ctx.family),
      gapBefore: 0, lineHeight: ctx.lead, fontSize: sz(BODY.size), align: al === "center" || al === "right" ? al : undefined,
    });
  }
  return out;
}

// ── the components ───────────────────────────────────────────────────────────
// `RichText` is the ABSTRACT family: flowing, structured, styled text. You never
// write `RichText [ ]` (like `Layout`, it names no format) — you write `Markdown`
// or `HTMLText`, which differ ONLY in how they parse their source into the block
// tree. The rendering engine is shared here (reactive TextFlow containers — see
// layoutBlocks); the base owns the reactive render, each concrete class supplies a
// parser. Shared attributes (lineHeight/bodyColor/fontScale) and the `link` event
// live on the base, so both formats inherit them.
export abstract class RichText extends View {
  // FACE + rich-text STRUCTURE slots (off View — docs/system-design/style.md):
  // each defaults to the nearest provided value, so prose inherits its region's
  // style; `selectable` defaults TRUE (a flowing document selects by nature).
  declare textColor: Color;
  declare fontSize: number;
  /** A family string, a Font, or a list of them. */
  declare fontFamily: FamilyValue;
  declare fontWeight: FontWeight;
  declare letterSpacing: number;
  declare headingColor: Color;
  declare headingWeight: FontWeight;
  declare linkColor: Color;
  declare codeColor: Color;
  declare codeSize: number;
  declare codeFamily: FamilyValue;
  declare codeBackground: Color;
  declare codeRule: Color;
  declare richTextLayout: Readonly<Record<string, { maxWidth?: number; margin?: readonly [number, number]; align?: "left" | "center" | "right" }>> | null;
  declare lineHeight: number;
  /** Line clamp over the whole flow (schema.ts). 0 = unclamped. */
  declare maxLines: number;
  /** True when the clamp dropped something — what a "Show more" binds to. */
  declare truncated: boolean;
  declare bodyColor: number | null;
  declare linkUnderline: boolean;
  declare fontScale: number;
  /** Color-scheme override (null = follow the App's OS `dark`). */
  declare dark: boolean | null;
  /** The y of the first line's baseline in this box — what `align = baseline`
   *  sits a Markdown/HTMLText on. A flow CLAIMS it (never discovered by the
   *  layout): the first block's first line when the document opens with prose;
   *  null when it opens with a table, list, code or rule, which is "declares
   *  none" to a baseline row. Read-only, reactive — re-claimed on every rebuild
   *  and re-width. */
  declare baseline: number | null;
  private built: View[] = [];

  /** Parse the current source into the block tree. `opts` carries the inline-view
   *  gate (which tag names are program classes) and the refusal channel. */
  protected abstract parseSource(opts: ReadOptions): Block[];
  /** What a refused piece of content does: `strip` (drop it, keep going, say so
   *  once) or `error` (throw). HTMLText declares it; Markdown has no such
   *  attribute and takes the default, which is also what raw markup has always
   *  done there — it stays the text it was written as. */
  protected policy(): Unsupported { return "strip"; }
  /** The source string(s) folded into the reactive render key, so an edit
   *  (or a policy change) re-parses and re-flows. */
  protected abstract sourceKey(): string;
  /** Named styles a source can reference (HTMLText's `styles`); none by
   *  default — Markdown has no syntax to name one. */
  /** The named-style palette for this render: the `textStyles` map, which
   *  defaults to the nearest provided one (defineAttributes below). */
  declare textStyles: Record<string, RunStyle>;
  protected stylesOf(): Record<string, RunStyle> { return this.textStyles ?? EMPTY_STYLES; }

  /** A rich text's type size is `fontScale`, its own attribute, and it never
   *  touches the geometry `scale` every other view means by that name. The
   *  glyphs are scaled into the runs, so the measured box IS the painted box
   *  and `scale` stays 1 — which is what lets paint, the hit walk's inverse,
   *  `rootTransform` and both auto-extent paths (the JavaScript derive and the
   *  kernel's native rule) read one geometry and agree, with nothing to mask.
   *  A rich text that IS transformed says so with `scale`, like any view, and
   *  every reader honours it. */

  override attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    super.attach(backend, parentSurface, before);
    // Reactive render: re-parse and rebuild whenever the source OR `width` changes
    // (a resize re-flows, not only an edit); `dark`/`fontScale` in the key so a theme
    // flip or font-size change re-renders.
    // STRUCTURE — the source and everything baked into the runs (palette, fontScale,
    // sizes). These genuinely need a re-parse and a rebuild.
    // `faceGeneration()` is in the key because the flow MEASURES inside rebuild,
    // which is the apply — where reads are not tracked (face-table.ts). Without
    // it a face that lands after this flow was built leaves every run placed by
    // the fallback's widths, and paints the real face over those positions.
    const c = new Constraint(`${this.constructor.name}.render`, () => `${this.sourceKey()} ${this.lineHeight} ${this.maxLines} ${this.bodyColor} ${this.isDark()} ${this.fontScale} ${this.codeBackground} ${this.codeRule} ${faceGeneration()} ${heldFamily(this, "fontFamily", this.fontFamily)} ${heldFamily(this, "codeFamily", this.codeFamily)}`, () => this.rebuild(), 0);
    c.run();
    onDiscard(this, () => c.dispose());
    // WIDTH — nothing structural depends on it, so re-width in place. Separate
    // constraint, and it must run AFTER the first build (c.run() above) so there
    // is something to re-width. A width nobody gives is the text's own (the
    // build fitted it), so there is nothing to re-width to.
    const cw = new Constraint(`${this.constructor.name}.rewidth`, () => `${this.width}`, () => { if (!this.ownWidth()) this.relayout(this.width > 0 ? this.width : READING_MEASURE); }, 0);
    cw.run();
    onDiscard(this, () => cw.dispose());
  }

  /** The color scheme for the house rich-element palette: the explicit `dark`
   *  override if set (an app whose own theme selector differs from the OS), else
   *  the root App's OS `dark`, read by walking to the tree root. */
  private isDark(): boolean {
    if (this.dark != null) return this.dark;
    let r: unknown = this;
    while (r instanceof View && r.parent !== null) r = r.parent;
    return !!(r as { dark?: boolean }).dark;
  }

  /** A link run was activated. Mechanism only: fire `onLink(href)` for the app to
   *  dispatch (custom routing — the docs app's openDocLink); unhandled, the href
   *  goes into the App's FOLLOW (location.md §0.5) — "#story" navigates in-app,
   *  anything else leaves through navigate — so authored prose links work with
   *  no wiring at all. (The old fallback was `navigate(href)` raw, which sent a
   *  fragment ref to the HOST as an outbound URL — the browser then opened
   *  DISTRO_ROOT + "#…", a different page entirely: §12.2's second half.) */
  private dispatchLink(href: string): void {
    if (typeof (this as unknown as Record<string, unknown>).onLink === "function") { fireEvent(this, "link", href); return; }
    let r: unknown = this;
    while (r instanceof View && r.parent !== null) r = r.parent;
    const app = r as unknown as { follow?: (ref: string) => void; navigate?: (to: string) => void };
    if (typeof app.follow === "function") app.follow(href);
    else app.navigate?.(href);   // a non-App root: external links keep working
  }

  /** The last layout's blocks, with the geometry each derived from. */
  private laid: Laid[] = [];

  /** A WIDTH-ONLY change: re-width what is already built instead of rebuilding.
   *
   *  Nothing structural depends on width — `parseSource()` never sees it, and a
   *  RichBlock carries no wrapping (the backend is handed the width and does
   *  the wrapping itself). All width does is set each block's content width and
   *  x. Rebuilding for it re-parsed the source, discarded every view and
   *  re-attached fresh ones, which on the native host meant a synchronous text
   *  layout per flow — ~40 per drag step, 699ms of a 712ms frame, most of it for
   *  flows whose width had not actually changed.
   *
   *  Falls back to a full rebuild if any block has no re-width registered, so an
   *  unconverted block type stays correct. */
  private relayout(width: number): void {
    // A clamped document's allotments depend on how its lines wrap, and wrapping
    // depends on width — so a width change re-spends the budget from the top.
    if (this.maxLines > 0) { this.rebuild(); return; }
    if (this.laid.length === 0) { this.rebuild(); return; }
    if (!relayoutEntries(this.laid, width)) { this.rebuild(); return; }
    this.childrenMutated();
    this.claimBaseline();
  }

  /** True when no author and no layout gives this box its width: it is then the
   *  width of the text itself (fitNatural). The auto-extent that reports that
   *  width back is not a giver. */
  private ownWidth(): boolean {
    if (isSet(this, "width")) return false;
    const owner = ownerOf(this, "width");
    return owner === null || owner.isAutoExtent;
  }

  /** A rich text with no width of its own is AS WIDE AS ITS TEXT: laid out at
   *  the reading measure, then re-flowed at its widest line (plus a 2px guard,
   *  so a renderer measuring a hair wider cannot wrap a line early). The content
   *  box — and so `x = center`, a row's spacing, a ring around it — is then the
   *  text's. Only a document of running text fits; one holding a list, table,
   *  quote or code keeps the measure. */
  private fitNatural(): void {
    if (!this.ownWidth()) return;
    let natural = 0;
    for (const e of this.laid) {
      const f = e.view;
      if (!(f instanceof TextFlow) || f.content.some((b) => isStructural(b) || b.pre === true)) return;
      natural = Math.max(natural, f.widestLine() + 2 + e.geo.ml + e.geo.mr);
    }
    natural = Math.ceil(natural);
    if (natural < READING_MEASURE) relayoutEntries(this.laid, natural);
  }

  /** Land the `baseline` fact: the first stacked block sits at y = 0, so when
   *  it is a prose flow its first line's baseline IS this box's. */
  private claimBaseline(): void {
    const first = this.laid[0]?.view;
    setBound(this, "baseline", first instanceof TextFlow ? first.firstBaseline : null);
  }

  /** The inline views this rich text holds (identity across content changes) —
   *  created on first need, so a document with no `<Class/>` tag allocates
   *  nothing at all. */
  private slotHost: SlotHost | null = null;

  private rebuild(): void {
    C = this.isDark() ? COLORS_DARK : COLORS_LIGHT;   // pick the palette for this render
    // A renderer that lays whole documents out takes this one as ONE flow — one
    // region to wrap, select and find in — unless a line budget is in force,
    // which the view path spends block by block as it builds.
    const whole = this.surface?.richBlocks === true && !(this.maxLines > 0);
    if (!whole) startBudget(this.maxLines);
    SCALE = this.fontScale || 1;                      // font-size multiplier for this render
    STYLES = this.stylesOf();                         // named styles for this render
    for (const v of this.built) { this.removeChild(v); v.discard(); }
    this.built = [];
    const width = this.ownWidth() || !(this.width > 0) ? READING_MEASURE : this.width;
    // The family a flow's value names now — held while a newly chosen font is
    // inside its wait, exactly as the render key above read it (font-value.ts).
    const family = heldFamily(this, "fontFamily", this.fontFamily) || FALLBACK_FAMILY;
    const lead = this.lineHeight || 1;
    const bodyColor = this.bodyColor ?? C.bodyColor;
    // Running text obeys the ambient text style, exactly like a
    // `Text` does — so rich text honors its inherited style like every other
    // run. Size/weight/tracking follow fontSize/fontWeight/
    // letterSpacing; their View defaults (16/normal/0) match the house body, so
    // prose that sets nothing renders unchanged. Color stays on the theme-aware
    // `bodyColor` house default (textColor's default is opaque black, which would
    // break dark-mode prose), overridable via `bodyColor`.
    BODY = { size: this.fontSize || PROSE.body, weight: this.fontWeight || "normal", tracking: this.letterSpacing || 0 };
    HEADINGW = this.headingWeight || "bold";
    HEADINGC = this.headingColor ?? C.headingColor;
    LINKC = this.linkColor ?? C.link;
    LINKU = this.linkUnderline === true;
    CODEC = this.codeColor ?? C.code;
    CODESIZE = this.codeSize || PROSE.codeSize;
    CODEFAM = heldFamily(this, "codeFamily", this.codeFamily) || PROSE.mono;
    CODEBG = this.codeBackground;
    CODERULE = this.codeRule;
    LAYOUT = this.richTextLayout ?? {};
    RESOLVE_SRC = (src) => resolveAsset(src, this.root);
    const ctx: Ctx = { family, lead, onLink: (href) => this.dispatchLink(href) };

    // THE INLINE VIEWS of this build. The host is the identity across content
    // changes: a tag matched to a view it already made keeps that view (hover, a
    // running spring, focus) and only the attributes whose converted values
    // changed are rewritten; a vanished tag's view is discarded at `end()`.
    const host = (this.slotHost ??= new SlotHost(this));
    host.begin();
    SLOTS = host;

    // Render the block tree: as one document flow, or (the view path) as a flat
    // list of stacked sub-views — paragraphs and headings coalesce into
    // TextFlows, and list/table/quote/code/rule each become their own reactive
    // sub-view (their text regions are TextFlows too).
    let children: Laid[];
    try {
      const blocks = this.parseSource(host.readOptions(this.policy()));
      if (whole) {
        const nodes = docNodes(blocks, bodyColor, ctx);
        children = nodes.length > 0 ? [{ view: flowView(nodes, width, ctx), geo: WHOLE }] : [];
      } else children = layoutBlocks(blocks, width, bodyColor, ctx);
    } finally {
      SLOTS = null;
    }
    let at = 0;
    for (const e of children) {
      this.insertChild(e.view, at++);
      this.built.push(e.view);
      if (this.backend !== null) e.view.attach(this.backend, this.surface);
    }
    // AN INLINE VIEW PAINTS ON TOP OF THE FLOW IT SITS IN, and its surface must
    // say so. Model order already does — the blocks above went in at 0…n, ahead
    // of views the block pass had appended — but the surfaces did not follow: a
    // slot view is realized while the blocks are still being laid out, so it was
    // parented before any flow existed and stayed UNDER the flow's element.
    // Under it the view is not merely behind, it is unreachable: the flow's box
    // carries the selectable text and takes pointer events across the whole
    // line, so every click on the view landed on the text instead and no handler
    // ever ran. Re-parent them at the end, in model order, now the flows are in.
    if (this.surface !== null) for (const v of host.views()) if (v.surface !== null) this.surface.insertChild(v.surface, null);
    this.laid = children;                 // kept so a width change can re-width
    const opening = children[0]?.view;
    if (opening instanceof TextFlow) opening.onBaseline = () => this.claimBaseline();
    this.fitNatural();
    // Stack the block-views, PROSE.blockGap apart; their heights (a TextFlow's
    // measured at attach, a container's derived by auto-extent) drive the stack,
    // and auto-extent gives this box its height — so leave `height` unset. The
    // same stack also places the inline views, from their flows' published boxes.
    const stack = yStack(PROSE.blockGap);
    stack.slotOf = host.end();
    this.layout = stack;
    this.childrenMutated();
    this.claimBaseline();
    // The build spent the budget; report what happened, so a
    // "Show more" has a fact to bind to rather than a look to infer.
    setBound(this, "truncated", whole ? false : budgetTruncated());
  }
}

/** Where a rich text with no width of its own wraps. */
const READING_MEASURE = 640;

// Shared attributes live on the RichText base; Markdown (markdown.ts) and
// HTMLText (html-text.ts) inherit them and add only their own source attribute(s).
/** One frozen empty palette, so a rich text with no styles never churns its
 *  source key (stylesOf rides sourceKey's signature). */
const EMPTY_STYLES: Record<string, RunStyle> = Object.freeze({});

defineAttributes(RichText, {
  // The named-style palette — inherited, like the face slots below it. `styles`
  // is taken (View.styles = the skin class list), so the map the CONTENT
  // references is `textStyles`; the `text` earns its place disambiguating them.
  textStyles: { def: EMPTY_STYLES, defBinding: providedDefault("textStyles", EMPTY_STYLES) },
  // FACE slots, off View: each defaults to the nearest provided value.
  textColor: { def: 0x000000, defBinding: providedDefault("textColor", 0x000000) },
  fontSize: { def: 16, defBinding: providedDefault("fontSize", 16) },
  fontFamily: { def: "sans-serif", defBinding: providedDefault("fontFamily", "sans-serif") },
  fontWeight: { def: "normal", defBinding: providedDefault("fontWeight", "normal") },
  letterSpacing: { def: 0, defBinding: providedDefault("letterSpacing", 0) },
  // `selectable` is NOT declared here: RichText reads it as a provided value
  // (effSelectable / TextFlow), so a container's provision reaches the flow
  // children without RichText's own slot shadowing the walk.
  // Rich-text STRUCTURE slots, off View: heading/link/code/richTextLayout —
  // null color = the theme-aware house token (resolved in rebuild()).
  headingColor: { def: null, defBinding: providedDefault("headingColor", null) },
  headingWeight: { def: "bold", defBinding: providedDefault("headingWeight", "bold") },
  linkColor: { def: null, defBinding: providedDefault("linkColor", null) },
  linkUnderline: { def: true, defBinding: providedDefault("linkUnderline", true) },
  codeColor: { def: null, defBinding: providedDefault("codeColor", null) },
  codeSize: { def: 0, defBinding: providedDefault("codeSize", 0) },
  codeFamily: { def: "", defBinding: providedDefault("codeFamily", "") },
  codeBackground: { def: null, defBinding: providedDefault("codeBackground", null) },
  codeRule: { def: null, defBinding: providedDefault("codeRule", null) },
  richTextLayout: { def: null, defBinding: providedDefault("richTextLayout", null) },
  lineHeight: { def: 1 }, bodyColor: { def: null }, fontScale: { def: 1 }, dark: { def: null }, baseline: { def: null },
  maxLines: { def: 0 }, truncated: { def: false },
});

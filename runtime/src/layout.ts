// Layout — views arranging their children declaratively (language §5: "how
// those children are arranged is a reactive `Layout` attribute you set on the
// view"; the strategies are Layout subclasses). A layout is NOT a child and
// NOT a container type: it is the value of the view's `layout` slot, written
// as the member `layout: SimpleLayout [ axis = y, spacing = 10 ]`.
//
// Semantically a layout is nothing but standing computations over the
// children's geometry, riding the R4 reactive core — no delegate lists, no
// update() methods, no bespoke invalidation (the LZX LzLayout family in
// ../runtime/classes/utils/layouts/ was read for intent; its
// updateDelegate machinery is exactly what Cells/Constraints replaced).
//
// THE SEAM — a strategy IS its `place()`: pure geometry, one Box per laid
// child (laid() is the one definition of which children a layout manages).
// The base's install() turns that into standing constraints; every concrete
// arrangement — the runtime's own and any authored in Declare (a library
// class extending Layout supplies place() as an ordinary method) — is a pure
// function over the same seam. TweenLayout (tween-layout.ts) refines the WRITE
// path (it interpolates between two snapshots of place()); nothing else overrides
// install.
//
// Granularity — ONE PASS per layout, gated fan-out (a kernel-only shape: the
// language surface binds one slot per constraint; the kernel is free to put
// one engine behind many slots). The pass-constraint computes place() — its
// tracked reads (view size, the strategy's attributes, child sizes and
// visibility) are the dependencies — and applies every box through the
// ordinary equality-gated writes, so children that did not move produce no
// downstream wake. Cost per relevant change: one O(N) pure-arithmetic pass +
// writes on exactly the children that moved. (The R4 fine-grained
// alternative — chained per-child constraints — re-ran fewer computes for
// middle-child changes but was a bespoke wiring per strategy; the pass is
// the uniform kernel under every place(), and the equality gate keeps the
// expensive half — pushes and paints — exactly as precise as before.)
//
// The library's own SimpleLayout, unmodified (`$canon`), with nothing aligned
// and nothing flexing is placed by the KERNEL instead ($installNative,
// kernel_layout_add): the same run of footprints and spacing, computed over the
// table with no place() in JavaScript, and the same claims. Every other case —
// and every host without that rule — takes the pass.
//
// Child ORDER is the semantic order (the R4 ruling's deliberate exception:
// tree order is paint order) — a stacking layout consumes exactly it, and
// place()'s boxes align with laid() BY INDEX. Invisible children are skipped
// and their space reclaimed (the LZX rule); a skipped child's own position
// still computes uniformly — the slot it would occupy — so re-showing it
// needs no special case.
//
// Slack and Spacer — a run that does not fill its container leaves slack,
// and the laid children cannot absorb it themselves (their flow-axis slot is
// owned). The structural answer is a flexing child (`flexes = true` — a
// content view that takes the rest, or the library's empty Spacer): a
// strategy's place() divides the slack among the flexing children, and the
// kernel drives each one's flow-axis SIZE through a percent-family constraint
// (markPercent) so a container deriving its own extent from its children never
// counts a flexing child — the same cycle guard percent Lengths ride (a
// flexing child's size IS parent-extent-derived).
//
// THE RULE (docs/system-design/layout-ownership.md): a layout places its
// children, and what it places a child does not declare — in any spelling, a
// literal, a percent, `center`, a `{ }`. What a layout places is KNOWN, never
// declared: the checker reads it from the source (the library's table, per
// instance; an author's place() box keys) and refuses a conflicting
// declaration at compile time. This file holds the line for what only exists
// at run time.
//
// Ownership: a strategy owns exactly the slots its boxes carry, per child
// (the one-owner-per-slot model, attributes.ts). claim() captures each slot's
// base at first touch; unclaim() restores it — so a slot a tier stops
// allocating (a plan's share, a drop) reverts to what it was instead of
// stranding the arrangement's last write. A child that also owns a slot the
// strategy places is a conflict, and it surfaces in ONE wording
// (layoutConflictMessage / discardedValueMessage, errors.ts) at four run-time
// sites: the layout's own claim meeting an author binding (reportConflict —
// contained and reported once, never a settle-aborting throw), an author
// binding installing over a layout's (attributes.ts own() — a throw), a
// handler's write to a placed attribute (the setter — a throw, in the
// momentary form), and an author literal on a placed attribute
// (reportDiscarded — contained, an error). Each names the layout, the child
// and attribute, the author's line, and the ways out; `ignoreLayout = true` is
// how a child takes its whole geometry back. Layout claims carry `arrangedBy`
// (TweenLayout's too) so the attributes.ts sites recognize a layout owner.
//
// AND THE ARRANGEMENT NEVER ADVANCES BY A NUMBER IT DID NOT WRITE. A refused
// SIZE claim used to leave the strategy laying the neighbours from the width
// it *meant* to allocate — a live hole (116px, measured) that no rung could
// see. A child whose size the author owns now leaves the arrangement whole
// (`authorSized`), so the run packs around it and every number the layout
// writes describes the picture it produced.
//
// Pay-per-use: a view with no layout carries nothing (the slot's default is
// null on the prototype); an idle laid tree is inert constraint data — zero
// rAF, zero polling.

import { Node } from "./node.js";
import { Constraint, afterSettle, kernel, kernelLoaded } from "./reactive.js";
import { blockOf, cellIdsOf, isSet, markPercent, own, ownerOf, release, setBound, setPosOf, slotCellOf, useSiteSet } from "./attributes.js";
import { LAYOUT_NOWRITE } from "./kernel-loader.js";
import { DeclareError, discardedValueMessage, layoutConflictMessage, noBaselineMessage, stackBaselineMessage } from "./errors.js";
import { isWindowedBlock, View, viewLayoutReady, type LayoutStrategy } from "./view.js";

/** The geometry a layout places one child in: any subset of position, size,
 *  and visibility. `w`/`h` name the sizes so a box is a plain record, distinct
 *  from the child's live `width`/`height` slots the layout writes. A strategy
 *  OWNS exactly the slots its boxes carry — PER CHILD, probed at install: a box
 *  without `h` leaves that child's height to the child, and the shape may
 *  differ from box to box (a ResponsiveLayout carries a width for a child its
 *  plan gives a `share` and none for a child it does not; a Spacer carries its
 *  flexed size where its siblings carry only a position). It may also differ
 *  from install to install, which is what the shape watcher exists for.
 *  `vis: false` hides — the zero-size-is-hidden idiom made explicit. */
export interface Box {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  vis?: boolean;
}

/** A Box with every slot present — what TweenLayout interpolates (its lerp
 *  needs both endpoints of all four geometry slots plus visibility). */
export type FullBox = Required<Box>;

/** Box key → the child slot it drives, in a stable order. */
const BOX_SLOTS: readonly (readonly [keyof Box, "x" | "y" | "width" | "height" | "visible"])[] = [
  ["x", "x"],
  ["y", "y"],
  ["w", "width"],
  ["h", "height"],
  ["vis", "visible"],
];

/** The abstract strategy. A layout is its `place()` — pure geometry, one Box
 *  per laid child — and the base turns that into STANDING constraints over the
 *  children's own slots (install below). `laid()` is the one definition of
 *  which children a layout manages. A subclass overrides `place()` to define an
 *  arrangement; it MAY also override `install()` when it can wire the same
 *  semantics more precisely (SimpleLayout's chained per-child constraints) or
 *  differently in time (TweenLayout's interpolated write path).
 *
 *  A Node — like Animator and Dataset, the other non-visual declarables (the
 *  ruled model: a declarable object is a Node, so hierarchy navigation from a
 *  layout's own code behaves as a developer expects). It is NOT a tree child,
 *  though: it lives in the view's typed `layout` slot, not in `children`, so a
 *  paint/hit walk never sees it. `parent`/`view` both point at the arranged
 *  view — the slot pusher wires them on attach — so `this.view.width`,
 *  `this.view.children`, `this.parent…` up to the root, and lexically-resolved
 *  ids all work; only the layout's own (always-empty) `children` is vestigial.
 *  `this.view` is the typed accessor (parent narrowed to View) the arrangement
 *  reads. */
export abstract class Layout extends Node implements LayoutStrategy {
  /** The view whose children this strategy arranges; null when unattached.
   *  Kept in step with `parent` (a Node link for upward navigation); this is
   *  the View-typed handle the arrangement uses. */
  view: View | null = null;
  private undo: (() => void) | null = null;

  /** Set when this strategy is the library's own SimpleLayout, unmodified
   *  (instantiate.ts buildLayout): what its place() does is then known, so the
   *  shape below is read from its inputs rather than from a placement. */
  $canon: "simple" | null = null;
  /** True while the KERNEL places this layout's children ($installNative). */
  $native = false;

  /** Which slots each laid child's box carries, as a signature — the shape the
   *  install was probed from. For an unmodified SimpleLayout it follows from its
   *  inputs alone: the flow position for every child, the flowed size for a
   *  visible flexing child, the cross position for every child when `align`
   *  claims it (SimpleLayout's place()). Anything else asks place(). */
  private $shapeSignature(): string {
    if (this.$canon !== "simple") {
      return this.place().map((b) => BOX_SLOTS.filter(([k]) => b[k] !== undefined).map(([k]) => k).join()).join("|");
    }
    const me = this as unknown as { axis: string; align: string };
    const xAxis = me.axis === "x", aligned = me.align !== "none";
    const out: string[] = [];
    for (const c of this.laid()) {
      const keys: string[] = [];
      if (xAxis || aligned) keys.push("x");
      if (!xAxis || aligned) keys.push("y");
      if (c.visible && c.flexes === true) keys.push(xAxis ? "w" : "h");
      out.push(keys.join());
    }
    return out.join("|");
  }

  /** Each claimed (child, slot)'s AUTHORED BASE value, captured at first claim
   *  and kept across rearm. When a strategy vacates a slot (an axis flip, a
   *  layout swap) the slot reverts to this base — the authored cross-axis
   *  literal (`y = 15`) or the class default — instead of stranding whatever
   *  the arrangement last wrote (release() leaves the stored value; the
   *  restore is ours to make). */
  private readonly bases = new Map<View, Partial<Record<string, unknown>>>();

  /** Begin arranging `view` (the View.layout pusher's entry). One strategy
   *  arranges one view: a strategy is written per element, and sharing one
   *  across views would make its reactive attributes action-at-a-distance.
   *
   *  Alongside install, a SHAPE WATCHER stands guard: the set of slots a
   *  strategy manages can itself depend on its inputs (a ResponsiveLayout
   *  tier flip swaps row→stack and shares appear/disappear), and the
   *  installed claims were probed from one shape. The watcher re-derives the
   *  shape signature under tracking and REARMS on change — a rearm restores
   *  vacated slots to their authored bases (see `rearming`) and re-probes.
   *  It lives OUTSIDE the install/undo cycle (rearm must not dispose its own
   *  trigger) and is disposed only on detach. */
  attachTo(view: View): () => void {
    if (this.view !== null) {
      throw new DeclareError(
        `this ${this.constructor.name} already arranges a ${this.view.constructor.name} — one strategy per view`
      );
    }
    this.view = view;
    this.parent = view; // navigation back-ref (not a children entry: the layout lives in view.layout)
    this.undo = this.$install(view);
    let lastShape: string | null = null;
    const watcher = new Constraint(
      `${this.constructor.name} shape`,
      () => this.$shapeSignature(),
      (sig) => {
        if (lastShape === null) {
          lastShape = sig as string;
        } else if (sig !== lastShape) {
          lastShape = sig as string;
          this.rearm();
        }
      }
    );
    watcher.run();
    return () => {
      watcher.dispose();
      this.undo?.();
      this.undo = null;
      this.view = null;
      this.parent = null;
    };
  }

  /** True while rearm() swaps installs — unclaim restores authored bases only
   *  then. A full detach (layout = null, a strategy swap) keeps the last
   *  arranged values instead (the documented release semantics: the slot
   *  reverts to a plain stored value); a rearm within ONE strategy (an axis
   *  flip, a plan regime change) must not strand the old arrangement's
   *  offsets on slots the new install no longer drives. */
  private rearming = false;

  /** Re-run install — the entry for a *structural* attribute change (axis),
   *  where the constraints' target slots themselves change. Value-level
   *  attributes (spacing) never need this: constraints read them under
   *  tracking and re-run through the ordinary machinery. */
  rearm(): void {
    if (this.view === null) return;
    const undo = this.undo;
    this.undo = null;
    this.rearming = true;
    try {
      undo?.();
      this.undo = this.$install(this.view);
    } finally {
      this.rearming = false;
    }
  }

  /** The children this strategy arranges: the view's View children, honoring
   *  the `ignoreLayout` opt-out (LZX's rule — a decoration/overlay child owns
   *  its own position, both axes). Non-View members (a Dataset, an Animator, a
   *  State) are never laid. In child order — order is the layout semantics —
   *  and `place()`'s boxes align with this array BY INDEX. */
  protected laid(): View[] {
    const v = this.view;
    if (v === null) return [];
    return v.children.filter(
      (c): c is View =>
        c instanceof View &&
        (c as { ignoreLayout?: boolean }).ignoreLayout !== true &&
        !this.authorSized.has(c)
    );
  }

  /** Children this arrangement WANTED to size and cannot, because the author
   *  owns that size already (install below). They are out of the arrangement
   *  entirely — not merely missing one slot — because a strategy that
   *  allocates a size lays its neighbours FROM that size: place() computes the
   *  next child's position by advancing over the width it meant to write, and
   *  if that width never lands, every position after it is a number describing
   *  a picture that does not exist (the measured 116px hole of a plan whose
   *  wide tier shares a width the child's own `{ … }` already owns). Dropping
   *  the child is the honest resolution and the one the message already names:
   *  the author owns this child's geometry, so the layout stops pretending to
   *  place it, and its siblings pack as if it were `ignoreLayout`.
   *
   *  A refused POSITION is different and stays put: no place() derives a box
   *  from a position it writes, so one child sitting where its author put it
   *  costs its siblings nothing. Re-derived from scratch at every install —
   *  ownership can change with the tier, and a rearm is when we may look. */
  private readonly authorSized = new Set<View>();

  /** Pure geometry — one Box per laid child, from this strategy's own
   *  attributes and `this.view`'s box. No time, no side effects. THE seam: a
   *  strategy IS its place(); everything else is shared machinery. The boxes'
   *  shape declares ownership — carry exactly the slots this strategy manages
   *  for THAT child (per box, not per strategy: a box without `h` leaves that
   *  child's height alone, and its neighbour's box may well carry one). */
  place(): Box[] {
    throw new DeclareError(
      `${this.constructor.name} declares no place() — a layout strategy IS its place(): ` +
      `declare it and return one box per child of laid(), aligned by index`
    );
  }

  /** THE ROOM THIS ARRANGEMENT HAS: the arranged view's CONTENT BOX on `size`
   *  — its extent less its own `padding` on that axis, never below 0 (view.ts
   *  `contentBox`). A strategy that needs the view's measurement — a flow
   *  deciding where to wrap, a plan dividing the width into shares, a run
   *  sizing its spacers — reads this and not `this.view.width`, and then a
   *  padded view costs it nothing to honor.
   *
   *  THE PADDING IS THE VIEW'S, not this strategy's (RULED 2026-09-19, moving
   *  it off the base): a layout simply arranges inside the room it is given,
   *  and a `place()` returning `{ x: 0 }` puts a child at the content origin
   *  because that is what `x = 0` means for every child — nothing in the
   *  kernel offsets a box. Two paddings, one on the view and one on whatever
   *  arranges it, would have been a genuine confusion.
   *
   *  Unlike `viewExtent` it is the plain measurement: it does not ask whether
   *  the view derives that extent from these very children. A strategy that
   *  needs the cycle-safe answer (an alignment band) wants `viewExtent`. */
  contentExtent(size: "width" | "height"): number {
    const v = this.view;
    // Floored for the arrangement's sake — a `place()` dividing a negative
    // room would hand out negative slots. `View.contentBox` itself does not
    // floor an UNPADDED box (a degenerate width stays what the author wrote,
    // so `padding = 0` is indistinguishable from no padding everywhere it is
    // read); this is the strategy-facing promise, and it says "never below 0".
    return v === null ? 0 : Math.max(0, v.contentBox(size));
  }

  /** Claim `slot` on `child` for constraint `k`: capture the authored base
   *  (first claim only — rearm must not capture the arrangement's own writes),
   *  then take ownership. Errors loudly on a standing AUTHOR binding (two
   *  owners), naming both sides. A *yielding* prior — auto-extent, auto-size,
   *  the runtime derive every child without an authored size carries — is not
   *  a second author: it yields to a layout's claim exactly as it yields to an
   *  author write (`own` disposes it), which is what lets a `place()` that
   *  returns sizes arrange children that never declared any. Refusing it here
   *  was the bug a data-driven treemap found (issue #16): every templated
   *  child auto-derives its size, so the arrangement died on a conflict the
   *  ownership machinery downstream was built to resolve — and the message
   *  blamed an authored binding that did not exist. */
  /** Per (child, slot) conflicts already reported — so a rearm storm (a
   *  shape-driven place() re-hitting the same author-owned slot every wave)
   *  says it ONCE, not per wave. Keyed by child identity, then slot. */
  private readonly reported = new WeakMap<View, Set<string>>();

  /** An author bound a slot this strategy's place() also returns. The
   *  one-owner rule leaves the slot to its author; say so once, name the fix
   *  (`ignoreLayout` for a child that owns its own place), and let the rest
   *  of the arrangement install. Reported like the other mid-settle-contained
   *  defects (a thrown handler, a wedged reconcile) — loud, attributed, and
   *  survivable, never a settle-aborting throw. */
  private $reportConflict(child: View, slot: string, arranger: string): void {
    if (this.$firstReport(child, slot)) {
      console.error(
        "[Declare] " +
          layoutConflictMessage(child.constructor.name, slot, arranger, null, ownerOf(child, slot)?.sourcePos)
      );
    }
  }

  /** A LITERAL on an attribute this strategy places — `Spacer [ height = 40 ]`
   *  in a run that flexes its spacers, `width = 120` on a child a plan shares.
   *  The language's rule (docs/system-design/layout-ownership.md §1–§2): what a
   *  layout places a child does not declare, in any spelling. The checker
   *  refuses this at compile time wherever it can see what the layout places —
   *  every library layout, and an author's layout whose place() returns literal
   *  box keys — so what reaches here is what only exists at run time: a
   *  layout whose place() builds its boxes with computed keys, a bound
   *  `ignoreLayout`, a plan that is not plainly literal.
   *
   *  It is an ERROR, in the same words as a binding on the same attribute —
   *  spelling never decides the answer — but a CONTAINED one: install() runs
   *  mid-settle on a rearm, where a throw aborts the whole settle, so the
   *  arrangement takes the attribute, the rest of the tree installs, and the
   *  report is made once per class and attribute (one authored line builds
   *  every replicated row).
   *
   *  Determinism is the residual to know about. install() learns what a
   *  strategy places from one call to place(), so a strategy whose box keys
   *  change with the room it is given is judged by the room it had then. The
   *  library's layouts return the same position keys at every size (a
   *  ResponsiveLayout places both axes in both flows since the rule landed,
   *  2026-09-22 — before, its row tier left `y` alone and its stack tier did
   *  not, so the verdict followed the viewport at boot); what still varies by
   *  tier is a plan's share and drop, which the checker reads from a literal
   *  plan. An author's layout is asked to keep the same discipline — the same
   *  keys at every size — and one that does not is judged at boot. */
  protected $reportDiscarded(child: View, slot: string, arranger: string): void {
    if (!useSiteSet(child, slot)) return; // nothing written here — the ordinary case
    // Deduped by CLASS and slot, not by child: one authored line builds 30
    // replicated rows, and it is one line that wants fixing, not thirty.
    const key = `${child.constructor.name}.${slot}`;
    if (this.discarded.has(key)) return;
    this.discarded.add(key);
    const v = (child as unknown as Record<string, unknown>)[slot];
    const shown = typeof v === "number" || typeof v === "boolean" ? String(v) : null;
    console.error(
      "[Declare] " +
        discardedValueMessage(child.constructor.name, slot, shown, arranger, setPosOf(child, slot))
    );
  }

  /** `Class.slot` pairs already reported as discarded — see reportDiscarded. */
  private readonly discarded = new Set<string>();

  /** Is this the first thing said about (child, slot)? A conflict report is
   *  once-only per child — a rearm storm re-hits the same slot every wave. */
  private $firstReport(child: View, slot: string): boolean {
    let seen = this.reported.get(child);
    if (seen === undefined) this.reported.set(child, (seen = new Set()));
    if (seen.has(slot)) return false;
    seen.add(slot);
    return true;
  }

  /** A strategy's own CONTAINED refusals — the same once-per-(child, key)
   *  discipline as a conflict, callable from a `.declare` place(): the child is
   *  placed at the line's start, the arrangement stands, the message says why.
   *  The checker refuses the same shapes first wherever the tree is static;
   *  these hold the line for what only exists at run time (a bound `align`, a
   *  created child, a `baseline` binding that yields none). */
  refuseBaseline(child: View): void {
    // Judged at the CLOSE of the settle, not mid-flight: a flow (Markdown,
    // HTMLText) claims its baseline when it renders, and the parent's first
    // pass can run before that — a `null` seen here may be a claim still on
    // its way. So the child is placed at the line's start now (the arrangement
    // never waits), and the refusal is spoken only if, with the settle
    // quiescent, it still declares none. One report per child, ever.
    let seen = this.reported.get(child);
    if (seen === undefined) this.reported.set(child, (seen = new Set()));
    if (seen.has("baseline") || seen.has("baseline?")) return;
    seen.add("baseline?");                 // a judgment is pending for this child
    afterSettle(() => {
      seen.delete("baseline?");
      const c = child as unknown as { baseline?: unknown; $surface: unknown };
      if (typeof c.baseline === "number") return;   // it arrived
      // Not yet attached: a flow claims its baseline when it RENDERS, and in a
      // browser the model settles once before the tree is attached (build →
      // settle → mount). Nothing to judge yet — the render that follows
      // changes the child's height, which re-lays the row and asks again.
      if (c.$surface == null) return;
      if (seen.has("baseline")) return;
      seen.add("baseline");
      console.error("[Declare] " + noBaselineMessage(child.constructor.name, this.constructor.name));
    });
  }

  /** THE BAND an alignment places children in: the arranged view's own extent
   *  on `size` — or **0 when that extent is measured from the very children
   *  this strategy lays**, where reading it would be the one-pass discipline's
   *  forbidden cycle (place() writes the children the extent sums). A caller
   *  folds it in with `Math.max(line, this.viewExtent(size))`: on a view that
   *  measures its children the answer is 0 and the line stands (and the two
   *  agree anyway — an aligned run's extent IS its widest child); on a view
   *  that was told its size the band is the box the author drew, which is what
   *  `align = center` has always meant.
   *
   *  (The defect this closed, 2026-09-17: a child sized `{ parent.width - 32 }`
   *  IS the widest laid child, so the line was its own width — it aligned to
   *  offset 0 and its siblings centred on IT instead of on the card. Every
   *  `align = center` column whose children derive their width from the
   *  parent lost its inset.)
   *
   *  The read of the extent is TRACKED, so a parent that resizes re-places its
   *  aligned children. The safety test is not: ownership is settled at attach
   *  and `!isSet` covers the window before auto-extent installs, so the only
   *  gap is a view whose content-derived size is later displaced by a direct
   *  imperative write — which re-places on the next child change like any
   *  other untracked fact the arrangement rearms on. */
  viewExtent(size: "width" | "height"): number {
    const v = this.view;
    if (v === null) return 0;
    const owner = ownerOf(v, size);
    if (owner === null) {
      // Unset and unowned: auto-extent measures these very children the moment
      // it installs, and attach order is not ours to assume.
      if (!isSet(v, size)) return 0;
    } else if (owner.isAutoExtent && owner.isNative) {
      // The view's own AUTO-EXTENT owns it, as a KERNEL rule: it measures these
      // very children by definition, and it reads them through the structure
      // words of its own body, not through dependency edges `readsAny` could
      // see (reactive.ts isAutoExtent). The JavaScript form needs no special
      // case — its reads are tracked edges like any other rule's.
      return 0;
    } else {
      // Owned — by `{ this.contentWidth + 16 }`, by a percent,
      // by the grandparent's own layout, by `{ parent.width }`. Only the ones
      // that READ a laid child close the loop; ask the constraint itself, in
      // kernel cell ids: a child's geometry lives in the kernel's table and
      // has no JS cell (see attributes.ts cellIdsOf).
      const ids = new Set<number>();
      for (const c of this.laid()) for (const id of cellIdsOf(c)) ids.add(id);
      if (owner.readsAny(ids)) return 0;
    }
    // The band is the CONTENT box: a padded column centres its children in the
    // room left between its insets, not in the whole view.
    return this.contentExtent(size);
  }

  private stackReported = false;
  refuseStackBaseline(): void {
    if (this.stackReported) return;
    this.stackReported = true;
    console.error("[Declare] " + stackBaselineMessage(this.constructor.name));
  }

  protected $claim(child: View, slot: string, k: Constraint): void {
    // The blocking-owner conflict is pre-filtered in install() (a contained,
    // once-reported diagnostic — no longer a settle-aborting throw); a claim
    // reaching here has no non-yielding prior.
    const base = this.bases.get(child) ?? {};
    if (!(slot in base)) {
      base[slot] = (child as unknown as Record<string, unknown>)[slot];
      this.bases.set(child, base);
    }
    own(child, slot, k);
  }

  /** Release `k`'s claim of `slot` on `child`; during a rearm, restore the
   *  authored base (see `rearming` — a full detach keeps the last values).
   *  Does NOT dispose `k` — one constraint may back many slots (the pass), so
   *  disposal is the detacher's, once per distinct constraint. */
  protected $unclaim(child: View, slot: string, k: Constraint): void {
    release(child, slot, k);
    if (!this.rearming) return;
    // While the windowing kernel owns this block's placement, a rearm's
    // base-restore must not clobber the logical positions it just wrote
    // (the suspension's other half — the pass skip alone leaves this
    // restore re-stacking every reconcile's rows at their captured bases).
    if (this.view !== null && isWindowedBlock(this.view)) return;
    const base = this.bases.get(child);
    if (base !== undefined && slot in base) {
      setBound(child, slot, base[slot]);
    }
  }

  /** The label claims and conflict errors carry. A strategy with an `axis`
   *  attribute gets it tagged on ("App's SimpleLayout[y]") — sharp diagnostics
   *  for any axis-bearing strategy, library or native. */
  protected $label(): string {
    const ax = (this as unknown as { axis?: unknown }).axis;
    const tag = typeof ax === "string" ? `[${ax}]` : "";
    return `${this.view === null ? "?" : this.view.constructor.name}'s ${this.constructor.name}${tag}`;
  }

  /** Stand up standing constraints over `view`'s children from `place()` —
   *  the ONE kernel wiring every strategy shares. Each child's own probe box
   *  declares its managed slots (shape may vary per child: a Spacer carries
   *  its flexed size, a plan-shared child its width, a plain sibling only its
   *  position). POSITIONS and VISIBILITY ride one shared pass-constraint —
   *  compute place() once per wave, fan out equality-gated writes (the
   *  kernel-only one-engine-many-slots shape the header describes). SIZES get
   *  a percent-family constraint per (child, slot) — markPercent — because a
   *  kernel-driven size is parent-extent-derived by nature and must sit out
   *  of auto-extent's max (the cycle guard percent Lengths ride); positions
   *  stay unmarked so containers keep auto-extending around laid children.
   *  Transactional: on a mid-install error nothing stays owned. Children are
   *  read at install (tree mutation is R8's rearm). TweenLayout overrides
   *  this with its interpolating write path over the same place(). */
  /** THE KERNEL'S STACK (kernel_layout_add): an unmodified SimpleLayout with
   *  nothing aligned and nothing flexing places exactly the flow position of
   *  every laid child — a run of footprints and spacing the kernel computes
   *  itself, with no place() in JavaScript. The claims are the pass's own: each
   *  child's flow slot, a child whose slot an author owns reported once and left
   *  in the run unwritten, a literal on the slot reported as discarded. Anything
   *  else — another strategy, alignment, a spacer, a windowed block, no kernel
   *  rule for it — is null, and the pass below places as ever. */
  private $installNative(): (() => void) | null {
    // DIAGNOSTIC: `globalThis.__declareLayoutTrace = []` collects why a stack
    // stayed on the pass (dev and profiling builds only, like the EXPR trace)
    const why = (reason: string): null => {
      if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) {
        const t = (globalThis as { __declareLayoutTrace?: string[] }).__declareLayoutTrace;
        if (Array.isArray(t)) t.push(reason);
      }
      return null;
    };
    const view = this.view;
    if (this.$canon !== "simple") return null;
    if (view === null) return why("no view");
    if (!kernelLoaded() || !viewLayoutReady()) return why("no kernel");
    if (isWindowedBlock(view)) return why("windowed block");
    if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && (globalThis as { __declareNoNativeLayout?: boolean }).__declareNoNativeLayout === true) return null;   // the A/B switch (dev and profiling builds only)
    this.authorSized.clear();
    const me = this as unknown as { axis: string; align: string };
    if (me.align !== "none") return why("aligned");
    const K = kernel();
    if (K.layoutAdd === undefined) return why("no kernel rule");
    const spacingCell = slotCellOf(this, "spacing");
    if (spacingCell < 0) return why("spacing not a kernel cell");
    const kids = this.laid();
    if (kids.length === 0) return () => {};
    const slot = me.axis === "x" ? "x" : "y";
    const words: number[] = [view.$structureCellId(), spacingCell];
    for (const c of kids) {
      if (c.flexes === true) return why("flexing child");   // the pass sizes it
      if (c.$is3D()) return why("3D child");
      if (blockOf(c) < 0) return why("child without a block");
    }
    const label = this.$label();
    const arranger = `${view.constructor.name}'s ${this.constructor.name}`;
    const claims: View[] = [];
    const discards: View[] = [];
    for (const c of kids) {
      const prior = ownerOf(c, slot);
      const author = prior !== null && !prior.yielding;
      if (author) this.$reportConflict(c, slot, arranger);
      else { claims.push(c); if (prior === null) discards.push(c); }
      words.push(author ? blockOf(c) + LAYOUT_NOWRITE : blockOf(c));
    }
    for (const c of discards) this.$reportDiscarded(c, slot, arranger);
    const id = K.layoutAdd(me.axis === "x" ? 0 : 1, words);
    if (id < 0) return why("kernel refused: " + id);
    const k = new Constraint(label, () => undefined, () => {}, 0, false);
    k.adoptRule(id);
    k.arrangedBy = arranger;
    // a child went out of the plane mid-run: re-install at the settle's close,
    // where $installNative sees the 3D child and the pass takes over
    k.onDecline = () => { afterSettle(() => { if (this.$native) this.rearm(); }); };
    for (const c of claims) this.$claim(c, slot, k);
    this.$native = true;
    k.run();
    return () => {
      this.$native = false;
      k.dispose();
      for (const c of claims) this.$unclaim(c, slot, k);
    };
  }

  /** The child list changed inside a settle: a KERNEL stack's words name the
   *  old children's blocks — one discarded this settle may already serve
   *  another view — so its rule stops now, and the re-arm at the settle's
   *  close (View.childrenMutated) installs it over the new list. */
  $retireNative(): void {
    if (!this.$native) return;
    const undo = this.undo;
    this.undo = null;
    undo?.();
  }

  protected $install(_view: View): () => void {
    this.$native = false;
    const native = this.$installNative();
    if (native !== null) return native;
    const label = this.$label();
    const arranger = `${this.view?.constructor.name ?? "?"}'s ${this.constructor.name}`;
    // Ownership is re-derived from scratch here: a rearm is the one moment the
    // answer may change (a tier flip, a created child, a swapped binding), so
    // a child dropped by the LAST install gets a fresh hearing at this one.
    this.authorSized.clear();
    let kids: View[] = [];
    let probe: Box[] = [];
    const passClaims: { child: View; slot: string; key: keyof Box; i: number }[] = [];
    const sizeClaims: { child: View; slot: string; key: keyof Box; i: number }[] = [];
    const discards: [View, string][] = [];
    // One pass per child at worst: each re-probe drops at least one child from
    // the arrangement, and a dropped child is never reconsidered.
    for (;;) {
      kids = this.laid();
      if (kids.length === 0) return () => {};
      probe = this.place();
      if (probe.length !== kids.length) {
        throw new DeclareError(
          `${label}.place() returned ${probe.length} boxes for ${kids.length} laid children — one box per child, by index`
        );
      }
      passClaims.length = 0;
      sizeClaims.length = 0;
      discards.length = 0;
      let dropped = false;
      kids.forEach((child, i) => {
        const box = probe[i] ?? {};
        for (const [key, slot] of BOX_SLOTS) {
          if (box[key] === undefined) continue;
          // CONFLICT CONTAINMENT (field report 2026-09-02): a place() that
          // returns a slot the CHILD ITSELF authored (`width = { … }`) cannot
          // claim it — the one-owner rule holds, and `ignoreLayout = true` is
          // the blessed way for a child to own its own geometry. Discovered
          // mid-settle on a shape-driven rearm, throwing here aborted the whole
          // settle (or, caught upstream, re-fired every wave — the 365-error
          // storm). Instead: report ONCE per (child, slot), leave the slot to
          // its author, and install everything else. A yielding prior
          // (auto-size) is NOT a conflict — the layout displaces it, as ever.
          const prior = ownerOf(child, slot);
          if (prior !== null && !prior.yielding) {
            this.$reportConflict(child, slot, arranger);
            // A SIZE this arrangement allocates and cannot write makes every
            // position derived from it a fiction — so the child leaves the
            // arrangement and we place the rest again without it, rather than
            // advancing the run by a number nothing wrote (`authorSized`).
            if ((key === "w" || key === "h") && !this.authorSized.has(child)) {
              this.authorSized.add(child);
              dropped = true;
            }
            continue;
          }
          // A literal on a claimed slot: the layout takes it, as it always
          // has, and now says so instead of discarding it in silence. HELD
          // until the claim set is final — a child dropped by a later refusal
          // on this same pass keeps its literal, and must not be told it lost it.
          if (prior === null) discards.push([child, slot]);
          if (key === "w" || key === "h") sizeClaims.push({ child, slot, key, i });
          else passClaims.push({ child, slot, key, i });
        }
      });
      if (!dropped) break;
    }
    for (const [child, slot] of discards) this.$reportDiscarded(child, slot, arranger);
    const installed: { child: View; slot: string; k: Constraint }[] = [];
    const detach = () => {
      const seen = new Set<Constraint>();
      for (const o of installed) {
        if (!seen.has(o.k)) {
          seen.add(o.k);
          o.k.dispose();
        }
        this.$unclaim(o.child, o.slot, o.k);
      }
    };
    try {
      if (passClaims.length > 0) {
        const pass = new Constraint(
          label,
          () => this.place(),
          (v) => {
            // While the WINDOWING KERNEL owns this block's placement
            // (materialization.md — a windowed vertical stack), the pass
            // computes but does not apply: rows sit at their LOGICAL
            // positions, and disengaging re-arms through childrenMutated.
            if (this.view !== null && isWindowedBlock(this.view)) return;
            const boxes = v as Box[];
            for (const c of passClaims) {
              const b = boxes[c.i];
              if (b !== undefined && b[c.key] !== undefined) setBound(c.child, c.slot, b[c.key]);
            }
          }
        );
        pass.arrangedBy = arranger;
        for (const c of passClaims) {
          this.$claim(c.child, c.slot, pass);
          installed.push({ child: c.child, slot: c.slot, k: pass });
        }
        pass.run();
      }
      for (const c of sizeClaims) {
        const k = new Constraint(
          `${label} → ${c.child.constructor.name}.${c.slot}`,
          () => this.place()[c.i]?.[c.key],
          (v) => {
            if (this.view !== null && isWindowedBlock(this.view)) return;
            setBound(c.child, c.slot, v);
          }
        );
        markPercent(k);
        k.arrangedBy = arranger;
        this.$claim(c.child, c.slot, k);
        installed.push({ child: c.child, slot: c.slot, k });
        k.run();
      }
    } catch (e) {
      detach();
      throw e;
    }
    return detach;
  }
}

// The base declares NO attributes of its own. `padding` lived here until
// 2026-09-19 and moved to the view (view.ts): the content box is the view's,
// a layout arranges inside the room it is given, and two paddings — one on the
// view and one on whatever arranges it — would have been a genuine confusion.
// A strategy still reads the room through `contentExtent(size)`, which now
// simply asks the arranged view for its content box; nothing in place() or the
// kernel names an inset.

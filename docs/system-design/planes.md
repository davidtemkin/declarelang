# Planes — layered view hierarchies over one host

**Status: RESEARCH DRAFT for ruling (2026-07-18). Nothing here is ratified.**
This document synthesizes three inputs: David's planes-as-hierarchies model
(§2, the governing statement), the charter's earlier partial ruling and its
superseded attribute proposal (library-charter.md §4 — the ladder, the
no-z-index survival, authoring locality for transients), and a precedent
survey (§3). It ends in a worked candidate design (§5–§9) and the question
register rulings must close (§10).

## 1. The problem

Declare has one plane. A declaration is a view hierarchy; stacking is source
order within it ("later siblings draw above; there is no z-index" — the
diagnostic says so verbatim), and reordering live siblings is deliberately
unsupported. That is the right shape for *content* — and it cannot express
the second family of UI: things that float **over** content with their own
lifecycle — menus, tooltips, dialogs, toasts, palettes, drag ghosts. Today
apps fake one modal layer as a late App child (the homepage's editor overlay:
`visible = { app.editing }`, full-window, declared last). It works precisely
because it is one overlay in one app; it does not scale to anchored
transients, stacked dialogs, or notice queues, and it buries a load-bearing
distinction — content vs. chrome-over-content — in child order.

## 2. The governing model (David, 2026-07-18, quote of record)

> "The declarations are basically view hierarchies which are incidentally
> z-ordered […] I was imagining a model that you could think of as a set of
> planes that are each entire view hierarchies. Right now we have one plane,
> one view hierarchy. I was envisioning constructs where actions taken by the
> lowest of the planes, the one with the main app's content, would
> imperatively or declaratively induce things to appear in other planes. But
> a developer might also declare a plane's hierarchy directly, either inside
> of App or parallel to it — if we think of App as being the virtual
> hierarchy at the base or lowest-layer plane."

Three commitments fall out:

1. **A plane is a whole view hierarchy, not a property of a view.** This
   dissolves the incoherence that killed the earlier `plane` attribute (a
   child rendering outside its parent's clip and stacking "is a child in name
   only"): nothing is lifted out of anywhere. A plane has a root; its tree is
   ordinary; the bracket nesting still IS the view tree — there are just
   several trees, stacked.
2. **App is the base plane.** Not a new concept wrapping App — App *is* the
   lowest plane, and today's programs are the one-plane special case,
   unchanged.
3. **Upper planes are induced from below — declaratively by preference —
   or declared outright.** "Induced" must get the Declare treatment: a
   plane's *content deriving from base-plane state* is the same move as
   `shown = { data.loaded }` and the location pattern. The imperative form is
   just writing that state.

## 3. Precedents (what everyone else converged on)

- **The web, after twenty years of z-index wars, confessed into the top
  layer**: `<dialog>.showModal()` and the `popover` attribute promote an
  element into a browser-managed layer above ALL stacking contexts —
  promotion-ordered, numberless, with `::backdrop` and built-in light
  dismiss. The platform's own answer is a managed ladder, not author numbers.
- **Flutter**: one `Overlay` with insertion-ordered entries; authors never
  touch it — `Tooltip`/`DropdownButton` mount entries internally. Authoring
  locality with runtime promotion (the charter's mechanism (b)).
- **SwiftUI**: presentations (`.sheet`, `.popover`, `.alert`) are *state-
  driven* — `isPresented: Binding<Bool>` — content declared beside the
  presenter, shown by the framework when the binding goes true. The closest
  philosophical cousin to "induced declaratively from below."
- **AppKit / WinUI**: fixed named ladders (window levels; XamlRoot popups)
  — again small, named, never numeric.
- **OpenLaszlo (the ancestor)**: `LzModeManager` — a modal *stack* over one
  canvas, with input exclusion outside the topmost mode. Our input-strata
  question was answered there once already.
- **Games/graphics**: layered scenes over one surface — planes as scene
  graphs is the native idiom of every compositor.

Convergences to keep: small named ladder; promotion order within a layer;
no author-facing numbers; state-driven presentation; author locality for
anchored transients. Nobody ships author-numbered z and survives.

## 4. What already exists in the runtime (the substrate audit)

- **Multiple hierarchies over one page is half-built.** Embedded islands are
  separate App trees sharing a document; the Focus service already arbitrates
  across trees (a ring "stands down" when another tree owns the target; Tab
  cycles within the focused view's own tree). Planes-as-hierarchies rides the
  same shape: more roots over one host.
- **`focustrap`** bounds a self-contained focus group with `escapeFocus` at
  the edges — the Dialog trap primitive, shipped.
- **Focus restore**: `noteDiscarded` moves focus out of discarded/hidden
  subtrees — half of close-returns-focus.
- **Cross-tree geometry tracking**: the FocusRing follower is a runtime
  constraint over a live silhouette through a parent chain (`retargetFollower`
  + `focusShape()`). Anchoring a menu to a button in a lower plane is THIS
  machinery pointed at a second consumer — root-space position as a reactive
  fact is designed, just not yet exposed as one (inspect.ts has snapshot
  `rootX/rootY`; promotion to reactive intrinsics is known work).
- **The input router** owns pointer dispatch and already hosts global
  behaviors (tap-to-dismiss blur on mobile). Light-dismiss and modal input
  exclusion belong here — strata, not bubbling.
- **Stacking today**: source order, no z-index, reordering unsupported — a
  ruling planes deliberately PRESERVES per-plane and makes unnecessary
  across planes.

## 5. Candidate design — the plane ladder as hierarchies

The charter's four-rung ladder survives, now as *hierarchies, not tags*:

```
content   — App itself, the base plane (today's world, unchanged)
floating  — anchored transients: tooltips, menus, popovers; light-dismiss
modal     — dialogs; input-blocking scrim; focustrap
notice    — toasts; above modal; never takes focus by default
```

Fixed ladder across planes; **promotion order within a plane** (the moment
content appeared) — nested menus and stacked dialogs are correct for free,
the web-top-layer rule. No numbers anywhere. All planes share the host's
coordinate space and size (`app.width/height` remain the facts; a plane is
not a window system — Window-in-plane stays the charter's keyed-replication
data pattern *inside* a plane).

## 6. The author surface (candidate — the central ruling)

Two declaration forms, matching the model's two commitments:

**(a) Direct declaration — a plane's hierarchy written out.** For content
that is *structurally* top-level: the notice area, an app-owned palette, the
windows layer. Placement candidate: a named member of App with a reserved
base, reading as what it is —

```declare-fragment
App [ …content…,
    notices: Plane [ level = notice,
        Toast [ datapath = :queue[], text = :message ],     // presence = data
        ],
    ]
```

`Plane` is a root, not a view: it does not lay out within App's tree; it
stacks over it. (The "parallel to App" top-level form — `plane notices [ … ]`
beside App, like `stylesheet` — is the recorded alternative; member-of-App
keeps one namespace and lets constraints reach `app.*` without a new scope
rule. Ruling needed: **member vs. parallel**, or member now / parallel when
multi-file arrives.)

**(b) Induced presence — the component channel.** Anchored transients stay
authored WHERE THEY BELONG (inside their owner: the menu inside its button —
locality, classroot, data scope, analyzability all preserved), and the
*component's implementation* mounts its floating subtree into the plane —
Flutter's overlay discipline, the charter's mechanism (b), unchanged by this
design. Authors write `Menu [ … ]`; nobody touches the ladder:

```declare-fragment
Select [ value <-> :country,
    Option [ label = "France", choice = "fr" ],     // the popover lives in
    Option [ label = "Japan",  choice = "jp" ],     // the floating plane;
    ]                                                // the author never says so
```

Presence is DERIVED in both forms: a toast exists because the queue has a
row; a menu is open because `open == true`; a dialog because
`app.confirming != null`. `.showModal()`-style verbs, where wanted, are one-
line methods that write that state — the imperative induction David names is
the write; the declarative induction is the constraint. One mechanism.

## 7. Input strata (the no-bubbling test, closed structurally)

Planes are input layers, resolved in the ROUTER, top plane first:

- **notice**: passes pointer input through except over its own content.
- **modal**: swallows everything below it — the scrim is real, not painted-
  only. Escape routes to the top modal (cancel).
- **floating**: observes outside-pointer-down → light dismiss (the plane
  closes ITSELF; the press ALSO delivers below by policy — ruling needed:
  swallow-and-dismiss (Mac menus) vs. dismiss-and-deliver (most web)).
- **content**: today's routing, unchanged.

This is the catch-all/click-outside family — bubbling's strongest remaining
claim — answered at the stratum where it is actually about *planes*, not
propagation. LzModeManager solved it here; so do we.

## 8. Focus, keyboard, accessibility

- Opening a **modal** plane installs `focustrap` at its root (exists), moves
  focus to `tabDefault()`, and RESTORES focus to the opener on close
  (noteDiscarded's other half — the opener handle is the plane entry's
  natural field). Tab never leaves the top modal.
- **floating** planes: menus take roving focus on open (arrow keys — the
  deferred roving-tabstop work lands HERE, with Menu/Select, as agreed);
  tooltips never take focus.
- **notice** never steals focus; an actionable toast is Tab-reachable only
  by explicit policy (F6-style plane cycling is the recorded future for
  keyboard access to planes — Windows precedent).
- The FocusRing follower already tracks across hierarchies (islands prove
  it); one ring per host serves all planes.

## 9. Materials, themes, extraction

- **The scheme-holds test**: plane backdrop/material is THEME DATA — new
  tokens (working set: `scrimColor`, `planeShadow`, `planeMaterial` =
  none | dim | blur…) rendered by the plane root, so SF gets flat shadowed
  cards, Mountain View its elevation tint + scrim, Cupertino translucency,
  Redmond Acrylic/Mica. DOM: `backdrop-filter`; canvas: honest approximation
  (dim without blur) — recorded, not hidden.
- **Anchoring** (`attachTo` — `anchor` is taken by location): a floating
  subtree positions against a lower-plane view's root-space box via the
  reactive-intrinsics promotion (§4), with edge-avoidance (flip/clamp at
  host edges) in the `Floating` base, written once.
- **Extraction/crawl**: planes are ephemeral chrome — absent at t=0,
  excluded from the crawled document by construction (same rule as any
  `visible = false` content). A dialog whose content SHOULD be crawlable is
  mis-modeled — that content is a location. The doc states this as guidance.
- **Verify**: R-rungs walk every plane's hierarchy exactly as they walk App;
  a plane is a root in the same program — nothing new to teach the checker
  beyond the `Plane` form itself.

## 10. Question register (rulings needed before build)

1. **Declaration placement**: `Plane` as a named App member (§6a) vs. a
   parallel top-level form vs. both. (Draft leans: member-of-App.)
2. **Ladder shape**: confirm the four rungs and their names; is `notice`
   above `modal` (draft says yes, per toasts-over-dialogs)?
3. **Light-dismiss delivery**: swallow-and-dismiss vs. dismiss-and-deliver.
4. **Backend realization**: upper planes as sibling host elements (DOM) /
   compositor layers (canvas) vs. the browser top-layer API for modal —
   top layer buys native ::backdrop + inertness but couples us to `<dialog>`
   semantics; draft leans: own layers, one model both backends.
5. **Material tokens**: the working set in §9, and the canvas blur honesty
   line.
6. **Roving tabstop**: confirm it lands with Menu/Select in this phase (also
   closes the Redmond radio-group fidelity gap).
7. **Charter order**: this phase proceeds ahead of ResponsiveLayout —
   amendment to the ratified phase order, to be recorded on ruling.

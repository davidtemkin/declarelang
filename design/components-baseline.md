# Baseline components — the contracts

**Status: DRAFT 2026-07-13, for sequential ruling.** Four contracts, each proposed with its concerns surfaced; components are written only after the contracts are ruled, because every later component inherits them. Companion to [`style.md`](style.md) (which settles more of this than expected — prevailing attributes, `theme`-as-prevailing, style bundles, and the principle that *the standard library defaults its look to the prevailing theme by design*), [`composition.md`](composition.md), and [`verify-and-evals.md`](verify-and-evals.md) §3 (the eval task suite assumes Tier 1 exists).

**Why now:** the eval tasks (form, modes, mini-app) otherwise measure the library gap, not the language; every run would hand-roll a different checkbox, adding noise exactly where measurement wants stability. And because the library is self-hosted, these files are pedagogy — among the most-read Declare sources there will ever be. They are written as exemplars: canon-formatted, literate-commented, doc-prose'd.

## Scope

**Tier 1 (this effort — settled language ground, pure composition):**

| component | one line |
|---|---|
| `Button` | label + optional primary/secondary look; the interaction-states idiom's reference implementation |
| `Checkbox` | boolean control; box + mark + label |
| `Switch` | boolean control; sliding thumb (a spring, naturally) |
| `RadioGroup` / `Radio` | one-of-N; group owns the value, radios are its children |
| `Slider` | bounded number by drag; the continuous-value questions live here |
| `Field` | a labeled row wrapping any control — label, control slot, note/error line |
| `ProgressBar` | display-only bounded number (harvests/replaces the placeholder `Bar`) |

**Tier 2 (explicitly deferred — each lands on ground `declare-language.md` §13 lists as open, and is scheduled later as the *forcing function* for that ruling, not before):** `Select`/`Menu`/`Dropdown` and `Tooltip` (overlay stacking — z-order is declaration order, which is exactly wrong for a popup; needs a top-layer story — plus dismiss/outside-click and the focus model), `Modal` (top-layer + focus trap), `Tabs` (multi-region composition wants slots/`placement`).

**Stays true after Tier 1 lands:** the eval **compose** task remains primitives-only (raw composition is a core language claim and keeps its own measurement); the LLM brief's §9 "no widget zoo" entry is rewritten to name the baseline set (negative knowledge tracks the library).

---

## Contract 1 — Value exposure — **RULED 2026-07-13**

*(Ruled in discussion: components are data-agnostic; the three-form gradient below; `<->` stays data-only; form (b) — "about as straightforward as it gets" — is the canonical shared-state spelling. RadioGroup follows the same shape: the group owns `value`, radios deliver. External dependency: the D2 write-vs-constraint ruling backs the trap diagnostic.)*

**The question.** How does a stateful control expose its value to the app — and who owns writes?

**What the tree does today.** `TextInput [ value <-> zip ]` (attribute two-way, weather); `TextInput [ text <-> :title ]` (datapath two-way, calendar); the uncontrolled seed via `initial = { src }` — "follows the source until you type, then holds the edit" (site CodeField); the ruled editor-session model for text (the dataset owns the committed value; the editor owns draft/valid/dirty/commit). The known trap is logged as language-learnings **D3**: controlled/uncontrolled field semantics.

**Proposal.**

1. **Components are data-system-agnostic.** A control declares its value as an ordinary reactive attribute and knows nothing about datasets, paths, or binding. Every binding form is a use-site choice riding mechanisms that already exist. (RULED in discussion 2026-07-13: nothing about components may require the data system — the constructs must be separately learnable.)
2. **The value is a declared reactive attribute with a semantic name** — `checked: boolean` (Checkbox, Switch), `value: number` (Slider), `value: string` (RadioGroup) — mirroring the names the platform corpus already taught every reader, human or model. Not a uniform `value` everywhere: `checked` is a retrieval key into correct priors.
3. **The use-site gradient — three steps, each exactly one construct more, and the teaching order is also the decision procedure** (state lives at the narrowest scope that owns it):
   - **(a) No binding.** The control's state *is* the state; anything that cares constrains on it by name: `mute: Checkbox [ label = "Mute" ]` … `visible = { mute.checked }`. Zero new constructs — attributes and constraints only. The *correct* form for view-local UI state, not merely the beginner form.
   - **(b) App-owned state — derive down, deliver up.** The value belongs to the app (shared, outlives the widget): `Checkbox [ checked = { app.muted }, input(v) { app.muted = v } ]` — a one-way constraint down, and the control's **`input` method** delivering the user's edit to its owner. Both directions visible at the use site; legal today; the calendar's own controls (`ViewTab` → `app.mode`) are this exact pattern. (`input` is not a value-change listener — reacting to values is what constraints are for — it is the *edit-delivery channel* a control exposes for when it does not own the value; a standalone control never needs it supplied. **Naming note, build-discovered 2026-07-13:** `event` declarations are specced in §8 but NOT yet implemented in the parser, so `onInput` cannot legally exist (the `on` namespace answers *declared* events only) — the member ships as the plain method `input(v)`, with the class default `input(v) { checked = v }` making standalone work and a use-site override redirecting delivery; it can graduate to a real `event input` + `onInput` when the event surface lands. The implementation refinement that fell out is a keeper regardless: **`press()` never writes the value slot — it only calls `input`** — so a bound control never fights its constraint and the D2-static rule is never triggered by the library itself.)
   - **(c) Data-owned state.** The value lives in data: two-way `<->` through an editor (`text <-> :title`). The arrow is REQUIRED here and only here — `=` cannot write a record; the data write path (mutation API, boundary validation, editor draft/commit) is what `<->` carries. Requires the data chapter; only apps with data get here.
4. **`<->` is NOT extended to attribute targets — RULED OUT for Tier 1 (2026-07-13).** What the extension would have bought (atomic wiring, one definition for standalone+bound, D3-trap-unrepresentable) is convenience, not power; `=` already is the attribute write path; the corpus pattern (b) is proven; and the standing no-magic value (predictability over ergonomic sugar) applies. Logged as a *possible future* with an explicit re-open condition: if evals show models habitually half-wiring form (b) despite brief + diagnostic, that E-series evidence reopens this — the sugar gets added on receipts or not at all.
5. **Documentation ordering is part of the contract:** each component's docs show forms (a) and (b) only; `:path` bindings appear exclusively in the data chapter. The eval **form** task binds App attributes — no dataset — so it measures forms, not the data system.
6. **The half-wired and fighting forms want diagnostics, not docs.** Statically detectable: a value slot constrained at the use site while the class writes it internally (the write-fights-constraint case — whose underlying semantics is open decision **D2** in language-learnings.md and needs that ruling), and a supplied-`onInput`-without-down-binding (or vice versa where detectable). Each error names the two-line fix.

**Concerns to rule on (the honest edges).**

- **1a. Slider is not instant-commit.** Mid-drag, is the bound target written continuously (live derived UI — good; chatty writes into a dataset — undo/network granularity, maybe bad)? Options: (i) continuous always — simple, reactive-native; the data layer owns coalescing; (ii) a `live: boolean = true` knob — commit-on-release when false; (iii) the editor-session model extended to sliders. Lean: **(i) continuous always** for Tier 1, revisit if a real consumer needs (ii) — but this is exactly the kind of call that shouldn't be made silently.
- **1b. The seed trap (D3) generalizes.** `Checkbox [ checked = :done ]` (one-way) vs `checked <-> :done` (two-way) vs `initial`-style seeding — three superficially similar spellings with different ownership semantics. The contract must say which the docs teach as *the* form (lean: `<->` is the form for editable controls, one-way `=` means display-only, and `initial` stays a text-editing concept), and ideally the compiler should have something to say when a control's value is one-way-bound *and* internally written — that's the write-fights-constraint case, worth a diagnostic.
- **1c. `<->` reach.** Two-way is static-path-only today, with the computed-field-name form (`text <-> { classroot.field }`) proven in the calendar. Is attribute-target two-way (`checked <-> app.muted`) fully supported and blessed, or was `value <-> zip` a special case? Needs a verification pass; the contract assumes it works.
- **1d. RadioGroup ownership.** The group owns `value`; each `Radio` writes `classroot.value = this.choice` — which makes Radio's own API trivially small but means the *group* is the bindable unit. Confirm that shape (it mirrors how the calendar's `ViewTab`s write `app.mode`).

---

## Contract 2 — Theming (IN DISCUSSION)

**The question.** How does a library component look right in *any* app — zero configuration, no app-defined theme record — while following the app's ambient style when one exists?

**What `style.md` already rules** (this contract is mostly *application*, not invention): prevailing attributes are the mechanism; `theme` is just a prevailing attribute, never a global; the standard library **defaults its look to the prevailing theme by design** ("opt-in by convention, not reach-into-anything"); style bundles (`style name [ … ]` + `styles:`) are the external channel; fonts/textColor are already prevailing on View; declaration defaults may be bindings.

**What today's tree actually does:** `site` and `calendar` each declare a *plain App attribute* named `theme` — private records, incompatible vocabularies (~10 roles vs ~35 roles), resolved by bare-name scope, not by the prevailing machinery at all. A library component can read neither.

**Facts established (2026-07-13):** the `theme` *value* is a plain TS object — no special type, no syntax (both apps provide object expressions). The `theme` *slot* is already a ruled prevailing attribute on View (`schema.ts` prevailing list) — that is why `{ theme.text }` resolves in a class body; the apps already ride the flow-down machinery. Separately, stylesheets carry a checked `theme: Theme [ tokens ]` record (scalar tokens only) — its relationship to the prevailing slot is a verify item (2e).

**Proposal (revised in discussion — no new syntax, no new rules; plain values + plain functions):**

1. **The theme stays a plain, FLAT TS object** in the existing prevailing slot. No `Theme` value type in v1 (2b deferred — nothing forces the record-type ruling); typing arrives later, if ever, as tooling.
2. **House default via the slot's declared default**: `{ houseTheme(app.dark) }` — declaration defaults may be bindings (ruled), so zero-config apps get the house look, dark-mode-correct, and `theme.role` in library source *always resolves*. `houseTheme(dark)` is an ordinary typed library function.
3. **Partial override is explicit-base spread — plain TS, the blessed idiom:** `theme = { { ...houseTheme(app.dark), accent: 0x37E0C8 } }`, or over an ancestor on a subtree root: `theme = { { ...app.theme, accent: 0x37E0C8 } }`. The base is always *named* — no provider-reads-what-it-shadows scope question can arise. Provision-as-delta (merge semantics attached to the act of provision) was considered and REJECTED: special rules multiplying against the prevailing/inheritance/scope complex. No packaged merge function either — object spread is the single most common idiom in the modern JS corpus (the Redux-era immutable-update pattern) and means exactly this; any name we gave it would teach less. (RULED 2026-07-13: object literals in bodies are written **bare** — no `({ … })` wrapper; the JS arrow-function parenthesizing habit solves an ambiguity Declare's value slots don't have.)
4. **Self-referential spread (`...theme` in a theme provision) is a dependency cycle** — statically visible; becomes a diagnostic naming the fix ("name the base: `app.theme` or `houseTheme(…)`"), not a rule.
5. **The vocabulary starts near the intersection site and calendar independently invented, and evolves during the build** (RULED 2026-07-13: start with these, modify as we go). v1 roles: `bg, surface, line, text, textMuted, textFaint, accent, accentText, control, controlActive` — plus **`depth: number`** (0 = flat … 1 = dimensional): a theme value need not be a color, and components *translate* depth in their decoration constraints — shadow strength scales with it, separation renders as hairlines at 0 and soft shadows at 1, fills flatten or gain subtle gradients. `{ ...app.theme, depth: 0 }` flattens an app in one line; a spring on a theme's depth animates a whole UI between flat and dimensional. v1 keeps depth's interpretation narrow (shadows + fill treatment, documented per component) so it stays a dial, not an everything-knob.
6. **Per-component prevailing knobs stay exceptional** (the `codeBackground` precedent; none anticipated in Tier 1); instance variants are ordinary attributes + style bundles, as ruled. No forced migration of site/calendar.

**Remaining open:**

- **2a′. The partial-provision hazard (accepted-or-hardened, David's call):** an app providing `theme = { pageBg: … }` *without* spreading a base leaves library reads (`theme.control`) undefined beneath it. With plain objects the guard is the documented spread idiom now, the typecheck pass catching missing-role reads later. Soft, and honestly so.
- **2b′. The role vocabulary itself** — the ~10 names, for David's edit.
- **2e. Verify:** the stylesheet `theme: Theme [ ]` token record vs the prevailing slot — one mechanism or two; and confirm the house-default binding pattern works as assumed at the schema-declaration site.

## Contract 3 — Interaction states — **RULED 2026-07-13**

**A library `Control` base class** (`Control extends View`, pure Declare, zero language surface) that every Tier 1 control extends — and app authors may too. Runtime-provided `hovered`/`pressed` on every View was considered and parked with an eval re-open condition (the `:hover` prior runs deep; if models reach for `hovered` on raw Views persistently, that evidence reopens it).

**Control v1 carries the four interaction states and a boundary:** `hovered`, `pressed`, `disabled`, `focused` (the focus substrate — `focusable`, `focusChanged`, preorder Tab traversal — already exists in the runtime; Control lands focus *visuals* now; traversal refinements/trapping stay deferred). The boundary: Control owns **interaction** states (how pointer and focus relate to me); **semantic** states (`checked`, `selected`, `value`) always live on the concrete control.

**Touch rulings:**
- **Press-cancel:** the input router already handles `pointercancel` (browser reclaims the gesture for scroll); Control clears `pressed` on it without firing the click. The hand-rolled corpus pattern doesn't do this — fixing it once in Control retires a live stuck-press bug class.
- **`pressed` is the touch feedback**; `hovered` is never true on touch (router-guaranteed).
- **Keyboard activation:** Space/Enter on the focused control drives the same activation path as click — the base accessibility contract, wired once.
- **`disabled` = inert:** blocks input handlers, blocks focus (no tab stop), suppresses hover/press.
- **Hit-target inflation: NOT a Control mechanism** (David, 2026-07-13) — device-honest sizing is the concrete component's and app developer's job, i.e., design guidance; with the corollary that Tier 1 *default* sizes are touch-adequate so the guidance has teeth.
- **Long-press: deferred**, logged (timer/cancel interplay; context gestures).

## Contract 4 — Sizing — **RULED 2026-07-13**

**Verified (headless Node instantiate+settle):** a class's intrinsic width *constraint* (`width = { this.inner.width + 24 }` → 174) is cleanly overridden by a use-site literal (`width = 200` → 200). The mechanism assumption holds; no language work needed.

1. **Intrinsic by default.** A control fits its content (the `NavLink` pattern); a use-site `width`/`height` imposes and wins — verified above. Both forms are the existing language; the contract just picks the default.
2. **The interior contract (the fluid/adaptive discipline — RULED):** every component is a *yielding intrinsic default* wrapped around an *imposed-ready interior*.
   - The default size is a constraint over content (`width = { Math.min(contentWidth + pad, parent.width - 32) }` — clamps are arithmetic, per sizing.md); it yields to any use-site value, and imposition may itself be a constraint (`width = { parent.width * 0.5 }`), so container fluidity propagates through the ordinary graph.
   - The interior is written against **`this.width`**, never against the content's natural size — imposed or intrinsic, the interior adapts.
   - **Height derives last**, from the re-laid content (`height = { Math.max(minH, contentHeight + pad) }`); the negotiation is two one-way flows meeting at the component boundary — width resolves (one winner), content re-lays within it, height follows — never a bidirectional solve. The `extentOf` cycle guard is what makes this legal.
   - **Per-control response policy when imposed < natural** (declared per component, not left to accident): multiline text **wraps** (height absorbs); single-line inputs **scroll horizontally** in the box; imposed-both means the interior **scrolls** (`scrolls = true` is the pressure valve); label-bearing controls **clip** in v1 — *ellipsis is a text-system gap* (verify: `wrap = false` behavior below natural width), logged as a later text addition.
   - What the model deliberately lacks, stated for authors: no min-/max-content negotiation protocol; "available space" is always *named* (`parent.width - labelWidth - gap`) or *delegated to a layout* (the `releasetolayout` lineage) — explicit over ambient, sizing you can statically read.
3. **Default sizes are device-honest** (per the Contract 3 hit-target ruling): Tier 1 defaults meet touch expectations out of the box (e.g., control heights ~40+); dense desktop UIs impose smaller sizes deliberately. A general density mechanism was considered and NOT adopted — no new machinery; this is defaults + design guidance.
4. **`Field` label alignment: a shared plain value, never aggregation.** The tempting form — auto-max over sibling labels — is *already illegal by ruled language semantics* (node-collection aggregation is constraint residue, constraints.md §3), which settles the design: `Field` has `labelWidth: number` with a sensible default; a form wanting a shared column sets one plain value and constrains each row to it. The language ruled; the contract obeys.

---

## Process (applies to every component)

- Written in Declare, in `library/src/`, auto-included; canon-formatted; literate-commented (the source is pedagogy).
- Each ships with doc prose (`tools/doc/prose/`) and at least one runnable guide fence.
- Each adds comprehension-eval questions (`verify-and-evals.md` §3.4) — "what does this component do when…" answered from its source.
- Landing updates: brief §9 negative-knowledge entry; `library/index.json` / `autoincludes.json`; the docs `model.json`.

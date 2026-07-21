# LZX Component-Library Mapping — Design

*Phase-2 follow-up to the LZX source layer (`docs/plans/2026-07-20-lzx-source-layer-*`).
Goal: knock down the dominant `unknown-tag` gap (11,859) by cleaning up the
accounting first, then mapping the OL components that have a clean Declare
equivalent. Status: approved for planning, 2026-07-21.*

## Problem

The Phase-1 oracle reported `unknown-tag` = 11,859 across 574 distinct tags — by
far the top category. Measuring what those tags actually are shows the count is
mostly **noise**, not components:

- **`<doc>` documentation prose** — `p` 552, `sgmltag` 270, `example` 246, `b`
  234, `classname` 386, `tag` 164, `tagname` 152, `i` 143, `li` 128, `code`
  126, `a` 84, … The parser recurses *into* `<doc>` blocks and treats embedded
  HTML as UI elements.
- **Language constructs, not components** — `include` 1061, `library` 454,
  `event` 337, `script` 223, `setter` 218, `remotecall` 96, `stylesheet` 61,
  `param` 148. These belong in §13 gap categories, not `unknown-tag`.
- **Dataset data** — `item` 230, `day` 148, `firstName`/`lastName` 78, `literal`
  62. XML *data* inside `<dataset>` bodies, walked as if components.
- **Actual UI components** (the real target) — `radiobutton` 242, `edittext`
  162, `inputtext` 140, `checkbox` 97, `window` 96, `menuitem` 90, `textlink`
  126, `textlistitem` 125, `stableborderlayout` 78, …

So "map the component library" is really: **stop miscounting (accounting), then
map the components that have a clean Declare home.** Naively adding tags to the
table would aim at a number that is ~70% noise.

## Scope — minimal

Accounting cleanup + exact-equivalent component mappings only. Explicitly
**deferred** (each its own follow-up): translating `<script>` → a `script { }`
block, `<stylesheet>` → a Declare stylesheet, `<setter>` → a `set x(v)`
accessor, and `<dataset>` XML data → the JSON `Dataset { }` body. Those *are*
translatable, but bundling four mini-features into this pass is out of scope.

The no-equivalent policy is **honest gap, not fake compile**: a component with
no clean Declare equivalent stays a categorized gap; it is NOT force-mapped to
`View` (that would report false success).

## The five moves (all in `lzx/src/map.ts`, `gaps.ts`, tests)

1. **Skip `<doc>` blocks.** In the children loop, a `<doc>` child is not walked
   and not emitted; record one `info` `documentation` gap. Removes the largest
   noise slice (all the embedded-HTML prose tags).

2. **Don't recurse into data bodies.** `<dataset>` maps to a Declare `Dataset`
   (already in the tag table) but its body is left empty this pass and recorded
   as a `degraded` `dataset-body` gap; its data children are **not** walked
   (kills `item`/`day`/name tags). Real XML→JSON conversion is the deferred
   follow-up.

3. **Route language constructs to real categories** (recategorize, not emit):
   - `include` / `library` / `import` → `modules`
   - `event` → `event-decl`
   - `setter` → `custom-setter`
   - `remotecall` / `rpc` → `rpc`
   - `stylesheet` → `styling`
   - `script` → `script-block`
   - `param` → `slots-placement`

4. **Map exact-equivalent components** (extend `TAG_TABLE`). Targets are either
   a built-in schema or a `library/src/*.declare` class (both resolved by
   `compile()` — library classes via auto-include). Verified-present mappings:
   - built-in schemas: `edittext`/`inputtext` → `TextInput`; `image` → `Image`;
     `animator` → `Animator`; `animatorgroup` → `AnimatorGroup`; `node` →
     `Node`; `wrappinglayout` → `WrappingLayout`.
   - library classes: `checkbox` → `Checkbox`; `radiobutton` → `Radio`;
     `radiogroup` → `RadioGroup`; `slider` → `Slider`; `switch` → `Switch`;
     `field` → `Field`; `progressbar` → `ProgressBar`.

   No clean equivalent → stay gaps: `window` (chrome), `menuitem`, `textlink`,
   `stableborderlayout`, `textlistitem`, `edittext`'s multiline variants, etc.
   *(Schema-anchoring invariant, now two-sided: every mapped target must be a
   real key in `runtime/src/schema.ts` OR a `library/src/*.declare` class name.
   A target that is neither is a bug — a Task-level test asserts every
   `TAG_TABLE` value resolves to one or the other.)*

5. **Residue → `library-component` gap.** After 1–4, a leftover bare tag in the
   UI tree is a real OL component with no Declare home. Recategorize
   `unknown-tag` → `library-component`, so the oracle directly answers *"which
   components to build in Declare next, ranked by corpus weight."* `unknown-tag`
   then means only genuinely-unrecognized tags (typos, stray markup).

## New `S13Ref` values

`documentation`, `dataset-body`, `event-decl`, `custom-setter`, `rpc`,
`styling`, `script-block`, `library-component`.

## Distinguishing a component tag from a genuine unknown (move 5)

After moves 1–3 remove doc/data/language tags, the residue reaching the
`unknown-tag` branch is presumed a UI component (it appears as a child element
in a view tree). It is recategorized `library-component` unconditionally — no OL
component whitelist is needed, because the noise sources are already excised
above. A rare true-stray still lands here; acceptable for an oracle metric.

## Testing

Unit tests, one per move:
- `<doc>` child is skipped (not emitted) and records a `documentation` gap.
- `<dataset>` maps to `Dataset`, its `<item>` data children are not walked (no
  per-row gaps), records `dataset-body`.
- each language construct → its category (`<include>`→`modules`,
  `<setter>`→`custom-setter`, `<remotecall>`→`rpc`, `<stylesheet>`→`styling`,
  `<script>`→`script-block`, `<event>`→`event-decl`, `<param>`→`slots-placement`).
- `<edittext>` → `TextInput` (emits + compiles clean); `<checkbox>` → `Checkbox`.
- a leftover `<window>` → `library-component`, not `unknown-tag`.

Then re-run the full-corpus sweep (`node tools/lzx-transpile.mjs
../openlaszlo-5.0 --compile --report`) and rewrite `design-docs/lzx-coverage.md`
with the new distribution — the deliverable is the corrected oracle table
(expect `unknown-tag` to collapse; `documentation`/`dataset-body`/`modules`/
`library-component` to carry the redistributed weight).

## Out of scope / follow-ups

- `<script>`/`<stylesheet>`/`<setter>` real translation; `<dataset>` XML→JSON.
- Authoring new Declare library components for the high-weight
  `library-component` gaps (`window`, `radiobutton`, `menuitem`, …) — the whole
  point of surfacing that category.

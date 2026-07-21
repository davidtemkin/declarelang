# LZX Component-Library Mapping — Design

*Phase-2 follow-up to the LZX source layer (`docs/plans/2026-07-20-lzx-source-layer-*`).
Goal: correct the dominant `unknown-tag` gap (11,859) by cleaning up the
accounting first, then mapping the OL components with a **schema-backed** Declare
equivalent (safely, without regressing compiled-clean). Status: approved for
planning, 2026-07-21. Revised after spec review round 1 (three grounded reviews).*

## Problem

The Phase-1 oracle reported `unknown-tag` = 11,859 across 574 distinct tags — by
far the top category. Measuring what those tags actually are (empirical AST scan
of the corpus) shows the count is mostly **noise**, not components:

- **`<doc>` documentation prose** (~1,670) — `p`, `sgmltag` 270, `example` 246,
  `classname` 386, `tag`, `tagname`, `b`, `i`, `li`, `code`, `a`. All nested
  inside `<doc>` blocks (a `<class>`/`<method>` child; the API-doc convention).
  The parser recurses *into* `<doc>` and treats embedded HTML as UI.
- **Language constructs, not components** (~2,350) — `include` 1061, `library`
  454, `event` 332, `param` 148, `script` 117, `setter` 109, `remotecall` 96,
  `stylesheet`. **`<library>` is always the file ROOT** (454/454), never a child.
- **Text-content pseudo-gaps** (~2,681) — the `unknown-tag` `info` gap Phase-1
  emits for text on a slot-less tag. NOT components.
- **Dataset data** (~377) — `item`, `day`, `firstName`/`lastName`, `literal`,
  inside `<dataset>` bodies (XML data, walked as if components).
- **Actual UI components** (~4,650, the real residue) — `radiobutton` 242,
  `edittext` 162, `inputtext` 140, `checkbox` 97, `window` 96, `menuitem` 90,
  `textlink`, `textlistitem`, `stableborderlayout`, `scrollbar`, …

So "map the component library" is really: **stop miscounting (accounting), then
map the components that have a schema-backed Declare home.** Of the ~4,650 real
component residue, the safe schema-backed mappings cover a modest slice; the rest
(led by `window`, `radiobutton`, `menuitem`, `textlistitem`) correctly remain a
distinct `library-component` gap — the ranked "what to build next" signal.
**Expectation, honestly stated:** `unknown-tag` does not "collapse" so much as
**split** — noise moves to `documentation`/`dataset-body`/`modules`/etc., and
`library-component` becomes the new (accurate) dominant category (~3.8k).

## Scope — minimal

Accounting cleanup + **schema-backed** exact-equivalent component mappings only.
Explicitly **deferred** (each its own follow-up): translating `<script>` → a
`script { }` block, `<stylesheet>` → a Declare stylesheet, `<setter>` → a
`set x(v)` accessor, `<dataset>` XML data → the JSON `Dataset { }` body, and
**mapping library-class input components** (`checkbox`, `radiobutton`, `slider`,
`switch`, `field`, `progressbar`) — those need per-component attribute aliasing
(`value`→`checked`, etc.) which is out of this pass's scope.

The no-equivalent policy is **honest gap, not fake compile**: a component with no
safe schema-backed equivalent stays a categorized gap; it is NOT force-mapped
(that would report false success), and — critically — a mapping that would make
the file fail `check()` is not done (no compiled-clean regression).

## The moves

All changes in `lzx/src/map.ts`, `lzx/src/naming.ts`, `lzx/src/gaps.ts`, tests.

### Move 0 (enabling): position-independent special-tag routing

The Phase-1 mapper only special-cases some tags inside `mapMembers`' children
loop. But `<library>` is a **root**, and `resolveTag` returns null for it →
Phase-1 emits `unknown tag <library>` and drops the whole file. So the
doc/dataset/language-construct handling must run in **`mapElement`** (before
`resolveTag`), so it fires at root *and* child position. Add a
`routeSpecial(el, sink): "handled" | "walk" | null` step at the top of
`mapElement`:
- returns `"handled"` → record the gap, do NOT emit this node, do NOT walk
  children (doc, dataset-body, leaf language constructs like `<event>`/`<setter>`);
- returns `"walk"` → record the gap, do NOT emit, but STILL walk children for
  nested gaps (`<library>`/`<canvas>`-less containers whose children carry more
  constructs);
- returns `null` → normal mapping (resolveTag → emit or library-component).

### Move 1 — skip `<doc>` blocks

`routeSpecial`: `doc` → record one `info` `documentation` gap, return
`"handled"` (children not walked). Removes the largest noise slice.

### Move 2 — suppress `<dataset>` child recursion

`<dataset>` stays mapped to `Dataset` (it IS in `TAG_TABLE`, so `resolveTag`
returns non-null and normal mapping runs). Add a guard in `mapMembers`: when
`tag === "Dataset"`, do NOT walk data children; record one `degraded`
`dataset-body` gap. (Real XML→JSON is the deferred follow-up.)

### Move 3 — route language constructs (via `routeSpecial`, position-independent)

Each stops being miscounted; most are `"handled"`, `library` is `"walk"` (it
wraps class definitions worth scanning):
- `include` / `import` → `modules` (handled)
- `library` → `modules` (**walk** — scan its `<class>` children)
- `event` → `event-decl` (handled)
- `setter` → `custom-setter` (handled)
- `remotecall` / `rpc` → `rpc` (handled)
- `param` → `rpc` (handled — `<param>` is an RPC call argument, not a slot)
- `stylesheet` → `styling` (handled)
- `script` → `script-block` (handled)

### Move 4 — map schema-backed exact-equivalent components (with attribute + handler dropping)

Extend `TAG_TABLE` with a **curated, verified-safe, schema-backed** set (present
in `runtime/src/schema.ts` `SCHEMAS`, so `naming.attrTypeFor` can introspect
them): `edittext`/`inputtext` → `TextInput`; `image` → `Image`; `animator` →
`Animator`; `animatorgroup` → `AnimatorGroup`; `wrappinglayout` →
`WrappingLayout`. **`node` is NOT mapped** — `NodeSchema.attrs` is empty, so it
would drop every attribute to an empty shell (no value). Library-class input
components (`checkbox`/`radiobutton`/`slider`/`switch`/`field`/`progressbar`) are
**deferred** — they aren't in `SCHEMAS`, can't be introspected, and need a
per-component attribute-alias layer (`value`→`checked`, etc.).

**The image-source alias.** OL `<image>` names its source `src`/`resource`/`url`;
Declare `Image`'s slot is `source`. Without an alias the source would be *dropped*
— an empty image that still "compiles clean" (false success). So add
`src`/`resource`/`url` → `source` to `ATTR_TABLE` **before** mapping `image`.

**Attribute-dropping (prevents the `check()` regression).** OL components carry
attributes the Declare schema lacks (`edittext enabled=…`). `check()` rejects an
unknown attribute even under `typecheck:false`, so for a **schema-backed** mapped
tag (gated by `naming.hasSchema(tag)`), emit only attributes the schema has
(`attrTypeFor(tag, name) !== "unknown"`); drop the rest with one `unmapped-attr`
`degraded` gap each. **Note dropped attrs can be behavior-changing, not cosmetic**
(`password`, `enabled`) — that's the honest-gap tradeoff, recorded per drop.

**Handler-event dropping.** `check()` also rejects an `on<event>` handler whose
event the schema doesn't declare. The drop must cover handlers too: for a
schema-backed mapped tag, emit an `on*` method only when the schema's event set
(base chain, via `schema.events`) declares that event; else drop + `unmapped-attr`
gap. The curated set is verified handler-safe today (image→`click`;
animator→`start`/`stop`), but the guard future-proofs additions.

**Anchoring invariant — two-sided** (reconciles the pre-existing `button →
`Button`, which is a *library class*, not a `SCHEMAS` key): every `TAG_TABLE`
value must be a real `SCHEMAS` key **OR** a `library/src/*.declare` class name. A
Task-level test asserts this over the whole table. Attribute/handler dropping
applies to the schema-backed subset only (`hasSchema` true); library-class
targets emit their attributes as-is (their own auto-included schema checks them).

### Move 5 — residue → `library-component` (scoped to the tag-resolution site ONLY)

Only the **tag-unresolved branch** of `mapElement` (the site that today emits
`unknown tag <…>` because `resolveTag` returned null AND `routeSpecial` returned
null) is recategorized `unknown-tag` → `library-component`. The other Phase-1
`unknown-tag` emissions — canvas knobs, unnamed `<class>`/`<attribute>`,
text-content-with-no-slot — keep their existing `unknown-tag` `s13Ref` (they are
not components). After moves 0–3 excise doc/data/language, the residue at this
one site is a genuine OL UI component with no Declare home → the ranked "build
next" signal.

## New `S13Ref` values

`documentation`, `dataset-body`, `event-decl`, `custom-setter`, `rpc`, `styling`,
`script-block`, `library-component`, `unmapped-attr`. (`modules`,
`slots-placement` already exist and are reused; `param` now routes to `rpc`.)

## Testing

Unit tests, one per move:
- `<doc>` child skipped (not emitted, children not walked) + `documentation` gap.
- `<library>` **root** → `modules` gap, program is walked (its `<class>` children
  are seen), not silently dropped.
- `<dataset>` → `Dataset`, its `<item>` data children NOT walked, `dataset-body` gap.
- each leaf language construct → its category (`<include>`→`modules`,
  `<event>`→`event-decl`, `<setter>`→`custom-setter`, `<remotecall>`→`rpc`,
  `<param>`→`rpc`, `<stylesheet>`→`styling`, `<script>`→`script-block`).
- **ordering:** a `<param>` (or `<p>`, `<event>`…) *inside* `<doc>` yields a
  `documentation` gap, NOT `rpc`/`event-decl` — Move 1 excises `<doc>` children
  before `routeSpecial` sees them. One explicit test guards this dependency.
- `<edittext text="hi" width="200" enabled="false">` → `TextInput [ text = "hi",
  width = 200 ]` (schema attrs kept, `enabled` dropped + `unmapped-attr` gap).
- `<image src="a.png" width="64">` → `Image [ source = "a.png", width = 64 ]`
  (via the `src→source` alias — source retained, not dropped). Both **compile
  clean via `compile-node`** (auto-include host — the test MUST import `compile`
  from `compiler/dist/compile-node.js`, not core `compile.js`; core defaults to
  `NO_INCLUDES` and would reject library tags).
- a leftover `<window>` → `library-component` (not `unknown-tag`); a canvas knob
  (`debug`) still → its own `unknown-tag`-family gap, NOT `library-component`.
- Task-level: every `TAG_TABLE` value is a real `SCHEMAS` key OR a
  `library/src/*.declare` class name (two-sided anchoring).

**Library-root files & the metric.** A `<library>`-root file has no App, so
`mapDoc` returns null → `declare = null` → the harness counts it as
not-transpiled. This is *expected* (a library is class-only, not a runnable app),
not a failure — ~449 corpus files. The coverage report must report these in a
separate **library (class-only)** bucket, so `transpiled/total` is not read as a
regression. (`routeSpecial` "walk" = record the `modules` gap, call `mapMembers`
to collect nested gaps, discard the member output, return null — same shape as
the existing unknown-tag gap-walk.)

Then re-run the full-corpus sweep (`node tools/lzx-transpile.mjs
../openlaszlo-5.0 --compile --report`) and rewrite `design-docs/lzx-coverage.md`
with the corrected distribution — the deliverable. Track that **compiled-clean
does not drop** (the attribute-drop guard is what protects it).

## Out of scope / follow-ups

- `<script>`/`<stylesheet>`/`<setter>` real translation; `<dataset>` XML→JSON.
- **Library-class input components** (`checkbox`→`Checkbox`, `radiobutton`→
  `Radio`, `slider`/`switch`/`field`/`progressbar`) — need a per-component
  attribute-alias layer (`value`→`checked`, `onvalue`→an event), since those
  classes aren't in `SCHEMAS` and can't be attribute-introspected.
- Authoring new Declare library components for the high-weight
  `library-component` gaps (`window`, `menuitem`, `textlistitem`, …).

# Docs constraints — the buildability guardrails (handoff for the IA/editorial pass)

**Status:** 2026-07-14 (Opus prep). Companion to [`documentation.md`](documentation.md) (the
contract) and [`docs-audit.md`](docs-audit.md) (the inventory). These are the constraints the
information architecture, on-disk layout, and guide **must honor to be buildable and
gate-ready** — the guardrails, handed over so the editorial/IA pass designs *for the reader*
without designing something the toolchain can't later lock. They are constraints, not
suggestions; within them, the shape is judgment.

## Hard constraints (the layout/IA must satisfy these)

1. **Reference is generated, not written by hand.** Per-element pages derive from `@api`
   doc-comments in the source via `tools/doc/extract.mjs` (→ `docs-model.json`). The layout
   must give the extractor a **predictable place to emit** generated pages; the IA arranges
   and links them, it does not author them. (The prose *inside* a reference entry is the
   source doc-comment — editing happens at the code, not the doc.)

2. **Every ID is generated, never hand-created** (contract §5). Reference/diagnostic/flag IDs
   *are* the source symbol (`View.x`, `DECLARE2000`, a `FLAG_SPECS` key). Prose-section IDs are
   auto-slugged from the heading and **pinned**. The IA must not depend on hand-assigned IDs.

3. **Links use the `declare-docs:` scheme with symbolic targets** — never file paths or
   heading text. This is what lets files move freely (critical *right now*, mid-reorg) and
   what the dangling-link gate checks. Re-point the 17 `design/`-linking files to symbolic
   targets, not new paths.

4. **Every runnable fence is `verify`-executable.** A code example in a category-B doc must
   compile *and* behavior-assert where it claims behavior (verify rung 5). The IA must keep
   examples as real, runnable `.declare` (the docs app already renders live islands) — not
   inert code blocks.

5. **Surface claims must be cross-checkable.** Any attribute / component / diagnostic / flag
   *name* stated in prose is validated against the schema, registry, `Diag` catalog, and
   `FLAG_SPECS`. Prefer naming a real element (which links + checks) over prose paraphrase.

6. **The core doc stays small enough to hold in context.** It carries the whole model +
   terse usable rationale; it is *not* the exhaustive reference. Deep/historical rationale
   lives in `system-design/`. If the core doc stops fitting "in your head," the line between
   usable-why (core) and deep-why (system-design) has slipped.

7. **The guide is derivative + linked.** Every *fact* it states links up (`declare-docs:`) to
   the reference or core doc that backs it; a guide fact with no backing link is a lint. What
   it originates is the path, framing, and voice — not new facts.

8. **Two categories, by location.** `docs/` (root + guide/reference/operational) = category B
   (authoritative, gated). `docs/system-design/` = category A (the record; non-authoritative).
   Bundled-app specs co-locate in `examples/<app>/`, not in `docs/`.

9. **Same prose for human and LLM.** One corpus; the packaging/access differs (file nav,
   docs app, injected context, future IDE), the words do not. Do not fork a "human version"
   and an "LLM version" of a topic.

## Moving-target constraints (the reorg is live — design against the *settled* tree)

10. **Paths are provisional until the reorg lands.** In flight: `dist-browser`→`bundles`,
    `web`→`browser`, `/examples` serving retired (**the program URL is the run address**),
    `examples/site`→`examples/homepage`, `model.json`→`docs-model.json`. The IA/layout targets
    the post-reorg shape; do not hard-code today's paths. (Another reason links are symbolic.)

11. **The doc top-level moves ride the reorg.** `design/`+`design-docs/` → `docs/system-design/`
    is deferred to land *with* the distro reorg, one pass. The IA can assume that end-state.

## Editorial constraints (judgment, but bounded)

12. **No page-1 gotchas.** Front-load the payoff (a reactive binding; a one-file app that
    runs); defer caveats to where they're earned.

13. **Persuasion shown, not told.** The "Declare is better" argument is a construct that
    visibly does in five lines what the reader knows takes thirty — the example carries it,
    not the adjectives. This also self-enforces "not in-your-face."

14. **Mine, don't reinvent, the positioning** — see [`docs-source-map.md`](docs-source-map.md).

## Out of scope for the gate (pure judgment — do not try to mechanize)

- The guide's **narrative quality, sequencing, voice, and persuasive arc.** These are
  editorial; the gate checks the guide's *facts* (links + examples), never its prose quality.

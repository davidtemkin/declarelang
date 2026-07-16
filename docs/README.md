# docs — the Declare documentation root

Everything here is **category B**: knowledge documentation, authoritative, the same
prose for humans and LLMs — only the packaging differs. (The internal design record —
category A — lives in [`system-design/`](system-design/), and is *not* part of the
teaching corpus.) The governing spec is
[`system-design/documentation.md`](system-design/documentation.md).

## The layout

| where | what | start at |
|---|---|---|
| [`declare.md`](declare.md) | **The core doc** — the whole language stated once: spec, rationale, and the working brief. | top |
| [`guide/`](guide/) | **The guide** — the teaching path, in chapter order (the numeric prefix is ordering, not identity). | [`00-shape.md`](guide/00-shape.md) |
| [`operational/`](operational/) | **Operating the toolchain** — server, builds, verify, format, flags. | [`getting-started.md`](operational/getting-started.md) |
| the reference | **Generated from the `@api` surface** — browsable in the docs app (`examples/docs/`); the data rides [`declare-model.json`](declare-model.json). | the docs app |
| [`declare-model.json`](declare-model.json) | **The comprehensive machine model** — the SPINE (schemas, enum tokens, flags, requests, diagnostic codes, library, commands) + links + reference + guide, assembled from the live registries (`tools/doc/assemble.mjs`); its `meta.pipeline` describes its own derivation. Generated; do not edit. | — |

Reading order for a newcomer (human or model): `operational/getting-started.md` →
`guide/` in order → `declare.md` when you want the whole language at once → the
reference to look things up.

## Linking — `declare-docs:` symbolic IDs

Docs link to each other by **symbolic ID**, never by file path or heading text:
`[Reach](declare-docs:guide:reach)`. IDs are *generated* from the corpus — a guide
chapter's ID is its filename minus the ordering prefix (`20-tree.md` → `guide:tree`),
an operational page's is its filename (`operational:verify`), a reference symbol's is
the symbol itself (`View.width`) — so files renumber and move freely under stable IDs.

- **The registry and the gate:** `node tools/doc/links.mjs` builds the ID registry and
  reports every link; `--check` (run by `npm test`) fails on any dangling link, so a
  wrong target cannot ship; the graph itself travels inside `declare-model.json`.
- **Resolvers:** each packaging resolves the same IDs its own way — the docs app
  navigates in-app (guide and reference IDs switch the pane; the rest leave through
  `navigate`); on disk and for LLMs, the `links` section of `declare-model.json`
  maps any ID to its file.

## For LLMs

The corpus is designed to be consumed directly: plain markdown, one concept per
place, and every ` ```declare ` fence is a **complete program verified against the
compiler on every test run** (` ```declare-fragment ` marks illustrative excerpts).
Walk it either way:

- **File-system:** this directory, in the reading order above — entered through
  the skill at [`skill/SKILL.md`](../skill/SKILL.md) (the resident kernel + the
  routing table into these chapters).
- **Walkable JSON:** [`declare-model.json`](declare-model.json) — the one
  comprehensive structure: exact facts (names, tokens, flags, commands) in its
  `spine`, plus the link graph, the reference, and the guide as data. For a
  quick fact, grep the spine before reading prose.

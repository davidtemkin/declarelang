# Text wrapping + native Markdown

**Status:** SETTLED 2026-07-08 (David). Surfaced by the homepage build: `Text` never wrapped
(`white-space: pre`, "wrap semantics: open question"), blocking real prose. This is the ruling
for wrapping and for **Markdown as a native, full-featured content type** — the content-layer
expression of "the UI language for the AI era."

---

## Part 1 — Text wrapping

**The rule** (no new attribute for the common case):
- `Text` with **no bounded width** → single run, auto-sized to content (today's behavior).
- `Text` with a **bounded width** (literal or constraint) → **wraps** within it (`pre-wrap`:
  honors `\n` *and* wraps long lines). **Height auto-extends** to the wrapped lines unless
  author-set (a set height clips per `clip`).
- **Dynamic by baseline:** wrapping is reactive — when the width changes (container/viewport
  resize), the run re-wraps and its auto-extent height updates, and layout reflows. Wrapping is
  a standing relationship, not a one-time measure.

**Companions:** `wrap: boolean = true` (force single line; pairs with `clip` for truncation) ·
`textAlign: left | center | right = left`.

**Backends:** DOM = `white-space: pre-wrap` + `offsetHeight` for auto-extent (flip the hardcoded
`pre`). Canvas = build on **`@chenglou/pretext`** (the ~15 KB zero-dep DOM-free measurement +
`Intl.Segmenter` line-layout already named as the canvas text core) as the *starting* point;
match DOM break points within AA tolerance, deviations listed not silent.

---

## Part 2 — Markdown as a native content type

**Principle:** a developer says *"render markdown here"* and points `Markdown` at any string —
**no thinking about which subset renders.** Full support, in toto.

### Two primitives
- **`Text`** — plain string, one style, wrapping. Fast path: headings, labels, UI.
- **`Markdown`** — rich content authored in Markdown → a **rich-text tree** → rendered styled
  and wrapped. Prose, docs, content, AI output.

`Text` is never secretly formatted; `Markdown` is the explicit rich choice. (No-magic.)

### The rich-text tree — two tiers
```
document → [ block ]
  block  = paragraph | heading | list | blockquote | codeBlock | table | rule
  inline = text | strong | em | code | link | strike | br
```
- **inline tier** = flowing rich text (wraps; what fields will edit; what measurement lays out).
- **block tier** = structural content rendered through **neo's own layout/components**:

| block node | renders as |
|---|---|
| paragraph | wrapped rich-text run |
| heading h1–h6 | `Text`, size/weight from the `heading` slot |
| list (ul/ol, nested, task) | `Stack` of items — marker + nested block flow |
| blockquote | indented `View` + left rule, nested blocks |
| code block | mono `Text` in a `surface` `View` |
| table (GFM) | `Grid` — header + rows, cells are wrapped runs, per-column align |
| rule | thin `View` line |
| inline (everywhere) | styled spans |

Block Markdown is literally *"generate a neo component subtree from the tree"* — it **reuses the
site's `Stack`/`Grid`/`Text`/`View`** (double duty, not new machinery). A text **field** operates
on the **inline tier only** — which is why a table categorically can't live in a field (block vs
inline), not a limitation to fight.

### Scope — CommonMark + GFM, in toto
Paragraphs, all headings, ordered/unordered/nested/task lists, blockquotes, fenced + indented
code, **tables**, rules, strikethrough, autolinks, and the full inline set. A developer writing
normal Markdown never hits a wall.

**Raw HTML → escaped literal text** (the one documented deviation from CommonMark passthrough).
Inline `<b>/<i>/<a>` in a Markdown doc is rare (native syntax covers it) and raw HTML is used for
things we can't render anyway — so *all* HTML markup renders as visible literal text: safe,
predictable, self-correcting. **Character entities** (`&copy;`, `&#8212;`) still **decode** —
they're characters, not markup.

### The `prose` stylesheet
Rendered Markdown looks good with zero author effort via a default **`prose`** stylesheet mapping
node roles → styles (heading scale, list indent/markers, code surface, link color, quote rule,
table borders, vertical rhythm) on the theme tokens. This is a design artifact — the difference
between "renders Markdown" and "renders it gorgeously."

### Static vs dynamic — one API, compiler routes it
```
Markdown [ text = "## Literal" ]     → compiler expands to a neo subtree at build. Zero runtime MD.
Markdown [ text = :article.body ]    → runtime parses at render, REACTIVELY.
Markdown [ text = { llm.response } ]  → same; re-renders as the value changes.
```
The developer always writes `Markdown [ text = … ]`; literal vs computed is routed automatically
(same rule as `:path` with/without a schema). **The reactive dynamic path is a keystone** — a
streaming LLM response renders live, token by token, for free (the constraint system). (Perf note:
incremental re-parse is a later optimization, not an architecture change.)

### The parser — `md`, purpose-built, standalone
- **Not adopted off-the-shelf.** No marked/markdown-it/micromark and their generality/plugins/
  passthrough. We **write a tight parser for exactly our subset and nothing more** — the way neo
  hand-built its own parser. A few KB, single-pass, allocation-light, tuned for the reactive
  re-parse hot path. **Size and perf are critical here** — this is on the render path.
- **A standalone leaf module owned by neither compiler nor runtime.** The compiler is **not** a
  fixture of the runtime — it runs offline (CLI/build), on a server request, *or* in the browser,
  and a deployed app ships the runtime but generally not the compiler. So `md` has two independent
  import sites: the **compiler** imports it to expand literals at build; the **runtime** imports it
  (only when dynamic Markdown is used) to parse at render.
- **Delivery is deferred to a general topic.** Whether `md` is statically compiled-in (literal
  path) or dynamically loaded (dynamic path) is decided by the broader **module-loading /
  code-splitting / tree-shaking** design (which we found the runtime doesn't yet support) — not
  hard-wired for Markdown. `md` is built as a clean module that plugs into whatever that becomes.

### Deferred / horizon
- **HTML-subset as an *alternate authoring/interop front-end*** onto the same tree (LZX migration,
  CMS/RSS ingest, contenteditable) — separate optional feature, decoupled from the Markdown reader.
- **Markdown-specific string operations** (character-index vs styling split) — the architecture for
  a rich-text *editor* (plain buffer + marks overlay); the editing layer, not now.
- **Markdown embedding live neo** (a `neo` fence as a runnable example) — the Explorer endgame.

---

## Sequencing
`wrapping` (prerequisite; unblocks the homepage prose immediately) → **`Markdown` (full block +
inline)** on the two-tier tree, block → `Stack`/`Grid`/`Text`/`View`, styled by `prose`, literals
compiler-expanded / dynamic runtime-parsed via `md` → convert the site's copy **and** add a live
showcase render (paste/stream Markdown → renders). Interleaves with Tranche-1's `Stack`/`Grid`.

## Showing it off
A homepage/playground section that live-renders a real doc (headings, list, fenced neo code, a
table, links, bold) — editable, so you paste an LLM's Markdown and watch it render styled and tiny.
Reflexive dogfood: the Explorer's **docs are Markdown neo renders** (the doc system = `Markdown` +
`prose`).

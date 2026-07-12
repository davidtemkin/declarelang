# Documentation — future plans

**Status:** DRAFT / exploration 2026-07-10 (David). Not settled — captured to return to.
Sibling of [`doc-system.md`](doc-system.md) (the *generated-reference* system — structure,
`@api`, coverage gates); this is the *authoring* side (how docs are written) and the *why /
for-whom*. See also [`text-and-markdown.md`](text-and-markdown.md) (native Markdown content type).

---

## 1. Markdown doc blocks — a captured construct

Two comment registers, split along the language's existing `[ ]` vs `{ }` seam:

- `// …` — a **literal** line comment. Terse, code-adjacent, never rendered. Unchanged.
- `/* … */` — a **Markdown doc block**. Prefix-free Markdown interior; rendered in preview,
  **and captured by the compiler** as documentation.

(Recommended delimiter: reuse `/* */` — it already exists inside `{ }` bodies; a top-level form
is a small lexer addition. An opt-in marker like `/*: … */` is the alternative if plain literal
block comments are judged common enough to deserve their own form — not expected in `.declare`.)

### Attachment: a doc block documents the declaration that follows it

One uniform rule — **not limited to classes.** A doc block attaches to *whatever declaration
comes next*, at every level of granularity a reference needs:

- a class / component, a child instance,
- an **attribute** (`count: number = 0`), a **method** (`onClick() { … }`),
- a `style` / `stylesheet`, a `font`, a dataset / datapath, an `include` —

every object that can appear in a `[ ]` block. A free-standing block (not before a declaration)
is just narration. Reference-level granularity falls out of the single attachment rule; nothing
is special-cased per declaration kind.

### Indentation is cosmetic (dedent)

Markdown is whitespace-sensitive (4+ leading spaces → a code block), and a doc block nested
inside `[ ]` is indented. So the block's **common leading whitespace is stripped** — the same
`dedent()` the `"""` text block already uses (parser.ts:241). The author writes clean Markdown at
any nesting depth; the compiler/formatter normalizes it to column 0. This must be part of the
*language definition*, not just an editor nicety, so every tool (compiler, formatter, LSP) agrees.

### The boundary: docs live in `[ ]`, code keeps its comments

The scheme is a **declarative-surface** construct. It does **not** reach into `{ }` regions —
constraint bodies, method bodies, raw child bodies (all raw TS). Inside a `{ }`, comments are
ordinary TS comments (`//`, `/* */`) — **plain text, not Markdown.** You document the *declaration*
a `{ }` is the value/body *of*, from outside, with a doc block before it; you don't document inside
the expression. (The one top-level code region is **`script { }`** — module-scope imports and free
functions; being a `{ }` region it follows the same rule: plain comments inside, and a doc block
attaches from *outside*, documenting the block. There is no `Script` *element* — a script is not a
tree node.) This is a feature, not a limitation: the doc-comment split lands
exactly on the `[ ]` (declarations) / `{ }` (TypeScript) seam that already organizes the language.

## 2. Humble syntax, elevated semantics

The point is *not* "comments can be pretty." The compiler **captures** the doc block (by position)
and the Declare toolchain pays it back everywhere:

- **generated reference** (`doc-system.md`) — the block *is* the entry;
- **hover / tooltips** via an LSP Declare *ships* — editor-agnostic, so the value is the
  language's, not one editor's;
- **diagnostics** can quote a declaration's own doc;
- **AI-context export** — hands a model each object's authored docs as curated context.

Write it once as a comment; the language propagates it. That is the value-add — delivered by the
toolchain, not an editor render. Syntax stays humble (no `@tags`, no ceremony); semantics are real.

## 3. Human vs. LLM documentation value (a clarifying lens)

Not a wildly different discipline from human docs — good docs are good docs — but a useful lens on
*which* parts carry the weight when the reader is a model.

**For a human, docs cut EFFORT. For an LLM, docs cut ERROR.** A human's bottleneck is reading;
even *descriptive* docs ("what this does") save the climb. An LLM has little reading bottleneck at
in-context scale, so descriptive/**restating** docs collapse toward zero value — it already
predicted them. Information-theoretically, a doc is worth the bits *not recoverable by the reader*,
and a strong reader zeroes out the descriptive bits.

The **residual** is where model value concentrates, and some of it exceeds the human's:

- **Intent / "why"** — not in the code for anyone; but the model's failure mode is *confidently
  inventing a plausible why*, so docs here prevent a confident-wrong, not merely fill a blank.
- **Unstated invariants / contracts** ("run after init", "never mutate", "idempotent") — invisible
  in code; the model is the agent most likely to violate them (it pattern-matches from everywhere).
- **Prior-correction / gotchas** — the sharpest kind-difference. A model arrives with strong
  defaults; a codebase's *deviations* are where it's confidently wrong, so a doc there is a **prior
  override**, not a gap-fill. (This repo's live examples: `0x` vs `#` colors, "rebuild the browser
  bundle after a compiler change", `classroot` semantics, "no DOM in `{ }`". Descriptive docs would
  have saved none of these.) A human newcomer has weaker priors — they read, they don't assume.
- **Canonical examples** — the highest-signal thing you can hand a model (few-shot), outweighing
  prose.

Other differences that aren't degree:

- **Function.** For a human a doc is input to *comprehension*; for an agentic model it's also a
  constraint on *generation* — a spec it must conform to when editing. Guardrail, not guidebook.
- **Delivery.** Models benefit from docs *extracted and curated* into context more than inline —
  an argument for first-class **capture** that the human case alone wouldn't justify.
- **Scale.** Past the context window the model can't read it all either, and docs snap back into
  the human role — a *map* for deciding what to load. So the kind-difference is really
  "fits in context" vs. "doesn't."

**Design upshot.** Optimize doc blocks — and **weight the AI-context export** — toward the
non-derivable: *why / must / must-not / "looks like X but isn't" / a canonical example*, over
descriptive "what". Capture "what" only and you've built a lovely thing for humans that a model
will skim.

## 4. Open questions

- Final delimiter choice (`/* */`-as-Markdown vs. an opt-in `/*: */` doc marker).
- Capture scope: every `/* */`, or only doc-position blocks? Free-standing narration handling.
- The pipeline from captured blocks → `doc-system.md` generator, the shipped LSP, the AI-context
  export format (and how that export *weights* the non-derivable content).
- Formatter behavior (re-dedent / normalize doc blocks on format).
- Discoverability (the benign gap): surfacing that comments can render, without the language
  depending on any one editor to advertise it.

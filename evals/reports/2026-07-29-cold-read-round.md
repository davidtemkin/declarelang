# Findings — the 2026-07-29 cold-read round

> **Provenance.** Two independent agents were given the repo and asked to start
> from `docs/declare.md`, with no context about recent work: one assessing *as an
> LLM that would have to write the language*, one taking the POV of an
> experienced React developer who has tried Svelte and done some iOS. Neither was
> told what had changed. Both were asked the same eight questions — what makes
> sense, what is hard, what is untrue, what is surprising, what is arbitrary,
> what they like, what quality level they ascribe, and what they would use it for.
>
> **Status of this round, relative to the previous one:** the previous round
> produced *structural* objections (the typing gap that drove the whole
> 2026-07-28 arc). This round produced a **bug list**. Both agents independently
> called the architecture sound — "None of what I found is architectural" — and
> rated it a strong late-alpha with high craft. That is the progress signal; this
> file is the debt it surfaced.

> **Superseded in part by `findings-2026-08-03.md`.** Seven agents, five days later,
> independently re-found A1 (deps dropped through a call), A3 (theme untyped) and C11
> (no did-you-mean on attributes) without having seen this file. Those three are still
> open and are carried forward there; §D (the theme question) and §F (the functional
> gap) are unchanged and remain the standing statements. This round's other items are
> not re-litigated there.

## How to read the Verified column

- **✓ me** — reproduced in this repo, at the terminal, by the author of this file.
- **✓ agent** — the agent showed a concrete repro; not independently re-run here.
- **claim** — asserted, plausible, not yet checked.
- **✗ false** — checked and the agent was wrong. Recorded so nobody re-chases it.

---

## A. Correctness bugs

| # | Finding | Evidence | Verified | Severity |
|---|---|---|---|---|
| A1 | **Method-parameter reads are not rebased into deps.** A constraint calling `f(app.cart)` where `f(c)` reads `c.qty` wires only `this.root.cart` — the value goes permanently stale. The identical body as a `script { }` function wires `.qty` correctly. | `dep-extract.ts:611` calls it a "KNOWN HOLE, deliberately left"; closing it "refuses live code in three shipped apps." `declare.md` §5 asserts the opposite ("every read inside all of it is a wired dependency") in the same breath as "an unanalyzable constraint is a blocking compile error rather than a silent fallback." | ✓ me — deps: method `["this.root.cart"]` vs script `["this.root.cart","this.root.cart.qty"]` | **High** — silent wrong value, contradicts the language's central claim |
| A2 | **`Dataset.set()` does not wake `.value` readers.** A TypeScript read of `.value.rows[0].done` stays stale after a surgical `set()`, while `.read(["rows"])` and `:datapath` reads both update. The stale constraint's recorded dep is the exact path written. | `declare.md` §7 teaches the broken idiom: "A Dataset's `.value` is the parsed data, so a count is ordinary TypeScript on it." | ✓ agent | **High** — silent wrong value on the documented path |
| A3 | **`theme` is entirely untyped.** `Theme = Readonly<Record<string, unknown>>`. A misspelled or invented token compiles clean, wires as a constraint, boots clean, and resolves to `null` — a transparent fill — with no warning at any of the six rungs. | `value.ts:135`. The tell: `library/checkbox.declare:37` does `typeof theme.checkboxSize == "number" ? … : 20`, a defensive pattern repeated across `library/`. | ✓ both agents, independently | **High** — see §D, this is the round's strongest signal |
| A4 | **`children.length` compiles, records a dep, and never updates.** The dep `this.root.box.children.length` looks wired but has no cell behind it. | — | ✓ me (text stays `"0"` while `children` is 2) | Medium |
| A5 | **`Tab` is `preventDefault`'d unconditionally** while Space and the arrows immediately below it are gated on `focusHolds()` and `activeElement`. | `keys.ts:137` vs `:143-147` | ✓ me | Medium — top-level only; embedded apps are correctly exempt (`boot.ts:105`) |
| A6 | **`verify.mjs` omits `originDir`**, so includes resolve against the process cwd while the dev server and `declarec` both pass it. The shipped library does not verify from the repo root. | `verify.mjs:100` vs `server/create.mjs:337`, `declarec.mjs:127` | ✓ agent | Medium — one-line fix |
| A7 | **`Accordion` violates the §11 value contract** its own docstring claims ("exactly RadioGroup's shape"): no `input` seam, and `Pane.press()` assigns the group's slot directly, so the documented pattern earns a runtime refusal. | `accordion.declare:12`, `:53` | ✓ agent | Medium |
| A8 | **`export` in a `script { }` block cascades bogus errors** at the wrong line/column ("nothing in scope is named 'Text'"). Dropping `export` works; nothing says which form to use. | — | claim | Low |

## B. Naming

| # | Finding | Verified | Note |
|---|---|---|---|
| B1 | `ignorelayout` → **`ignoreLayout`**, `ignoreclip` → **`ignoreClip`**, `focustrap` → **`focusTrap`** — all-lowercase compounds sitting beside `cornerRadius`, `pointerEvents`, `contentWidth`, in a language whose own formatter doc mandates camelCase (`declare.md:726`). | ✓ me | Breaking; the did-you-mean machinery makes the migration near-free, as `onPointer*` showed. **LANDED 2026-07-29** (the `scrolls` axis enum rode the same sweep; every retired spelling errors naming its rewrite) |
| B2 | Checked and **deliberately NOT offenders**: `multiline`, `spellcheck`, `stylesheet`, `placeholder`, `focusable`, `selectable`, `stretches`. These match web-platform spellings and should stay one word. | ✓ me | Recorded so the sweep does not overreach |
| B3 | `input` means two different things: an overridable **method** on Checkbox/Switch/Slider/RadioGroup, an **event** on TextInput. The natural generalization (`TextInput [ input(v) { … } ]`) compiles, boots, and is dead code with no warning. | ✓ agent | Naming collision with a silent failure attached |

## C. Documentation gaps

| # | Finding | Scale | Verified |
|---|---|---|---|
| C1 | **`Draw` is undocumented everywhere a reader would look** — no `prose/Draw.md`, absent from `declare-model.json` entirely, two incidental mentions in `declare.md`. The compiler knows all 55 members exactly (hand-mirrored into the scaffold 2026-07-28); the reference shows none. See §E for what the doc should say. | 23 accessors + 35 methods | ✓ me |
| C2 | **The value-constructor family is absent from the "one file"** — `stroke()`, `shadow()`, `gradient()`, `rgba()`, `blur()`, `hsl()`. `declare.md:108` says bare slots hold "Lengths, colors, and keywords," but `calendar.declare:681` is `shadow = shadow(0, 6, 16, #00000088)` — a function call with an 8-digit hex, in a bare slot. | **264 uses** across `apps/` + `library/` | ✓ agent |
| C3 | **Dataset mutation is absent from `declare.md`** — `.set()`/`.read()`/`.insert()`. The doc says "Assignment is the whole update model… no way to change a value without the cascade," but for datasets it is `data.set("rows.0.done", true)`. Compounds A2: the doc teaches `.value` and never mentions the `.read()` that actually subscribes. | **239 uses**; 0 mentions | ✓ agent |
| C4 | **`app.pointerX` is never mentioned** despite §8 covering drags at length — and it is what the calendar and the library `Slider` both use, in preference to `e.x`. | 59 uses | ✓ agent |
| C5 | **`.value` and `key` are absent from the reference model** the map points you to for "a name, a type, or a signature." Both are used throughout `declare.md` itself. | — | ✓ agent |
| C6 | **`DataSource.schema` is documented and does not parse.** Described in detail at `declare.md:458-461` and stated flatly in `guide/09-data.md:90-92` with no hedge. `declare.md` carries a trailing "(Landing; …)" that reads as modifying only the last sentence. | — | ✓ agent (first compile failure) |
| C7 | **The library reference is 89% undocumented** — 170 of 191 `library/` entries have `doc: null`, versus 93 of 276 for `runtime/`. Library *internals* are published as API: `Slider.x0`/`v0`, commented in source as "drag bookkeeping," appear with `api: true`. There is no visibility mechanism — every declared attribute is public. | — | ✓ agent |
| C8 | **"Compiled by the test suite on every commit"** (`declare.md:14`) — the programs *are* compiled by `docs.test.mjs`, but the pre-commit hook runs six generators each `\|\| exit 0` and unconditionally exits 0, and there is no CI. `docs.test.mjs:5` states the accurate version: "on every test run." | — | ✓ agent |
| C9 | **`-> Ret` doc/corpus mismatch.** §3 reads as though a returning method needs one; parameters are required but returns are optional, and `darkTheme()`, `computeMonthRows()`, `buildModel()` in the reference app all return values without it. Introduced 2026-07-28. | 3 sites | ✓ me |
| C10 | **A component-class attribute type does not auto-include the class.** `dlg: Dialog = null` fails with an unknown-name error; `dlg: Dialog [ ]` works. `include.ts:169` treats attribute type names as non-references. Undocumented. | — | ✓ agent |
| C11 | **No did-you-mean on unknown ATTRIBUTES.** `fontsize`, `onclick`, `labl`, `colour` all get a bare "has no attribute 'X'". Methods have near-miss suggestions; attributes do not — and these are precisely the errors an LLM makes, with the full attribute list in hand. | — | claim |
| C12 | `<->` described as "the only arrow in the language" (`:466`) while `->` is the return-type marker (`:178`). Calendar stat says 740 lines; the file is 737. | — | ✓ agent |

## D. The theme question

Both agents reached for this **first and independently**, from opposite directions — the human noticed the defensive `typeof theme.x == "number"` pattern in `library/`; the LLM wrote two invented tokens and watched them render transparent through all six rungs. That convergence is the strongest signal in either report.

It is not drift. It is a real gap, and it sits exactly where the language's pitch is loudest:

- `declare.md:28-29` — "a guessed attribute is a compile error"
- `declare.md:559` — theme is "a token record every color in an app should name once"
- …and every token read is an unchecked string-keyed lookup into `Record<string, unknown>`.

The material to fix it already exists: `library/themes/*.declare` names all 45 tokens at build time, and this round's typing work added component-class types, function types, element-typed arrays, and a nullable marker — so a declared `Theme` shape is now expressible in the vocabulary. **Open design question, not a mechanical fix**: whether a theme is a closed record (checked, extension by declaration) or an open one with a checked *known-token* core.

## E. What a `Draw` doc has to say

Recorded here because the rationale already exists in `draw.ts`'s header and has simply never reached a reader.

- **`draw()` runs on invalidation, never per frame.** It records a **display list of plain-data ops** — never live pixels, never a stored `Path2D`, every op structured-cloneable so a recording can cross a worker boundary.
- **Both backends replay the same list** — canvas straight into the shared ctx, DOM rasterized into that view's own `<canvas>`. This is what makes a recording substrate-independent and lets the runtime re-host a view without re-entering user code.
- **The subset is nearly all of Canvas2D, and completeness is the stated goal** — "a developer who knows Canvas should find Canvas." Present: text, gradients, shadow/blur, `filter`, compositing, clipping, transforms, the full path and rect set.
- **Two families are out, for one principled reason** — a recording may be detached from any live context:
  - **reads** — `measureText`, `getImageData`, `isPointInPath/Stroke`, every getter;
  - **live image sources** — `drawImage`, `createPattern(image)`, `putImageData`. The op shape exists; the pixels need an image-handle model. "The follow-on, not a refusal."

## F. The functional gap — data-heavy CRUD

Not a bug list; the honest scope statement of what Declare cannot do well yet. Both agents arrived at the same place from different angles: the LLM noted "**there is no `Select`/dropdown, which is the first control anyone asks for**, and no composition recipe for one anywhere in the docs"; the developer's "not for" list was "anything data-heavy until `.value` invalidation is fixed, anything needing an ecosystem."

| Area | Missing |
|---|---|
| **Components** | `Select`/dropdown (the first control anyone asks for), Tabs, table/datagrid, date picker (ironic given the flagship), list virtualization |
| **Data** | Virtualization for large collections; JSONPath (RFC 9535) reads and JSON Pointer (RFC 6901) writes — ruled and measured in `data-paths.md`, unbuilt; the optional response `schema` (C6) that would make `:path` compile-checked |
| **Compile-time** | More static checking of the data layer generally — today a `:path` is only as checked as the (absent) schema makes it |

`docs/system-design/data-paths.md` is the standing plan for the data half; the component half has no equivalent document yet.

## G. Explicitly checked and FALSE

Recorded so nobody re-chases them.

| Claim | Reality |
|---|---|
| "`children.length` compiles and updates correctly; I drove it 2→3" (LLM agent) | **False.** Text stays `"0"` while `children` is 2. The opposite finding (A4) is the true one. |
| "The unconditional `Tab` preventDefault breaks the host page's tab order for an embedded app" (dev agent) | **False for embedded.** `boot.ts:105` — `if (chrome \|\| embedded) return;` sits directly above `Keys.listen(…)`, so an embedded app never installs the global listener. A5 stands for top-level apps only. |

## H. What both agents praised

Kept because it is evidence about what to protect while fixing the above.

- **First-try compiles.** Both wrote a working app from `declare.md` alone with no prior exposure — 45 lines and 78 lines respectively, clean through R4 on the first attempt. "I know of no other new language where that happens."
- **`explain()`** — "the best debugging affordance I have seen in a reactive system." It is what localized both of the round's silent-value bugs in minutes.
- **Event sources as children** (`Keys [ … ]` dying with its node) — "the single best small idea in the language and I'd steal it tomorrow."
- **The rung ladder**, and rung 5 driving real input deterministically in Node — with `controls.assert.mjs` asserting *provenance*, that a value is a statically wired constraint.
- **The diagnostics that name a rewrite** — the `borderWidth` → `stroke(1, …)` family. "Someone sat down and enumerated the CSS instincts an author arrives with." Both agents rated these above the docs as a teaching surface.
- **The static-dependency refusal.** "Every other reactive system I know falls back to runtime tracking or silent staleness."
- **The calendar as argument rather than demo** — four views as one continuously-zooming rectangle, five springs on five scalars, every cell's geometry derived. Both cited it as the strongest thing the project says, and both noted it says it in code.
- **Honesty in the source comments** — `dep-extract.ts:611` naming its own hole and the three apps that would break; `calendar.declare:220-225` documenting that the app's palette does not speak the library's role names.

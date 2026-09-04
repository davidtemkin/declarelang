# declare-help — ask the platform a question

One command answers name-shaped and concept-shaped questions from the documentation
model, in the same register the compiler uses:

```bash
node tools/declare-help.mjs <question> [--all] [--json]
```

No server, no index, no network — it reads `docs/declare-model.json` once and runs
cold in a fresh clone. Same question, same bytes, every time.

## What it answers

| you ask | you get |
|---|---|
| `Slider.value` | the reference entry, scoped: type, default, read-only, the prose, see-also |
| `Text.lineheight` | the compiler's own near-miss: `did you mean 'lineHeight'…?` |
| `Segmented` | the class: member table, library file, inheritance chain (`--all` adds the full prose) |
| `lineHeight` | every class carrying the attribute — then ask the scoped form |
| `borderWidth`, `zIndex` | the foreign name's hint, verbatim — the Declare door the CSS instinct was looking for |
| `rotation`, `bold inside a label` | the entry that answers the concept |
| `scrolls`, `fontWeight tokens` | the enum's tokens, and who carries them |
| `DECLARE7001` | the diagnostic's family and where its register lives |
| `E3A14CE` | a **runtime** error code — what a production build throws in place of the sentence: the message, and where it is thrown |

## Two contracts worth trusting

**A curated absence is a success.** When something deliberately does not exist
(`drawImage`, an image preload call), the answer states the absence, names the real
door, and **exits 0** — that is the answer, not a failure to find one.

**A true miss is honest.** When nothing anywhere answers, it **exits 1** and lists
what was searched — so silence means "not documented," never "not found by this
tool." If it should exist and does not, that absence is worth reporting.

## Where the answers come from

The tool adds no truth of its own. Vocabularies and prose come from
`docs/declare-model.json`; the hint tables and the
did-you-mean calibration are imported from the runtime's teach module
(`runtime/src/teach.ts`) — the same code the checker's diagnostics run, so this
tool and the compiler cannot learn different manners. The concept table is curated
in `tools/internal/doc/concepts.json` and rides the doc pipeline
(`assemble.mjs`) into the model, gated like everything else.

For bulk extraction or an unusual join the tool doesn't answer, grep the model's
`spine` and `reference` sections directly rather than reading the file whole —
it is large, and one line of it can be very long.

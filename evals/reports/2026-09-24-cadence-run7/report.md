# Cadence — run 7 · 2026-09-24

**Subject:** GitHub `52bfadcd`, downloaded fresh — `evals/` stripped, brief and fixture at `task/`.
**Model:** Opus 5.5 (`claude-opus-5-5`).
**Launch:** `evals/craft/launch.sh cadence ~/Code/eval-cadence-7 claude-opus-5-5 52bfadcd` — the recorded standard (`evals/craft/README.md`): six tools (Read, Glob, Grep, Bash, Write, Edit) and no others, accept-edits, permission prompts refused, no MCP servers, started in the run directory. `started.txt` is the record.
**Prompt:** `prompt.txt`, the four standard sentences. **Brief:** unchanged since run 5.

One round, no fix pass. Two variables moved against run 6: the model (Opus 5 → 5.5) and the platform (`63b240f` → `52bfadcd`, chiefly `05932487`, which answered run 6's findings). One run cannot separate them; this one is read as a new baseline, finding by finding.

## Headline

**Clean through R4** from the main tree (246 nodes, settled in 73 ms) · **no R5 assert written** — it drove its own puppeteer flows at 360, 390, 820 and 1440 px · **1,302 lines** in one file · **16.0 min** · **76 turns** · **$6.29**.

| usage | tokens |
|---|---|
| output | 89,555 |
| fresh input written to cache | 277,062 |
| cache reads, summed over turns | 11,424,521 |

## Against run 6

| | run 6 (Opus 5, `63b240f`) | run 7 (Opus 5.5, `52bfadcd`) |
|---|---|---|
| build round | 58.6 min, $43.27 | 16.0 min, $6.29 |
| tool calls before the first write | 44 | 33 |
| files read before writing | 19, + 12 `declare-help` | 13, + 13 `declare-help` |
| `verify` runs | 53 (15 at R5) | 12 (none at R5) |
| writes and patches to the app | 66 | 18 |
| screenshots viewed | 26 | 15 |
| output tokens | 226k | 90k |
| app | 1,788 lines + 25-step assert | 1,302 lines |

The reading phases match; the difference is the build-and-fix loop. Part of that is the model; part is that it did less — no assert — and took a data path that avoided run 6's pitfalls entirely (below).

## Appearance, layout, text — the best of any run

The reviewer's judgment: aesthetically far ahead of every previous run, with nothing glaring in alignment. The code shows why, and it lines up with the guidance run 6 lacked or ignored:

- **A figure and its units are one run of text** — three `HTMLText` runs with `textStyles` classes set the hero lines ("4 sessions · 4h 11m"), exactly the style chapter's form. Run 6 kerned separate views by hand and had to undo it.
- **`TextLabel`** for every digit in a disc and every button label (run 6 hand-rolled one).
- **Library layouts throughout**: `SimpleLayout` ×27, one `WrappingLayout` with `rowSpacing`, one `ResponsiveLayout` switching one column and two. No custom layout, none needed.
- **Tabular numerals** on all nine changing figures; letter spacing proportional to size; hero line height 1.0.

Small things: the "Last session" row aligns "yesterday" to the bottom of "Lift" (`align = end`) rather than its baseline, a few pixels low; two figures are centred by a line-height guess (`(76 − fontSize·1.2)/2`); equal columns are divided by hand in several places; the monospace stack is repeated rather than held once.

## The data layer, bypassed

Only the live session is a `DataSource` (polled by a five-second tick in its URL). The first load is `Promise.all` over two raw `fetch` calls with a hand-set `loaded` flag; add, correct and delete are `fetch` in handlers with a hand-kept `busy` and `saveError`. The truth itself is idiomatic — a typed `Dataset`, every edit one write (`insert`, `set`, `removeAt`), everything derived — but the request lifecycle `DataSource` provides (`loaded`, `loading`, `failed`, `error`, `statusCode`, `errorBody`) is rebuilt by hand, and a failed first load leaves a blank screen with no `failed` to derive from.

Asked why (read-only resume, `question-why-no-datasource.txt` → `reply-why-no-datasource.md`, ~$10 of the session reloaded):

- `declare.md` permits it: handler code is "ordinary TypeScript: … the host's `fetch`/`URL`/timers".
- No example in `apps/` writes through a `DataSource`; the data chapter's only POST is a GraphQL query — a read.
- It never opened `DataSource.method`, `body`, `statusCode` or `errorBody`.
- The hand-set `loaded` flag contradicts the data chapter's "There is no `isLoading` flag you set"; it followed the tracker's `booted` flag instead.

**Finding for the docs:** show a create, update and delete through a `DataSource`. An agent looking for the write pattern finds only the escape hatch.

## Fix pass: through `DataSource` (labelled; not part of the one-round result)

The same session, resumed with the same six tools, given `fixpass-prompt.txt`: move every
exchange with the service to `DataSource` — first load, live refresh, add, correct, delete —
keeping behavior and appearance, and say what it had to look up and what the docs didn't
answer. **3.2 min · 13 turns · $11.24** (most of it the session reload). Result
`app-after-fixpass.declare`, 1,320 lines, clean through R4 from the main tree; no raw `fetch`
or `.then` remains; five sources (`todaySrc`, `db`, `liveSrc`, `saveSrc`, `delSrc`).

- `ready` derives from the two sources' `loaded`; the hand-set flag is gone.
- One `saveSrc` whose `method`, `url` and `body` derive from the draft (POST or PUT); Save
  calls `fetch()`, `onLoad` merges the stored record; "Saving…" from `loading`; the refusal's
  own sentence from `errorBody.message`.
- The history source is itself the working copy (a `DataSource` is a `Dataset`: `insert`,
  `set`, `removeAt`) — no separate `Dataset`.
- The live refresh is a `Time` calling `liveSrc.fetch()` every fifth second.

Pointed at the tool, it read the full reference entries (`declare-help DataSource.<member>
--all`) and got it right in one pass. What it said the docs did not answer (`reply-fixpass.md`):
whether a source may serve as the working copy and what a later fetch does to local edits;
how to refresh on an interval; whether writes earlier in a handler reach `fetch()` (they do —
`fetch()` settles first); whether `fetch()`'s promise rejects (it does not); how to react to a
failure (no failure event — it used `trackChanges` on `failed`); and why `trackChanges` needed
braces on a `DataSource` but not on the App.

## Other departures from the idiom

- Computed values held in `Dataset`s and read back `as any` about a dozen times — right for the lists that replicate rows, not for the scalars beside them.
- `Btn` and a `Choice` row rebuilt where `Button` and `Segmented` exist; sheets built from a view layer and two springs.
- The palette split between script constants and raw hex in views; the App's `theme` set, then barely read.
- The key handler reaches `this.layer.entry.body.col.noteBox.note.focused` from the App.

## Its own choices and caveats (`reply-build.md`)

"This week" is the last seven days; the streak counts from today or yesterday; the default sport is weekday-weighted (the data has no time of day); exact hours read "3h". It found port 8200 serving another checkout and ran its own server on 8201. It read the service's source (the prompt forbids only modifying it), and deleted its own test sessions — the service ended at its original 248.

## Evidence

Run directory `~/Code/eval-cadence-7/` — `logs/agent.stream.jsonl` (every event, every read), `logs/question.stream.jsonl`, `report.py`/`tail.py`/`cost.py`. Here: `app.declare`, `prompt.txt`, `started.txt`, the two replies and the question, `shots/`.

# Memory: everything given back, and a program that can ask

*Design note, 2026-11-01, from DT's direction after issues #34 and #35. Status: designed,
not built. The order of work is at the end.*

## The goal

A program's memory should follow **what is live now, not what has ever existed or how long
the program has run.** A desktop app left open all day uses at five o'clock what it used at
ten past nine, plus whatever it is showing now that it wasn't then.

Two things follow:

- **Inside the block it has been given, the runtime gives everything back.** Every view,
  value, rule and expression it allocates returns to a shared pool when it goes, and
  anything later can reuse that space. The block itself may only grow. A WebAssembly memory
  cannot shrink, and most allocators keep their peak too. So the bound is the program's
  peak live size, not its age.
- **A program can ask how it is doing,** in its own terms (views, bytes, the hosted
  programs it holds), and the runtime can say when something grows on every return to the
  same state.

## Where it stands (measured 2026-11-01, on `main` after #34)

Every kernel table has a free list (cells, rules, dynamic edges, views, code, constants), and
the soaks that churn *within* a program are flat. Over hundreds of cycles, calendar
navigation, tracker searches and rebuilt rows with short expressions gain nothing. Two leaks
remain, and both are design, not slips:

1. **A view's slot block is pooled per class.** When a view is torn down, its block of
   attribute cells goes to a free list for *that class* (`FREE_BLOCKS`,
   `runtime/src/attributes.ts`), never back to the kernel. Within one program a class
   recycles its own blocks, so in-app churn is flat. But no other class can ever use the
   cells, and a program built again (an island detached and reattached, a module reloaded)
   has new classes, so the old pools are orphaned for good. Building and discarding one
   small program 30 times raised the cell high-water mark by about 410 each time
   (2,099 → 14,035). 400 of every 412 were pooled blocks.
2. **Code blocks are reused only by exact length, up to 64 words** (`CODE_CLASSES`,
   `kernel/src/kernel.c`). A rule whose bytecode is longer leaks it each time the rule is
   recreated. Rows rebuilt 300 times with a 5-term numeric expression: +0 words; with 12
   terms: +21,600; with 40 terms: +72,000.

The baseline benchmark (`test/bench/alloc-bench.mjs`) found two more, at larger scale:

3. **Discarding a program leaks nearly all its view cells.** A 500-row program built and
   discarded 20 times grew the cell high-water mark by 520,080: about 26,000 per program,
   which is every row's slot block. This is leak 1 at full size, since every view class's
   pool is orphaned with its program.
4. **A list's child list leaks too, by the same limit.** Fifty rows rebuilt 400 times with
   only short rules grew the code arena by 41,600 words: exactly 104 a rebuild. The list's
   auto-extent rule keeps its children's blocks in the code arena (`extent_store`): 2 + 50
   words, held at twice that (104) so it can grow. 104 is over the 64-word limit, so the
   range is never reused once given back. Any list or layout of more than about 30 children
   leaks its list each time it re-lists. Power-of-two size classes fix this case as well.

The two leaks fixed before this (6969e0ba: record cells; #34: the structure cell) were the
same kind of thing: an allocation whose owner went away without it.

## The design

### One allocator, shared by everything

- **Cells.** A torn-down view's slot block goes back to the kernel, which keeps free blocks
  by length. Any view of any class with that many slots reuses it. View classes have few
  distinct lengths, so these lists stay short. A block is reset to its class's defaults on
  reuse, as it is today, so taking a block costs what a pool pop costs now. When a request
  finds no block of its length, adjacent free blocks are merged and the request is served
  from the result. Merging is lazy: steady churn never reaches it. The per-class pools go.
- **Code and constants.** Blocks are rounded up to a power-of-two size class, with free lists
  per class and no upper limit. Taking and giving are constant time. The waste is at most
  half a block, on long expressions only.
- **Rules, dynamic-edge nodes and views** are fixed-size records with free lists already.
  They change only by gaining an owner tag (below).
- **The runtime's own side tables** that grow with the program (`BLOCK_BASE`/`BLOCK_VIEW`,
  the rule table `RULES`) are audited the same way: everything indexed by a freed id is
  cleared, and nothing is only ever appended.

### Every allocation has an owner

Each allocation records the program, or the island tenant, that made it: one integer,
written once. Discarding a program, or detaching an island (`program = ""`), sweeps
everything that program still owns, whatever its individual teardowns missed. The sweep is
proportional to the program's size, which teardown already is.

The tag gives three more things at no further cost:
- the invariant tests hold: *after a discard, nothing is attributed to that program*;
- memory per tenant, for `Diagnostics` and for #36;
- a later quota per tenant, if #36 needs one.

## Asking: `Diagnostics`

`Diagnostics` is a built-in service, used like `Keys`: a static call for a snapshot, or a
member for live facts.

```declare
const m = Diagnostics.memory()       // a MemoryReport, as of now
Diagnostics.checkpoint(app.location) // "this is a state the program returns to"
```

```declare
schema MemoryReport [
    debug: boolean,                // true when a debug build answered (byClass, className and source filled in)
    memory: MemoryUse,             // the runtime's memory for this program, in bytes
    viewCount: number,             // views live now
    tenants[]: TenantMemory,       // one per program hosted in an AppIsland
    growth[]: Growth,              // what grew on every return to a checkpoint
    byClass[]?: ClassCount,        // debug only
    ]
schema MemoryUse [ used: number, peak: number, reserved: number ]
schema TenantMemory [ program: string, viewCount: number, memory: MemoryUse ]
schema Growth [
    checkpoint: string,            // the checkpoint it grew across
    visits: number,                // returns it grew on, in a row
    viewCount: number,             // views added per visit
    bytes: number,                 // memory added per visit
    className?: string,            // debug: the class that grew
    source?: string,               // debug: where those views are declared, "inbox.declare:48:5"
    ]
schema ClassCount [ className: string, viewCount: number, source?: string ]
```

- **Bytes, not cells.** Cells and the kernel are not words a developer meets. `memory` is
  the runtime's memory for the program: its views, values and rules. Strings and records
  the program makes itself belong to the JavaScript engine, and are not counted.
  `reserved` is reported so that the block's growth is not mistaken for a leak.
- **Checkpoints, because only the program knows "the same state".** The runtime records
  what is live each time a checkpoint recurs. A count that grows on every return is
  `growth`. Without checkpoints there are facts but no signal.
- **Two builds, one type.** A production build reports totals, from counters the
  allocator keeps anyway. A debug build (what the dev server serves and what `declarec
  --debug` writes) adds what is live per class and where it was declared. Fields only a
  debug build fills are optional, so one program compiles and runs in both. `debug` says
  which answered. This is a difference in what is *reported*, never in what the program does.
- **Facts, as a member, in the `Time` pattern.**
  `health: Diagnostics [ tick = 5000, onGrowth(g) { … } ]` gives `viewCount`, `memory` and
  `growth` as facts, refreshed at the tick the program chose and idle until something reads
  one. `onGrowth` fires once, when a class first grows across a checkpoint. A fact's own
  cells are allocated once, when the member is made, so watching memory never allocates
  memory. Facts per class are not offered: that surface stays in the report.
- **Slimming.** The `Diagnostics` module ships only in a program that names `Diagnostics`,
  by the `mentions` trigger (an exact signal: a body reaches a global only by naming it, and
  a direct `eval` keeps everything). It is never reachable through a view member. The
  counters it reads belong to the allocator and ship always. Tracking per class and per
  source comes in only under the debug build setting.

## Performance

Allocation sits on the hot paths: building rows, opening screens, scrolling a virtualized
list. The design keeps them constant time (a pop by length, a pop by size class, one
integer written). It goes in only if a measured baseline shows nothing slower beyond
run-to-run noise. The baseline is taken first, on `main` as it stands, with the machine's
load recorded alongside:

- a kernel microbenchmark: cell blocks, rules and code blocks taken and given at volume;
- frame and settle times from the profiler, `--native`, on the costliest real operations:
  filtering and scrolling the tracker's million issues, calendar view switches, opening and
  closing desktop windows, Presentify's slide list, Venue's seat map;
- build-time cost of a large replicated list (the allocation-heaviest path).

## Holding it

- **The invariant everywhere.** Every test that discards a program, or detaches an island,
  asserts that nothing is still attributed to it. The whole suite becomes the workout.
- **Real workouts for churn within a program.** The eval drives (Venue's 11 flows,
  Presentify's 19) and the corpus apps' behaviour scripts are real user flows on real apps.
  Each runs many times, and every table's high-water mark must flatten after warm-up, on
  both kernels.
- **The cases found here** (rebuilt rows with long expressions, build and discard) stay as
  targeted tests.

## Open questions

1. **The name `Diagnostics`.** In Declare's docs and code, "diagnostics" already means the
   compiler's errors and warnings (`compiler/src/diagnostics.ts`, `DECLARE` codes,
   `docs/system-design/diagnostics.md`). A runtime service of the same name may blur the
   two. Confirmed by DT before this clash was noticed; to be re-confirmed.
2. **`checkpoint` by string.** A string names a state simply; a program with structured
   state composes one (`app.location + "/" + app.mode`).
3. **Code waste.** Power-of-two classes can waste up to half a long block. If long
   expressions turn out to be common, an exact-fit allocator with merging can replace it,
   behind the same two calls.

## Order of work

1. The performance baseline (above), with the machine's load recorded.
2. The allocator: cell blocks to the kernel by length, with lazy merging; code and constants
   by size class; owner tags and the sweep on discard. Both kernels, the WebAssembly kernel
   rebuilt. The baseline run again, and compared.
3. The invariant and the soak tests.
4. `Diagnostics`: the static report first, then checkpoints and `growth`, then the member.
5. Issue #35 answered with what was built; #36's accounting (part 4) on the owner tags.

## Baseline (2026-11-01, `main` at 8fd24784)

`node test/bench/alloc-bench.mjs --runs 5 --browser`; the median of five runs (the fastest in
parentheses). The machine was in use throughout: one-minute load averaged 4.5 (peak 7.4)
through the headless half and 6.8 (peak 8.8) through the browser half, CPU 55–75% idle, with
Chrome and WindowServer the other main consumers. Run-to-run spread was 1–2% headless and
1–4% in the browser, to-do excepted (about 12%).

| case | WebAssembly kernel | JS kernel | high-water gained after warm-up |
|---|---|---|---|
| 50 rows rebuilt, 400× | 7.14 ms (7.06) | 7.96 ms (7.65) | 41,600 code words |
| 50 rows rebuilt, long expression, 200× | 13.72 ms (13.59) | 14.96 ms (14.87) | 2,450,800 code words |
| 500-row program built and discarded, 20× | 72.8 ms (70.4) | 70.9 ms (68.5) | 520,080 cells, 40,160 code words |
| calendar navigation, 300 steps | 0.78 ms (0.76) | 0.85 ms (0.84) | nothing |

| scenario, in Chrome, as shipped | time in turns | building views |
|---|---|---|
| desktop (`tests/assert.mjs`) | 399 ms (394) | 69.7 ms |
| to-do (`tests/assert.mjs`) | 373 ms (343) | 92.7 ms |
| docs (`tests/assert.mjs`) | 2,753 ms (2,714) | 242.6 ms |
| calendar (`tests/states.mjs`) | 94 ms (91) | 53.0 ms |
| tracker (`tests/states.mjs`) | 227 ms (216) | 86.6 ms |

## The adversarial soaks (2026-11-01)

`test/soak/` (its README lists each script) builds and discards views, overlays, motion,
islands and whole programs, and reports what grows per cycle. What it found, and the fix:

| what stayed | why | fix |
|---|---|---|
| every program an AppIsland ever hosted | `disposeApp` took down the environment wiring, never the program; then, one by one: the title mirror (top-level only by intent, but islands render through the same path), the input router's window listeners (retired lazily, on their next event), the file-drop listeners on the island's box, a pane's scroll watch, and one discard callback per mount on the island | `disposeApp` discards the app; each of those now goes with it; a cleared or changed `program` unmounts |
| an overlay open when its owner goes | it stayed on the overlays' stack and held the keyboard claim | `Floating.onRetire` |
| shortcut sets and key claims of nodes that are not views | only views were marked torn down | every node is; `Keys` drops torn-down ones as new ones come |
| the App's interaction driver | it reads a module-level cell, which held it | disposed with its App |
| a State's displaced base rule | held only by the state's stack | disposed with its view |
| a Spring in flight | its own flight is not Animator's run | off the clock with its view |
| visibility rules, one per row | the first value an install lands can arm a second fact's feed, mid-install; the second install was overwritten | installs do not re-enter |
| a cell per read of a torn-down view | a tracked read made one | a retired view is not tracked |
| a virtualized list's measured extents | kept for every record ever seen | pruned past one generation |
| the windowing's two cells | never freed | freed with the list |

Left as they are: cells a fresh layout object or a replaced record holds until JavaScript's
GC collects it (released then; `wholesale-cells.mjs` is flat with GC), and a few KB of heap
per cycle in the browser island soaks with no view, element or listener behind it.

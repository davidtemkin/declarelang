# Venue run 6: Declare 1b3064f2, Opus 5.5

**Run:** 2026-10-26 22:49 UTC, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-6 claude-opus-5-5 1b3064f2 8350` against GitHub main
(the brief still sits in `evals/apps/venue-checkout/`; the eval is now called Venue).

The same brief, service, port, model, tools and prompt as run 5. What changed is the foundation: the renames read in
full (`2c2d9f1d`: `touchFirst`/`hasMouse`, `DrawContext`, `userScrolling`, `Tooltip`, `autoFetch`, TextInput's own
edit session and `disabled`, the page as host, the 7d5c1060 fixes) and the documentation pass (`1b3064f2`: the page
API in the reference, member instincts and ~40 concept synonyms in `declare-help`). It is the first run analyzed with
the **names ledger** (`evals/craft/names.py`).

It used Opus 5.5 (`claude-opus-5-5`) with web tools available, and the brief included the idiom sentence. One round.

## The comparison

Build figures come from the build's own final record, 26.7 minutes in. The account was asked for afterwards in a
read-only resume (1.2 min, 6.3k output tokens) and is counted separately.

| | Venue 4 | Venue 5 | **Venue 6** | Venue React 1 |
|---|---|---|---|---|
| Declare commit | `613f8875` | `d7e80f80` | **`1b3064f2`** | — |
| first read | calendar | to-do | **to-do** | — |
| time | 34.7 min | 36.0 min | **26.7 min** | 31.4 min |
| turns · tool calls | 160 · 159 | 155 · 154 | **117 · 116** | 101 · 97 |
| code, raw lines | 1,860 (4 files) | 1,948 + 292 script | **2,095** (5 Declare files, no script) | — |
| code, excluding comments and blanks | 1,351 | 1,522 + 227 script | **1,606** | 4,861 |
| **Tokens** | | | | |
| output | 145k | 161k | **129k** | 147k |
| fresh input (cache writes) | 360k | 353k | **326k** | 199k |
| cached input re-read | 37.1M | 36.9M | **23.9M** | 9.3M |
| read before first app write | 400 KB | 350 KB | **400 KB** | 23 KB |
| context at first write → end | 197k → 366k | 174k → 359k | **189k → 332k** | 42k → 205k |
| first app write at | 7.6 min | 6.6 min | **6.6 min** | — |
| **Download (gzip)** | 157.9 KB | 173.3 KB | **174.3 KB** ¹ | 158.5 KB + ~85 KB fonts |
| hidden acceptance (`drive.mjs`) | 11 of 11 | 10 of 11 | **11 of 11** | 11 of 11 |
| runtime source read | 3 calls | 2 calls | **1 call** (`purpose.ts`) | — |
| library source read | 8 calls | 7 calls | **5 calls** (3 files) | — |
| names refused by a check | — | — | **4** (all resolved) | — |

¹ `declarec --sizes` from the main tree at `1b3064f2`: program 39.1 KB, runtime 122.4 KB, kernel 12.6 KB.

**The cheapest Declare Venue yet, and the first faster than the React baseline.**
- **Time:** 26.7 minutes, 9.3 faster than run 5 and 4.7 faster than React run 1. Run-to-run spread across Venue runs
  1–5 was 34.7–56.0 minutes, so this is outside it.
- **Cost:** cached input re-read fell by 35% (23.9M against 36.9M); output by 20%. It still re-reads 2.6 times React's.
- **Size:** 6% more Declare lines than run 5, but no TypeScript helper file this time (its helpers are in a `script`
  block), so 8% less code in all: 1,606 lines against 1,749.
- **Acceptance:** all 11 hidden scenarios pass, including the phone purchase run 5 failed.

What one run can't separate is the new foundation from luck. The shape of the saving is suggestive: the reading phase
cost the same (3.04M re-read against 3.03M, with the first app write at the same minute), and almost all of the gain is in debugging and
verification, which was 19.4M re-read against run 5's 31.9M. Fewer compile rounds (four names refused in one round,
against run 5's four collisions each costing a compile) and no hand-written browser scripts account for much of it.

## Where the time and the tokens went

Phases from the build stream, by wall-clock and by the cached input each phase's API calls re-read (API calls
de-duplicated by message).

| phase | time | API calls | cached input re-read | share |
|---|---|---|---|---|
| **Reading and planning** (0–6.6 min) | 6.6 min | 27 | 3.04M | 13% |
| **Writing** the five files (6.6–13.3) | 6.7 min | 7 | 1.40M | 6% |
| **Debugging and verification** (13.3–26.7) | 13.4 min | 67 | 19.44M | **81%** |

Run 5 split 8 / 5 / 86. The first compile came 13.3 minutes in, after all five files were written.

In all: 31 `declare-verify` runs (23 with `--assert`), 9 `declare-look` runs, 25 pictures read, and **no browser
scripts of its own** — run 5 wrote five, including a puppeteer session. Everything it checked, it checked with
Declare's own tools: five assert scripts (`tests/`), one of them for the signed-in session.

## Reading and docs

**The skill's order, followed exactly:** README → SKILL.md → `declare.md` → guide 01, 04, 05 → the to-do app whole
(`todo.declare`, `todo-parts.declare`), all in the first minute. Then by need: guide 14 (data: talking to a server,
streams, editing and forms), 08 (controls), 19 (accessibility), 06 (layout), parts of 18, 10 and 20, and `verify.md`'s
flags and assert sections. It never opened the calendar and never read a brief.

**`declare-help` carried the reference.** It looked up `TextInput`, `TextInput.judgeOn`/`validate`/`purpose`/`judge`,
`View.accessibilityError`, `DataSource`, `DataSource.errorSchema`, `EventStream`, `Field`, `Carousel`, `RadioGroup`,
`Combobox`, `View.focusScope`, `View.scrollTo`, `View.tabOrder`, `Control.focusShape`, "theme tokens", `Animator`,
`Button`, `ChangeEvent`, `ValueChange` and `InputPurpose`. None missed. The account calls it "the best single tool".

**Source reads, which count as reference gaps:**
- `runtime/src/purpose.ts` and `library/combobox.declare` (minute 2.3), after grepping for "country": how a country
  field gets autofill. The answer was in `Combobox.purpose`'s reference entry; "country" is not a concept synonym, so
  only a grep found it.
- `library/radiogroup.declare` (3.9): how a radio group is built. It then built its own (below).
- `library/combobox.declare` again (18.4): why a saved country didn't show in the field. A real library bug (below).
- `library/focusring.declare` (19.4, 24.4): why the focus ring vanished on the dark hall. A real library gap (below).

## Names

From `names.txt` (the ledger) and the idiom read together.

**Misses: four, all in the first compile round, all resolved in that minute.**

| name | where | origin | the platform's answer | what was right |
|---|---|---|---|---|
| `numeralWidth` | on `TextInput` | a real Declare name, on `Text` | none — "has no attribute" | nothing: `TextInput` lacks it. A **platform gap**: the field showing a card number can't have lining figures |
| `focused` | inside a `State`, 3 sites | the view's own fact | "declare it or fix the name" | `classroot.focused`: inside a `State`, `this` is the State. The message doesn't say so |
| `mail` | on `SignInForm` | the agent's own child | "did you mean `email`?" — **misleading** | a path: `this.mailBox.mail`. The suggestion offered a different member of the same class |
| `heading` | a member not yet declared | its own | "declare it or fix the name" | it declared it — ordinary |

No foreign-instinct misses at all: no CSS property, browser global or other framework's name reached a check. The
CSS and member tables were not exercised.

**Silent misses** (the compiler accepted them; the read found them):
- **`purpose: InputPurpose = "text"`** → bare `text`, and `judgeOn = "leave"` → `leave`, `fontWeight = { … ? semibold : … }`
  → `"semibold"`. Not wrong names but wrong spellings of right ones; they cost three compile rounds (the account's first
  complaint). The rules are scattered across chapters.
- **`trackChanges = ["loading"]` to catch a refusal**, where `DataSource.failed`'s entry teaches `trackChanges =
  ["failed"]` and says a second refusal is caught. A right name not found: the agent "didn't check whether an `onError`
  exists".
- **A `paying` flag beside `order.loading`.** It wasn't sure `loading` is true within the settle `fetch()` starts.

**Collisions: none.** Run 5 had four, each costing a compile: `Card` (a library class) and three with its own names (a
`schema Seat` declared in two files, its own `FormField`, `scrollToX`). This run named its records apart from its
views (`SeatRec`, `PlanSeat` beside the `Seat` control) and its card `PerfCard`.

**Lookups that missed:** none in `declare-help`; no empty searches.

**Candidates for the tables and the concept synonyms:** "country" → `Combobox.purpose`; "on error", "request failed",
"refused" → `DataSource.failed`; a did-you-mean that prefers a descendant child of the same name (`mailBox.mail`) over
a different member.

## API and language

**`Combobox` doesn't show a value set from outside.** The saved billing country (GB) came down as `value`, and the field
read "Choose": the entry's text is written only in `pickIndex` (`library/combobox.declare:184`). The agent read the
library and synced `entry.text` itself with a `trackChanges` on a computed label (`venue-checkout.declare:375-378`). The
control breaks the library's own rule — derive the value down. **Fix bug.**

**An explicit `focusable = false` doesn't take a scroller out of the Tab order.** An empty `scrolls = y` list of chosen
seats was a Tab stop before the seat map. `focusable` defaults to false, so `bareScroller` (`focus.ts:756`) can't tell
"set false" from "unset", and the author's word is ignored. The agent made the list scroll only when it had seats
(`venue.declare:260`). **Fix bug:** honor an explicit `focusable = false`.

**The focus ring ignores a subtree's theme.** The ring is drawn from the App's theme, so on the dark hall the ink ring
vanished. The agent found `focusRingInnerColor`/`Width` by reading `focusring.declare` and made it two-tone.
**Library:** the ring should take the theme of the view it rings.

**A labelled field that shows its error can't be composed from the library.** `Field` is a caption beside a control,
with no error line; a wrapper can't read a use-site `TextInput`'s `error`. So `FormField` owns its `TextInput` and
re-exports half its surface as overridable methods (`check`, `regroup`, `edit`, `submit`; `venue-checkout.declare:23-78`).
With it came three additions the platform lacks: an **outside error** on a field (`refused`, the service's 422
sentence until the value changes), a **reset of the judged state** (`fresh`, so a cleared security code isn't marked
wrong at once), and a **form-wide pass** (`PayForm.problems()`, then `pay()` judging eight fields by a path table,
`fieldFor()`). This is the forms proposal's case, met in full. **New feature** (the discussion already queued).

**`TextInput` has no `numeralWidth`.** A field holding a card number or an amount wants lining, tabular figures.
**New feature:** the face attributes `Text` has and `TextInput` lacks.

**The "did you mean" for `mail` pointed the wrong way.** See Names.

**`padding = [32, app.gutter, 32, 32]`** failed with "expected ']', got '.'", the one message that didn't name its fix
(a name in a bare list needs braces). **Docs/diagnostic.**

## Debugging and verification

Compile-and-fix took about eight rounds from the first `declare-verify` (13.3 min) to a clean check, mostly spelling
(tokens vs strings) and the four names above. Then verification, entirely in Declare's tools:

- **Pictures first:** `declare-look` of every screen at a desk and a phone, read and adjusted (column widths, the
  seat map's pan constant).
- **Assert scripts:** `flow.mjs` (a guest buys two seats), `phone.mjs` (the same under touch), `keyboard.mjs` (Tab and
  arrows through the hall), `session.mjs` (a signed-in session survives a reload), `focus-shot.mjs`.
  `expect.request("POST", "/api/orders", { count: 1, body: … })` proved "a second press sends nothing" directly.
- **The focus episode** (minutes 21–25): the Tab-stop scroller above, found by the keyboard script; then the vanishing
  ring, found by a picture.
- **Addressing friction, again:** to reach things from scripts it named instances it had left anonymous
  (`signForm: SignInForm`, `pay: PayButton`), and `app.signInSheet.Password` matched the label `Text`, not the field.
- **One unexplained difference:** `declare-look --key Tab` didn't move focus the way the same keys did in an assert
  script. Not investigated by the agent; **worth reproducing**.

## What it built

*The Marriage of Figaro*'s twenty performances, a seat map, checkout and tickets, at a desk and on a phone
(`shots/`).

- **The list:** cards by month (`classFor` heads), each with a fullness bar and an urgent line when few seats are left.
- **The hall:** a dark auditorium with four curved tiers and an apron stage, drawn from the plan; 648 seats, each a
  `Control` with its own drawing, a checkbox role with a spoken name and price, and a spring "pop" when chosen. Three
  states differ in shape, not only colour (ring, disc with a tick, dot). Each section is one Tab stop; arrows move
  along a row, Up and Down to the nearest free seat in the next row. On a phone the hall is panned in both directions
  at a thumb's size, with the whole room inset as a map that jumps the view.
- **Live seats:** the event stream writes each sale into the seat map; a seat taken from under the person is named in
  words, announced, and marked with a cross where it was.
- **Checkout:** saved cards as radio cards (expired ones shown and disabled), a new card's fields grouped as typed with
  the caret kept, the card's kind recognised, the postal code checked against the country, nothing marked wrong while
  first typed. The service's refusals land on the field they name. On a phone the total and the pay button stay at the
  foot, in reach.
- **Tickets:** one at a time in a carousel, seat in the largest type, a Code 39 barcode drawn bar by bar.

## Is it idiomatic Declare?

### What it gets right

- **State in one place, everything derived.** `stage` is a union derived by a method (`venue.declare:591-596`, moved
  there after DECLARE4025); the totals, summary line and pay amount are constraints over `chosen`; `perfId` derives
  from `location`, so a stale address can't name a performance.
- **The form's values live on the App** (`PayForm extends Node`, `venue-model.declare:325`) as computed defaults that
  follow the account until typed into — the to-do app's idiom, which the account calls "the nicest thing in the
  language for forms".
- **The service as declared members:** typed `schema`s including the refusal body (`errorSchema = Refusal`), `body =
  { app.orderBody }`, `credentials = include`, an `EventStream` gated by `active`.
- **Navigation by `location` and `waypoint`**, so Back leaves checkout for the hall without a router.
- **A seat is a `Control`** with `draw()`, `focusShape()` and an accessibility contract — keyboard, screen reader and
  test names for 648 seats from one class.
- **Accessibility as structure:** headings with levels, focus moved to each screen's heading on arrival (`arrive()`),
  live regions for the summary and the notices, `Accessibility.announce` for refusals.
- **The seating plan is a computed `Dataset`** (`SeatingPlan`, `contents = { build(source) }`), so a sale changes the
  room by writing one status.

### Missteps, and how they should have been written

1. **`trackChanges = ["loading"]` to catch a refusal** (`venue.declare:554-555, 564-565`). Written: `trackChanges =
   ["failed"]`, `onChange() { if (this.failed) app.refused() }` — the `failed` entry's own idiom.
2. **`paying` beside `order.loading`** (`venue.declare:588, 768, 779`). `order.loading` is the fact; the guard is
   `if (order.loading) return`.
3. **Paths into the view tree from the App** (`fieldFor`, `takeTo`, `venue.declare:744-765`): the App knows the
   checkout's layout down to `place.left.postal`. With the platform as it is, a field could register itself
   (`onInit() { app.fields[name] = this }`) or the form could own focus; the real fix is the form group.
4. **The validation list twice:** `problems()` and the field list in `pay()`. One table of `[field, check]` would serve
   both, until a form group makes it unnecessary.
5. **Its own radio cards** (`CardOption`, `PayChoice`) after reading `radiogroup.declare`. `RadioGroup` takes text
   choices; a card with a badge and an expiry needed its own class, so this is a reasonable choice, but the group
   semantics (roving focus, arrow keys) are hand-assembled with `focusScope = stop`.
6. **The seat glyph drawn twice** (`Seat.draw`, `LegendMark.draw`): one `script` function would draw both.
7. **A leftover comment** (`venue-model.declare:314-316`) pointing to a method elsewhere.
8. **`moveRow` rescans the whole plan per keypress** (`venue-hall.declare:102-124`); fine at 648 seats.

### Workarounds the platform forced

- **`Combobox` text sync** (`venue-checkout.declare:375-378`) — the library bug.
- **A scroller that scrolls only when non-empty** (`venue.declare:260`) — the `focusable` bug.
- **A two-tone focus ring** (theme `focusRingInnerColor`) — the ring ignoring the subtree theme.
- **`FormField` re-exporting `TextInput`, `refused`, `fresh`, `problems()`** — the missing form story.
- **Hand centring of the scaled hall** (`x = { max(0, (parent.width - this.width * hallScale) / 2) }`): a scaled view's
  layout box is unscaled, so `x = center` centres the wrong width. Arguably the platform's to do.

## Findings, ranked by leverage

1. **Forms** (new feature, queued for discussion): field-level outside errors, a reset of the judged state, a wrapper
   that can read its field's state, and a form group that judges, focuses the first problem and submits. The run shows
   every piece being hand-built.
2. **`Combobox` displays its `value`** (fix bug).
3. **Honor an explicit `focusable = false`** on a bare scroller (fix bug).
4. **Token and string spelling, in one place** (docs): a table of how a token is written in each position, and a
   fix-naming message for a name inside a bare list. Three compile rounds.
5. **The focus ring takes the ringed view's theme** (library).
6. **`TextInput` gains `numeralWidth`** and the other face attributes `Text` has (new feature).
7. **Diagnostics:** inside a `State`, say that `this` is the State; prefer a same-named descendant child over a
   different member in a did-you-mean (`mailBox.mail`, not `email`).
8. **Discovery:** concept synonyms "country" → `Combobox.purpose`, "request failed" → `DataSource.failed`; consider an
   `onFail` to pair with `onLoad`.
9. **Test addressing** (verification): a name matched to a label should prefer the control it names; anonymous
   library frames (a `Sheet`'s body) need documented paths.
10. **`declare-look --key Tab` vs assert focus** — reproduce.

## The agent's account, verbatim

Asked after the build by resuming the finished session with read-only tools (Read, Glob, Grep), with the standard
questions (`impressions.txt`). 1.2 minutes, 6.3k output tokens, counted apart from the build. Also filed alone as
`account.md`.

### Building Venue in Declare: an account for the people who make Declare

This covers about one long session: from the README to a working app that passes four browser-driven checks. I didn't change anything while writing it. The file-change notices in this session came from `declare-format --write`, which I ran at the end of the build.

#### (a) Getting up to speed

**What I read, in order.** I read `README.md`, then `skill/SKILL.md`, which told me exactly what to read and when to stop. That was `docs/declare.md`, guide chapters 01, 04 and 05, and the to-do app (`todo.declare` and `todo-parts.declare`). After that I read only by need:
- `14-data.md`: Talking to a server, Streams, and Editing text and forms
- `08-controls.md`
- `19-accessibility.md`
- parts of `18-overlays.md` and `10-touch.md`
- `06-layout.md`
- the top of `20-urls.md`
- the flags and assert sections of `docs/operational/verify.md`

**What taught me the most:**
- **`docs/declare.md`.** It gave me the model and the rules that would bite. "Assignment is the setter", the two kinds of `{ }`, set versus declared-with-default, and "a layout places its children, and what it places a child does not declare" all came up during the build.
- **The to-do app.** It is where I learned the idioms the spec only names. Examples: computed defaults as fields that "follow until the person types", `afterSettle(() => Focus.focus(...))`, `trackChanges`/`onChange`, `Control` with `press()`, and the theme spread `{ ...SanFrancisco, ...Paper }`. I copied its Fraunces `Font` declaration outright.
- **`npx declare-help`.** It was the best single tool. Lookups like `TextInput.judgeOn`, `TextInput.purpose`, `DataSource.credentials`, `DataSource.errorSchema`, `View.focusScope` and `EventStream` each answered the exact question in a paragraph.

`TextInput.judgeOn`'s entry says: "A field marked wrong while the person is still typing in it for the first time is a common annoyance." That is nearly the brief's sentence. The platform clearly anticipated this class of app. I can't tell whether that reflects good taste or docs written with this brief in view.

**What was missing or misleading:**
- **How values are spelled.** Bare tokens versus strings is learnable, but the rules are scattered and I learned most of them from errors:
  - `judgeOn = "leave"` is wrong; it must be `leave`.
  - `purpose = "email"` is wrong for a declared `InputPurpose` attribute; it must be bare `email`.
  - Inside braces it flips: `fontWeight = { x ? semibold : regular }` is wrong; it needs `"semibold"`.

  A single table of "how a token is written in each position" would have saved three compile rounds.
- **Type names for library enums.** I wanted `purpose: string` on my own `FormField`. I only discovered the type is called `InputPurpose` from a typecheck error.
- **`Combobox` docs.** The docs say `value` is "the chosen member", and that when it's constrained you override `input`. Nothing says that setting `value` from outside doesn't put text in the field. The entry's text is written only in `pickIndex`. The saved billing country (GB) showed "Choose" until I read `library/combobox.declare` and synced `entry.text` myself.
- **Event payload shapes.** I guessed `e.changed("perfId")` on a `ChangeEvent`. It is an array of `ValueChange`. The error was clear, but the guide's `onChange` examples never use the payload.
- **Lost reads.** Some reads came back "too large" and were saved to files. I had to re-read them in pieces. That's a harness issue, not Declare's, but it is a cost the skill's "read these whole" advice doesn't account for.

#### (b) Expressing what I wanted

**Where it fit well.** Several requirements turned out to be ordinary features of the language:
- **"Sign in halfway and lose nothing."** `PayForm extends Node` lives on the App. Its fields are computed defaults: `email: string = { classroot.me?.email ?? "" }`. They follow the account until typed into, then belong to the person. That one idiom covered fill-from-account, don't-overwrite-what-was-typed, and survive-the-sheet. I think it is the nicest thing in the language for forms.
- **Service calls.**
  - Each call is a `DataSource` with `method`, `body = { app.orderBody }` and `credentials = include`.
  - `errorSchema = Refusal` typed the 402/409/422 bodies, so `r.conflicts` and `r.field` were checked at compile time.
  - `EventStream [ url = {...}, active = {...}, listenTo = ["seatchanged"] ]` needed no connection code.
  - Because `fetch()` settles before it sends, the body was always current.
- **Back button.** `location` holds the performance and `waypoint = "pay"` holds the checkout. That gave correct Back behaviour with no router code.
- **The seats.** Each seat is a `Control` with `draw()`, a `Spring` for the "pop", `accessibilityRole = checkbox`, a computed `accessibilityLabel`, and `disabled = { sold }`. That gave keyboard support, aria state and a test-findable name for 648 seats almost for free. `focusScope = stop` per section turned 648 Tab stops into four. `focusShape()` let the focus ring hug the circle.
- **The hall layout.** It came from a dataset class (`SeatingPlan extends Dataset`, `contents = { build(source) }`), so a seat sold on the stream changes the room just by writing one status into the seat map. I didn't do any profiling, though: 648 seats get rebuilt on every stream message, and I only know it felt fine in headless Chrome.

**Where I had to work around it:**
- **A labelled field with its error.** I couldn't make "a labelled field" by putting a use-site `TextInput` inside a wrapper. The wrapper can't read its child's `error`, and `entry.purpose = email` is refused with DECLARE5000. That message was clear and right. So `FormField` owns its `TextInput` and takes `check`, `regroup`, `edit` and `submit` as overridable methods. It works, but it re-exports half of `TextInput`'s surface by hand. I'm not sure this is the intended shape.
- **Server-side field errors.** I never tested whether `validate()` re-runs when app state it reads changes, so I didn't rely on it. A 422 is stored as `refusedField/Value/Message` and merged into a `shownError`, which I pass to `accessibilityError` myself. I'd like a sanctioned way to give a field an outside error.
- **No "un-judge".** After a decline the code field has already been judged, so clearing it marks it wrong at once. I added a `fresh` flag that hides the error until blur or Pay. Something like a `reset()` that clears the judged state would be cleaner.
- **Refused requests.** As far as I could find, a `DataSource` has no failure event. I used `trackChanges = ["loading"]` with `onChange() { if (!loading && failed) ... }`. Watching `failed` alone would miss a second failure in a row. I didn't check whether an `onError` exists; it may.
- **Double payment.** I kept my own `paying` flag. I wasn't sure `loading` becomes true within the same settle as `fetch()`. Possibly that's redundant.
- **Layout.**
  - A `SimpleLayout` axis that changes with width, combined with `flexes`, collided with "don't declare what the layout places". `width = { wide ? undefined : … }` isn't a valid Length. I restructured into a fixed-axis row containing a column.
  - `padding = [32, app.gutter, …]` failed with `expected ']', got '.'`. That was the only diagnostic that didn't name its fix (it needed braces).
  - I used hand arithmetic for scale and centring: `x = { max(0, (parent.width - this.width * hallScale)/2) }`. It is drift by the skill's own checklist. I think it's justified for a scaled scene, but I'm not certain.
  - `{ parent.width }` means the padded box. That misplaced my checkout column once, even though the docs warn about it.
- **Small compile surprises.** These were each fixed in one round:
  - `valueOf` is a reserved member.
  - `TextInput` has no `numeralWidth`.
  - `Animator.running` is read-only, so I used `started`/`paused`.
  - `this` inside a `State` is the State.
  - The nested-ternary warning (DECLARE4025) pushed `stage` into a method. That was a better shape.
- **Focus ring in the dark hall.** A subtree `theme` override doesn't reach the focus ring, which seems to read the app's theme. The ink ring vanished on the dark floor. I used a two-tone ring (`focusRingInnerColor`/`Width`), which I found by reading `focusring.declare`.
- **Unwanted Tab stop.** Chrome made an empty `scrolls = y` list into a Tab stop, and `focusable = false` didn't override it. I made it scroll only when it had seats. That's the browser's behaviour, but Declare could own it.

#### (c) Verifying it

`declare-verify` was the core loop: structure, resolution, analysis, then boot at a laptop size and a phone size, in seconds. Most errors named a precise fix, and applying it literally worked. The boot check also caught a 134×40 touch target in the header.

The `--assert` scripts were the real verification.
- **What worked well:**
  - `drive`/`expect` by view path or by accessible name.
  - `expect.request("POST", "/api/orders", { count: 1, body: {...} })` with a partial body match. It let me prove "a second press sends nothing" and "the postcode sent was 95014" directly.
  - `drive.selectAll`, `drive.set` (to force a 409 deterministically), touch presses under `device`, and screenshots via `page`.
  - Buying a seat from the test script through the real API, then watching the stream remove it from the person's choice, felt like testing the real thing.
- **Friction:**
  - Paths into anonymous children and library frames, such as `Sheet` bodies, were hard to guess. `app.signInSheet.Password` matched the label `Text`, not the field, and the error said "not a text field". I ended up naming things (`signForm`, `pay`) just for the tests.
  - `count` combined with `body` counts only matching requests. That's reasonable, but I misread it once.
  - `declare-look --key Tab …` didn't seem to move focus the way the same keys did in an assert script. I never found out why, and switched to assert scripts for focus pictures.

What I could not verify: a real phone keyboard covering fields, browser card and address autofill, VoiceOver or NVDA, and performance on a real phone. The checks are also my own scripts written against my own understanding. They show the app does what I think the brief says, not that my reading of the brief is right. The checker reported "454 of 613 constraints statically wired", and I don't know what the remaining third costs or risks.

#### Surprises

- How little runtime debugging there was. Almost every bug was a compile error or a visual issue. The one real logic bug I found by looking was the `Combobox` text.
- A first draft of about 1,500 lines across five files compiled after roughly eight rounds, and the first boot drew a recognizable room.
- 648 `Control`s with custom `draw()` booted and responded without any virtualization.

#### Good and bad

**Good:**
- Constraints plus computed defaults.
- Data sources as declared, reactive members.
- `location`/`waypoint`.
- Accessibility roles checked as contracts.
- `purpose` for autofill and keyboards.
- Diagnostics written to be acted on.
- `declare-help`.
- Assert scripts that see network requests.
- One program for phone and desk without media queries.

**Bad:**
- The token-versus-string rules.
- The library's edges: `Combobox` text sync, a focus ring that ignores subtree themes, no field-level outside error or un-judge.
- The compiler's strictness about layouts sometimes forces restructuring for responsive designs.
- Test paths into unnamed structure.

#### Differences from what I usually use

- No re-render or component tree: views are long-lived nodes and state writes propagate. It's closer to a spreadsheet than to React.
- No CSS at all, which I didn't miss.
- Handlers are synchronous and timers are members.
- The compiler polices reactive reads and refuses what it can't follow (DECLARE7001 never fired for me, but its threat shaped how I wrote code).

#### What it reminded me of

- **QML,** most strongly: property bindings, `State`s, anchors-like `x = center`, ids by name. Also Flex/MXML, and OpenLaszlo, which the README names as its ancestor.
- **SwiftUI,** for the declare-the-destination motion model.
- **Elm-ish** single-source-of-truth discipline, but with mutation allowed.

#### Where I'd most want improvement

1. A first-class form story: outside or server errors on a field, a reset that clears the judged state, and a wrapper that can read its child field's state.
2. Library controls that fully follow the value pattern: `Combobox` should display its `value`.
3. One page on literal and token spelling per position, and a fix-naming message for names inside bare lists.
4. Overlays and the focus ring respecting subtree themes.
5. A clear failure event or idiom for `DataSource`.
6. Stable, documented test paths for library frames, and a way to address "the field labelled X" rather than the label itself.

#### What I'd use it for

Interactive consumer flows like this one — forms, a live surface, motion that means something — and internal tools, where its built-in accessibility and autofill save real work. It's also good for prototypes that need to feel finished. I'd hesitate for a large team needing a big ecosystem, for apps leaning heavily on third-party widgets, or anywhere the canvas renderer's missing accessibility tree would matter.

My confidence is moderate. One app is a narrow sample, and this brief fit Declare's strengths unusually well.

## After the run

The fixture gained a second account with a short sign-in, `a@a.co` / `pass` (the same address and cards as Ada's),
for testing by hand; `API.md` lists both. The acceptance still signs in as Ada. Run 7's agent will read one more line
than run 6's did.

# Ledger run 11: Opus 5.5, Declare, on the local tree, standard

The second sanity check before the release, after Venue 39: the working tree on 2026-11-19
(`e349b316` with the round's uncommitted changes), at the standard level. **33.8 min, 148
turns, 191k output tokens** (46k thinking), $17.64. Timing record:
`evals/timings/2026-11-19-ledger-run11-local.txt`.

## 1. The score

**The hidden drive: 6 of 8 as scored, 8 of 8 in substance.** Ledger's drive is run for the
first time on a filed run (runs 7–10 were audits only). The two failures are the drive's:

- **overview_drill.** The drive read "Revenue, $4,638.00, down 36% from Oct", which is the name
  of the November bar in the "Income vs expenses" chart, not a figure card. The cards' names
  carry their change ("Net profit, $574.60, ▲ +25% vs 1–18 Oct. Opens its transactions.",
  ledger-overview.declare:32, the same text as on screen), but the drive's pattern wants the
  month straight after "vs" and refuses the app's like-for-like "vs 1–18 Oct" (a month in
  progress against the same days of the last). **Drive:** accept a day range before the month.
- **budget_words.** The agent's own desk test sets a $30 Software budget and reads its words
  back. The drive chose Software in the add row, found no amount field named for Software
  (the app's is "Monthly amount"), fell back to the first budget field, and typed $30 into
  Stock & materials' budget, so Software was never stored. **Drive:** use the add row's amount
  field after choosing the category. **App, small:** naming that field for the chosen category
  ("Monthly amount for Software") would serve a screen reader too.

The passes leaned on fallbacks the drive records: filters behind a "Filters" button, ⌘A in
the grid where there's no "Select all" control, the Expenses kind as a toggle, and a general
"New" on the phone where there's no "New expense".

**Seen running** (the drive's screenshots, `logs/drive/`, not filed). Overview at desk size:
four figure cards with like-for-like changes and sparklines, a twelve-month income and
expenses chart with net profit as a line and the month in progress shaded, expenses by
category, and "Needs attention" (uncategorised transactions, budgets over). Budgets: each
category's state in words ("Over by $163.25"), spent against budget, a pace mark, and an add
row. Finished and orderly.

## 2. The comparison

| | 7 | 9 | 10 | **11** |
|---|---|---|---|---|
| total | 44.5 | 47.8 | 44.1 | **33.8 min** |
| turns | 169 | 191 | 176 | **148** |
| output tokens (thinking) | 222k (58k) | 229k (56k) | 206k (45k) | **191k (46k)** |
| reading · writing · checking | 6.1 · 7.0 · 31.4 | 5.3 · 0.1 · 42.3 | 4.1 · 6.5 · 33.5 | **3.4 · 8.7 · 21.6** |
| verify calls | 55 | 65 | 62 | **39** |
| output per model-minute | 6756 | 6926 | 6913 | **6970** |

Ten minutes faster than any earlier standard run, almost all of it in checking (21.6 min
against 31–42), at the same pace of output: fewer rounds of fixing, not faster thinking.

- **Tokens:** 191k output, 276 fresh input, 496k cache writes, 49.2M cache reads.
- **Code:** 2,796 lines of Declare in 10 files, and a 290-line TypeScript file of pure helpers
  (money, dates, parsing). **Download:** 285 KB gzip.
- **Checks:** verify 39 times (4.7 min), look 14, `declare-help` 15. Six flow scripts of its
  own (the brief's seven desk steps, the phone step, editing, Insights, a tour of the
  secondary views, loading and failure states), all passing at hand-over.
- **Source reads:** four library files (`form`, `rangeslider`, `table`, a listing).

## 3. The refusals (read in the stream; each named its fix)

1. `'from' is not a member of any[]` and `'to'`, a range read through an untyped array →
   "fix the name, or widen the type it was read through" [DECLARE6001]. Typed the range.
2. `app.topBar` → "a child's is: 'main.topBar'" [DECLARE6001].
3. `HTMLText [ text = … ]` → "an HTMLText's content is 'html' … plain text is a Text's
   'text'" [DECLARE2000].
4. `saleBox.channelPick` → "a child's is: 'saleBox.<Field>.channelPick', inside a view with no
   name — name it". Named the field.
5. DECLARE4045 once (a name both a member and a script function), DECLARE5001 once, and lints:
   DECLARE4025 ×3 (nested choices), 4017 ×2, 4022, and DECLARE1002 ×2 (parentheses).

## 4. Findings for the platform

None new from the build. The stream shows no crash and no wrong answer from the platform;
every refusal named its fix. Two notes:

1. **The account was refused.** Resuming the session with the standard questions
   (`account-declare.txt`) was flagged by the model's safeguards ("reasoning_extraction")
   twice; the same questions went through for Venue 39 an hour earlier. No account is filed.
   The questions should be looked at for wording that reads as asking for hidden reasoning.
2. **The drive:** the two fixes in §1.

## 5. Is it idiomatic Declare?

| | Ledger 9 | Ledger 10 | Ledger 11 | To-do |
|---|---|---|---|---|
| code | 3,268 | 3,044 | 2,796 + 290 TS | 841 |
| lines over 150 characters | 59 | 89 | 47 | 3 |
| colour literals outside theme declarations | 0 | 0 | 0 | 1 |
| theme reads | 187 | 199 | 184 | 69 |
| States | 5 | 2 | 5 | 7 |
| visible switches | 16 | 10 | 8 | 0 |
| branches on width or phone | 33 | 31 | 24 | 38 |
| flexes | 48 | 42 | 40 | 7 |
| browser scripts · page lookups | 1 · 0 | 1 · 0 | 0 · 0 | 0 · 0 |

The leanest Ledger yet on every count but `State`s, with no colour literals and, for the
first time, no browser script.

**In the grain** (from the header and a read of the model): the records stay in the service;
`Books extends Node` (ledger-model.declare:126) holds the lookups and makes every write; each
screen owns its reads (`Remote extends DataSource`, 112), addressed from one filter record
`f`, and a write moves `books.rev`, which every read's address names, so the screens read
again with nothing to remember. Where the user is lives on the App: the screen in the URL,
the filter, the comparison, the sort, the selection. Every number opens its records
(`openFigure` and its siblings), with `returnTo` so Back restores the chart. Money in cents
to the screen. The TypeScript file is what script is for: pure functions of their arguments.

**To look at:** `rev` in every read's address is a hand-made invalidation; the platform's
answer for "read again after this write" deserves a line in the data chapter, if it has one
(`DataSource.fetch()` on each affected read, or a refetch keyed on the write). Not a
misstep, but every program with a remote model will meet it.

A line-by-line read was not done for this filing; the counts and the model read above are
the review.

## 6. The agent's account

Not available (§4.1). Its hand-over, verbatim, in its place:

Ledger is built and running at **http://127.0.0.1:8605/my-apps/ledger/ledger.declare** (the dev server picked port 8605; the data service on 8370 was not changed). Everything the brief asks for works end to end against the live service, at laptop size and, for the phone parts of the brief, at phone size.

The code is in `declarelang/my-apps/ledger/`. Start reading at `ledger.declare`; its opening comment explains how the program is put together and which file holds what. The repeatable checks are in `tests/`.

## What I established, and how

I used Declare's own checker, which compiles the program, opens it in a real Chrome and then drives it the way a person would (real clicks, taps and keys), checking what shows after each step.

- **It builds and starts cleanly** at 1280×800 and on a 390×844 touch phone. The checker found no layout problems: nothing spilling out of its box, no text cut off, every phone target at least 44×44, and every control named for a screen reader. Those layout checks also ran on every screen the scripts visited below.
- **Each of the brief's seven desk steps passes in `tests/desk.mjs`:**
  1. Opening this month's expense bar on Overview shows Transactions with a summary equal to the bar's value to the cent, and Back returns to Overview.
  2. The $120 Printworks split is refused at $10.00 remaining, saves once Packaging is added, and appears in the list.
  3. The Market sale comes to $88.00; refunding one mug makes the sale show "Refunded 1 ($32.00)".
  4. The amount slider reaches $20–$100 by keyboard alone and the chips read as set. The summary's count and total equal the rows, Insights → Breakdown has the same total and count, and Overview says it is filtered.
  5. Select all says how many match the filters, Categorise as Other empties the list, and ⌘Z brings it back.
  6. The exported CSV's amounts add up to the summary's total.
  7. The Software budget is set to $30 and Budgets says where it stands in words.
- **The phone step passes in `tests/phone.mjs`:** Overview by touch, then an expense recorded with taps. Its usual category fills in, it is saved, and it appears under "Today".
- **Four more scripts cover the rest:**
  - **`editing.mjs`:** moving through rows with the keyboard moves the detail with them; Shift-click selects a range; editing in place saves on Enter and cancels on Escape; a category is chosen by typing part of its name; ⌘Z undoes.
  - **`insights.mjs`:** a chart used by keyboard alone opens exactly its records, a table row does the same, and Back returns with the table still showing.
  - **`tour.mjs`:** visits the custom date range, contact picker, columns menu, the detail sheet in a narrower window, the phone's filters sheet and date menu, and a transaction's sheet on the phone.
  - **`states.mjs`:** with a slow answer the old rows stay, dimmed, with "Still working…". Over all ~4,200 transactions, End jumps to the last row in about 0.3 s.
- **I looked at screenshots of every screen** in light and dark, and of the failure state (made by pointing the app at a dead port). I also forced a real refusal from the service (a refund dated before its sale): the message appeared under the Date field with the editor still open and everything typed kept.

Running the scripts caught real bugs, all now fixed:
- The Chart/Table switch in Insights did nothing.
- On a phone, a finger couldn't scroll the page over a chart.
- The chart bars were too thin to tap.
- In a narrower desk window there was no way to open a transaction's detail.
- Comparing a month in progress against a whole month was misleading. Comparisons now use the same days (e.g. "vs 1–18 Oct").

## Things you should know

- **The tests wrote to the live service.** Each desk run records an expense, a sale and a refund. So the service now holds my test records, a "Printworks" vendor and a $30 Software budget; restarting the service would reset them.
- **The phone covers what the brief lists:** Overview, Transactions and recording. Insights and Budgets are not in the phone's tabs.
- **Where I fell short of the brief:**
  - Charts are smaller on a phone: Overview shows 6 months there instead of 12, and you tap a whole month (shown with its figures and "Open" buttons) rather than a single bar.
  - Bars animate when filters change, but the lines on charts don't.
  - The arrow keys move along every bar in order; there's no separate Up/Down to switch between series.
  - In a narrower desk window, a transaction's detail opens from a "Details" button instead of sitting beside the list.
- **Not checked:** I didn't stop the real service to test failures (I used a dead port instead), didn't listen with an actual screen reader, and didn't save reference screenshots for later comparison.

## 7. The names ledger

```
NAMES — eval-ledger-11: 5 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    12 · member    · from                 · any[]                    · —                  · none         · ×1  ·   13 · resolved
         'from' is not a member of any[] — fix the name, or widen the type it was read through — 2 sites, also on line 96 [DECLARE6001] (line 91, col 92)
    12 · member    · to                   · any[]                    · —                  · none         · ×1  ·   13 · resolved
         'to' is not a member of any[] — fix the name, or widen the type it was read through — 2 sites, also on line 97 [DECLARE6001] (line 92, col 88)
    12 · member    · topBar               · this App                 · —                  · none         · ×1  ·   13 · resolved
         'topBar' is not a member of this App — a child's is: 'main.topBar' (reached through the child that holds it) — 3 sites, also on lines 453, 458 [DECLARE6001] (line 364, col 33)
    15 · attribute · text                 · HTMLText                 · —                  · hint         · ×1  ·   15 · resolved
         HTMLText has no attribute 'text' — an HTMLText's content is 'html' — the markup it shows ('html = { "<b>" + escapeHtml(name) + "</b>" }'); plain text is a Text's 'text' — 3 sites, also on lines 31, 23
    18 · member    · channelPick          · 'saleBox' (a View)       · —                  · none         · ×1  ·   18 · resolved
         'channelPick' is not a member of 'saleBox' (a View) — a child's is: 'saleBox.<Field>.channelPick', inside a view with no name — name it (box: View [ … ]) to read it through that name [DECLARE6001] (le

SUMMARY: 4 of 5 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```

# Ledger: a brief

Ledger is a product: the books of a small business that makes and sells things. It is where the owner records
what came in and what went out, and finds out how the business is doing. Small businesses have plenty of
choice in this market, so Ledger has to be clearly better to hold its place: quick to use every day, numbers
that can be trusted, and polished enough that people who try it want to keep it.

This is the version going to its first trial customers. Each has been set up for their business by hand (their
products, categories and history are already in place), so setup and configuration are not part of this
version. Everything a customer touches is.

**A customer we're building for: Clay & Paper.** Two people who make mugs, prints and bags, and sell them online
and at weekend markets. They pay for stock, packaging, postage, rent and stall fees, software, advertising and
the odd contractor. The owner is not an accountant; she is comfortable with spreadsheets. She uses the app every
day for a quick entry, every week to review, and at the end of the year to hand the numbers to her accountant.
The examples below are hers; the product serves any business like hers.

This brief says what should be true for the person using it and how it should feel. It does not say how to
build it. The product makes three promises: **recording is quick and safe**; **the numbers are right and
explainable** (every total can be opened to the exact records behind it, and totals always reconcile to the
cent); and **finding is one gesture** (one set of filters shapes every list, chart and summary at once).

Every record lives behind a service described in `api/API.md`. It is already written and already running, holds
Clay & Paper's last two years (several thousand transactions), validates every write, and computes totals over
any filter. You never write a server. Amounts are in US dollars; this version keeps no sales tax.

---

## 1. What is recorded

A **transaction** is one movement of money: a **sale**, a **refund**, or an **expense**.
- A sale has one or more lines: a product (or a free-form item), quantity, unit price, and line total. It has a
  channel (Online shop, Market, Wholesale) and may name a customer.
- A refund is its own transaction, dated when the money went back, linked to the sale it refunds where known.
  It can cover some of the sale's lines; it can never exceed what is left to refund.
- An expense has a vendor, a category, and an amount. It can be **split** across categories: its parts must add
  up exactly to its total.

A **category** is income or expense ("Product sales", "Stock & materials", "Shipping & postage", "Rent & stall
fees", "Software", "Advertising", "Contractors", "Other"…). A **product** has a price and a unit cost, so the
app can show margin. Customers and vendors are **contacts**.

Money is exact: amounts are whole cents, never rounded on the way to a total, and the lines of a transaction
always add up to the total shown. Dates are calendar dates; they never shift with the viewer's time zone.

## 2. Overview

In five seconds: how are we doing this period, and what needs attention?

- Four headline figures: **Revenue, Expenses, Net profit, Gross margin %**. Each shows its value, its change
  against the comparison period (an arrow, the signed change and words: "▲ 12% vs Oct"; coloured as good or bad
  where that means something, and an increase in expenses is the unfavourable one), and a small line of the last
  12 periods. Opening a figure goes to its trend in Insights.
- **Income vs expenses**, month by month, with net profit as a line.
- **Expenses by category**: the top categories as bars, the rest as "Other".
- **Top products** and **top customers**: five each, with small bars.
- **Needs attention**: uncategorised transactions, and budgets over or near their limit. Each item opens the list filtered to exactly those records. When there's nothing: "All caught up."
- **Recent transactions**.

## 3. Transactions

The workhorse: the whole history, and it must stay smooth at that size.

- A table of every transaction matching the filters: date, description with the contact beneath, category (a
  coloured chip; "Split (3)" for splits; "Uncategorised" marked as needing attention), channel, and amount
  (right-aligned, digits lining up; money out with a true minus sign). Columns can be hidden and sorted; the
  default order is newest first.
- A **summary line** always describes what is shown: "1,284 transactions · In $48,210.00 · Out $31,905.50 · Net
  $16,304.50". With rows selected it describes the selection instead.
- Scrolling stays smooth through thousands of rows, and jumping to the end is immediate.
- **Opening** a row shows its detail beside the list (its lines, totals, linked refund or sale, margin for a sale:
  "Cost $18.40 · Margin $41.60 (69%)"). Moving through rows with the keyboard moves the detail with them.
- **Editing in place**: date, description, category, contact and amount (amount only for a one-line
  transaction) can be changed in the table itself. Enter saves, Escape cancels, Tab moves to the next cell. A
  category or contact is chosen by typing part of its name.
- **Selecting**: click, Shift-click for a range, Space on the focused row, and "select all" — which selects every
  transaction matching the filters, not only those on screen, and says so.
- **Bulk changes** for the selection: categorise, set contact, delete. Each change says what it did and offers
  Undo for a few seconds ("Categorised 24 transactions · Undo"); ⌘Z undoes the last change too.
- On a **phone** the list is grouped by day, each row showing description, contact, amount and category.

## 4. Recording

One editor for every kind, with the kind chosen at the top.

- **An expense**, simple first: amount, date (today by default; "yesterday" or "3 nov" typed work), vendor
  (typed; a new one created on the spot, and choosing a vendor fills in its usual category), category. **Split**
  turns the category into parts, each a category and an amount, with "Remaining to allocate: $12.40" shown;
  saving waits until nothing remains.
- **A sale**: channel, optional customer, date, and lines — products chosen from the business's products
  (tapping a product again adds one more), each with quantity and price, plus free-form items. The total is
  always visible.
- **A refund** starts from a sale and shows its lines with what is left to refund.
- **Save** keeps the person in flow: the new transaction appears in the list at once, and "Save & new" starts the
  next one with the same channel and date.
- Mistakes are said where they are made, as the person leaves a field and on save; the first one is focused.
- When the service refuses a save ("Refund exceeds the original sale", "Category was archived"), the editor
  stays open with everything typed intact, and the message appears at the field it concerns. Input is never lost.

## 5. Filters

One set of filters, shared by Overview, Transactions, Insights and Budgets: changing it anywhere changes every
view, and moving between views keeps it. Every active filter shows as a chip with its value and a way to remove
it; "Clear all" returns to this month and nothing else. Filters apply as they change; previous results stay in
view until the new ones arrive, and the screen never goes blank.

- **Date range**, always present: presets (This month, Last month, Last 30 days, This quarter, Last quarter,
  This year, Last year, Last 12 months, All time) or two dates. Arrows step to the previous or next range of the
  same length. A **comparison period** — the previous period, the same period last year, or none — is chosen
  beside it and used by every comparison.
- **Search**: matches description, contact, products, and amounts typed as numbers ("42.50"). Every word must
  match. Matching text is highlighted.
- **Amount**, with a **two-handled slider** and two number fields. Amounts are skewed (most between $5 and $200,
  a few rent payments in the thousands), so the slider's scale is not linear, and its labels sit at friendly
  values ($10, $50, $100, $500, $1k…). Above the track, a small histogram shows how the transactions matching the
  other filters are spread by amount, the chosen range highlighted. Handles snap to sensible steps; the number
  fields take exact cents. Handles never cross. Each handle is reachable and movable by keyboard and is named
  for what it sets ("Minimum amount, $20"). The chip reads "$20 – $200", or "≥ $500" with the top handle at the
  end.
- **Kind** (sales, refunds, expenses), **category** (several at once, each with its count under the other
  filters, and "Uncategorised"), and **contact**.

Different filters combine with AND; several values of one filter with OR. When non-date filters are on, every
screen says the figures are filtered, so a filtered total is never read as the whole. When nothing matches,
the empty view names the filters and offers the one change that would bring results back ("Remove 'Amount ≥
$500' to see 42 transactions").

## 6. Insights

Charts of the filtered data, as tabs. Each chart has a title, one plain sentence saying what it shows ("Expenses
were highest in July ($5,210)"), the chart, and a way to see it as a table.

- **Trends**: one measure over time (revenue, expenses, net profit, gross margin %, number of sales), at a
  granularity chosen from the range (days, weeks, months, quarters) and changeable, with the comparison period
  drawn alongside, dashed.
- **Income vs expenses**: bars per period for each, net profit as a line, and a running total of net profit that
  answers "when this year did we break even?".
- **Breakdown**: expense (or income) categories as sorted horizontal bars, each with amount, share, and change
  against the comparison period.
- **Products**: units sold, revenue, cost, margin and margin % per product, sortable.

What every chart does:
- **Every number opens its records.** Choosing a bar, a point, a table cell or a headline figure opens
  Transactions filtered to exactly the records that make it up, and the summary there equals the number chosen,
  to the cent. Coming back returns to the chart as it was.
- Pointing at (or focusing) a mark shows period, series, value, change against the comparison period, and how
  many transactions it covers. On a phone a tap shows it.
- Dragging across a time chart selects a range, and offers to make it the date filter.
- A category keeps its colour on every chart. A period that isn't over yet is marked as partial, so its dip isn't
  misread. A chart's y-axis starts at zero; axis labels are compact ("$1.2k"), the values themselves full.
- When filters change, bars and lines move from the old values to the new, so the eye can see what changed.

**For someone who can't see the chart**: each chart is one stop for the keyboard; the arrow keys move between
periods and series; each point is announced in a sentence ("March 2026, Expenses, $4,120.00, up 6% from
February, 87 transactions"); Enter opens its records; and the table version holds everything the chart shows.
Colour is never the only carrier of meaning.

## 7. Budgets

A monthly amount for any expense category. Budgets shows, for the month in the date filter, each budgeted
category's budget, what has been spent, and what remains, with a bar and a marker for where spending should be
by today. Each says its state in words: "On track", "$40 over pace", "Over by $120". A month's budgets can be
started from last month's spending, and amounts are edited in place, moving down the list by keyboard.

## 8. Taking data out

**Export** the filtered transactions, or the selection, as a CSV: one row per transaction, ISO dates, amounts as
plain numbers.

## 9. States

- **Empty**: a business with no transactions is greeted with what to do first: record a sale or an expense. A chart with too little data says so instead of drawing a misleading one.
- **Loading**: content keeps its shape while it loads; a change of filters keeps the old results, dimmed, until
  the new arrive; an answer for filters since replaced is never shown.
- **Errors**: a failed load says so in place, with Retry, and the rest of the screen still works. A slow
  service says it is still working. A failed save keeps the change marked as not saved, with Retry.

## 10. Feel

- Every touch, keystroke, toggle and slider drag answers at once; the slider and a chart's pointer track the
  hand every frame.
- Money is formatted for the reader: "$1,204.50", a true minus sign "−$45.00", always two decimals in tables and
  forms, compact only on chart axes. Percentages signed when they are changes. Digits line up in columns.
- Motion only where it explains a change, short, and reduced when the person asks for less.
- Light and dark, both designed.
- A desk first: a mouse and a keyboard, the keyboard able to do everything (a key for a new expense, one for
  search, one to step the date range, Escape to close). On a phone: Overview, Transactions, and recording an
  expense or a sale quickly with a thumb; every target big enough for a finger.

## 11. Labels

These words are the app's, exactly, wherever they appear: "Revenue", "Expenses", "Net profit", "Gross margin",
"Uncategorised", "Split", "All caught up.", "Remaining to allocate", and the summary line's "transactions · In ·
Out · Net".

## 12. What done looks like

On a desk:
1. Overview shows this month's four figures with their changes against last month, and the income vs expenses
   chart. Choosing this month's expense bar opens Transactions filtered to exactly those expenses; the summary
   total equals the bar's value to the cent.
2. Record an expense of $120 from "Printworks" (a new vendor), split $90 Stock & materials and $20 Shipping &
   postage: saving waits, showing $10.00 remaining; add $10 Packaging; save. It appears in the list at once.
3. Record a sale at the Market: two mugs and a print. Then refund one mug; the sale shows what was refunded.
4. Filter to this year, search "adobe", and move the amount slider to $20–$100 with the keyboard alone. The
   chips read as set; the summary count and total match the rows; Insights → Breakdown shows only those, with the
   same total; Overview says it is filtered.
5. Clear the filters; filter to Uncategorised; select all; categorise as Other; undo with ⌘Z.
6. Export this month's expenses as a CSV; its total matches the summary line.
7. Set a $30 monthly budget for Software; Budgets says in words where it stands.

On a phone: open Overview, then record an expense with the thumb.

---

## Delivering it

Write it idiomatically, following the platform's established best practices, as code that other people will read
and maintain: the next person to work on Ledger will start from your code alone. Use the ecosystem's established
libraries where one fits, as a maintainer would expect.

The service runs separately, on port 8370. Check your work in the browser.

# Ledger — Product Specification

Bookkeeping and insight for a small product business.

Status: ready for design and engineering kickoff
Audience: product design, front-end and back-end engineering, QA

---

## 1. Summary

Ledger is a web application where the owner of a small product business records what came in (sales, refunds) and what went out (stock, rent, software, shipping, contractors, travel), and sees how the business is doing. It is not a full double-entry accounting package and does not replace an accountant. It is the owner's daily and weekly tool: fast entry, trustworthy totals, and answers to questions like "did the spring market season pay for itself?", "which products actually make money?", "what did we spend on shipping this year vs last?", and "are we over budget on software?".

The product's three promises:

1. **Recording is quick and safe.** Entering a sale or an expense takes seconds, on a laptop or a phone at a market stall. Mistakes are easy to fix and undo.
2. **The numbers are right and explainable.** Every total, chart point and summary can be clicked through to the exact records behind it. Money is never rounded wrongly, and totals always reconcile.
3. **Finding is one gesture.** A single filter bar (dates, text, amount, category, customer/vendor, and more) shapes every list, chart and summary at once, so the owner can ask a question by narrowing the data and reading the result.

### 1.1 Non-goals (v1)

- Payroll, inventory quantity tracking (stock levels), invoicing with payment collection, direct bank feeds, multi-currency accounting with revaluation, tax filing. (Some are noted in §17, Future.)
- Multiple businesses per account (one workspace = one business in v1; the data model allows more later).
- Double-entry journals visible to the user. The backend may store balanced entries; the user sees transactions.

---

## 2. Users and jobs

### 2.1 People

| Persona | Description | Main device | Frequency |
|---|---|---|---|
| **Owner** (Maya) | Runs the business; makes products, sells online and at weekend markets. Not an accountant, comfortable with spreadsheets. | Laptop for review, phone at markets | Daily quick entries; weekly review; monthly close; yearly tax prep |
| **Helper** (Sam) | Part-time; packs orders, staffs the stall. Records cash sales and receipts. | Phone | A few times a week |
| **Bookkeeper / accountant** (external) | Once a quarter or year, reviews, fixes categories, exports for tax. | Laptop | Quarterly |

### 2.2 Roles and permissions

- **Owner**: everything, including settings, budgets, deleting, importing, inviting people.
- **Editor**: create, edit and delete transactions; import; cannot change settings, categories structure, budgets, or members.
- **Viewer** (e.g. accountant read-only): read everything, export; no writes.
- **Recorder** (helper): can create transactions and edit/delete only their own within 7 days; sees the transaction list but not Insights or Budgets (owner can toggle Insights visibility per member).

### 2.3 Jobs to be done

1. **Record a sale on the spot.** "At the market, a customer buys two mugs and a print with card. I want to log it in under 10 seconds with one thumb."
2. **Record an expense with its receipt.** "I paid for packing supplies; I want it logged with the photo of the receipt so I can find it at tax time."
3. **Bring in the bank and shop data.** "Each month I download a CSV from my bank and from my online shop. I want them in without duplicates and with sensible categories."
4. **Know how we are doing.** "Are we making money this month? Is it better than last month and the same month last year?"
5. **Find an answer.** "How much did we spend with the printing contractor in Q2?" "Which customers bought more than €200 last year?" "What were all the refunds over €50?"
6. **Keep spending on track.** "I set a budget for software and advertising; tell me when we are drifting over."
7. **Hand it to the accountant.** "Export the year, by category, with receipts, in a form my accountant accepts."
8. **Fix mistakes in bulk.** "Forty imported transactions are uncategorised; categorise them fast. These ten 'Shipping' should be 'Postage'."

### 2.4 Scenarios

- **Saturday market.** Maya opens Ledger on her phone, taps "+ Sale", the last-used channel "Market" and payment "Card" are prefilled, she taps the products (two mugs, one print), the total computes with tax, she saves. Poor signal: the sale is queued and syncs when connected; the list shows it as "Saving…" then saved.
- **Monday review.** On her laptop, Maya opens Overview: this month revenue, expenses, profit and margin, each against last month and the same month last year. The Expenses-by-category chart shows Shipping higher than usual; she clicks the Shipping bar; the Transactions view opens filtered to Shipping, this month, sorted by amount.
- **Month-end import.** She drags the bank CSV onto Import. Ledger recognises the bank's format from last time, previews 212 rows, flags 9 as likely duplicates of transactions she entered by hand, 3 rows with unreadable dates, and suggests categories for 180 based on past vendors. She fixes the 3 dates inline, confirms, and the import completes. She can undo the whole import for 30 days.
- **Tax prep.** Her accountant (Viewer) filters to last tax year, exports "Profit & loss by category" and "All transactions with receipts" as CSV and a ZIP of receipts.

---

## 3. Core concepts and vocabulary

Use these words consistently in UI and code.

- **Transaction**: one movement of money: a *sale*, a *refund*, an *expense*, or a *transfer* (between the business's own accounts; excluded from income/expense totals).
- **Line**: a part of a transaction. A sale has product lines; an expense can be *split* across categories.
- **Category**: a label for what income or expense is about (e.g. "Product sales", "Stock & materials", "Rent", "Software", "Shipping", "Contractors", "Travel"). Categories are either income or expense, and can have one level of sub-categories.
- **Contact**: a customer or a vendor (one entity; a contact can be both).
- **Product**: something sold, with a default price, a cost (for margin) and a tax rate.
- **Account**: where money sits or flows (Business bank, Card reader, Cash box, Online shop payouts, Owner's personal card).
- **Channel**: where a sale happened (Online shop, Market, Wholesale, Other). User-editable list.
- **Tag**: free labels across categories (e.g. "Spring Fair 2026", "Website redesign").
- **Budget**: a planned amount for a category per period.
- **Recurring rule**: a template that creates transactions on a schedule (rent monthly, software yearly).
- **Period**: a date range used for summaries (month, quarter, year, custom).
- **Revenue / Income**: sales minus refunds, before tax, unless "include tax" is chosen in settings.
- **Gross margin**: revenue minus cost of goods sold (product costs of items sold), divided by revenue.
- **Net profit**: income minus expenses (excluding transfers and tax collected/paid through).

---

## 4. Data model

The app's data, as seen by the product. The backend is the source of truth and validates all writes.

### 4.1 Money

- All amounts are stored as **integers in minor units** (cents) with an explicit **currency code** (ISO 4217). Never floating point, anywhere in the app — including chart computations and totals; formatting happens only at display.
- The business has one **home currency** (set at setup, changeable only while there are no transactions). Each transaction has a currency; if different from home, it stores an **exchange rate** and the **home-currency amount** (entered or fetched at the transaction date; editable). All totals and charts use home-currency amounts.
- Currencies with zero or three minor digits (JPY, KWD) are handled by the currency's minor unit count.
- **Sign convention**: amounts are stored positive; the transaction *kind* determines direction. Displays show expenses and refunds as negative only where a signed context makes sense (e.g. cash flow), formatted with a true minus sign (−) and optionally red/colour plus the sign (never colour alone).
- **Rounding**: line tax is computed per line and rounded **half away from zero**, to match common receipts; a setting allows "tax computed on total" for businesses whose POS does it that way. Totals are sums of rounded line amounts so the displayed lines always add up to the displayed total.

### 4.2 Taxes

- Tax is optional (a business below a sales-tax/VAT threshold turns it off; then tax fields are hidden everywhere).
- **Tax rates**: name ("Standard 20%", "Reduced 5%", "Zero", "Exempt"), percentage (stored as basis points, e.g. 2000), active flag.
- Prices can be entered **tax-inclusive** or **tax-exclusive** (business default, overridable per transaction). Each line stores net, tax and gross amounts.
- Reports can show amounts net or gross (setting with per-view toggle). A tax summary shows tax collected on sales vs tax paid on expenses per period.

### 4.3 Entities

**Business (workspace)**
- name, home currency, tax enabled, default tax rate, prices-include-tax default, fiscal year start month, week start day, locale (number/date formatting), time zone, logo (optional).

**Member**
- user, role, display name, invited-by, status (invited/active/removed).

**Account**
- name, type (bank, card reader, cash, payout platform, personal card), currency, opening balance + date, archived flag.

**Category**
- name, kind (income | expense), parent (optional, one level), colour (from a fixed accessible palette), is-cost-of-goods flag (expense categories like "Stock & materials" count toward COGS in margin), tax-deductible flag (informational), archived flag, sort order.
- Seeded defaults on setup: Income: Product sales, Shipping charged, Wholesale, Other income. Expense: Stock & materials (COGS), Packaging (COGS), Shipping & postage, Rent & stall fees, Software & subscriptions, Advertising, Contractors, Travel, Equipment, Bank & payment fees, Professional fees, Other. Owner may rename, add, merge, archive.

**Contact**
- name, type flags (customer, vendor), email, phone, notes, default category (for vendors: used to prefill and for import matching), aliases (alternate names seen in bank descriptions, e.g. "AMZN MKTP" → "Amazon"), archived flag.
- Derived (read-only, served by API): first and last transaction date, lifetime total, transaction count.

**Product**
- name, SKU (optional, unique if present), default price (minor units, with tax-inclusive flag), unit cost (for margin; can change over time — store **cost history** with effective dates so past margin stays correct), tax rate, category (income category, default "Product sales"), active/archived, optional image.

**Transaction**
- id, kind: `sale` | `refund` | `expense` | `transfer`
- is-credit flag (expenses only): a *vendor refund*, money back from a vendor; it reduces expenses in its category rather than counting as income
- date (a calendar date in the business's time zone, no time component; optional time for sales for intraday reports)
- account (from), and for transfers, account (to)
- contact (optional)
- channel (sales/refunds)
- description / memo (free text)
- reference (order number, invoice number; free text)
- currency, exchange rate, total (gross), net, tax — totals are derived from lines
- lines (one or more):
  - sale/refund lines: product (optional; a line can be free-form), description, quantity (decimal allowed, up to 3 places), unit price, discount (amount or percent), tax rate, net, tax, gross, unit cost snapshot (copied from product cost at transaction date for margin)
  - expense lines (splits): category, description, net, tax rate, tax, gross; optional tag per line
- category (for single-line expenses it is the line's category; a split expense shows "Split (3)")
- tags (many)
- attachments (receipts: images, PDFs; up to 10 per transaction, 15 MB each)
- refund-of (for refunds: optional link to the original sale; the refund can cover some lines/quantities)
- status: `cleared` | `pending` (e.g. future-dated recurring or not yet in bank). Pending is included in totals by default with a filter to exclude.
- source: `manual` | `import:<batch id>` | `recurring:<rule id>`
- reconciled flag (matched to a bank line)
- created by/at, updated by/at, version (for optimistic concurrency)
- deleted-at (soft delete; trash keeps 30 days)

**Refunds**
- A refund is its own transaction (kind `refund`), dated when the money went back. Linked to the original sale when known; lines can refer to original lines with quantities ≤ remaining refundable. Product revenue and margin are reduced in the refund's period (cash view) — the period it happened in, not the original sale's. A sale's detail shows "Refunded €24.00 of €60.00".
- A partial refund without lines ("goodwill €5") is allowed as a single free-form line.

**Splits**
- An expense split across categories must have lines summing exactly to the total. While editing, the editor shows "Remaining to allocate: €12.40" and save is disabled until zero (or the user taps "Put remainder in…" a category).
- A sale with multiple products is naturally multi-line; a sale can also carry a "Shipping charged" line in a different income category.

**Recurring rule**
- template transaction (all fields except date), schedule: every N days/weeks/months/years, on day-of-month (with "last day"), start date, end (never / after N / on date), mode: `create automatically` or `remind me` (creates a pending draft to confirm), next occurrence (derived).
- Edits to a rule ask: "Apply to future only" (default) or "also update existing unconfirmed ones".
- Generated transactions link back to the rule; editing one generated transaction detaches only that one.

**Budget**
- category (or category group), period type (monthly, quarterly, yearly), amount per period, start period, optional per-period overrides (e.g. December advertising higher), rollover off/on (unspent carries forward).
- Budgets apply to expense categories in v1; a revenue target (income) is allowed as "target" with inverted good/bad colouring.

**Import batch**
- id, file name, source profile, imported at/by, row count, created count, skipped duplicates, errors, status (`previewing`, `committed`, `undone`).

**Import profile**
- name (e.g. "Northbank CSV"), column mapping, date format, decimal separator, sign convention (single amount column with negative = out, or separate in/out columns), header row index, default account, encoding.

**Matching rule** (auto-categorisation)
- condition (description contains / equals / regex-like "starts with", amount range, account), result (contact, category, tags), priority. Created explicitly or offered after the user re-categorises the same vendor twice ("Always categorise 'ADOBE*' as Software?").

**Saved view**
- name, filter set, view (list/insight), sort, column set, pinned flag.

**Activity log entry**
- who, when, what (created/edited/deleted/imported/undone), entity, before/after summary. Visible per transaction ("History") and globally to owner.

### 4.4 Relationships (summary)

- Transaction 1—N Line; Line N—1 Category (expense) or Product (sale); Transaction N—1 Contact, Account, Channel; Transaction N—N Tag; Transaction 1—N Attachment.
- Refund N—1 original Sale (optional).
- Transaction N—1 Import batch or Recurring rule (source).
- Category N—1 parent Category. Budget N—1 Category.
- Product 1—N cost history entries.

### 4.5 Dates

- Transaction dates are calendar dates, not instants; they never shift with the viewer's time zone. "Today" is computed in the business time zone.
- Periods respect fiscal year start (e.g. fiscal year starting April: "This year" = Apr 1 – Mar 31) and week start setting.
- Display format follows locale ("7 Nov 2026" / "Nov 7, 2026"); lists use compact form ("7 Nov") within the current year, with year when not.

---

## 5. Information architecture and navigation

### 5.1 Primary sections

1. **Overview** — the home dashboard.
2. **Transactions** — the master list of all records.
3. **Insights** — charts and analysis (tabs: Trends, Income vs Expenses, Breakdown, Products, Customers, Compare).
4. **Budgets** — plan vs actual.
5. **Contacts** — customers and vendors.
6. **Products**.
7. **Import** (also reachable from Transactions).
8. **Settings** — business, categories, accounts, tax, channels, tags, rules, recurring, members, export, trash.

### 5.2 Global elements

- **Filter bar** (see §7) at the top of Overview, Transactions, Insights and Budgets — same filter state shared across them.
- **"+ New" button**, always visible: Sale, Expense, Refund, Transfer. Keyboard: `N` then `S`/`E`/`R`/`T`, or `N` opens the menu.
- **Command palette / search** (`Ctrl/⌘ K`): jump to any screen, contact, product, saved view; run actions ("New expense", "Import CSV", "Last quarter"); free-text search of transactions ("Search transactions for 'tape'").
- **Sync indicator**: quiet when all saved; shows "Saving…", "Offline — 3 changes waiting", or "Couldn't save 1 change — Review".
- **Account menu**: user, business, sign out.

### 5.3 Layout by device

- **Desktop (≥ 1024 px)**: left sidebar navigation (collapsible to icons), filter bar across the top of the content area, content below. Detail panels open as a right-side panel (40% width, min 420 px) that leaves the list visible; on wide screens (≥ 1440 px) the panel sits beside the list without overlaying it.
- **Tablet (640–1023 px)**: sidebar collapses to icons; detail panel overlays the list as a sheet from the right.
- **Phone (< 640 px)**: bottom tab bar with Overview, Transactions, a central "+" button, Insights, More (Budgets, Contacts, Products, Import, Settings). Filter bar collapses to a single "Filters" button with an active-count badge plus a search field; filters open in a full-height sheet. Details and editors open full-screen with a back control. Charts are full-width and stacked, with horizontal scrolling only inside a chart where time series are long (never the page).

URLs: every screen, filter state, selected record and insight tab is reflected in the URL so views are shareable among members, bookmarkable, and the browser back button works as expected (filter changes replace history; navigation between screens and opening a record push history).

---

## 6. Screens

### 6.1 First-run setup

Steps (each skippable, progress shown as "Step 2 of 4"):
1. Business name, home currency, country (drives default tax rates and date format), fiscal year start.
2. Tax: "Do you charge sales tax / VAT?" Yes → choose/edit rates and prices-include-tax default. No → hidden.
3. Accounts: suggests "Business bank" and "Cash"; add more.
4. Bring in data: "Import a CSV", "Add products", or "Start empty". A **sample data** option loads a clearly-labelled demo business (banner "You're viewing sample data — Clear sample data") so the owner can explore Insights before having data.

### 6.2 Overview (home)

Purpose: in five seconds, "how are we doing this period, and what needs attention?"

Contents, top to bottom (desktop grid of 12 columns; phone single column in this order):

1. **Filter bar** (default period: This month).
2. **Headline figures** (four tiles in a row on desktop; 2×2 on phone):
   - Revenue, Expenses, Net profit, Gross margin %.
   - Each: the value large; beneath it the change vs the comparison period ("▲ 12% vs Oct" — arrow, sign and words, coloured green/red where *good/bad* is meaningful; for expenses an increase is coloured as unfavourable); a sparkline of the last 12 periods.
   - Click/tap a tile → Insights Trends with that measure selected.
3. **Income vs expenses chart** (8 columns): monthly bars for the last 12 months (or bucketed to the filter's range) with net profit line. See §8.2.
4. **Needs attention** (4 columns) — a list, each item linking to a filtered list:
   - "14 uncategorised transactions"
   - "3 recurring items to confirm"
   - "Software is 18% over budget this month"
   - "5 possible duplicates from last import"
   - "2 expenses over €100 without a receipt" (if the business enables the receipt reminder)
   - Empty: "All caught up." with a check.
5. **Expenses by category** (6 cols): horizontal bars, top 8 + "Other".
6. **Top products** and **Top customers** (3 cols each): top 5 by revenue with small bars, "See all" links.
7. **Budgets snapshot** (6 cols): up to 5 budgets closest to or over limit, each with progress bar.
8. **Recent transactions** (6 cols): last 8, with "View all".

Overview is not configurable in v1 except hiding the Budgets card if no budgets exist (shows a "Set a budget" prompt instead).

### 6.3 Transactions

The workhorse. Must handle tens of thousands of rows smoothly.

**Layout (desktop)**
- Filter bar.
- **Summary strip** under the filter bar, always reflecting current filters: "1,284 transactions · In €48,210.00 · Out €31,905.50 · Net €16,304.50". When rows are selected, it changes to the selection: "12 selected · Total €1,204.00 · Clear selection".
- **Table**, columns (user can show/hide, reorder by drag or via a "Columns" menu with move up/down for keyboard users, and resize; the set is remembered per user):
  - Selection checkbox
  - Date
  - Description (primary text) with contact as secondary text beneath, or separate Contact column
  - Category (chip with colour dot; "Split (3)" for splits; "Uncategorised" in a warning style)
  - Account
  - Channel (hidden by default)
  - Tags (hidden by default)
  - Reference (hidden by default)
  - Tax (hidden by default)
  - Amount (right-aligned, tabular figures; income positive, expense with − sign; currency shown only when not home currency, with home equivalent in secondary text)
  - Indicators: receipt attached (paperclip), recurring, imported, pending, refunded/partially refunded, unsaved/sync error.
- **Grouping** toggle: none (default), by day, by month (with group subtotals in group headers, sticky while scrolling), by category, by contact.
- **Sort**: click column header (asc → desc → default); default date desc, then created desc. Sort state shown with arrow and announced to screen readers.
- **Virtualised scrolling**: rows rendered as they come into view; the scrollbar represents the full count; jumping (e.g. End key or scrollbar drag) to row 9,000 is immediate with placeholder rows filled within ~200 ms.
- Rows are a fixed comfortable height (44 px; "compact" density 32 px in settings).

**Layout (phone)**
- Search field and Filters button; summary strip as one line ("1,284 · Net €16,304.50"), expandable.
- List grouped by day with sticky day headers showing day net. Each row: description + contact (two lines left), amount (right), category chip below. Tap opens detail full-screen.
- Swipe left on a row reveals Categorise and Delete; swipe actions also available from a long-press menu and from the detail screen (swipe is never the only way).
- Long-press enters selection mode; checkboxes appear; a bottom action bar shows bulk actions.

**Interactions**
- **Open**: click a row (not its checkbox) or press Enter on the focused row → detail panel on the right. Up/Down (or `J`/`K`) move between rows; while the panel is open, moving the row focus updates the panel.
- **Inline edit** (desktop): double-click or press `E`/F2 on a cell to edit Date, Description, Category, Contact, Account, Tags, Amount (only for single-line transactions; splits open the editor). Enter saves, Escape cancels, Tab moves to the next editable cell. Category and contact cells use type-ahead pickers.
- **Selection**: checkbox click; Space toggles the focused row; Shift+click / Shift+Up/Down extends a range; Ctrl/⌘+A selects all *matching the filter* (not just loaded rows) with a banner: "All 1,284 transactions matching these filters are selected." Selection survives scrolling and sorting, and is cleared when filters change (with a toast "Selection cleared because filters changed" only if there was a selection).
- **Bulk actions** (toolbar appears when ≥1 selected): Categorise…, Set contact…, Add tag / Remove tag…, Change account…, Mark cleared/pending, Export selected, Delete. Bulk actions on splits: "Categorise" applies only to single-line transactions; the dialog says "8 split transactions will be skipped" before confirming.
- **Undo**: every edit, bulk action, delete and import shows a toast "Categorised 24 transactions · Undo" for 10 seconds; `Ctrl/⌘ Z` also undoes the last action of this session (stack of the last 20 actions, while still valid on the server). Undo after another person changed the same record: Ledger restores only fields the other person did not change and reports "Undone, except 2 transactions changed by Sam since."
- **Delete**: soft-delete with Undo; deleted records are in Settings → Trash for 30 days.
- **Empty states**: see §11.
- **Keyboard shortcuts** list via `?`.

### 6.4 Transaction detail panel

- Header: kind badge (Sale/Expense/Refund/Transfer), amount large, date, status; actions: Edit, Duplicate, Refund (sales only), Delete, More (Make recurring, Copy link, History).
- Body: contact (link to contact), account, channel, reference, description, lines table (product/category, qty, unit price, discount, tax, total) with totals block (Subtotal, Tax, Total; for foreign currency also rate and home amount), tags, attachments (thumbnails; click to view full; drag-drop or browse to add; on phone "Take photo"), linked records (original sale / refunds of this sale; recurring rule; import batch with row number), notes.
- Footer: "Created by Sam on 2 Nov · Edited by Maya on 3 Nov · History".
- Margin info for sales: "Cost €18.40 · Margin €41.60 (69%)", and a note if a product had no cost set.

### 6.5 Transaction editor (new and edit)

One editor for all kinds, with a kind switcher at top (Sale | Expense | Refund | Transfer); switching kind keeps compatible fields.

Desktop: a panel on the right (same place as detail) or modal when invoked from elsewhere; phone: full-screen with sticky Save at bottom.

**Expense form** (simple first; advanced fields behind "More details"):
- Amount (autofocus, numeric keypad on phone; accepts "12.5", "12,50" per locale, "1 204", and simple arithmetic "40+12.5" evaluated on blur, shown as "= 52.50")
- Date (default today; quick chips: Today, Yesterday; picker; typing "yesterday", "3 nov", "-2" works)
- Vendor (contact type-ahead; create new inline "Create vendor 'Printworks'"); picking a vendor prefills its default category and account
- Category (type-ahead with recent and suggested first)
- Account (default last used)
- Tax rate (if tax enabled; default from category or business)
- Receipt (attach)
- "More details": description, reference, tags, pending status, currency, Split.
- **Split**: turns the single category into lines; each line: category, amount, tax, note; "Remaining €0.00" indicator; add line (Enter in last amount field adds a line).

**Sale form**:
- Channel (chips, last used preselected), Customer (optional type-ahead), Date, Account/payment method
- Product lines: product picker as a grid of tappable product tiles on phone (most-sold first, with search) and a type-ahead on desktop; tapping a product again increments quantity; each line shows qty stepper, unit price (editable), discount, line total.
- Free-form line ("Add custom item").
- Shipping charged, discount on the whole order.
- Running total with tax breakdown, always visible (sticky on phone).
- Save, and "Save & new" (`Ctrl/⌘ Enter` saves; `Ctrl/⌘ Shift Enter` saves and starts a new one with the same channel/account/date).

**Refund form**: started from a sale ("Refund" action) shows the sale's lines with quantities refundable; or standalone with customer and free lines. Refund amount cannot exceed the refundable remainder of the linked sale (client validation and server rule).

**Transfer form**: from account, to account, amount, date, note. Cannot be same account.

**Validation (client side, inline, as you leave a field and on save)**:
- Amount required, > 0, ≤ 999,999,999.99, at most the currency's minor digits.
- Date required, valid; warning (not error) if more than 1 year in the future or before the business's first transaction by more than 5 years: "That's in 2031 — is that right?"
- Category required for expenses (a "Save as uncategorised" escape is allowed for quick entry, shows in Needs attention).
- Splits must sum exactly.
- Messages appear beneath the field, are announced, and the first invalid field receives focus on failed save; an error summary at the top of the form lists errors as links on longer forms.

**Server-refused validation**: if the server rejects (e.g. "Category was archived", "Period is locked", "Refund exceeds the original sale", "This record was changed by Sam"), the form stays open with entered values intact, the message is shown at the relevant field (server returns field paths) or at the top if general, and focus moves there. Never lose input.

**Concurrency**: edits carry the record version. On conflict: "Sam changed this transaction while you were editing." Options: "Review changes" (side-by-side of their value vs yours for each conflicting field, pick per field), "Overwrite with mine", "Discard mine".

**Drafts**: an unsaved editor's contents are kept locally if the user navigates away or the tab closes; reopening "+ New" offers "Continue your unsaved expense from 10:42?"

**Locked periods** (Settings): owner can lock periods up to a date (e.g. after filing taxes). Edits in locked periods are refused with an explanation; owner can unlock.

### 6.6 Insights

Tabs across the top (desktop), a segmented selector/scrollable chip row (phone). All tabs honour the global filter bar. Each chart card has: title, one-line plain-language summary ("Revenue rose 12% vs the previous period, driven by Online shop."), the chart, a "Show as table" toggle, and an overflow menu (Export CSV, Export image, Copy link to this view).

Tabs:
1. **Trends** — measure picker (Revenue, Expenses, Net profit, Gross margin %, Number of sales, Average order value, Tax collected); granularity (Day/Week/Month/Quarter/Year; auto-chosen from range, user-overridable, with disallowed options disabled when they'd produce >400 or <2 points); comparison overlay (Previous period, Same period last year, None); optional breakdown by category/channel/product (top 5 + Other as stacked area or multiple lines, user's choice).
2. **Income vs Expenses** — grouped bars per period (income, expenses) with net profit line and cumulative net toggle; a waterfall option for a single period showing Revenue → − COGS → Gross profit → − each expense category → Net profit.
3. **Breakdown** — for expense or income (toggle): categories as a sorted horizontal bar chart (default) or treemap; sub-categories by expanding a bar; each bar shows amount, share %, and change vs comparison period.
4. **Products** — table+chart of products: units sold, revenue, COGS, gross margin €, margin %, refunds, trend sparkline; scatter plot option of revenue (x) vs margin % (y) with point size = units, to spot high-volume low-margin products.
5. **Customers** — top customers by revenue; new vs returning customers per period (stacked bars); customer count; average order value; repeat rate. List of customers with last purchase date ("Not seen in 6 months" filter preset).
6. **Compare** — pick two periods (e.g. this quarter vs same quarter last year or any two custom ranges) and see a side-by-side table of every category with difference and % change, sorted by absolute difference, plus a diverging bar chart of differences. The headline line: "Net profit €4,210 higher than Q3 2025".

Details of charts and their accessibility in §8.

### 6.7 Budgets

- Period selector (month/quarter/year, prev/next arrows) — linked to filter bar's date range: choosing a budget period sets the date filter and vice versa when it matches a whole period; if the filter range isn't a whole period, Budgets shows the budget prorated by days with a note "Budget prorated for 15 days".
- **Summary**: Total budgeted, Spent, Remaining, Projected end-of-period spend (based on daily pace, plus known recurring items still to come).
- **Budget rows**: category, budget, actual, remaining, progress bar with a marker for "where you should be today" (pace), status text: "On track", "€40 over pace", "Over by €120". Over budget rows are flagged with icon + text, not only colour.
- Row click → expands to the last 12 periods' bars of budget vs actual for that category, and a "View transactions" link.
- **Edit budgets**: inline amount editing (Tab through rows), "Copy last period's actuals as budgets", "Apply to all months", per-month overrides grid (12 months × categories, spreadsheet-like keyboard navigation, paste from a spreadsheet supported).
- Unbudgeted spending row: "Spent in categories without a budget: €310".
- Notifications (in-app; email optional): when a category crosses 80% and 100% of budget.

### 6.8 Contacts

- List with search, type filter (Customers/Vendors/All), columns: name, type, transactions, total (in/out), last activity. Sort by any.
- Contact page: header with totals for the filtered period and lifetime; small chart of monthly totals; their transactions (same table component, pre-filtered); default category; aliases; notes; Merge (choose a duplicate contact to merge into this one: moves all transactions, aliases added; preview counts; undoable).
- Bulk: merge selected, archive.

### 6.9 Products

- List/grid toggle: image, name, SKU, price, cost, margin %, units sold (period), revenue (period), active.
- Product page: details form; cost history (add new cost with effective date); sales chart; refunds.
- Archive (not delete) products with sales history; deleting allowed only if never used.
- Quick bulk price edit: select products → "Change price by %" or set value, with preview.

### 6.10 Import

A four-step flow, in one screen with a step indicator. Can be left and resumed (batch saved in `previewing` state for 7 days).

1. **Upload**: drag-and-drop zone and "Choose file" button; accepts .csv, .tsv, .txt (CSV); max 20 MB / 100,000 rows. Choose target account and what the file is (Bank statement / Sales export / Other). Encoding detection (UTF-8, UTF-16, Windows-1252), delimiter detection (comma, semicolon, tab), quoted fields, BOM.
2. **Map columns**: shows the first 20 rows as a grid; each column has a dropdown: Date, Description, Amount, Money in, Money out, Currency, Reference, Contact, Category, Tax, Product/SKU, Quantity, Ignore. Ledger guesses mappings from header names and contents, and from a previously saved **profile** matching the header row (auto-applied with "Using profile 'Northbank CSV' · Change"). Settings: date format (auto-detected with ambiguity prompt: "Is 03/04/2026 the 3rd of April or March 4th?" showing an example row), decimal separator, sign convention ("Negative amounts are money out" vs reversed), first row is header. "Save as profile" checkbox.
3. **Review**: every row parsed into a proposed transaction, in a table with a status column and filter chips at top: All (212) · Ready (180) · Needs category (20) · Possible duplicates (9) · Errors (3).
   - **Errors** (unparseable date, missing amount, non-numeric amount, amount zero): row shown with the problem cell highlighted and a message ("Couldn't read '31/02/2026' as a date"); fixable inline; or "Skip row". Error rows can't be imported until fixed or skipped.
   - **Duplicates**: a row is a *possible duplicate* if an existing transaction (or another row in the same file) has the same account, same amount, and date within ±3 days, with similar description (normalised text similarity). Exact duplicates (same date, amount, description, reference and account, or same external ID if the source provides one) are *certain duplicates*, skipped by default. For each possible duplicate, the row expands to show the matching existing transaction side by side with choices: "Skip (it's the same)", "Import anyway", "Merge: link and mark existing as reconciled" (keeps the existing record, adds bank reference). Bulk: "Skip all certain duplicates" (default on), "Skip all possible duplicates".
   - **Categorisation**: rules and vendor history suggest contact and category, shown with a subtle "suggested" marker; the user can accept all, change per row, or bulk-select rows and set a category. Rows without a suggestion are "Needs category"; they can be imported as Uncategorised.
   - Kind inference: money-out → expense. Money-in → income ("Other income" unless a rule or customer match says otherwise). Money-in matched to a known vendor → a vendor refund, recorded as an expense credit in that vendor's category (reduces that category's expenses) and labelled "Vendor refund"; the user can change the kind per row. transfers between own accounts detected when a matching opposite amount exists in another account within ±3 days ("Looks like a transfer to Cash box").
   - For sales exports: rows grouped into one sale by order number; SKUs matched to products; unmatched SKUs listed with "Create product" or "Map to existing".
4. **Confirm**: summary "Import 197 transactions (In €12,400.00, Out €9,215.33) · Skip 12 duplicates · Skip 3 rows". Import runs; progress bar for large files (server-side job; user may navigate away; a notification when done). Result screen: counts, "View imported transactions" (filter = this batch), "Download skipped rows as CSV" (with a reason column), and **Undo import** (available for 30 days in Settings → Imports, removes all transactions of the batch that haven't been edited since; edited ones are listed and left unless the user confirms).

Partial failure: if the server rejects some rows on commit (e.g. locked period), the batch commits the valid rows (atomic per row, not per file) and reports the rejected ones with reasons, downloadable and retryable after fixing. The user is told clearly before confirming that rows in locked periods will be refused.

### 6.11 Export

From Settings → Export, from Transactions (export current filtered list or selection), and from any chart (its data).
- **Transactions CSV**: one row per transaction or one row per line (choice), columns: date, kind, description, contact, category, account, channel, reference, tags, currency, net, tax, gross, home-currency amount, status, receipt file names, id. Amounts as plain decimals with "." and no thousands separators (option: locale format for spreadsheets in that locale); dates ISO (YYYY-MM-DD). UTF-8 with BOM option for spreadsheet compatibility. Formula-injection protection: fields starting with `=`, `+`, `-`, `@` are prefixed with a single quote when not numbers.
- **Profit & loss** by category for a period, optionally by month columns (CSV and PDF).
- **Tax summary** (CSV/PDF).
- **Receipts ZIP**: files named `YYYY-MM-DD_vendor_amount_id.ext`, with an index CSV.
- **Full backup**: all entities as JSON (and CSVs) for portability.
- Large exports run as background jobs; user receives a download link in-app (and by email if chosen) when ready.

### 6.12 Settings

Business; Accounts; Categories (tree with drag reorder, keyboard reorder with move buttons, merge, archive, colour); Tax rates; Channels; Tags (rename, merge, delete); Matching rules (list with test box: "paste a bank description to see which rule matches"); Recurring (list with next date, pause, edit); Members and roles; Locked periods; Import profiles and import history (with undo); Export; Trash (restore, delete forever); Preferences (density, net/gross display, comparison default, theme light/dark/system, reduced motion follows system with override, number format locale).

Category merge/archive effects are previewed: "Merging 'Postage' into 'Shipping & postage' moves 312 transactions and 1 budget."

---

## 7. Finding things: the filter system

### 7.1 Principles

- **One filter state, every view.** The filter bar's state is global across Overview, Transactions, Insights and Budgets (and scoped versions on Contact/Product pages). Changing a filter on any of these updates all, and navigating between them keeps it. This is what makes "narrow the data, read the answer" work.
- **Visible and reversible.** Every active filter is shown as a chip with its value and a remove (×) control. "Clear all" resets to defaults (period: This month; nothing else).
- **Instant.** Filters apply as you change them (debounced 200 ms for text and slider dragging); counts and totals update in place without page reload; previous results stay visible (dimmed slightly after 300 ms) until new results arrive.
- **Combination logic**: different filter types combine with **AND**; multiple values within one type combine with **OR** (e.g. Category is Shipping OR Packaging, AND amount €20–€200, AND date in Q2). Each type can be inverted with "is not" (e.g. Category is not Transfers). This is explained in a one-line hint the first time a second value is added.

### 7.2 Filters

1. **Date range** (always present; cannot be removed, only changed)
   - Presets: Today, Yesterday, This week, Last week, This month, Last month, Last 30 days, Last 90 days, This quarter, Last quarter, This year (fiscal), Last year (fiscal), Year to date, Last 12 months, All time, Custom.
   - Calendar-year variants when fiscal year differs from calendar year ("This calendar year").
   - Custom: two-month calendar (one on phone) with start and end typed fields; typing accepted in locale format and natural forms ("1 mar", "march 2026" = whole month, "2025" = whole year, "q2" = this year's Q2).
   - Previous/next arrows beside the control step by the range's own length (month → previous month; custom 10 days → previous 10 days).
   - Relative presets stay relative in saved views and shared links ("Last month" means last month when opened later); custom ranges stay fixed.
   - **Comparison period** setting lives with the date control: Previous period (default), Same period last year, Custom, None. Used by tiles, Trends overlay and Compare.
2. **Search** (free text): matches description, contact name and aliases, reference, notes, line descriptions, product names/SKUs, tags, and amounts typed as numbers ("42.50" matches €42.50 exactly; "42" matches €42.00–€42.99). Case- and accent-insensitive, word-prefix matching, multiple words all must match (AND); quoted phrase for exact. Matched text is highlighted in results. Operators supported but not required: `-word` excludes. Search is server-side for full-data correctness.
3. **Amount range** — two-handled slider plus two number inputs:
   - Range bounds from the data under the *other* active filters (min to max absolute amount, rounded out to friendly values).
   - Scale is **non-linear** (logarithmic-like) because amounts are skewed: most are €5–€200 with rare €3,000 rent. Tick labels at friendly values (€0, €10, €50, €100, €500, €1k, €5k).
   - A small histogram above the track shows the distribution of transactions by amount under the other filters, so the owner sees where values cluster; the selected range is highlighted.
   - Handles snap to sensible steps (whole currency units under €100, €5 to €1,000, €50 above). Number inputs accept exact cents and override snapping.
   - Handles cannot cross; dragging one past the other stops at it (equal is allowed = exact amount).
   - Applies to absolute amount by default; a "Direction" option: Any, Money in only, Money out only.
   - Keyboard: each handle is a separate slider control; Left/Down decrease, Right/Up increase by one step; Page Up/Down by 10 steps; Home/End go to the bounds. Announced as "Minimum amount, €20" / "Maximum amount, €200". Touch target at least 44×44 px on phone.
   - Chip text: "€20 – €200", "≥ €500" when the max handle is at the top bound, "≤ €50" when the min is at the bottom.
4. **Kind**: Sales, Refunds, Expenses, Transfers (Transfers excluded by default from Insights; included in Transactions list when selected).
5. **Category**: multi-select tree with search, parent selection includes children (shown as indeterminate when some children selected), "Uncategorised" option, counts beside each.
6. **Contact** (customers/vendors): multi-select type-ahead with recent and top first; counts.
7. **Product**: multi-select; filters sales/refunds containing any selected product. For Insights, line-level: revenue counts only the matching lines (stated in a note "Showing revenue from selected products only").
8. **Account**.
9. **Channel**.
10. **Tags**.
11. **Status**: Cleared / Pending; Reconciled / Not reconciled.
12. **Has receipt**: Yes / No.
13. **Source**: Manual, Imported (optionally a specific batch), Recurring.
14. **Created by** (member).

The bar shows Date, Search, Amount, Category, Contact as primary controls; others under "+ Filter". On phone all are in the sheet, with the active ones listed first.

### 7.3 Facet counts and impossible combinations

Within the category, contact, product and account pickers, each option shows how many records match given the other active filters. Options with zero are shown dimmed at the bottom, still selectable. If filters yield nothing, views show the "No results" state (§11) naming the filters and offering to remove the most restrictive one ("Remove 'Amount ≥ €500' to see 42 transactions").

### 7.4 How filters affect each view

| View | Effect |
|---|---|
| Overview | Tiles, charts, top lists and needs-attention counts compute over the filtered set. Trend sparklines show 12 periods ending at the filter's end date, other filters applied. |
| Transactions | List and summary strip show the filtered set. |
| Insights | All charts. Date range sets the x-axis span; granularity auto-adjusts. |
| Budgets | Date range sets the period; Category filter limits rows; filters like Search/Amount/Contact apply to *actuals* with a visible note "Actuals filtered: only transactions matching 'Amazon'". |
| Contact / Product pages | Global date range applies; the page's own entity is a fixed filter in addition. |

A small "Filtered" indicator with count appears on every screen when non-date filters are active, so the owner never misreads a filtered total as the full one. Headline tiles say "Revenue (filtered)" when non-date filters apply.

### 7.5 Saved views

"Save view" stores the filters (+ sort/columns/insight tab) under a name; saved views appear in the sidebar under "Views" and in the command palette. Owner can share a view with all members. Examples users will make: "Uncategorised", "Market days", "Big expenses this year". Editing a saved view's filters shows "Modified · Save · Revert".

---

## 8. Insight: charts and summaries

### 8.1 General chart behaviour

- **Every number links to its records.** Clicking a bar, point, slice, table cell, tile or list item opens Transactions with filters set to exactly the records that make it up (e.g. category=Shipping, date=March 2026), and the totals match to the cent. A "Back to chart" affordance returns to the chart with its state.
- **Hover/focus tooltip** shows period, series name, value, change vs comparison period, and record count ("March 2026 · Shipping · €412.30 · ▲ 18% vs Feb · 37 transactions"). Tooltips follow focus for keyboard users and can be pinned on touch (tap shows; tap elsewhere hides; tap again on the same item drills down, or a "View transactions" button inside the tooltip on touch).
- **Selection to filter**: dragging across a time chart's x-axis (brush) selects a range; on release, a prompt "Filter to 3 Mar – 21 Apr?" applies it to the global date filter (with Undo). Clicking a legend item toggles a series; Alt/Option+click isolates it.
- **Consistent colours**: each category keeps its colour across all charts; income/expense/net use fixed semantic colours; comparison period is drawn as the same colour lighter/dashed with a label in the legend ("Same month last year").
- **Axes**: y-axis starts at zero for bars; compact labels (€1.2k, €15k); gridlines light; dates as "Mar", "Mar '25" when crossing years; no rotated labels — thin them instead.
- **Granularity** auto: ≤ 31 days → daily; ≤ 6 months → weekly; ≤ 3 years → monthly; longer → quarterly. Partial periods (current month not finished; range cuts mid-month) are marked visibly (hatched or lighter, with "partial" in tooltip) so the owner doesn't misread a dip.
- **Empty periods** show as zero, not gaps, for sums; for ratios like margin % a period with no revenue shows a gap and tooltip "No sales".
- **Show as table** on every chart: same data in an accessible table with the same drill-down links; table can be exported.
- **Summary sentence** above each chart, generated from the data: biggest change, max/min, trend direction ("Expenses were highest in July (€5,210). Up 8% on the previous 12 months."). Kept factual, no advice.
- **Units**: currency for money, % with one decimal for ratios, counts as integers.

### 8.2 Specific charts

1. **Headline tiles** (Overview): value, change vs comparison (absolute and %), sparkline. When the comparison value is zero, show "New" instead of a percentage; when both are zero, "—".
2. **Income vs expenses**: clustered bars per period (income, expenses), a line for net profit, zero line emphasised; negative net shown below zero. Toggle: cumulative net (running total line) — helps answer "when this year did we break even?".
3. **Trend line** with comparison overlay: current period solid line, comparison dashed, aligned by position in period (day 1 to day 1), tooltip shows both values and the difference.
4. **Breakdown bars**: horizontal, sorted descending, label + value + share at bar end; up to 10 bars with "Other (14 categories)" expandable. Treemap alternative only for ≥ 6 categories. **No pie charts** except the optional simple 2–4 slice donut in "Revenue by channel" on Overview, which always shows labels and percentages directly.
5. **Waterfall** (Income vs Expenses, single period): bars from revenue down to net profit; each step clickable.
6. **Margin**: gross margin % line over time with revenue bars on a secondary visual (bars muted); product margin table with sortable columns and inline bars.
7. **Product scatter**: revenue vs margin %; quadrants labelled lightly ("High revenue, low margin"); points labelled for top 5 by revenue; hover/focus lists the product name and values; click opens the product.
8. **Top customers / products**: ranked list with inline bars, value, and share; "Top 10 / 25 / all" control; ties sorted by name.
9. **New vs returning customers**: stacked bars per period; a "returning" customer bought before the period start.
10. **Budget vs actual**: horizontal progress bars with pace marker (Budgets); and per-category column chart of budget (outline bar) vs actual (filled) over 12 periods.
11. **Compare**: diverging bars of change per category (increase right, decrease left), with table of both periods' values, difference and %.
12. **Cash position** (optional in Trends): running balance per account from opening balances, stacked or total line.

### 8.3 Interaction specifics for charts

- Keyboard: Tab focuses the chart as one stop; arrow Left/Right move between periods (or items), Up/Down between series; Enter drills down; Escape leaves the chart focus; `T` toggles table view. Focused element has a visible focus ring drawn in the chart and its tooltip shown.
- Pointer: crosshair snaps to nearest period on time charts; tooltip appears within 50 ms, positioned to never cover the hovered point and never overflow the viewport.
- Touch: tap = tooltip; horizontal drag across a time chart scrubs the tooltip (no page scroll hijack: vertical drags scroll the page); two-finger pinch not required.
- Charts animate between states (see §12.4) so changing a filter visibly *changes* the data rather than replacing it.

### 8.4 Accessibility of charts (for people who cannot see them)

- Every chart has: an accessible name (its title), the generated summary sentence as its description, and a "Show as table" equivalent that contains all the data shown.
- Keyboard and screen reader navigation of data points: each focused point is announced as a complete sentence: "March 2026, Expenses, €4,120.00, up 6% from February. 1 of 12. Press Enter to view 87 transactions."
- Series navigation announces the series and its total for the range.
- Changes caused by filtering are announced politely once results settle: "Showing 1,284 transactions. Revenue €48,210."
- Colour is never the only carrier of meaning: income/expense use different patterns or positions as well as colour; comparison series dashed; over-budget shown with icon and text; legend items are text labels, and where possible series are labelled directly at the line end.
- Colour palette meets 3:1 contrast against background for graphical elements and is distinguishable for common colour-vision deficiencies; text meets 4.5:1.
- Optional sonification is out of scope; table view is the complete alternative.
- Charts respect zoom up to 200% and text-spacing changes without clipping labels (labels thin out instead).

---

## 9. Backend needs (API at product level)

The app needs these resources and operations. All list endpoints support the shared filter model so the server computes results over the full data set.

### 9.1 Conventions

- Authenticated, per-business scoped. Role checks on the server for every operation.
- Money as integer minor units + currency code; dates as ISO calendar dates; timestamps as UTC instants.
- Writes are validated server-side; errors return a machine code, a human message, and the field path(s) concerned (e.g. `lines[2].amount`), so the app can place the message.
- Optimistic concurrency: each record has a version; updates send it; a mismatch returns a conflict with the current record.
- **Idempotency key** on creates (so a retried or offline-queued save never creates duplicates).
- Pagination by cursor; total counts and totals returned with the first page.
- A **filter specification** object shared by lists, aggregates and exports: date range, comparison range, search text, amount min/max/direction, kinds, categories (+ not), contacts, products, accounts, channels, tags, statuses, has-receipt, source/batch, created-by.

### 9.2 Resources and operations

- **Session/user**: sign in, sign out, current user, member roles.
- **Business settings**: read, update.
- **Accounts, Categories, Tax rates, Channels, Tags, Products (+ cost history), Contacts**: list, get, create, update, archive/restore, delete (when unused), merge (categories, contacts, tags) with a preview operation returning affected counts.
- **Transactions**: list (filter, sort, cursor), get (with lines, attachments, links, history), create, update, delete (soft), restore, **bulk update** (set category/contact/tags/account/status on a list of IDs *or* on "all matching filter X" with an expected count guard), bulk delete, duplicate-check (given candidate fields, return possible matches).
- **Attachments**: upload (resumable; returns id), get (signed URL), thumbnail, delete.
- **Aggregates** (one flexible endpoint or several): given a filter + group-by (period at granularity, category, contact, product, channel, account, kind) + measures (sum net/gross/tax, count, COGS, margin, distinct customers, new/returning customers), return grouped results and totals; also with comparison range. Histogram of amounts for the slider. Facet counts for filter pickers.
- **Budgets**: list for period with actuals and pace, create, update, per-period overrides, copy from actuals.
- **Recurring rules**: list, create, update (future/existing scope), pause, delete; list due confirmations; confirm/skip an occurrence.
- **Matching rules**: CRUD, reorder, test against a sample description.
- **Imports**: upload file → parse with profile/mapping → return preview rows with statuses, suggestions and duplicate candidates (paged); update mapping and re-parse; edit preview rows; commit (async job with progress); job status; result with per-row outcomes; undo batch (with preview of edited records); list import history; import profiles CRUD.
- **Exports**: request export (type, filter, format) → async job → download link.
- **Saved views**: CRUD, share.
- **Activity**: per record history; global activity feed.
- **Undo support**: each write returns enough to reverse it (prior values), or the server offers a "revert action" operation by action ID; bulk actions get an action ID.
- **Locked periods**: get/set.
- **Notifications**: list, mark read; budget threshold events.
- **Realtime (nice to have)**: change notifications so that other members' edits appear without reload ("Sam added 2 transactions · Show").

### 9.3 Performance expectations of the API

- List first page: < 300 ms at p95 for 50,000 transactions with filters.
- Aggregates for 5 years monthly with comparison: < 500 ms p95.
- Search: < 400 ms p95.
- Import preview of 5,000 rows: < 5 s; larger runs as a job with progress.

---

## 10. Offline and sync behaviour

- The app works for **entry** offline (phone at a market): new sales/expenses are saved locally with idempotency keys, shown in lists with a "Waiting to sync" marker, and sent in order when online. Attachments queue too (with a size warning on cellular if > 5 MB total; compress photos to ~1.5 MB by default).
- Reading while offline: the last loaded lists and Overview are shown with a banner "Offline — showing data from 10:42". Insights requiring new aggregates show "Can't update while offline".
- Edits and deletes of existing records offline are allowed and queued; conflicts on sync use the conflict flow (§6.5).
- If a queued item is refused by the server on sync (validation), it appears in a "Couldn't save" tray in the sync indicator, opens in the editor with the server's message; never silently dropped.

---

## 11. States

### 11.1 Empty

- **New business, no transactions**: Overview shows a friendly start panel with three actions: "Record a sale", "Record an expense", "Import a CSV", and "Explore with sample data". Charts show their frames with "Your trends appear here once you have a few weeks of data."
- **Transactions empty**: same three actions.
- **Filters return nothing**: "No transactions match these filters." List the active filters as removable chips and suggest the single change that would return results (with count). Never show zero-value charts that look like real data: chart areas show the empty message.
- **Insights with too little data** (e.g. < 2 periods): show what's available, plus "Comparisons need at least two months of data."
- **Budgets empty**: explain budgets in one sentence; "Create budgets from last month's spending" one-click starter.
- **Contacts/Products empty**: prompt to add, or explain they're created automatically from transactions/imports.

### 11.2 Loading

- First load: app shell renders immediately; content areas show **skeletons** shaped like the content (rows, tiles, chart frames) — no full-page spinners.
- Subsequent loads (filter changes): keep current content, show a thin progress indicator at the top of the affected area after 300 ms; dim stale content slightly; never blank the screen. If a result arrives for an older filter state, it is discarded (only the latest request wins).
- Long operations (import commit, export, bulk update of > 500 records): progress with count ("Updating 1,240 of 3,000…"), cancellable where the server allows, and runs in the background allowing navigation.

### 11.3 Errors

- **Network failure on read**: inline error in the affected card/list: "Couldn't load transactions. Retry" with automatic retry with backoff (1 s, 2 s, 4 s, up to 30 s) while visible; the rest of the page still works.
- **Slow server**: after 3 s of waiting, show "Still loading…"; after 10 s, "This is taking longer than usual" with Retry; requests time out at 30 s.
- **Write failure (network)**: the change stays applied in the UI marked "Not saved — Retry" and is queued; the sync indicator shows the count. Leaving the page with unsaved changes warns.
- **Write refused (validation/permission/locked)**: the change is reverted in lists (with a toast explaining why and an "Edit" action that opens it), or kept in the open form with field messages.
- **Conflict**: as §6.5.
- **Session expired**: a sign-in dialog over the current screen; after sign-in, pending work resumes; nothing lost.
- **Server error (5xx)**: friendly message with an error reference ID to quote to support; retry.
- **Permission denied**: controls the user can't use are hidden or disabled with an explanation tooltip; if the server still refuses, show "You don't have permission to do that. Ask the owner."
- Error messages say what happened, why if known, and what to do; never raw codes alone.

### 11.4 Very large data

Target: 5 years, 50,000 transactions, 2,000 contacts, 200 products, 30 categories, and remain responsive.
- Lists virtualised; server paging; selection by filter, not by loaded rows.
- Totals and aggregates computed by the server over the full filtered set (never summed client-side from a partial page).
- Charts cap points (≤ 400 per series) by auto-granularity; "All time" uses quarterly or monthly.
- Facet counts and histogram served by aggregate endpoints.
- Search server-side with highlighting.
- Exports and imports as background jobs.
- Category/contact pickers are searchable and virtualised.
- Measured on a mid-range phone (4× CPU slowdown): interactions in §12.1 budgets must hold.

---

## 12. Quality bar: visual and interaction

### 12.1 Speed (perceived and real)

- Initial load to usable Overview: < 2 s on a typical broadband laptop, < 4 s on 4G phone.
- Any input (typing, toggle, selection, slider drag) responds visually within 100 ms; slider handles and chart hover track the pointer every frame.
- Filter change → updated results in < 500 ms typical; old results stay in place meanwhile.
- Saving a transaction is **optimistic**: it appears immediately in the list with a subtle saving state; confirmation from the server removes the marker; failure is surfaced as in §11.3.
- Navigation between sections keeps scroll positions and filter state; going back to the list returns to the same row.
- Prefetch the detail of the focused row and the next likely screens.

### 12.2 Clarity

- Information hierarchy: one primary number per tile; supporting text smaller and lower contrast; avoid more than 3 type sizes per card.
- Labels in the owner's language (not accounting jargon): "Money in / Money out" alongside "Revenue / Expenses"; tooltips define terms (e.g. "Gross margin: what's left from sales after the cost of the products sold").
- Consistent placement: primary actions bottom-right in forms on desktop, sticky bottom on phone; destructive actions separated and styled distinctly; confirmations only for irreversible actions (Delete forever, Undo import with edited records) — otherwise use Undo.
- Light and dark themes, both designed (not inverted).

### 12.3 Number and date formatting

- Locale-aware formatting of currency (symbol position, separators): "€1,204.50", "1.204,50 €", "$1,204.50".
- **Tabular (monospaced) numerals** in tables, tiles and charts so columns align; amounts right-aligned; decimals always shown to the currency's minor digits in tables and forms ("€12.00", not "€12"); compact forms only in chart axes and small tiles ("€12.4k"), with full value in tooltip and accessible label.
- Negative amounts with a true minus "−€45.00" (not hyphen, not parentheses by default; accounting-parentheses option in settings).
- Percentages: one decimal below 10% ("4.7%"), integer above ("23%"); changes signed ("+12%", "−3%"); "n/a" never — use "New" or "—" with explanation.
- Large counts with separators ("12,480 transactions").
- Dates: relative only for very recent activity in history ("2 minutes ago"); transaction dates always absolute.
- Currency of non-home amounts always shows the code ("USD 40.00 ≈ €36.80").

### 12.4 Motion

Motion is used only where it explains change, is short (150–250 ms, ease-out), and is disabled or reduced to fades when the user prefers reduced motion.
- Charts: bars and lines morph from old to new values on filter change, so the eye can follow what changed; new categories fade in, removed fade out; axis rescales animate.
- Numbers in tiles: crossfade to the new value (no slot-machine counting).
- Lists: newly saved transaction slides into place and briefly highlights (1 s); deleted rows collapse; bulk-categorised rows' chips change with a short highlight.
- Panels slide in from the side they live on; sheets from bottom on phone.
- Drill-down: the clicked bar's colour is carried into the filter chip briefly, connecting cause and effect.
- No motion on scroll, no parallax, nothing looping.

### 12.5 Craft details

- Inputs: amount fields select-all on focus; date fields accept typing and picker; type-ahead pickers highlight matching characters; recent items first.
- Every list row and control has hover, focus, active, disabled and selected states designed.
- Touch targets ≥ 44×44 px; nothing important within 8 px of screen edges on phone; respects safe areas.
- Text never truncates numbers; descriptions truncate with ellipsis and full text on hover/focus.
- Pasting a table from a spreadsheet into the Transactions list offers "Import these 12 rows" (goes to Import review).
- Copying selected rows copies a tab-separated version suitable for spreadsheets.
- Print styles for P&L and tax summaries.

---

## 13. Accessibility and keyboard

Target: **WCAG 2.2 AA** throughout.

### 13.1 General

- Semantic structure: landmarks (navigation, main, filter region), headings in order per page, lists as lists, tables as tables with header cells and sort state exposed.
- All functionality available by keyboard; visible focus indicator with ≥ 3:1 contrast; focus never lost (after deleting a row focus moves to the next row; after closing a panel focus returns to the row that opened it; after a dialog, to the invoking control).
- Skip link to main content and to the filter bar.
- Dialogs and sheets trap focus and close with Escape; panels on desktop are non-modal and reachable via `F6` region cycling.
- Live regions (polite) for: filter results counts, save confirmations, sync state changes, import progress milestones; assertive only for errors that block the user.
- Form fields have visible labels; errors linked to fields and announced; required fields marked in text.
- Colour contrast: text 4.5:1, large text and UI components 3:1, in both themes.
- Zoom to 200% and reflow at 320 CSS px width without loss of content or horizontal page scroll (tables scroll horizontally within themselves with the first column sticky).
- Respect reduced motion, increased contrast, and forced-colours modes.
- Drag-and-drop always has a keyboard/button alternative (column reorder, category reorder, file upload via button).
- Time limits: toasts with Undo stay until 10 s *and* pause while hovered/focused; Undo also reachable via `Ctrl/⌘ Z` and the activity history.
- Language set; numbers read correctly (currency formatted for screen readers, e.g. "minus 45 euros" via accessible labels where the visible text uses compact notation).

### 13.2 Grid semantics for Transactions

- The table is an interactive grid: one Tab stop; arrow keys move between cells/rows; Home/End to row start/end; Ctrl+Home/End to first/last row; Page Up/Down by visible page. Row count and position exposed ("Row 37 of 1,284") even though rows are virtualised.
- Selected state exposed on rows; the bulk toolbar announced when it appears ("12 selected. Bulk actions available").

### 13.3 Keyboard shortcuts (shown in `?` overlay; single-key shortcuts can be turned off in settings, and never fire while typing in a field)

| Key | Action |
|---|---|
| `Ctrl/⌘ K` | Command palette |
| `/` | Focus search |
| `N` | New… menu; `N S` sale, `N E` expense, `N R` refund, `N T` transfer |
| `G O` / `G T` / `G I` / `G B` / `G C` / `G P` | Go to Overview / Transactions / Insights / Budgets / Contacts / Products |
| `F` | Open filters (focus date range); `Shift F` clear all filters |
| `[` / `]` | Previous / next date period |
| `J` / `K` or ↓ / ↑ | Next / previous row |
| `Enter` | Open focused row / drill into focused chart point |
| `E` or `F2` | Edit focused cell / record |
| `Space` | Toggle select row |
| `Shift ↑/↓` | Extend selection |
| `Ctrl/⌘ A` | Select all matching |
| `C` | Categorise selected/focused |
| `Delete` / `Backspace` | Delete selected (with Undo) |
| `Ctrl/⌘ Z` / `Ctrl/⌘ Shift Z` | Undo / redo |
| `Ctrl/⌘ Enter` | Save form; `Ctrl/⌘ Shift Enter` save & new |
| `Esc` | Close panel / cancel edit / clear selection (in that order) |
| `T` | Toggle chart/table on focused chart |
| `?` | Shortcuts help |

---

## 14. Security, privacy and trust (product-level)

- Data is private to the business's members; role-enforced on the server.
- Receipts served via short-lived links.
- Activity history for accountability; nothing is hard-deleted without passing through Trash (except by explicit "Delete forever").
- Sessions time out after 30 days of inactivity on trusted devices, 12 hours otherwise; sign-out everywhere option.
- Exports are logged.

---

## 15. Analytics and success metrics

- Time to record a sale on phone (median target < 10 s from opening "+").
- Share of transactions categorised within 7 days (> 95%).
- Import success: rows imported without manual fixes (> 85% for returning profiles).
- Weekly active owners using Insights or filters (≥ 60%).
- Drill-down usage (clicks from charts to records) as a signal that insight is trusted.
- Error rates: failed saves, conflicts, client errors per session.

---

## 16. What done looks like — end-to-end test scenario

Preconditions: a fresh business "Clay & Paper", home currency EUR, VAT enabled with 20% standard and 0% zero rate, prices include tax, fiscal year = calendar year, desktop browser and a phone.

1. **Setup**: Complete first-run setup; skip sample data. Overview shows the empty state with "Record a sale", "Record an expense", "Import a CSV".
2. **Products**: Add "Mug" (price €24.00 incl. VAT, cost €7.50), "Print A4" (€18.00, cost €3.20), "Tote bag" (€15.00, cost €4.00).
3. **Phone sale**: On the phone, tap "+", Sale, channel Market, tap Mug twice and Print A4 once. Total shows €66.00 incl. VAT €11.00. Save. It appears at the top of today's group immediately.
4. **Offline sale**: Turn on airplane mode; record a €15.00 Tote bag sale. It shows "Waiting to sync". Turn airplane mode off; within a few seconds the marker clears; no duplicate exists.
5. **Expense with split**: On desktop, press `N E`. Amount 120, vendor "Printworks" (created inline), Split: Stock & materials €90.00, Shipping & postage €20.00; save is disabled and "Remaining €10.00" shows; add Packaging €10.00; save enabled; attach a receipt image; save with `Ctrl/⌘ Enter`.
6. **Validation from server**: Lock periods up to last month in Settings. Try to create an expense dated last month. The form stays open, the date field shows "This period is locked (up to 31 Oct 2026)", values intact. Change date to today; save succeeds.
7. **Import**: Import the provided bank CSV (30 rows: includes the Printworks €120 payment, one row with date "31/02/2026", one exact duplicate row inside the file, two rows from "ADOBE *CREATIVE"). Ledger asks to confirm the date format, flags the Printworks row as a possible duplicate of step 5 (choose "Merge"), skips the in-file duplicate as certain, shows the bad date as an error (fix to 28/02/2026). Categorise one Adobe row as Software; the other Adobe row follows (offer "Always categorise…" — accept). Confirm. Result: 28 imported, 1 merged, 1 duplicate skipped. Download skipped rows — CSV contains the duplicate with reason.
8. **Undo import**: Undo the import; transactions disappear; Overview totals return to previous values. Redo the import (re-upload, profile auto-applied).
9. **Filters**: On Transactions, set date "This year", search "adobe", amount slider to €20–€100 using only the keyboard (Tab to minimum handle, arrow keys; then the maximum handle). Chips read "This year", "adobe", "€20 – €100". Summary strip count and total match the visible rows. Switch to Insights → Breakdown: only Software appears, with the same total. Switch to Overview: tiles labelled "(filtered)".
10. **Drill-down**: Clear filters. On Insights → Income vs Expenses, click this month's expense bar. Transactions opens filtered to expenses this month; summary total equals the bar's tooltip value to the cent. Back returns to the chart.
11. **Bulk edit and undo**: Filter "Uncategorised"; select all; Categorise as "Other"; toast "Categorised N transactions · Undo"; press `Ctrl/⌘ Z`; they are uncategorised again.
12. **Refund**: Open the phone sale from step 3; Refund one Mug. Refund €24.00 appears; the sale shows "Refunded €24.00 of €66.00"; Products → Mug units sold for the month is 1 net, margin recalculated.
13. **Budget**: Create a monthly budget Software €30. Budgets shows status (over or on track per imported Adobe amounts) with text and pace marker; Needs attention lists it if over.
14. **Compare**: Insights → Compare, this month vs last month; the table lists categories with differences; totals equal the Overview tiles for each month.
15. **Accessibility check**: With a screen reader, navigate to the Trends chart, arrow through points; each announces period, value, change and record count; `T` shows the table with the same values. Complete steps 5 and 9 with keyboard only. Turn on reduced motion: charts update without morphing.
16. **Large data**: Load the 50,000-transaction fixture (5 years). Transactions scrolls smoothly; `Ctrl/⌘ End` reaches the last row; "All time" Trends renders quarterly within 1 s; Ctrl/⌘+A selects all 50,000 with the "all matching" banner; a bulk tag completes with progress and Undo.
17. **Failure**: Throttle the network to fail requests for 30 s while changing filters: the list keeps showing previous results with an inline "Couldn't load — Retrying" message; when the network returns, results update without reload. Edit a transaction in two browser sessions; the second save shows the conflict review.
18. **Export**: Export This year P&L by month (CSV) and transactions per line (CSV). Open in a spreadsheet: amounts are numbers, totals equal Insights figures, no formula is executed from a description beginning with "=".

Done when every step passes on current desktop browsers (Chrome, Safari, Firefox, Edge) and on an iOS and an Android phone, in both light and dark themes.

---

## 17. Future (explicitly not v1)

- Bank feeds (direct connection) and automatic reconciliation.
- Invoices and payment links; customer statements.
- Inventory stock levels and low-stock alerts.
- Multiple businesses per account; multiple currencies with revaluation.
- Accrual-basis reports (v1 is cash-basis: income and expenses counted on their transaction date).
- Forecasting beyond end-of-period budget projection.
- Receipt OCR to prefill expenses.
- Natural-language questions ("how much did we spend on shipping in spring?") mapped onto the filter system.

# Ledger: what the edit cut from the blind spec, and why

The blind spec (793 lines, written with no knowledge of Declare) was cut to brief size (~230 lines).
Every cut is for scope or size. None is for difficulty on any platform.

| Cut | Why |
|---|---|
| People, roles and permissions (Owner, Editor, Viewer, Recorder); members; sign-in | One user is enough for a build-in-an-hour eval; auth is a service concern. |
| Offline entry and sync queue; idempotency | Large on its own; worth an eval of its own. |
| Sales tax / VAT (rates, inclusive/exclusive, per-line rounding, tax summary) | Domain depth, not UI breadth; money exactness is kept without it. |
| Transfers; multiple accounts; multiple currencies and exchange rates | Domain depth. |
| Receipts and attachments (upload, photo, thumbnails, ZIP) | File input is still exercised by CSV import. |
| Recurring rules; matching rules ("Always categorise…"); saved views; command palette | Each a feature area; the brief keeps one of each kind of interaction instead. |
| Contacts and Products screens (lists, pages, merge, cost history, bulk price edit) | Secondary screens; contacts and products remain as data and filters. |
| Settings (categories tree, channels, tags, locked periods, trash, preferences); first-run setup; sample data | Configuration screens; the service seeds a business. |
| Concurrency conflicts and review; drafts; activity history | Multi-user and persistence depth. |
| Insights: Customers tab, Compare tab, waterfall, product scatter, cash position, new vs returning | Four tabs kept (Trends, Income vs expenses, Breakdown, Products). |
| Budget overrides grid, rollover, notifications, prorating | One monthly budget per category kept. |
| CSV import entirely (upload, mapping, ambiguous dates, errors, duplicates, suggested categories, undo) | The user's ruling: import is normally a server process, so it tests the service more than the UI. |
| Export: P&L, tax summary, receipts ZIP, full backup, background jobs | One CSV export of the filtered list kept. |
| Tablet layout; 50,000-row target; mid-range phone budget | Desk and phone kept; the fixture holds several thousand rows. |
| Analytics, security, print, paste-from-spreadsheet, copy as TSV | Out of an app build's scope. |
| Filters: product, account, channel, tags, status, receipt, source, created-by; facet counts on contact | Five filters kept (date with comparison, search, amount slider, kind, category with counts) plus contact. |
| Keyboard shortcut table | Kept as a principle (the keyboard can do everything) with a few named keys. |

Kept from the spec in its own terms: the three promises; money in cents and lines that add up; the two-handled
non-linear amount slider with its histogram, snapping, keyboard and naming; drill-down that reconciles to the
cent; one filter state across views; select-all-matching; bulk change with undo; split with "Remaining to
allocate"; server refusals that never lose input; chart accessibility in sentences.

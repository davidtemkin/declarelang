# Ledger

The books of a small business, written in Declare, over the Ledger service
(`task/api`, port 8370). The brief is `task/brief.md`.

## Run it

```bash
npm start            # in declarelang/; the service must be running on 8370
# then open http://127.0.0.1:8200/my-apps/ledger/ledger.declare
```

## How it is put together

Read `ledger.declare` first: its header comment says where everything lives.

| file | what |
|---|---|
| `ledger.declare` | the App: where the user is (screen, filters, selection, what is open), every read the filters address, the selection's verbs, undo, keys, the frame |
| `ledger-model.declare` | schemas for the service's answers; pure helpers (money, dates, ranges, the query string, CSV); `Api`, the write queue; `Books`, the lookups |
| `ledger-parts.declare` | the two themes, drawn icons, small parts (money, category chip, chips, panels, load states) |
| `ledger-filters.declare` | the filter bar, its pickers (range, amount slider with histogram, kind, category, contact), the phone's filter sheet, the "nothing matches" view |
| `ledger-charts.declare` | `TimeChart`, `BarList`, `Spark`, `ChartTable` |
| `ledger-overview.declare` | Overview |
| `ledger-transactions.declare` | Transactions: summary line, grid cells and in-place editors, detail, the phone's day-grouped list |
| `ledger-insights.declare` | Insights: Trends, Income vs expenses, Breakdown, Products |
| `ledger-budgets.declare` | Budgets |
| `ledger-editor.declare` | recording an expense, a sale or a refund |

Every total is the service's: the app sums nothing the service can sum, except a
selection's totals (from the rows' `inFilter`, in cents). Every figure opens its
records through `app.openRecords`, which remembers where it came from for Back.

## Check it

Each script in `checks/` drives the real app in a browser and asserts what the
brief asks for; each screen it stops on also gets the layout checks.

```bash
npx declare-verify my-apps/ledger/ledger.declare --phone --desktop      # build, types, boot at both sizes
npx declare-verify my-apps/ledger/ledger.declare --assert my-apps/ledger/checks/<name>.mjs
```

The scripts talk to the live service and **write to it** (they record expenses,
sales, refunds and a budget, and undo their bulk and in-place changes). The
service keeps writes until it restarts.

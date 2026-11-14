# Ledger

The books of a small business that makes and sells things, written in Declare.
It reads and writes the Ledger service on port 8370 (`task/api/API.md`).

Run it from the Declare checkout:

    npm start                                   # prints the dev server's address
    open http://127.0.0.1:8200/my-apps/ledger/ledger.declare

Start with `ledger.declare`: its header says how the program is put together
and which file holds what.

## Checks

Each script drives the running app against the live service, as a person
would, and asserts the outcome. The writes they make stay in the service
until it restarts.

    npx declare-verify my-apps/ledger/ledger.declare --assert my-apps/ledger/checks/<script>.mjs

| script | what it establishes |
|---|---|
| `flows.mjs` | Overview's figures; this month's expense bar opens exactly those expenses, the summary equal to the bar to the cent; Back returns |
| `expense.mjs` | a $120 expense from a new vendor, split; saving waits with "Remaining to allocate: $10.00"; it appears in the list at once |
| `sale.mjs` | a Market sale of two mugs and a print; one mug refunded; the sale shows what was refunded |
| `filters.mjs` | this year, "adobe", $20–$100 by keyboard alone; chips, summary, rows and Insights → Breakdown agree; Overview says it is filtered |
| `bulk.mjs` | Uncategorised → select all → categorise as Other → ⌘Z; this month's expenses exported as CSV, its total equal to the summary; a $30 Software budget said in words |
| `inline.mjs` | editing in the table: Enter edits, Escape cancels, Enter saves, a category typed and picked; ⌘Z undoes |
| `refusal.mjs` | a refund the service refuses: the editor stays open, input intact, the message at the line it concerns |
| `scale.mjs` | End over the whole history (4,000+ rows); a chart by keyboard alone, each point said in a sentence, Enter opening its records |
| `phone.mjs` | on a phone: Overview, then an expense recorded with the thumb; the vendor's usual category filled in |

# Ledger

The books of a small business: record sales, refunds and expenses; see how the
business is doing; hand the numbers to an accountant. Written in Declare.

## Running it

1. The Ledger API must be running on port 8370 (`task/api/server.mjs`).
2. From the `declarelang/` directory: `npm install` once, then `npm start`
   (or `PORT=8201 npm start` if 8200 is taken).
3. Open `http://127.0.0.1:<port>/my-apps/ledger/ledger.declare`.

The service address is `app.base` in `ledger.declare`.

## Where things are

Start with the comment at the top of `ledger.declare`: it explains the model
(one set of filters on the App; every read addressed by it; every write bumps a
revision that re-reads everything) and lists the files.

## Checking it

`checks/` holds flow scripts for the brief's "what done looks like" list and a
few more (in-place editing, keyboard travel, the chart's keyboard). Run one:

    npx declare-verify my-apps/ledger/ledger.declare --assert my-apps/ledger/checks/flow2-split.mjs

They drive the live service, so they leave records behind (a new vendor,
expenses, a sale and its refund). Restarting the service resets it.

## Keys

E new expense · S new sale · / search · [ and ] step the date range ·
1–4 pages · ⌘Z undo the last change · ⌘A select all matching ·
⇧⌘E export CSV · Escape closes what is open. In the table: arrows move,
Return or F2 edits a cell (Return saves, Escape cancels, Tab moves on),
Space selects.

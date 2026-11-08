# The Ledger API

A local HTTP service holding Clay & Paper's books. It is given and running; it
is the only backend there is.

```
node api/server.mjs --port=8370        # http://127.0.0.1:8370
```

- JSON in and out. Cross-origin requests are allowed from anywhere, all methods.
- **Money is integer cents** (USD), always. No formatted strings, no floats.
- **Dates are calendar dates**, `YYYY-MM-DD` strings, never instants.
- The history covers the two years up to today (about 4,000 transactions). It
  is the same on every start on the same day. Writes last until the process
  stops.

Base URL: `http://127.0.0.1:8370`

---

## Errors

Every error has the same shape:

```json
400 { "error": "invalid",
      "message": "Refund exceeds the original sale",
      "problems": [ { "field": "lines[0].quantity", "message": "Refund exceeds the original sale", "remaining": 1 } ] }
```

`message` is the first problem. Each problem names the `field` it concerns,
using the path of the request body (`amount`, `categoryId`, `parts`,
`parts[1].amount`, `lines[0].unitPrice`…), or `null` when no field applies.
Some problems carry `remaining` (cents, or items for a `quantity` field): how
much was left to allocate or refund.

| Status | `error` | When |
|---|---|---|
| 400 | `invalid` / `invalid filter` | a write or a query was refused; see `problems` |
| 404 | `not found` / `no such endpoint` | |
| 405 | `method not allowed` | |
| 409 | `conflict` | the request clashes with the current state (see each endpoint) |

---

## `GET /api/today`

```json
{ "today": "2026-11-07" }
```

The date the service considers today. Use it for "this month" and the like.

---

## Lookups

### `GET /api/categories`

```json
{ "categories": [
  { "id": "product-sales", "name": "Product sales", "kind": "income", "colour": 0, "archived": false },
  { "id": "software", "name": "Software", "kind": "expense", "colour": 7, "archived": false },
  { "id": "travel", "name": "Travel", "kind": "expense", "colour": 11, "archived": true }
] }
```

`colour` is a stable index per category (0–11), for giving each category the
same colour everywhere. An archived category still appears on old
transactions; it can't be given to anything new (`"Category was archived"`).

### `GET /api/channels`

```json
{ "channels": [ { "id": "online", "name": "Online shop" }, { "id": "market", "name": "Market" },
                { "id": "wholesale", "name": "Wholesale" } ] }
```

### `GET /api/products`

```json
{ "products": [ { "id": "speckled-mug", "name": "Speckled mug", "price": 3200, "unitCost": 950, "archived": false } ] }
```

### `GET /api/contacts?q=&type=&limit=`

Customers and vendors. `q` matches any part of the name, case-insensitively;
names starting with it come first, then names with a word starting with it,
then the rest, each alphabetically. `type` is `customer` or `vendor`. `limit`
caps the count (default: all).

```json
{ "contacts": [
  { "id": "c014", "name": "Adobe", "type": "vendor", "usualCategoryId": "software",
    "transactionCount": 37, "lastDate": "2026-10-12" }
] }
```

A vendor's `usualCategoryId` is the category its expenses usually go to (may be
`null`); customers have `null`.

### `GET /api/contacts/:id`

One contact, same shape.

### `POST /api/contacts`

```json
→ { "name": "Printworks", "type": "vendor", "usualCategoryId": "stock" }
201 { "id": "c131", "name": "Printworks", "type": "vendor", "usualCategoryId": "stock", "transactionCount": 0, "lastDate": null }
```

`name` and `type` are required; `usualCategoryId` is optional, vendors only, an
expense category. A name that already exists (ignoring case) is `409`, with the
existing contact as `contact`.

---

## The filter

One filter model, accepted by every read: the transaction list, the summary,
every aggregate, and budgets. Pass it as query parameters:

| Parameter | Meaning |
|---|---|
| `from`, `to` | date range, inclusive, `YYYY-MM-DD`. Either may be omitted. |
| `q` | search text. Split on spaces; **every word must match**. A word matches if it appears (case- and accent-insensitive, anywhere in a word) in the description, the contact's name, or a line's description or product name. A word that is a number (`42.50`, `$1,204.50`, `42`) also matches the transaction's total, any line amount or any split part: with cents, exactly; without, the whole dollar (`42` = $42.00–$42.99). |
| `min`, `max` | amount range in cents, inclusive, on the transaction's total (always positive, whatever the kind). |
| `kind` | `sale`, `refund`, `expense`; several = any of them. |
| `category` | category ids, several = any of them; `none` = uncategorised. |
| `contact` | contact ids, several = any of them; `none` = no contact. |
| `product` | product ids, several = any of them; `none` = free-form lines. See below. |
| `ids` | only these transaction ids. |
| `except` | leave out these transaction ids. |

Several values are comma-separated (`kind=sale,refund`) or repeated
(`kind=sale&kind=refund`). Different parameters combine with AND. Omitted
parameters don't filter. An unknown id or a malformed value is a `400` with
`error: "invalid filter"`.

```
/api/transactions?from=2026-01-01&to=2026-11-07&q=adobe&min=2000&max=10000
/api/summary?category=none
/api/summary?kind=expense&category=shipping,packaging&from=2026-10-01&to=2026-10-31
```

**Part of a transaction.** A split expense has parts in several categories, and
a sale has several lines. With `category`, a split expense counts only its parts
in those categories; with `product`, a sale or refund counts only its lines of
those products (expenses have no products, so they drop out). Each row's
`inFilter` is the signed amount it counts for. Without those two parameters,
`inFilter` equals `signed`.

**Everything reconciles.** Every total in this API, from the summary to every
aggregate, is the sum of `inFilter` over the transactions the filter matches.
Adding an aggregate's own group to the filter (its period's `from`/`to`, its
category, product or contact, and the kinds it counts) gives a summary that
equals it to the cent, with the same count.

---

## Transactions

A transaction is a `sale`, a `refund` or an `expense`. Stored amounts are
positive; the kind says which way the money went.

- A **sale** has `lines` (a product or a free-form item, quantity, unit price,
  line total), a `channel`, an income category, optionally a customer.
- A **refund** is its own transaction, usually linked to a sale (`refundOf`);
  its lines point at the sale's lines (`saleLineId`). It can never exceed what
  is left to refund, per line or in total.
- An **expense** has one expense `categoryId`, or `parts` (a split across
  categories, at least two, adding up exactly to `amount`), or neither
  (uncategorised). Expenses have no lines.

### `GET /api/transactions?<filter>&sort=&dir=&offset=&limit=`

| Parameter | Default | |
|---|---|---|
| `sort` | `date` | `date`, `amount` (signed), `description`, `contact`, `category`, `channel`, `kind` |
| `dir` | `desc` for date and amount, else `asc` | `asc` or `desc`. Ties: newest first. |
| `offset` | `0` | |
| `limit` | `100` | up to `10000` |

Any offset is equally fast: ask for exactly the window you show.

```json
{ "total": 1284, "offset": 0, "limit": 100,
  "summary": { "count": 1284, "in": 4821000, "out": 3190550, "net": 1630450 },
  "rows": [
    { "id": "t04163", "kind": "expense", "date": "2026-11-07", "description": "Paper and inks",
      "contactId": "c131", "contactName": "Printworks",
      "categoryId": null, "split": { "parts": 3, "categoryIds": ["stock", "shipping", "packaging"] },
      "channel": null, "amount": 12000, "signed": -12000, "inFilter": -12000,
      "lineCount": 0, "refundOf": null, "refunded": null },
    { "id": "t04162", "kind": "sale", "date": "2026-11-07", "description": "Riverside Market",
      "contactId": null, "contactName": null, "categoryId": "product-sales", "split": null,
      "channel": "market", "amount": 8800, "signed": 8800, "inFilter": 8800,
      "lineCount": 2, "refundOf": null, "refunded": 3200 }
  ] }
```

`summary` is the same as `GET /api/summary` for the filter. `split` is `null`
unless the expense is split. `refunded` is the total refunded so far for a sale,
`null` for other kinds. `categoryId: null` with `split: null` is uncategorised.

### `GET /api/transactions/:id`

The row's fields (without `inFilter`), plus:

```json
{ "id": "t03957", "kind": "sale", "amount": 31200, "refunded": 1800,
  "parts": null,
  "lines": [
    { "id": "t03957.2", "productId": "tall-mug", "description": "Tall mug", "quantity": 12,
      "unitPrice": 1800, "amount": 21600, "unitCost": 1100,
      "refunded": 1800, "refundedQuantity": 1, "refundable": 19800, "refundableQuantity": 11 }
  ],
  "refunds": [ { "id": "t03997", "date": "2026-10-13", "amount": 1800, "description": "Breakage credit — W-0021" } ],
  "refundable": 29400, "cost": 18900, "margin": 12300 }
```

- **Sale**: each line has what was refunded and what is left (`refundable`,
  `refundableQuantity`); `refunds` lists its refunds, oldest first; `cost` is
  the sum of quantity × `unitCost` (the product's cost when sold); `margin` is
  `amount − cost`.
- **Refund**: `lines` each carry `saleLineId` (or `null` for a free-form line);
  `sale` is `{ id, date, description, amount, channel }` of the sale it refunds,
  or `null`.
- **Expense**: `parts` is `[{ "categoryId", "amount" }]` or `null`; `lines` is
  empty.

### `POST /api/transactions`

Returns `201 { "transaction": <detail>, "changeId": "ch12" }`. Any field the
service refuses comes back as a `400` with field-addressed problems; nothing is
stored.

**Expense**

```json
{ "kind": "expense", "date": "2026-11-07", "amount": 12000, "contactId": "c131",
  "description": "Paper and inks", "categoryId": "stock" }

{ "kind": "expense", "date": "2026-11-07", "amount": 12000, "contactId": "c131",
  "parts": [ { "categoryId": "stock", "amount": 9000 }, { "categoryId": "shipping", "amount": 2000 },
             { "categoryId": "packaging", "amount": 1000 } ] }
```

`date` and `amount` are required. `categoryId` may be `null` (uncategorised).
Parts that don't add up: `{ "field": "parts", "message": "Split parts must add
up to the total", "remaining": 1000 }`.

**Sale**

```json
{ "kind": "sale", "date": "2026-11-07", "channel": "market", "contactId": null,
  "lines": [ { "productId": "speckled-mug", "quantity": 2 },
             { "productId": "print-a4" },
             { "description": "Gift wrap", "quantity": 1, "unitPrice": 300 } ] }
```

`date`, `channel` and at least one line are required. A line names a
`productId` (its `description` and `unitPrice` default to the product's) or a
`description` and `unitPrice`. `quantity` defaults to 1. `categoryId` defaults
to `product-sales`. A line's `amount`, if sent, must equal
quantity × unit price; the sale's `amount`, if sent, must equal the sum of its
lines (`"Lines must add up to the total"`). A free-form line may carry a
`unitCost`.

**Refund**

```json
{ "kind": "refund", "date": "2026-11-09", "refundOf": "t04162",
  "lines": [ { "saleLineId": "t04162.1", "quantity": 1 } ] }

{ "kind": "refund", "date": "2026-11-09", "refundOf": "t04162",
  "lines": [ { "saleLineId": "t04162.1", "quantity": 0, "amount": 1000 } ] }

{ "kind": "refund", "date": "2026-11-09", "refundOf": "t04162", "amount": 500 }
```

A linked line refunds `quantity` items at the sale's unit price, or an explicit
`amount` (a partial refund, `quantity` 0 allowed). An `amount` with no lines is a
lump refund against the sale. `channel`, `contactId` and `categoryId` default to
the sale's. A refund can't be dated before its sale. More than is left to refund
on a line (by quantity or by amount) or on the sale as a whole is refused:
`"Refund exceeds the original sale"`, at `lines[i].quantity`, `lines[i].amount`
or `amount`, with `remaining`.

A refund without `refundOf` is free-standing: free-form or product lines as for
a sale, or just an `amount`.

**Every kind**: `description` (text, up to 200 characters, default `""`) and
`contactId` (or `null`) are optional. A category must exist, be of the right kind
(`"Choose an expense category"` / `"Choose an income category"`) and not be
archived (`"Category was archived"`). Amounts and prices are positive whole
cents; quantities positive whole numbers.

### `PATCH /api/transactions/:id`

Send only the fields that change; the result is validated as a whole, exactly
like a create. Returns `200 { "transaction": <detail>, "changeId" }`. (`PUT`
does the same.)

- Any of `date`, `description`, `contactId`, `categoryId`, `channel`.
- An expense: `amount`; `categoryId` replaces a split; `parts` makes one.
- `amount` on a sale or refund with exactly one line changes that line (for a
  sale, its unit price; the amount must divide evenly by the quantity).
- `lines` replaces all the lines. Send a kept line's `id` to keep it.
- A sale that has refunds can't change its lines or amount. The kind and a
  refund's `refundOf` never change. Keeping a category that has since been
  archived is allowed; choosing it is not.

### `DELETE /api/transactions/:id`

`200 { "deleted": "t04163", "changeId": "ch13" }`. A sale with refunds is `409`:
delete its refunds first.

### `POST /api/transactions/bulk`

Change many transactions at once, chosen by ids or by a filter ("everything
matching").

```json
→ { "action": "categorise", "categoryId": "other", "where": "category=none", "expectedCount": 36 }
→ { "action": "set-contact", "contactId": "c014", "where": { "ids": ["t00412", "t00415"] } }
→ { "action": "delete", "where": { "kind": "expense", "q": "costco", "except": ["t01200"] } }

200 { "action": "categorise", "matched": 36, "count": 36,
      "ids": ["t04120", "…"], "skipped": [], "changeId": "ch14" }
```

- `where` is the filter, as a query string or as an object of the same keys
  (values as strings, comma lists or arrays). It must name something: `{}` is
  refused.
- `categorise` takes `categoryId` (`null` = uncategorise). It sets the one
  category, replacing any split. An expense category applies to expenses only,
  an income category to sales and refunds; others are listed in `skipped` with
  `reason: "kind"`. An archived category is refused.
- `set-contact` takes `contactId` (or `null`).
- `delete` skips a sale whose refunds aren't deleted with it (`reason:
  "has-refunds"`).
- `expectedCount` (optional): if a different number matches now, nothing
  changes and the answer is `409` with the current `count`.
- `count` and `ids` are what actually changed (already-equal ones are left
  alone). `changeId` is `null` when nothing changed.

### `POST /api/changes/:changeId/undo`

Every write that returns a `changeId` (create, update, delete, bulk) can be
undone: it puts each record back exactly as it was (a deletion is restored with
its id, a creation is removed).

```json
200 { "undone": "ch14", "count": 36, "ids": ["t04120", "…"] }
```

`409` if it was already undone, if any of its records changed since, or if
undoing would break a refund recorded since.

---

## Totals

### `GET /api/summary?<filter>`

```json
{ "count": 1284, "in": 4821000, "out": 3190550, "net": 1630450 }
```

`in` is money in (sales), `out` money out (refunds and expenses), `net = in −
out`. For a selection, filter by `ids` (or by the selection's filter plus
`except`). Query strings of several thousand ids are accepted.

### `GET /api/aggregates/periods?<filter>&by=`

`by`: `day`, `week` (Monday to Sunday), `month` (default), `quarter`. Every
period overlapping the filter's date range is returned, empty ones included,
oldest first. With no `from`/`to`, the range runs from the first transaction to
today.

```json
{ "by": "month", "from": "2026-01-01", "to": "2026-11-07",
  "periods": [
    { "period": "2026-11", "start": "2026-11-01", "end": "2026-11-30",
      "from": "2026-11-01", "to": "2026-11-07", "partial": true,
      "revenue":  { "amount": 305900, "count": 53 },
      "sales":    { "amount": 317700, "count": 51 },
      "refunds":  { "amount": 11800, "count": 2 },
      "expenses": { "amount": 297585, "count": 16 },
      "net":      { "amount": 8315, "count": 69 },
      "cogs": 99055,
      "grossMargin": { "amount": 206845, "percent": 67.6, "count": 53 } }
  ],
  "total": { "revenue": { … }, "…": "same measures over the whole range" } }
```

- `period` is `2026-11-07` (day), the Monday `2026-11-02` (week), `2026-11`
  (month) or `2026-Q4` (quarter). `start`/`end` are the whole period;
  `from`/`to` are the part inside the filter's range: **use `from`/`to` to open
  its records.** `partial` is true when the period ends after today.
- `revenue` = sales − refunds; `expenses`; `net` = revenue − expenses (net
  profit); `sales.count` is the number of sales. Each `count` is the number of
  transactions behind the figure.
- `cogs` is the cost of the goods sold: quantity × unit cost over the sales'
  lines, less refunded items. `grossMargin.amount` = revenue − cogs; `percent`
  is that over revenue, one decimal, `null` when revenue is 0.
- To open a figure's records, add the period's `from`/`to` and the kinds:
  revenue and gross margin → `kind=sale,refund` (summary `net`); sales →
  `kind=sale` (`in`); refunds → `kind=refund` (`out`); expenses →
  `kind=expense` (`out`); net → no kind (`net`). If the filter already has
  `kind`, use the kinds both allow.

### `GET /api/aggregates/categories?<filter>&side=`

`side`: `expense` (default) or `income`. Largest first.

```json
{ "side": "expense",
  "categories": [ { "categoryId": "rent", "amount": 234500, "count": 3 },
                  { "categoryId": null, "amount": 7779, "count": 3 } ],
  "total": { "amount": 297585, "count": 16 } }
```

Expense amounts are positive; income amounts are sales − refunds. A split
expense counts each part in its own category, so it adds to the `count` of
each. `categoryId: null` is uncategorised. Opening one: add
`category=<id or none>` and `kind=expense` (summary `out`) or
`kind=sale,refund` (summary `net`).

### `GET /api/aggregates/products?<filter>`

Sales and refunds, by product, largest revenue first. `productId: null` gathers
free-form lines.

```json
{ "products": [ { "productId": "speckled-mug", "units": 412, "revenue": 1302400, "cost": 391400,
                  "margin": 911000, "marginPercent": 69.9, "count": 377 } ] }
```

`units` and `revenue` are net of refunds. Opening one: add
`product=<id or none>` (summary `net`).

### `GET /api/aggregates/contacts?<filter>&side=&limit=`

`side`: `income` (default; customers: sales − refunds) or `expense` (vendors).
Largest first; `limit` keeps the top few. `total` covers all of them.

```json
{ "side": "income",
  "contacts": [ { "contactId": "c037", "contactName": "Fern & Finch", "amount": 312000, "count": 6 } ],
  "total": { "amount": 9120000, "count": 2950 } }
```

`contactId: null` gathers transactions with no contact (most market sales), and is
ranked like any other entry. Opening one: add
`contact=<id or none>` and the side's kinds.

### `GET /api/aggregates/amounts?<filter>`

How the transactions are spread by amount, under every filter **except**
`min`/`max`. Buckets are fixed and grow with the amount.

```json
{ "buckets": [ { "min": 0, "max": 500, "count": 0 }, { "min": 500, "max": 1000, "count": 34 },
               "…", { "min": 500000, "max": null, "count": 0 } ],
  "count": 1646, "lowest": 500, "highest": 225000 }
```

A bucket holds totals from `min` up to, not including, `max` (`null` = no top).
Edges, in cents: 0, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000,
30000, 50000, 75000, 100000, 150000, 200000, 300000, 500000. `lowest` and
`highest` are `null` when nothing matches.

### `GET /api/aggregates/category-counts?<filter>`

How many transactions each category would have under every filter **except**
`category`: one entry per category that isn't archived, plus archived ones that
have any, plus `null` (uncategorised).

```json
{ "categories": [ { "categoryId": "product-sales", "count": 1048 }, { "categoryId": null, "count": 23 } ],
  "total": 1646 }
```

A split expense counts once in each of its parts' categories.

---

## Budgets

A monthly amount for an expense category. An amount set for a month holds for
that month and every later one, until a later month sets another.

### `GET /api/budgets?month=YYYY-MM&<filter>`

`month` defaults to today's. The month replaces any `from`/`to`; other filter
parameters narrow what counts as spent.

```json
{ "month": "2026-11", "from": "2026-11-01", "to": "2026-11-30",
  "budgets": [ { "categoryId": "advertising", "amount": 15000, "spent": 18500, "remaining": -3500, "count": 1 } ] }
```

Only categories with a budget that month are listed. `spent` is the month's
expenses in the category (split parts included); `remaining = amount − spent`,
negative when over. Opening it: `from`/`to` of the month, `category=<id>`,
`kind=expense` (summary `out`).

### `PUT /api/budgets/:month/:categoryId`

```json
→ { "amount": 3000 }
200 { "month": "2026-11", "categoryId": "software", "amount": 3000, "spent": 5340, "remaining": -2340, "count": 2 }
```

`amount` is positive cents, or `null` to stop budgeting the category from that
month on. The category must be an expense category and not archived.

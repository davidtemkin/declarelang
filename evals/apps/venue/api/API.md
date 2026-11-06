# The Venue API

A local HTTP service holding the production, the hall, the seats, the accounts and the
payments. **You do not write or modify this server** — it is given, it is running, and it
is the only backend that exists.

It answers at `http://127.0.0.1:8350`.

Prices are integer cents. Every refusal is JSON with an `error` code and a one-sentence
`message` meant for the person; show the `message` as it is.

**Cross-origin, with a cookie.** The service answers any origin, echoing it in
`Access-Control-Allow-Origin` with `Access-Control-Allow-Credentials: true`. The session is
an `HttpOnly`, `SameSite=Lax` cookie named `vn_session`. A request that should carry the
session must be made with credentials included; one made without them is signed out. The
cookie is same-site, so serve the app from `127.0.0.1` too (any port), not `localhost`.

---

## The production

### `GET /api/production`

```json
{ "title": "The Marriage of Figaro", "hall": "Grand Hall", "runningTime": "3h 10m",
  "performances": [
    { "id": "p01", "startsAt": "2026-11-13T19:30", "doorsAt": "2026-11-13T18:45",
      "priceFromCents": 3500, "seatsLeft": 340, "seats": 648 } ] }
```

Twenty performances, ordered by start time. Times are the hall's local time, as printed
on a ticket. How full each is varies a great deal.

### `GET /api/performances/:id/seats`

The seat map for one performance: four sections, front to back, each with its price, its
booking fee and its rows, each row with its seats. Rows are listed front to back and seats
left to right as seen from the stage. A seat's `status` is `"available"` or `"sold"`. Seat
ids are stable (`ORCH-C-14` = Orchestra, row C, seat 14); row letters skip I and O.

```json
{ "performanceId": "p01",
  "sections": [ { "key": "ORCH", "name": "Orchestra", "priceCents": 8000, "feeCents": 700,
                  "rows": [ { "name": "A",
                              "seats": [ { "id": "ORCH-A-1", "number": 1, "status": "available" } ] } ] } ] }
```

The sections are Orchestra, Grand Tier, Dress Circle and Balcony.

### `GET /api/events?performance=:id`

A server-sent event stream of other people buying seats in that performance.

```
event: seatchanged
data: {"seatId":"ORCH-A-2","status":"sold"}
```

A seat named by `seatchanged` is no longer available to anyone.

## Accounts

### `POST /api/session`
`{ "email", "password" }` →
- `200 { name, email }`, and sets the cookie;
- `401 { error: "bad_credentials", message: "That email and password don't match." }`.

Two accounts exist: `ada@example.com`, password `correct horse battery`, and `a@a.co`, password
`pass`. Each has the same saved billing address, a Visa ending 4242, and a Mastercard ending
4444 that expired in August 2026.

### `DELETE /api/session`
Signs out. `204`.

### `GET /api/me`
`401 { error: "signed_out", message }`, or:

```json
{ "name": "Ada Lovelace", "email": "ada@example.com",
  "billing": { "line1": "12 Marchmont Street", "line2": null, "city": "London",
               "postalCode": "WC1N 1AB", "country": "GB" },
  "cards": [ { "id": "card_1", "brand": "visa", "last4": "4242", "expMonth": 4, "expYear": 2028 },
             { "id": "card_2", "brand": "mastercard", "last4": "4444", "expMonth": 8, "expYear": 2026 } ] }
```

## Paying

### `POST /api/orders`
Takes about a second and a half.

```json
→ { "performanceId": "p01", "seatIds": ["ORCH-C-2", "ORCH-C-3"],
    "email": "ada@example.com",
    "payment": { "savedCardId": "card_1", "cvc": "123" }
            /* or */
            { "card": { "number": "4242424242424242", "expMonth": 4, "expYear": 2028,
                        "cvc": "123", "name": "A Lovelace" },
              "billing": { "line1", "line2", "city", "postalCode", "country" } } }
```

- `201 { code: "VN-48K2QX", email, totalCents, brand, last4, performanceId,
         tickets: [ { seatId, section, row, number, barcode: "VN48K2QX-01" } ] }`
- `402 { error: "card_declined" | "insufficient_funds", message }`
- `422 { error: "invalid", field: "cvc" | "postalCode" | "number" | "expiry" | "email", message }`
- `409 { error: "unavailable", conflicts: ["ORCH-C-3"], message }` — nothing is charged.
- `401 { error: "signed_out", message }` — a saved card was named without a session.
- `400 { error: "bad_request", message }` — the order is missing something the form should
  have required.

`brand` is `visa`, `mastercard`, `amex` or `discover`; `totalCents` is the seats' prices
and booking fees together.

Countries are `US`, `CA` and `GB`. Cards the service knows (any future expiry, any code of
the right length, unless noted):

| number | outcome |
|---|---|
| `4242 4242 4242 4242` | accepted (Visa) |
| `5555 5555 5555 4444` | accepted (Mastercard) |
| `3782 822463 10005` | accepted (American Express, four-digit code) |
| `4000 0000 0000 0002` | declined |
| `4000 0000 0000 9995` | insufficient funds |
| `4000 0000 0000 0127` | `422`, field `cvc` |
| any other valid number | accepted |

A billing postal code the bank doesn't hold for the card — `10001` in the US, `M5V 2T6` in
Canada, `SW1A 1AA` in the UK — is answered `422`, field `postalCode`. Saved `card_1` is
declined when its code is `000`.

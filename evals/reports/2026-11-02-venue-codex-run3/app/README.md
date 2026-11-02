# The Venue

A Declare ticketing app for The Marriage of Figaro, using the separate service at
`http://127.0.0.1:8350`. No service code is included or modified.

## Run

From the Declare distribution root:

```sh
npm install
npm --prefix my-apps/venue ci
npm start
```

Open **http://127.0.0.1:8200/my-apps/venue/venue.declare**. Use `127.0.0.1`, since the
service's session cookie is same-site. `venue.declare` is the entry point.

## Organisation

- `venue.declare`: service connections, current step, selection, persistent chrome.
- `model.declare`: schemas, seat inventory queries/writes, editable payment defaults.
- `performances.declare`: programme and the twenty performances.
- `hall.declare`: curved seat map, full-house overview, enlarged touch seat picker.
- `checkout.declare`: native fields, sign-in, saved cards, payment form, order summary.
- `tickets.declare`: individual tickets with genuine QR encodings of service barcodes.
- `style.declare`: typography and the shared palette.
- `helpers.ts`: pure formatting, card-validator adapters, postal checks, QR generation.

The server owns inventory, receipts, accounts and the session. The app stores no service
data in localStorage or another reload-persistent cache. SSE updates inventory in place.
The payment draft follows account defaults until the buyer edits a field.

`ServiceForm` is a small workaround for a source-watcher timing issue observed in this
distribution: it uses `DataSource.fetch()`'s documented completion promise while retaining
Declare's `Form` validation, field membership, refusal mapping and focus APIs. It guards
the entire request against repeated submission. The platform itself is unmodified.

## Checks

From the distribution root, with the service and dev server running:

```sh
node tools/format.mjs --check my-apps/venue/*.declare
node tools/verify.mjs my-apps/venue/venue.declare --phone --desk
node tools/verify.mjs my-apps/venue/venue.declare --no-boot \
  --url http://127.0.0.1:8200/my-apps/venue/venue.declare \
  --assert my-apps/venue/tests/member-phone.mjs
```

Other retained assertion flows: `guest.mjs`, `keyboard.mjs`, `live-seats.mjs`,
`conflict.mjs`, `payment-errors.mjs`, and `usability.mjs`. They cover guest and saved-card
purchases, password visibility and service errors, preserved drafts, expired cards,
card formatting and validation, single submission, bank refusals, cookie reload/sign-out,
real SSE sales, a real 409 race, ticket paging, scrolling, resizing and touch input.

These are **live-service checks**: successful purchases sell seats. Each flow chooses
currently available seats, though repeating them enough times can exhaust its chosen row.
`conflict.mjs` blocks only the test browser's event stream to reproduce stale inventory;
it does not change the service. Browser captures are in `tests/`.

Touch checks use a 390 × 844 viewport. Native phone keyboard behaviour and autofill cannot
be proven by desktop emulation: fields declare their purposes and Enter navigation, and
the app's height follows `hostHeight - keyboardHeight` to keep its payment bar in reach.
The deliberately ivory palette remains the same under a dark system preference.

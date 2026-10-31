# The Venue

A Declare app for the supplied ticketing service. Run from the distribution root:

```sh
npm install
npm start
```

Open http://127.0.0.1:8200/my-apps/venue/venue.declare . The service must already be running at http://127.0.0.1:8350 . Use 127.0.0.1 for the session cookie.

`venue.declare` holds typed resources, selection, checkout draft, forms and the view classes. `helpers.ts` contains pure formatting, validation and QR encoding using the `qrcode` package. `browser.ts` associates the native login inputs with a browser credential form for password managers. No server or service persistence is implemented here.

The phone interface shows a complete hall overview and then section/row navigation with 44px seat targets. Desktop seats form centered, curved rows. Live events update the source hall and remove lost selections. Native Declare forms provide validation timing, field refusals, focus and in-flight submission protection.

Verification scripts use the live service and select seats that are available at run time. Successful tests buy seats and therefore change availability:

```sh
node tools/verify.mjs my-apps/venue/venue.declare --phone --desk
node tools/verify.mjs my-apps/venue/venue.declare --url http://127.0.0.1:8200/my-apps/venue/venue.declare --no-boot --assert my-apps/venue/flow.mjs
```

Other assertions: `account-flow.mjs` (phone sign-in, preserved draft, expired cards, saved-card decline, reload session and sign-out), `validation-flow.mjs` (local rejection and focus), `live-flow.mjs` (another buyer purchases a selected seat).

Headless Chrome verifies touch input and native field semantics; an actual phone keyboard and browser autofill have not been manually exercised.

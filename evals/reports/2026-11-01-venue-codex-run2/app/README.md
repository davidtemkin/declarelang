# The Venue

Run `npm start` from the Declare distribution and open:
http://127.0.0.1:8200/my-apps/venue/venue.declare

The supplied service must be running at `http://127.0.0.1:8350`. Use `127.0.0.1`, not `localhost`, for the session cookie.

- `venue.declare`: typed service data, seat selection, live seat events, room views and tickets.
- `forms.declare`: sign-in, checkout, native autofill fields and validation.
- `helpers.ts`: pure formatting/validation functions and the `qrcode` library adapter.
- `PLAN.md`: structure and design decisions.

## Read-only checks

From the distribution root:

```sh
node tools/verify.mjs my-apps/venue/venue.declare --phone --desk
node tools/verify.mjs my-apps/venue/venue.declare --no-boot --url http://127.0.0.1:8200/my-apps/venue/venue.declare --assert my-apps/venue/tests/phone.mjs
node tools/verify.mjs my-apps/venue/venue.declare --no-boot --url http://127.0.0.1:8200/my-apps/venue/venue.declare --assert my-apps/venue/tests/recovery.mjs
node tools/verify.mjs my-apps/venue/venue.declare --no-boot --url http://127.0.0.1:8200/my-apps/venue/venue.declare --assert my-apps/venue/tests/recovery-phone.mjs
```

These tests do not submit payment or sign-in. Recovery checks use a profile GET fixture and inject refusal and ticket preview data locally. Live payment processing, cookie persistence after successful sign-in, and bank responses have not been verified end to end. The app uses the supplied API for those operations. Native browser autofill and an actual phone keyboard require device testing.

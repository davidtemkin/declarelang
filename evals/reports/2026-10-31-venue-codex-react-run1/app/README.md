# The Venue

A React ticket-booking application for the supplied Grand Hall service.

## Run locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The existing API must be running at
http://127.0.0.1:8351. Use `127.0.0.1`, rather than `localhost`, so the service's
SameSite session cookie works. No application server or API changes are required.

```sh
npm run build
npm test
node tests/browser.mjs
```

The browser integration check uses headless Google Chrome on macOS and the supplied
test accounts and card numbers. It buys two test seats through the running service.
Change its `executablePath` if Chrome is installed elsewhere.

## Implementation

- React state keeps selections and checkout input intact across the sign-in dialog.
- Credentialed, uncached fetches use the service as the source of truth. No account,
  seat, or payment data is stored in local storage.
- Server-sent events update the hall and remove unavailable selections. Reconnecting
  refreshes the full map to reconcile events missed during a connection interruption.
- The desktop hall offers individual accessible seat buttons. At phone widths the
  overview is noninteractive; section and row selectors expose exact seats in a
  separate grid with touch targets at least 44px wide.
- Client validation runs on blur or submission. Server field errors focus the relevant
  input. A synchronous submission lock prevents duplicate requests.
- Returned ticket codes are rendered as real Code 128 barcodes with JsBarcode.

Browser autofill and physical mobile keyboard behavior use standard HTML autocomplete
and input-mode attributes; headless emulation cannot verify the OS integrations.

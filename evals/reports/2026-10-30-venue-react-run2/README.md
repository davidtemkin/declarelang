# The Venue

Booking for *The Marriage of Figaro* in the Grand Hall: pick a performance, choose seats,
pay, and carry tickets to the door. React + TypeScript, built with Vite.

The data service (see `../task/api/API.md`) must be running on `http://127.0.0.1:8351`.
Its session cookie is `SameSite=Lax`, so the app is served from `127.0.0.1`, never `localhost`.

```sh
npm install
npm run dev        # http://127.0.0.1:5178
npm run build      # type-checks, then builds to dist/
npm run preview    # serves the build on http://127.0.0.1:4173
```

Set `VITE_API_BASE` to point at the service elsewhere.

## Layout

- `src/api` — the service client, its types, and TanStack Query hooks (including the live
  seat feed, which keeps the cached seat map true).
- `src/selection.tsx` — the person's chosen seats, notices about seats lost to others, and
  the completed order.
- `src/performances` — the list of performances, and the route that owns one performance's
  seat map and live feed.
- `src/hall` — the seat map: `layout.ts` lays rows out as arcs around the stage; on narrow
  screens seats are drawn thumb-sized in a pannable view with a minimap to steer by.
- `src/checkout` — the payment form (React Hook Form; card checks via `card-validator`).
- `src/account` — sign in / out in a dialog over whatever page is open.
- `src/tickets` — the tickets, one at a time.

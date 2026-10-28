# The Venue

Tickets for *The Marriage of Figaro* in the Grand Hall: pick a performance, choose seats,
pay, and get tickets to show at the door.

```sh
npm install
npm run dev      # http://127.0.0.1:5173
```

The Venue service must already be running on `http://127.0.0.1:8351` (see `../task/api/API.md`).
Serve the app from `127.0.0.1`, not `localhost`: the session cookie is `SameSite=Lax`.

`npm run build` type-checks and builds; `npm run lint` and `npm run format` keep the code tidy.

## Layout

- `src/api.ts` — the service client and its types. Every refusal is an `ApiError` carrying the
  service's own sentence.
- `src/queries.ts` — TanStack Query hooks for the production, seat maps and the account.
- `src/booking.tsx` — what the person is in the middle of (performance, seats, checkout draft,
  order). It sits above the routes, so signing in or going back to the hall loses nothing.
- `src/hall/` — the seat map. `layout.ts` lays the rows out as arcs facing the stage;
  `LiveSeats.tsx` keeps the map true from the service's event stream and takes any seat
  someone else buys out of the person's choice; `SeatMap.tsx` draws it, with tap-to-zoom on
  phones and arrow-key navigation.
- `src/checkout/` — card formatting and validation (`card-validator`), and form fields.
- `src/routes/` — the pages: performances, hall, checkout, tickets.
- `src/shell/` — header, sign-in dialog and a live-region announcer.

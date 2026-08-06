# The Venue API

A local HTTP service holding the season, the halls, and the seats. **You do not
write or modify this server** — it is given, it is running, and it is the only
backend that exists. Start it (or check it is up) with:

```
node evals/apps/venue/api/server.mjs        # http://127.0.0.1:8310
```

Everything it returns is deterministic: the same request gives the same bytes on
every run. It permits cross-origin requests from anywhere, so a page served from
any origin can read and write it directly.

Base URL: `http://127.0.0.1:8310`

---

## `GET /api/performances`

The whole season in one response — about 4,000 performances, ordered by start
time. There is no paging; the list arrives complete and is meant to be held in
memory.

Optional query parameters, both of which the server applies for you:
`?search=` matches on title, case-insensitive, substring;
`?hall=grand|playhouse|studio` restricts to one hall.

```json
{
  "performances": [
    {
      "id": "p0641",
      "title": "Raymonda",
      "hallId": "studio",
      "hall": "Studio",
      "startsAt": "2026-09-01T20:00:00.000Z",
      "priceFrom": 35
    }
  ]
}
```

## `GET /api/performances/:id`

One performance, same shape as a list entry. `404` if there is no such id.

## `GET /api/halls`

The three halls and their sections, independent of any performance.

```json
{ "halls": [ { "id": "grand", "name": "Grand Hall",
               "sections": [ { "key": "ORCH", "name": "Orchestra",
                               "rows": 18, "seats": 22, "price": 145 } ] } ] }
```

## `GET /api/performances/:id/seats`

The seat map for one performance: sections, each with rows, each with seats. A
seat's `status` is `"available"` or `"sold"`. Seat ids are stable and unique
within a performance (`ORCH-C-14` = Orchestra, row C, seat 14). Row letters skip
I and O, as real houses do.

```json
{
  "performanceId": "p0001",
  "hall": "Playhouse",
  "sections": [
    {
      "key": "ORCH", "name": "Orchestra", "price": 80,
      "rows": [
        { "name": "A", "seats": [ { "id": "ORCH-A-1", "number": 1, "status": "available" } ] }
      ]
    }
  ]
}
```

Halls run from 112 seats (Studio) to 702 (Grand Hall). How full a house is varies
across the season — some performances are nearly empty, some nearly sold out.

## `POST /api/holds`

Claim seats before booking them.

```json
→ { "performanceId": "p0001", "seatIds": ["ORCH-C-2", "ORCH-C-3"] }

200 { "performanceId": "p0001", "held": ["ORCH-C-2", "ORCH-C-3"], "expiresInSeconds": 600 }

409 { "error": "seats unavailable",
      "conflicts": ["ORCH-C-3"],
      "message": "Someone else took ORCH-C-3 first." }
```

**A hold can fail.** Between the moment a seat map is fetched and the moment a
hold is sent, someone else may have taken a seat — the server answers `409` with
the seats that were lost in `conflicts` and a sentence in `message`. This is a
normal outcome, not an exceptional one, and it happens often enough that you
will see it.

## `POST /api/bookings`

Turn held seats into a booking.

```json
→ { "performanceId": "p0001", "seatIds": ["ORCH-C-2"],
    "name": "Ada Lovelace", "email": "ada@example.com" }

201 { "code": "BK-0001", "performanceId": "p0001", "seats": ["ORCH-C-2"],
      "total": 80, "name": "Ada Lovelace", "email": "ada@example.com" }

400 { "error": "email invalid", "message": "That email address doesn't look right." }
409 { "error": "seats unavailable", "conflicts": ["ORCH-C-2"],
      "message": "Someone else took ORCH-C-2 first." }
```

The server rejects a booking with no seats, no name, or a malformed email, each
with its own `message`. It never charges anything and never asks for payment
details.

## `GET /api/events?performance=:id`

A server-sent event stream of other people buying seats in that performance,
about one every three seconds.

```
event: open
data: {"performance":"p0001"}

event: seatchanged
data: {"seatId":"ORCH-A-2","status":"sold"}
```

Two named event types: `open` once on connect, then `seatchanged` repeatedly. A
seat named by `seatchanged` is no longer available to anyone.

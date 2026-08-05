# The Cadence API

A local HTTP service holding the training history. **You do not write or modify
this server** — it is given, it is running, and it is the only backend that
exists.

```
node evals/apps/cadence/api/server.mjs        # http://127.0.0.1:8320
```

Deterministic: the same request returns the same bytes on every run. It permits
cross-origin requests from anywhere.

Base URL: `http://127.0.0.1:8320`

---

## `GET /api/today`

```json
{ "today": "2026-08-05" }
```

**The service's clock is frozen at this date, and it is the one to trust.** Ask
it rather than the machine's clock, so "this week" and "the streak" mean the
same thing every time the app runs.

## `GET /api/sessions`

The whole history — about 250 sessions across fourteen months — newest first.
No paging; it is meant to be held in memory.

Optional filters, applied by the server: `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD`,
`?sport=run|ride|lift|swim`.

```json
{
  "sessions": [
    {
      "id": "s0248",
      "date": "2026-08-04",
      "sport": "lift",
      "minutes": 52,
      "distanceKm": null,
      "effort": 3,
      "heartAvg": 112,
      "note": null
    }
  ]
}
```

`distanceKm` is `null` for lifting. `note` is `null` more often than not.
`effort` runs 1–10. Some weeks are empty, and there is a fortnight with nothing
in it at all.

## `GET /api/sessions/:id`

One session, same shape. `404` if there is no such id.

## `GET /api/live`

The session in progress, if there is one. Its elapsed time and heart rate
advance while it runs, so re-reading gives fresh numbers.

```json
{ "session": { "id": "live", "date": "2026-08-05", "sport": "run",
               "startedSecondsAgo": 412, "minutes": 6,
               "distanceKm": 1.1, "heartNow": 148, "effort": 6 } }
```

## `POST /api/sessions`

Record a session that already happened.

```json
→ { "sport": "ride", "date": "2026-08-04", "minutes": 75,
    "distanceKm": 31.5, "effort": 6, "note": "Windy on the flats." }

201 { "id": "s0249", … the stored session … }

400 { "error": "invalid session",
      "problems": ["a session cannot be in the future"],
      "message": "a session cannot be in the future" }
```

`sport`, `date` and `minutes` are required. `effort` defaults to 5.
`distanceKm`, `heartAvg` and `note` may be omitted or null. The server refuses a
future date, an unknown sport, a malformed date, a non-positive duration, and an
effort outside 1–10 — each with a sentence in `message` and the full list in
`problems`.

## `PUT /api/sessions/:id`

Correct one. Send only the fields that change; the rest are left alone. Returns
the updated session, or `404`.

## `DELETE /api/sessions/:id`

Remove one. Returns `{ "deleted": "s0249" }`, or `404`.

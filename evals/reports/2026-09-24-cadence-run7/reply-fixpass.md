Cadence now uses `DataSource` for everything it asks of the service. The file has no `fetch(API…)` or `.then(` left; the only `fetch()` calls are `DataSource.fetch()`. The app looks and behaves as before. It passes the checker through rung 4, and I ran every path in headless Chrome. The service is back to its original 248 sessions.

## What changed

- **First load:** `todaySrc` and `db` are DataSources with schemas, fetched in `onInit`. The sessions source is also the app's copy of the history, since a DataSource is a Dataset and accepts `insert`, `set` and `removeAt`. The hand-set `loaded` flag is gone: `ready` now comes from the two sources' `.loaded`. The one-time setup of the year view runs from `onChange` when `ready` becomes true.
- **Live session:** the URL is now fixed, without the fake `?at=` parameter. The existing one-second `Time` calls `liveSrc.fetch()` every fifth second, skipping if a request is still in flight. The log showed one GET every 5 seconds, and the clock still keeps time between reads.
- **Adding and correcting:** a single `saveSrc`. Its `method` is `POST` for a new session and `PUT` for a correction, and its `url` and `body` come from the draft; Save just calls `fetch()`. `onLoad` writes the stored session into `db`.
- **Deleting:** `delSrc`, pointed at the open session. A 404 (session already gone) still removes it from the screen.
- **Saving state and errors:** the "Saving…" state comes from the sources' `loading`. The error line comes from `failed`, `statusCode` and `errorBody.message`. Opening the sheet or changing sport or date calls `saveSrc.clear()` to remove an old refusal.

**Tested:** first load, live refresh over 12 seconds, adding by touch, a correction, a refusal (it shows the service's own message, "a session cannot be in the future"), and a delete that met a 404.

## What I looked up

This time I read the full reference entries (`declare-help DataSource.<member> --all`) for `method`, `body`, `fetch`, `statusCode`, `errorBody`, `onLoad`, `auto`, `failed`, `error`, `headers`, `url` and `clear`. They settled most of it:
- A POST or PUT source "stays a source": the response lands in `value`, just as a GET's would.
- `body` is JSON-encoded, the content-type header is set for you, and changing `body` sends nothing until `fetch()`.
- `statusCode` is `0` when no reply came back, which separates "try again" from "the service refused".
- `errorBody` is the server's parsed JSON, so its `message` is available.
- Failures don't fire `onLoad`; `failed` and `error` are set instead.
- `auto` is meant for a URL that changes, not for refreshing the same one.

For reacting to a failure, I relied on the guide's statement (`14-motion-and-states.md`) that `trackChanges` can name facts a node carries, such as `loaded`.

## What the documentation didn't answer

- **Whether a DataSource may act as the app's working copy.** The docs say it extends `Dataset`, but none of them shows `insert` or `removeAt` on a loaded source, or says what a later `fetch()` would do to those edits. It works, and this app never re-fetches the history. The tracker example copies into a separate Dataset instead, possibly for this reason.
- **How to refresh on a timer.** Nothing covers re-reading the same URL at an interval. `auto` explicitly isn't for it, and "nothing waits" argues against polling. A timed `fetch()` from `Time.onTick` is my own choice, not a documented pattern.
- **Timing within one handler.** If a handler changes something the `url` or `body` depends on and then calls `fetch()`, does the request use the old values or the new ones? The docs say a handler reads "the world before your writes land", which suggests old. I avoided the question: the draft and the selected session are always settled before Save or Delete is pressed. I didn't test the other case.
- **What `fetch()`'s Promise does on failure.** The docs don't say whether it rejects or resolves. I don't depend on it; everything goes through the flags and `onLoad`.
- **How to react to a failure.** `onLoad` has no failure counterpart. For the 404 case I used `trackChanges` on `failed`. It works in testing, since each `fetch()` clears `failed` first, but the docs don't describe this for DataSource. The checker also required `trackChanges = { ["failed"] }` in braces on a DataSource, while on the App it accepted a plain list. I don't know why.
- **Why only 220 of 249 constraints are "statically wired".** The checker reports this and I haven't looked into which ones or why. It was 214 of 239 before this change.

The server on port 8200 still serves `/Users/temkin/Code/Declare`, not this folder. To use the brief's URL, run `npm start` from `declarelang/`.
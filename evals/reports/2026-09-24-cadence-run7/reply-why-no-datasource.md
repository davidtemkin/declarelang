The split came from two different kinds of data, but partly also from what I did and didn't look up.

## The live session: a DataSource

It's a value the screen reads continuously, and that is what the docs say a DataSource is for:

- **`docs/declare.md` §7:** "A `DataSource` is a remote resource whose lifecycle is reactive state… Screens then derive from the resource … rather than being toggled."
- **`docs/guide/09-data.md`, "Two kinds of source":** the weather example uses `url = { … ${zip} … }` with `auto = true`. There, a change to the URL is what triggers a refetch. I copied that shape.
- **§5 of declare.md**, on handlers: "a value the screen derives from is a `DataSource`."

So `live` is `{ app.liveSrc.value?.session ?? null }`, and the band, the chart outline and the clock all follow from it.

One weak spot: to make it refetch, I put `Math.floor(app.tick.now / 5000)` into the URL. That is timer-driven re-requesting. The docs' "nothing waits" rule (declare.md §1, point 7) is aimed at polling for a *state*, and the service does say "re-reading gives fresh numbers." Even so, I didn't find any sanctioned idiom for periodic refresh. I chose that approach; the docs don't endorse it.

## Adding, editing and deleting: `fetch()` in handlers

- **declare.md §5** explicitly allows this: handler code "is ordinary TypeScript: locals, loops, `switch`, the host's `fetch`/`URL`/timers — and genuinely dynamic work belongs there." It also says a handler isn't `async`, which is why I used `.then` chains.
- **`node tools/declare-help.mjs fetch`** answered: "a shared function, callable in any { } body."
- **I grepped `apps/` for `POST` and `method =`** and found no example of a write going through a DataSource.

What I did *not* do: `declare-help DataSource` lists `method` (including POST, PUT and DELETE), `body`, `statusCode` and `errorBody`. 09-data also says the request's parts are "ordinary reactive attributes." But I never read the full entries for `DataSource.method` or `DataSource.body`. My `--all` query printed only the summary and the GET example. So my conclusion that a DataSource suits a resource you read, not a one-off command whose response you merge into `db`, is my own inference, not something I confirmed. `errorBody` suggests a DataSource might have handled the service's 400 `message` cleanly.

## The first load: `fetch()` too, and the weakest of the three

My model here was `apps/tracker/tracker.declare`, around lines 522–540. It declares a separate `db` Dataset, calls `src.fetch().then(…)` in `onInit`, and moves the result into `db` with `db.set(["sessions"], …)`. I wanted the same split: `db` as the mutable truth, so that `insert` and `removeAt` could come later. I also wanted `today` and the sessions to land in the same settle, so I used `Promise.all` over two raw `fetch` calls.

The departure from the docs: the tracker keeps a DataSource for the read and only copies the result into `db`. I dropped the DataSource altogether and added a hand-set `loaded: boolean` flag. 09-data warns against that directly: "There is no `isLoading` flag you set." Two DataSources, with `ready` derived from their `.loaded` values, would have followed the docs more closely. The tracker's own `booted` flag made the flag feel acceptable, but that was copying an example rather than following the rule.
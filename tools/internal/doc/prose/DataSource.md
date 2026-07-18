A `Dataset` whose value arrives over HTTP — a reactive remote resource. The one thing to
know: **`fetch()` is explicit — a DataSource does not auto-load.** Call it when the data
should load (typically `onInit`, or on a user action); value and status then settle
*together*, a frame ahead, so a constraint reading `.loaded` and one reading `.value`
never disagree. Read the lifecycle through bindings — `.loading`, `.loaded`, `.failed`,
`.value`, `.error` — none are settable attributes; `clear()` returns it to idle. The
response is parsed JSON by default; `format = "text"` fetches textual material instead —
a Markdown article, a source file — as one string (see `format`).

```declare
weather: DataSource [ url = { `/api/weather?zip=${zip}` } ],
onInit() { this.weather.fetch() },                       // nothing loads until you ask
report: View [ visible = { weather.loaded },
    datapath = { weather.value?.rss?.channel } ]         // :paths below read the response
```

## format
What the fetched bytes **are**: `"json"` (the default) parses the response and tags it for
`:path` navigation; `"text"` delivers the raw bytes as **one string** in `.value`. Text is
a first-class material, not a detail — it is how an authored Markdown file is loaded
*directly*, with no JSON wrapping beside it: consume it whole, `text = { article.value || "" }`.
A string has nothing to navigate into, so the structural machinery — `datapath`, `:path`,
`schema`, `<->` — does not apply to a text source; the lifecycle (`fetch()`, `.loading`,
`.loaded`, `.failed`) is identical. Loaded text renders clean through `Markdown`: HTML
comments in the file are annotation, and annotation never renders.

```declare-fragment
article: DataSource [ url = "guide.md", format = "text" ],
doc: Markdown [ visible = { article.loaded }, text = { article.value || "" } ],
```

## url
The resource URL — a literal or a `{ }` constraint, so the source **re-points reactively**:
change a dependency (a zip, a filter) and the *next* `fetch()` hits the new URL. Setting
`url` never triggers a load on its own — fetching stays explicit.

## fetch()
Loads (or reloads) the resource from the current `url`, then settles `value` and the status
flags **together**, a frame ahead. This is the whole point of DataSource: loading is a verb
you call — there is no auto-load — so you decide *when* (usually in `onInit`, or on a user
action). Calling it again re-fetches; change `url`'s dependencies first to fetch a new
address. Returns a `Promise` you can `await`, but the reactive flags are the idiomatic path.

## clear()
Returns the source to the idle state — drops `value`, `error`, and the loaded/failed flags,
as if it had never fetched. For resetting a search field's results, or releasing a large
response you no longer need.

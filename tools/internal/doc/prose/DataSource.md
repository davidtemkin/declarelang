A `Dataset` whose value arrives over HTTP — a reactive remote resource. The one thing to
know: **`fetch()` is explicit — a DataSource does not auto-load** (`auto = true` is a
deliberate opt-in for reactive addresses, not the default). Call it when the data
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
doc: Markdown [ visible = { article.loaded }, text = { article.value || "" } ]
```

## url
The resource URL — a literal or a `{ }` constraint, so the source **re-points reactively**:
change a dependency (a zip, a filter) and the *next* `fetch()` hits the new URL. Setting
`url` does not load on its own — fetching stays explicit unless you opt into `auto`.

## fetch()
Loads (or reloads) the resource from the current `url`, then settles `value` and the status
flags **together**, a frame ahead. Loading is a verb you call, not something that happens
to you, so you decide *when* (usually in `onInit`, or on a user action). Calling it again
re-fetches; change `url`'s dependencies first to fetch a new address. Returns a `Promise`
you can `await`, but the reactive flags are the idiomatic path.

## auto
Fetch unprompted whenever `url` arrives or changes, instead of waiting for `fetch()`.
**Off by default, and the default is the discipline** — explicit loading is what stops a
source firing requests nobody asked for as unrelated dependencies settle. Turn it on when
the address *is* the reactive thing: a detail pane whose `url` derives from the current
selection, where "the URL changed" and "load it" are the same event. With `auto` off,
changing `url` arms the next `fetch()` and does nothing else.

```declare-fragment
detail: DataSource [ auto = true, url = { "/api/issue/" + app.selectedId } ]
```

## method
The HTTP verb — `"GET"` by default. A body-carrying verb (`"POST"`, `"PUT"`, `"PATCH"`)
sends `body` with the request. A DataSource stays a *source* either way: the response lands
in `value` and the status flags exactly as a GET's would, so a POST that returns the created
record leaves you reading it like anything else.

## body
The payload for a non-GET `method` — an object or array (JSON-encoded on the way out), or a
string (sent as-is). Ignored on a GET. Like `url` it can be a `{ }` constraint, so the
payload re-derives from live state; also like `url`, changing it sends nothing until the
next `fetch()`.

## credentials
How to handle cookies, TLS client certificates, and authentication headers
- "same-origin" — the default, send only when `url` shares page's origin;
- "omit" — never send credentials or cookies in request
- "include" — sends cross-origin too, allowing app to carry a session 
   cookie/header/cert to a separately-hosted authenticated API; this only takes 
   effect if that origin's CORS response allows credentials explicitly — a 
   wildcard `Access-Control-Allow-Origin: *` cannot combine with it,
   the response must echo back the specific requesting origin instead. 

```declare-fragment
notes: DataSource [ url = "https://api.example.com/notes", credentials = "include" ]
```

## onLoad
Fires when a fetch settles successfully, after `value` and the flags are consistent — a
handler reading `value` sees the arrived data, never the previous one. Failures do not fire
it; they set `failed` and `error`. **You usually do not need this**: any binding reading
`.value` or a `:path` beneath it already updates on arrival, which is the entire reactive
point. Reach for `onLoad` only when arrival must cause something a binding cannot express —
focusing the first result, chaining a follow-up fetch, announcing to a screen reader.

## clear()
Returns the source to the idle state — drops `value`, `error`, and the loaded/failed flags,
as if it had never fetched. For resetting a search field's results, or releasing a large
response you no longer need.

## status
The lifecycle as one fact: `"idle"` before anything is asked, `"loading"` in flight, then
`"loaded"` or `"failed"`. Read-only — `fetch()` and `clear()` move it. The four booleans
below derive from it, so they can never disagree with it or with each other.

## idle
Nothing has been asked for yet, or `clear()` returned it here. `= { status == "idle" }`.

## loading
A request is in flight. `= { status == "loading" }` — the slot to hang a spinner on.

## loaded
The value arrived and validated. `= { status == "loaded" }`. This is the usual one: a
screen derives from it (`visible = { data.loaded }`) rather than being toggled by hand.

## failed
The request, or the schema check, refused. `= { status == "failed" }`. Read `error` for
the one-line reason, `statusCode` and `errorBody` for what the server actually said.

## error
Why the last fetch failed, as one line — an HTTP status, a transport message, or the
schema mismatch with its pointed path. `null` when nothing has gone wrong. It is the
*message*; the server's own account is `errorBody`.

## statusCode
The HTTP status of the last reply — `404`, `422`, `200`. **`0` means no reply arrived**:
nothing asked yet, or the request never reached a server at all. That distinction is the
point of the slot, since it separates "retry" from "report" without parsing `error`.

## errorBody
What the server said when it refused — parsed if it was JSON, the raw text otherwise,
`null` if the body was empty. This is the part that names *which* field failed or *when*
the rate limit resets; a refusal reported as a status number alone throws it away.
`value` is untouched by a failure, so the last good data is still there.

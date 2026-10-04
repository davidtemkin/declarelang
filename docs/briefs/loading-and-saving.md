# Loading and saving
<!-- index: DataSource: fetch, auto, onLoad, failure, POST, schema -->

**Use when** data comes from a server, or goes back to one.

```declare
class TaskRow [ width = 100%, height = 26, t: Text [ x = 8, y = 5, text = :title ] ]

App [ width = 360, height = 300, fill = white,
    tasks: DataSource [ url = "/api/tasks", auto = true ],
    draft: string = "",
    create: DataSource [ url = "/api/tasks", method = "POST",
        body = { { title: app.draft, done: false } },
        onLoad() { app.draft = ""; app.tasks.fetch() }
        ],
    status: Text [ x = 8, y = 8, visible = { !app.tasks.loaded || app.tasks.failed },
        text = { app.tasks.failed ? "Couldn't load: " + app.tasks.error : "Loading…" } ],
    list: View [ y = 32, width = 100%, datapath = { app.tasks.value },
        layout: SimpleLayout [ axis = y ],
        TaskRow [ datapath = :tasks[] ]
        ],
    field: TextInput [ x = 8, y = 250, width = 220, height = 32, text = { app.draft },
        onInput(v: string) { app.draft = v } ],
    add: Button [ x = 240, y = 250, label = { app.create.loading ? "Saving…" : "Add" },
        disabled = { app.create.loading || app.draft == "" }, onClick() { app.create.fetch() } ]
    ]
```

**Rules**
- Nothing loads until asked: call `fetch()` (in `onInit`, or on an action), or set
  `auto = true` when the `url` itself is the reactive thing. Forgetting is the silent
  first bug.
- The host's `fetch` is refused in a `{ }` body. Every request is a `DataSource`,
  a write too (`method = "POST"`, a `body`, `.fetch()` from the handler).
- Screens derive from the source's state: `loaded` is about the value (true through a
  refresh), `loading` and `failed` about the request. No flags to set.
- `fetch()` settles first, so a handler can aim the request (`app.target = :id`) and send
  it in one go. `onLoad()` is what follows the reply; `fetch()` never throws.
- Where edits go depends on whether the source fetches again. If it refreshes (a timer,
  a `url` that changes, `auto`), each fetch replaces its value: edit a working copy,
  filled in `onLoad`. If it loads once and the app keeps it current (a `Socket` feeding
  it), editing the source's own value is fine.
- A `schema` validates the reply on arrival: bad data lands as `failed`, not as
  `undefined` three constraints later.
- Logic about one feed belongs on it: `class Feed extends DataSource [ … onLoad() { … } ]`.

**Look up** `DataSource`, `DataSource.fetch`, `DataSource.auto`, `DataSource.onLoad`,
`DataSource.loaded`, `DataSource.failed`, `DataSource.schema`.

**Examples** `apps/weather/weather.declare`: `data` with `auto` · `apps/marketmap/marketmap.declare`:
`Market`, a class of `DataSource` decoding its feed in `onLoad` ·
`apps/lzx-calendar/lzx-calendar.declare`: `fetch()` in `onInit`, the view revealed in `onLoad`.

**Guide** Data § Where data comes from · § Talking to a server ·
Typed data: schemas.

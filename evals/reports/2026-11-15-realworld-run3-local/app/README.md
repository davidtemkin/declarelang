# Conduit, in Declare

The [RealWorld](https://github.com/realworld-apps/realworld) example app — publish
articles, read them, comment, favorite, follow authors, filter by tag — written in
Declare against the RealWorld API, with the shared Conduit theme.

## Run it

The API service must be running on port 8380 (`node task/api/server.mjs --port=8380`).
Then, from the `declarelang/` directory:

```bash
npm install          # once
npm start            # the dev server; it prints its address, http://127.0.0.1:8200/ by default
```

and open **http://127.0.0.1:8200/my-apps/conduit/conduit.declare**. The demo account is
`jake@jake.jake` / `jakejake`. The service address is the App's `api` attribute.

## How it is put together

| file | what |
|---|---|
| `conduit.declare` | the program: session, routes, navbar and footer, and one class per page |
| `conduit-parts.declare` | the look: the Conduit theme as tokens, drawn icons, buttons, avatars, tags, an article preview, the paged article list, tabs, a form's error list |
| `default-avatar.svg` | shown for a user with no image |
| `tests/assert.mjs`, `tests/phone.mjs` | end-to-end checks at a laptop's size and on a phone |

- **Routes** are the URL fragment (`#/`, `#/login`, `#/register`, `#/settings`, `#/editor`,
  `#/editor/:slug`, `#/article/:slug`, `#/profile/:username`, `#/profile/:username/favorites`),
  the App's `location`. It is parsed into `page` and `arg`, and each page exists while
  `page` names it. Settings and the editor show the sign-in form in place when nobody is
  signed in.
- **The session** is the token, kept in `localStorage` (`jwtToken`), and the current user
  from `GET /api/user`. Every request carries `app.auth`, whose `Authorization: Token …`
  header is left out when signed out.
- **Data** lives in `DataSource`s on the page that shows it. Writes (favorite, follow,
  comment, delete, publish, update settings) are `DataSource`s too; each reply is written
  back into the record on screen. Forms are the library's `Form`; the API's
  `{ "errors": { "field": ["message"] } }` refusals appear in Conduit's error list.
- **Markdown** article bodies render with the library's `Markdown`, which treats raw HTML
  as text, so user-written content never runs.
- **Narrow screens** (under 640px) put the navbar's links in a sheet behind a menu
  button; controls are finger-sized on touch devices.

## Tests

From `declarelang/`, with the API running:

```bash
npx declare-verify my-apps/conduit/conduit.declare --phone --desktop                       # build + boot at both sizes
npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/assert.mjs   # laptop flow
npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/phone.mjs    # phone flow (touch)
```

The flows write to the live service (a new user and article each run, the article
deleted again at the end).

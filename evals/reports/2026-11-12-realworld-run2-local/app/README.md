# Conduit, in Declare

The [RealWorld](https://github.com/realworld-apps/realworld) example app: a place to
publish articles, read them, comment on them, favorite them, follow their authors and
filter them by tag. It's written in [Declare](../../README.md) and talks to any service
that implements the RealWorld API. It uses the shared Conduit theme's colors, type,
spacing and icons.

## Running it

It needs two things running: the RealWorld service on port 8380, and the Declare dev
server.

```bash
# 1. the service (from the task folder; it may already be running)
node api/server.mjs --port=8380

# 2. the dev server, from the root of this repository
npm install            # once
npm start              # prints its address; PORT=8201 npm start if 8200 is taken
```

Then browse to `http://127.0.0.1:8200/my-apps/conduit/conduit.declare` (use your port
if it differs). There is no build step: the server compiles the program when it is
requested. The demo account is `jake@jake.jake` / `jakejake`.

The service's address is the App's `api` attribute in `conduit.declare`.

## How it is put together

Three files, each opening with a comment on what it holds:

| file | what |
|---|---|
| `conduit.declare` | the App: the session, the address and the page it names, the header and footer |
| `conduit-pages.declare` | one class per page: home, sign in/up, settings, editor, article, profile |
| `conduit-parts.declare` | schemas for the API's records, small helpers, the theme, and the shared parts (buttons, tag pills, the article preview, the paged feed) |

The architecture in five lines:

- **Addresses.** The spec's paths live in the URL fragment: `#/`, `#/login`,
  `#/register`, `#/settings`, `#/editor`, `#/editor/<slug>`, `#/article/<slug>`,
  `#/profile/<name>`, `#/profile/<name>/favorites`. Declare has no router. `location` is
  the fragment as an attribute, `page` is derived from it, and the App builds the page it
  names (`exists`). Settings and the editor need an account. A signed-out reader sees the
  sign-in form at that address, and signing in lands on the page they asked for.
- **Data.** Each page holds its own requests as `DataSource` members. They fetch when
  their URL is known and stop when the page goes away. Each screen is derived from its
  request's state (loading, loaded, failed). Every reply is typed by a `schema`. A
  favorite or follow writes the service's answer back into the record on screen.
- **The session** is the JWT, kept in `localStorage` so a reload stays signed in, and
  the user it belongs to. Every request reads `app.authHeaders`, so signing in or out
  is one assignment.
- **Forms** are the library's `Form`. The service's `{ errors: { field: [...] } }`
  replies are mapped onto the named fields (`ApiForm.refusal`) and listed above the form
  as `.error-messages` (`ErrorList`).
- **The look** is `styles.css` translated into a theme record (`theme Conduit`) and a
  few classes, because Declare has no CSS. The fonts are Source Sans Pro and Lora from
  Google Fonts, and the icons come from the Ionicons v2 font. The container widths
  follow the theme's breakpoints. Article bodies are rendered from Markdown, and raw
  HTML stays as text.

## Tests

Two scripts in `tests/`, run with `declare-verify` from the repository root. Each one
compiles, typechecks and boots the app, then drives it in headless Chrome:

```bash
# unit checks: address → page, the feed's endpoint and paging, error mapping (no writes)
npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/units.mjs

# the flows, against the live service: sign in (refused, then accepted), the feeds and
# tags, paging, publish → comment → edit → delete, favorite, follow, settings, sign out,
# a refused sign-up
npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/tests/assert.mjs
```

The flow script writes to the running service. Everything it creates it also deletes,
and everything it changes it changes back, so it can be run again.

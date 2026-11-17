# Conduit in Declare

The [RealWorld](https://github.com/realworld-apps/realworld) example app ("Conduit"),
written in Declare. You can publish articles, read them, comment on them, favorite them,
follow their authors and filter them by tag. Every record comes from a RealWorld API
service.

## Running it locally

1. Start the API service on port 8380 (the program expects `http://127.0.0.1:8380/api`):

   ```sh
   node task/api/server.mjs --port=8380
   ```

2. From the `declarelang/` directory, install the toolchain once and start the dev server:

   ```sh
   npm install
   npm start
   ```

3. Open `http://127.0.0.1:8200/my-apps/conduit/conduit.declare`. If 8200 is taken, use
   the address the server prints instead. There's a demo account: `jake@jake.jake` /
   `jakejake`.

To check the program without opening it, run
`npx declare-verify my-apps/conduit/conduit.declare`. This compiles the program,
type-checks it and boots it headlessly.

## How it is put together

| file | what it holds |
|---|---|
| `conduit.declare` | the API's record shapes (`schema`s), a few pure helpers, and the `App`: where the user is, the data sources, and the verbs that write |
| `conduit-pages.declare` | one class per page (home, sign in/up, settings, editor, article, profile) plus the navbar and footer |
| `conduit-parts.declare` | the Conduit theme as tokens, the drawn icons, and the small parts (buttons, avatars, tag pills, tabs, pager, text fields, article previews) |
| `default-avatar.svg` | the face shown for a person with no picture |

- **Routing is the URL fragment.** The app's `location` holds paths like
  `#/article/<slug>`, `#/profile/<name>/favorites`, `#/editor/<slug>` and `#/settings`.
  The current page, slug and profile are all computed from it, so links, Back and deep
  links behave the same way. There is no router.
- **Data is a `DataSource` per resource.** The articles list, one article, its comments,
  a profile, the tags and the signed-in account each have a source. Its `url` is computed
  from where the user is, so navigating to a page loads that page's data.
- **Writes are requests too.** Favoriting and following write their replies into every
  source that shows the same article or person. Each form (sign in/up, settings,
  editor, comment) owns the request it sends. Refusals from the service are listed above
  the form, as in the templates.
- **The session** is the JWT. It's kept in `localStorage`, sent as
  `Authorization: Token …`, and dropped if the service says it is invalid. Settings and
  the editor show the sign-in form at their own address while signed out.
- **Markdown** article bodies are rendered with Declare's `Markdown`. It treats raw HTML
  as plain text, so user-written HTML is never interpreted.

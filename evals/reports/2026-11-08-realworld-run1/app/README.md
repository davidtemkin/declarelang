# Conduit, in Declare

The [RealWorld](https://github.com/realworld-apps/realworld) example app, a Medium-like
place to publish, read, comment on, favorite and filter articles and to follow their
authors. It is written in [Declare](../../README.md) and wears the shared Conduit theme.
It talks to any RealWorld API, by default the one at `http://127.0.0.1:8380/api`.

## Run it

```sh
# from the declarelang/ folder, once
npm install

# the API (RealWorld spec, v2) must be running on port 8380, then:
npm start                     # prints its address; PORT=8201 npm start for another port
```

Browse to `http://127.0.0.1:<port>/my-apps/conduit/conduit.declare`. The server
compiles the program on request, so there is no build step. Sign in with the demo
account: `jake@jake.jake` / `jakejake`.

To point it at another RealWorld API, change `apiBase` on the App in `conduit.declare`.

## Check it

```sh
npx declare-verify my-apps/conduit/conduit.declare --assert my-apps/conduit/conduit.flows.mjs
```

This compiles and typechecks the program, boots it in headless Chrome, and drives
`conduit.flows.mjs` against the live API, the way a person would use it:

- the global feed, paging and a tag filter
- a refused sign-in, then a real one, with the token kept in localStorage
- Your Feed
- publishing an article, including blank-field errors and tags
- the Markdown body, where raw HTML stays text
- posting and deleting a comment
- editing the article
- favoriting and following, each undone
- a profile and its favorites tab
- saving settings
- deleting the article
- signing out
- a refused sign-up

The script creates its own uniquely named article and removes it, and it reverses
every favorite, follow and settings change it makes, so the service is left as it
was found.

## How it is built

Three files. Each opens with a comment saying how it is put together.

| file | what is in it |
|---|---|
| `conduit.declare` | the API's schemas, the service layer, the session, and the App: where the user is, and the requests that follow from it |
| `conduit-pages.declare` | one class per page: home, sign in / sign up, settings, editor, article, profile |
| `conduit-parts.declare` | the look: the `Conduit` theme (the stylesheet's colours as tokens), drawn icons in place of Ionicons, and the small parts (buttons, fields, tags, tabs, byline, article preview, navbar, footer) |

- **Routing is the URL fragment.** The App's `location` holds `/`, `/login`,
  `/register`, `/settings`, `/editor`, `/editor/<slug>`, `/article/<slug>`,
  `/profile/<name>` or `/profile/<name>/favorites`, and the page derives from it. Links
  write it, and Back writes it back. Settings and the editor show the sign-in page while
  signed out, and signing in lands where you were going.
- **Data comes from `DataSource`s whose paths derive from that location.** They all share
  one `Api` base, which adds the base URL and the `Authorization: Token …` header. Opening
  an article is enough for it and its comments to load. Replies to favorites and follows
  are merged into what is on screen, so a change shows everywhere at once.
- **The session** is a `Session` node. It keeps the token in localStorage, loads the
  account from it, and signs out if the service rejects the token.
- **Forms** are the library's `Form`, sending through the page's own `DataSource`. The
  API's `{"errors": {"field": ["message"]}}` is laid on the field it names and listed
  in `.error-messages`, worded as Conduit words it ("email has already been taken").
- **Each page is built fresh per address.** The screen is a single record keyed by the
  location, and `classFor` picks the page class. A form therefore starts from its
  defaults on every visit.

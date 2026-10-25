# RealWorld (Conduit) front ends compared with the Declare implementation

Date: 2026-10-25. Static analysis only. Nothing was installed, built or run.

The Declare app is in this folder (`conduit.declare`, `conduit.ts`, `session.ts`, `default-avatar.svg`), with its end-to-end check in `tests/flow.mjs` and a backend seeder in `tests/seed.mjs`; it was written in one session by an AI agent. The other eight were cloned at these commits:

| Clone | Repository | Commit |
|---|---|---|
| react-redux | github.com/khaledosman/react-redux-realworld-example-app | 53b0b4c |
| react-fsd | github.com/yurisldk/realworld-react-fsd | 969709a |
| angular | github.com/realworld-apps/angular-realworld-example-app | dd99ed2 |
| vue3 | github.com/mutoe/vue3-realworld-example-app | 741c215 |
| vue-official | github.com/realworld-apps/vue-realworld-example-app | f7e48c8 |
| sveltekit | github.com/sveltejs/realworld | df79670 |
| elm | github.com/rtfeldman/elm-spa-example | cb32acd |
| solid | github.com/solidjs/solid-realworld | f6e77ec |
| _spec (E2E suite, shared CSS) | github.com/realworld-apps/realworld | ebbcdeb |

The counting script is `tools/count.py` (run with cloc 2.02 on the path), given a folder holding the clones under these names; it reads the Declare app from this folder and writes `counts.json` to the current directory.

The code-quality reading, the density question and the reading-list feature walk-through are in [`quality.md`](quality.md).

## 1. Summary

The headline count covers front-end source only. It leaves out tests, build and lint config, generated code, the HTML shell (`index.html`) and any copy of the shared Conduit CSS. "Code-only" means no blank lines and no comment lines, counted by cloc. `.declare` files are counted with TypeScript comment rules.

| Implementation | Stack | Files | Lines raw / code-only | Styling lines the authors wrote | Notes |
|---|---|---:|---:|---:|---|
| **Declare** (`my-apps/conduit`) | Declare + 2 small TS helpers | **3** (+1 SVG) | **948 / 750** | All styling is in the code: ~65 lines of theme + icons, plus inline visual attributes. Estimate: about 20% of tokens are visual styling, about 35% including layout. | One session, written by an AI agent. Hash routing. Tag chips, Markdown, paging. The home tab and page are not in the URL. The official E2E suite was not run. |
| React + Redux Toolkit (khaledosman fork of gothinkster/react-redux) | React 18, RTK, React Router 6, superagent | 33 | 3,253 / 2,057 | 0 (CDN CSS) | Raw count is inflated by JSDoc. Old `/@user` routes. Tab and page live in Redux, not the URL. Jest and Cypress tests. Last commit 2024-03. |
| React "FSD" (yurisldk/realworld-react-fsd) | React 19, React Router 7 loaders/actions, TanStack Query 5, Zod 4, Orval | 65 | 3,131 / 2,693 | 69 (CSS modules) + 15 lines added to the copied theme | Does not count the Orval-generated API client, which is produced at build time from `openapi.yaml`. Tags are a plain text field (no chips). The article body is shown as plain text (no Markdown). URL holds feed and offset. 533 stars, last commit 2026-05. |
| Angular (realworld-apps/angular-realworld-example-app) | Angular 21 (signals + RxJS), standalone components, interceptors | 52 | 2,415 / 2,054 | 6 + a few inline `styles:` | The project's reference front end, deployed at demo.realworld.show. Runs the **official Playwright E2E suite**. `window.__conduit_debug__`, `jwtToken` key. 5.6k stars, last commit 2026-05. |
| Vue 3 (mutoe/vue3-realworld-example-app) | Vue 3.5 `<script setup>`, Pinia, vue-router 5 (hash) | 42 | 2,062 / 1,832 | 18 | Does not count `services/api.ts` (844 raw / 572 code), which swagger-typescript-api generated. Its own Playwright and Vitest suites. Tab in the route, page not. 1.1k stars, last commit 2026-08. |
| Vue 3 (realworld-apps/vue-realworld-example-app) | Vue 3.5, Pinia, vue-router 5, plain JS | 32 | 2,082 / 1,858 | 1 | Runs the official E2E suite (spec as a git submodule) and has no tests of its own. Tab and page in the URL. 4.1k stars, last commit 2026-06. |
| SvelteKit (sveltejs/realworld) | SvelteKit + Svelte 5 runes, server `load`/form actions | 39 | **1,328 / 1,112** | 63 | Server-rendered: the JWT is a cookie, not localStorage. Uses progressive-enhancement forms. Routes are `/profile/@user`. No tests. 2.4k stars, last commit 2026-08. |
| Elm (rtfeldman/elm-spa-example) | Elm 0.19.1, TEA, ports for localStorage | 33 | 5,794 / 3,726 | 0 (CDN CSS) | The largest by far: types, decoders and elm-format's vertical style. Tags are a plain text field. Targets the dead `conduit.productionready.io` API. Last commit 2019 (3.3k stars). |
| SolidJS (solidjs/solid-realworld) | Solid 1.3, stores + `createResource`, hand-written hash router | 26 | 1,320 / 1,248 | 0 (CDN CSS) | Smallest of the JS versions. Tab in the hash query, page not. No tests. Last commit 2022-04 (235 stars). |

For reference, the shared Conduit theme (`assets/theme/styles.css`) is 1,526 raw / 1,205 code lines of CSS. Every implementation above except Declare gets it for free. They load it from a CDN, copy it in, or import it from the spec submodule. The Ionicons font and Google Fonts also come from a CDN.

### Size by category (code-only lines)

Templates in Vue and Svelte single-file components were split from their `<script>` and `<style>` blocks before counting. In JSX, Elm and Angular inline templates, markup and logic are mixed, so they appear as "components".

| | Components / views | Templates (SFC/HTML) | Component script (SFC) | Data / API layer | Routing | App state | Styling | Other (types, utils, entry) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Declare | 492 | — | — | 123 (DataSources + `session.ts`) | 15 | 20 | 65 theme+icons (+ inline, see §3) | 30 (schemas 7, `conduit.ts` 23) |
| React+RTK | 1,227 | — | — | 97 | 77 | 620 | 0 | 36 |
| React FSD | 1,383 | — | — | 634 (loaders, actions, fetch) | 379 | 169 (URL-param parsing) | 69 | 59 |
| Angular | 1,064 (incl. inline templates) | 523 | — | 252 (services, interceptors) | 134 | (in services) | 6 | 75 |
| Vue 3 (mutoe) | — | 825 | 496 | 231 (composables + api wrapper) | 89 | 28 | 18 | 145 |
| Vue 3 (official) | — | 740 | 624 | 112 | 62 | 250 | 1 | 69 |
| SvelteKit | — | 624 | 129 | 294 (server load + actions) | 0 (file-based, 23 route files) | — | 63 | 2 |
| Elm | 2,333 (Page modules) | — | — | 254 | 69 | 76 | 0 | 994 (Main 225, model/decoder modules 769) |
| Solid | 895 | — | — | 66 | 23 | 256 | 0 | 8 |

How the Declare split was made: `conduit.declare` is one file, so it was cut by line ranges. The schemas and script declarations are lines 1–34. `ArticleList` is lines 35–53. The theme is lines 54–64 and the icons 65–135. Components are lines 136–530 and 697–903. App session state is lines 531–557, location parsing 558–579, and the read/write DataSources and session functions 580–696. Summed by range the parts give 707 lines; the whole file counts 712. The small gap is cloc's comment handling at the cut points.

### Tests (not in the headline)

| | Own tests (code lines) | Kind |
|---|---:|---|
| Declare | 139 (`flow.mjs`) | One 53-step end-to-end run against a live API (the "R5" flow test). `seed.mjs` (87 lines) seeds the backend. |
| React+RTK | 2,160 | Jest slice and component specs, plus Cypress |
| React FSD | 229 | Jest (a few) |
| Angular | 1,882 | Vitest unit specs, plus the official E2E suite through the submodule |
| Vue 3 (mutoe) | 2,073 | Vitest component specs, plus its own Playwright suite |
| Vue 3 (official) | 0 own | The official E2E suite through the submodule |
| SvelteKit, Solid | 0 | — |
| Elm | 101 | Routing unit tests |

The official RealWorld Playwright suite (`specs/e2e`) has about 2,100 code lines. One file timed out in cloc, so that is a lower bound. It targets CSS selectors and form `name`s defined in `SELECTORS.md`, plus `window.__conduit_debug__`. Declare renders its own tree, not the spec's HTML, so it cannot run that suite as it stands.

### Line density: lines understate Declare

Declare packs many attributes onto one line. Counting tokens after removing comments (identifiers, numbers and single punctuation marks) gives a fairer comparison:

| | Code lines | Tokens | Non-whitespace chars | Tokens / line |
|---|---:|---:|---:|---:|
| Declare | 745 | **11,808** | 30,294 | **15.8** |
| SvelteKit | 1,112 | 9,548 | 24,042 | 8.6 |
| Solid | 1,248 | 10,657 | 29,176 | 8.5 |
| Vue 3 (mutoe) | 1,832 | 13,620 | 40,080 | 7.4 |
| Vue 3 (official) | 1,858 | 13,930 | 38,891 | 7.5 |
| React+RTK | 2,057 | 14,789 | 46,159 | 7.2 |
| Angular | 2,054 | 18,104 | 54,860 | 8.8 |
| Elm | 3,726 | 22,018 | 80,799 | 5.9 |
| React FSD | 2,693 | 22,230 | 76,389 | 8.3 |

(745 vs 750: the comment-stripped copy differs from cloc's count by a few lines.)

Measured by lines, Declare is 1.5–5× smaller than the others. Measured by tokens, it is about the same size as SvelteKit and Solid, about 15% smaller than the Vue versions, and about 20% smaller than React+RTK. It is about 35% smaller than Angular and roughly half the size of React FSD and Elm.

The token figure also covers the styling that the others get from the shared CSS. About 2,200 Declare tokens are visual styling: the theme, the icons, and fill, stroke, font and colour attributes (estimate). About 1,700 more are layout and sizing. The others' styling hook is the `class=` attribute, which costs them 1,100–1,800 tokens each.

## 2. How each one is structured

### Files and organisation

- **Declare**: one 902-line `.declare` file and two helper TS files. `conduit.ts` (31 lines) holds date formatting, error-line mapping and tag parsing. `session.ts` (15 lines) holds the token in localStorage, as a `host = browser` script. The file reads top to bottom: schemas, a DataSource subclass, the theme, four canvas-drawn icons (heart, pencil, trash, gear; the default avatar is a copied SVG), about 19 small classes (Btn, Avatar, TagPill, Tab, Errors, Input, Meta, Preview, Feed, the forms, ArticleActions, CommentCard, NavLink), then one `App [...]` holding all app state, every DataSource and every page.
- **React+RTK**: `components/` and `features/<x>/{Screen, slice}` sit side by side because the migration to Redux Toolkit was partial. `agent.js` wraps the API.
- **React FSD**: page slices (`pages/<p>/{p.ui.tsx, p.loader.ts, p.route.ts, p.paths.ts, p.state.ts, actions/*.action.ts}`) plus `shared/api`, `shared/lib/react-router` (middleware) and `shared/ui`. It has 65 files, the most here. Each page has up to eight files.
- **Angular**: `core/` (auth, interceptors, layout), `features/<area>/{components, pages, services, models}` and `shared/` (pipes, list-errors). Page templates sit in separate `.html` files; small components use inline templates.
- **Vue 3 (mutoe)**: `pages/`, `components/` (each paired with a `.spec.ts`), `composable/use-*.ts` for data, and a Pinia user store. The API client is generated.
- **Vue 3 (official)**: `views/`, `components/`, Pinia stores (`article`, `auth`, `home`, `profile`) and `common/api.service.js`.
- **SvelteKit**: file-system routes. Each route has a `+page.svelte` view and a `+page.server.js` with `load` and form `actions`. `lib/api.js` is a 40-line fetch wrapper.
- **Elm**: one module per concept (`Article`, `Article.Feed`, `Article.Slug`, `Username`, `Avatar`, `Route`, `Session`, `Viewer`, `Api`, `Api.Endpoint`) and one per page (`Page.Home`, …). `Main` dispatches between pages.
- **Solid**: `pages/`, `components/`, and `store/create*.js` factories that build one global store with an `actions` object.

### Routing

| | Mechanism | URL form | Home tab / page in URL? |
|---|---|---|---|
| Declare | `location` attribute (a string) parsed into `dest`, `slug`, `profileName` and `favoritesTab`. Pages are shown by `visible = { app.dest == "article" }` or `shows = "login"`, and links are `link = "#…"`. The compiler checks it, and Back/Forward work without code. | `#article/slug`, `#profile/name/favorites` | No (known gap) |
| React+RTK | `<Routes>` in `App.js` with lazy screens | `/@user` (old spec) | No (Redux) |
| React FSD | `createBrowserRouter`, lazy route modules, middleware for auth guards | spec routes | Yes (`?feed=personal&offset=`) |
| Angular | `app.routes.ts`, lazy `loadComponent`, auth guards | spec routes, `/tag/:tag` | Yes (`?feed=following&page=`) |
| Vue 3 mutoe | vue-router hash history, named routes | `#/my-feeds`, `#/tag/:t`, `#/article/create` | Tab yes, page no |
| Vue 3 official | vue-router history | spec routes | Yes |
| SvelteKit | File system | `/profile/@user` | Yes (`?tab=&tag=&page=`) |
| Elm | `Url.Parser` over the fragment | `#/profile/user` | No |
| Solid | 24-line hand-written hash router (`createRouteHandler`) | `#/@user` | Tab yes (`?tab=`), page no |

### Data fetching and caching

- **Declare**: every read is a `DataSource` whose `url` is a constraint over app state, with `auto = true`. Changing `app.tab`, `app.tag`, `app.page`, `app.location` or `app.token` re-issues the request, and no effect code is involved. An empty URL means "don't fetch". There is no cache beyond the current value. Loading, failure, status and error body are attributes the views bind to directly (`app.articles.loading`, `.failed`, `.errorBody`).
- **React+RTK**: `createAsyncThunk` for every request. Results go into slices, and loading flags are hand-written in reducers.
- **React FSD**: React Router loaders call `queryClient.fetchQuery(...)` with Orval-generated query options. Mutations are route actions submitted via `useFetcher`. TanStack Query is the cache.
- **Angular**: services return RxJS `Observable`s. Pages combine route params with auth state (`combineLatest`) and keep results in signals.
- **Vue 3**: composables (`useArticles`) `watch` route meta and the page ref, then refetch. `useAsync` wraps loading and 401 handling. The official version keeps lists in Pinia stores.
- **SvelteKit**: server `load` per route. Navigation reruns `load`, and `invalidate` and redirects refresh.
- **Elm**: `Http` requests as `Cmd`s, with results as `Msg`s in each page's `update`. Explicit `Loading`/`Loaded`/`Failed` states, plus a `Loading` module that shows a slow-load spinner.
- **Solid**: `createResource(source, fetcher)` keyed on a source signal (`["articles", predicate]`). Of the others, this is closest to Declare's "URL as a function of state", but the source is still set imperatively from each page (`loadArticles(predicate)`).

### Auth and token handling

- **Declare**: one fact, `token: string = { loadToken() }`, saved through `trackChanges`/`onChange` to localStorage. `auth = { Authorization: token != "" ? "Token " + token : "" }` goes into every source's `headers`, and an empty header is not sent. `me` is a DataSource whose URL is empty when signed out.
- **Angular**: `JwtService` (localStorage `jwtToken`), a functional `tokenInterceptor`, and `UserService` holding a `BehaviorSubject` of the current user. Guards and an `*ifAuthenticated` directive.
- **React+RTK**: middleware writes `jwt` to localStorage on login and logout, and `agent.setToken`.
- **React FSD**: `auth-storage.ts` and `auth-fetch.ts` merge the header. React Router middleware loads the user into a router context and redirects.
- **Vue 3**: a `Storage` helper plus a plugin that sets the header on the generated client. The official version follows the spec's `jwtToken` key and exposes `window.__conduit_debug__`.
- **SvelteKit**: a base64 JSON cookie decoded in `hooks.server.js` into `locals.user`. Requests are made server-side.
- **Elm**: an opaque `Cred` type, so authenticated endpoints cannot be called without one. Persisted through ports and 25 lines of JS in `index.html`, with cross-tab sync through the `storage` event.
- **Solid**: localStorage `jwt` inside the agent.

### Forms, validation and server errors

All of them show the spec's `{ errors: { field: [msgs] } }` as a list above the form.

- **Declare** has one `errorLines(body, fallback)` helper and an `Errors` class. Each form binds `lines = { send.failed ? errorLines(send.errorBody, send.error) : [] }`. Each form is a class whose fields are its own attributes, and its submit `DataSource` is a member whose `body` is a constraint over those fields. A form is built with `exists = {…}` when its page opens, so it starts empty.
- **Angular** uses typed reactive forms (`FormGroup`/`FormControl`) and `list-errors`.
- **React FSD** validates `formData` with Zod in actions before calling the API, and `handleApiError` maps the reply.
- **SvelteKit** uses native `<form method="POST">` with `use:enhance`. Actions return `fail(422, body)`.
- **Elm** does client-side validation (`validate` returning `List Problem`) plus server errors.
- **React+RTK, Vue, Solid** use controlled inputs with local state.

### Pagination

Every implementation computes `ceil(articlesCount / limit)` page links. Declare builds a `Dataset` of page indices and replicates a `PageNum` control over it (`press() { app.page = n }`), and the feed refetches because `listQuery` depends on `app.page`. `onChange` on `location`, `tab` or `tag` resets `page` to 0. Angular, the official Vue, React FSD and SvelteKit put the page in the query string.

### Editor with tag chips

Declare, React+RTK, Angular, both Vue versions, SvelteKit and Solid render removable chips. React FSD and Elm use a space-separated text field instead, which the spec allows but the templates don't show. Declare's `addTags` also splits on commas and spaces and drops duplicates. Pending typed text is included on publish (`tagList: addTags(tags, tagTyping)`).

### Markdown

| | How |
|---|---|
| Declare | A built-in `Markdown` view (`text = { app.shown?.body }`) rendered into Declare's own tree, with no HTML injection |
| React+RTK | snarkdown + `xss` |
| React FSD | **none**: the body goes into a `<p>` |
| Angular | lazy `marked` + `DomSanitizer` in a pipe |
| Vue 3 mutoe | `marked` + `insane` |
| Vue 3 official | `marked` + DOMPurify |
| SvelteKit | `marked` + `sanitize-html` (server-side) |
| Elm | `elm-explorations/markdown` |
| Solid | `marked(..., { sanitize: true })` (a deprecated option) |

### Shared state, and keeping a favourite in sync across views

Declare has a single `app` object. The favourite write's `onLoad` merges the server's reply into whichever list or article is showing (`app.articles.merge(a)`, `app.article.set([...])`). React+RTK does the same in reducers. Solid and SvelteKit update optimistically and roll back on failure. React FSD uses optimistic `useFetcher` state. Angular, Vue and Elm replace the article in the local list from the response or an emitted event.

## 3. The same feature in each: the "favorite" button in an article preview

**Declare**: the button binds to the row's data, and the write is a DataSource on `App`.
```
fav: Btn [ tone = "brand", icon = "heart", label = { "" + :favoritesCount }, solid = :favorited,
    accessibilityLabel = { (:favorited ? "Unfavorite " : "Favorite ") + :title },
    press() { app.toggleFavorite(:slug, !:favorited) }
    ]
…
favorite: DataSource [ schema = [ article: Article ], headers = { app.auth },
    method = { app.favOn ? "POST" : "DELETE" },
    url = { app.favSlug == "" ? "" : app.api + "/articles/" + app.favSlug + "/favorite" },
    onLoad() { const a = this.value!.article; app.articles.merge(a) /* + the open article */ } ],
toggleFavorite(slug: string, on: boolean) {
    if (!this.authed) { this.location = "register"; return }
    this.favSlug = slug; this.favOn = on; this.favorite.fetch() },
```
The `/* + the open article */` comment replaces four lines that also update the open article page.

**React + Redux Toolkit**: a thunk per verb, and a reducer that patches the list.
```js
const handleClick = (event) => {
  event.preventDefault();
  if (article.favorited) dispatch(unfavoriteArticle(article.slug));
  else dispatch(favoriteArticle(article.slug));
};
…
builder.addCase(favoriteArticle.fulfilled, (state, action) => {
  state.articles = state.articles.map((article) =>
    article.slug === action.payload.article.slug
      ? { ...article, favorited: action.payload.article.favorited,
          favoritesCount: action.payload.article.favoritesCount }
      : article);
```

**React FSD** (Router 7 + Query): an optimistic fetcher submits to a route action.
```tsx
const favoriteToggleFetcher = useFetcher({ key: `article-favorite-toggle-${slug}` });
const optimisticOperation = favoriteToggleFetcher.formData?.get('operation');
let isFavorited = favorited;
if (optimisticOperation === 'favorite') isFavorited = true;
if (optimisticOperation === 'unfavorite') isFavorited = false;
…
favoriteToggleFetcher.submit(formData, { method: 'post', action: homePaths.getFavoriteTogglePath(slug) });
```
A separate `article-favorite-toggle.action.ts` file (30 lines) is repeated per page: home, profile and article.

**Angular**: a component with RxJS, where `switchMap` gates on authentication.
```ts
this.userService.isAuthenticated.pipe(
  switchMap(authenticated => {
    if (!authenticated) { void this.router.navigate(['/register']); return EMPTY; }
    return !this.article.favorited
      ? this.articleService.favorite(this.article.slug)
      : this.articleService.unfavorite(this.article.slug);
  }),
  takeUntilDestroyed(this.destroyRef),
).subscribe({ next: () => { this.isSubmitting.set(false); this.toggle.emit(!this.article.favorited); } … });
```

**Vue 3 (mutoe)**: a composable, and the parent replaces the item on `update`.
```ts
const favoriteArticle = async () => {
  const requestor = isFavorited.value ? api.articles.deleteArticleFavorite : api.articles.createArticleFavorite
  const article = await requestor(articleSlug.value).then(res => res.data.article)
  onUpdate(article)
}
const { active, run } = useAsync(favoriteArticle)
```

**SvelteKit**: a real `<form>` posts to a server action. It works without JS and is optimistic with it.
```svelte
<form method="POST" action="/article/{article.slug}?/toggleFavorite"
  use:enhance={({ form }) => {
    if (article.favorited) { article.favorited = false; article.favoritesCount -= 1; }
    else { article.favorited = true; article.favoritesCount += 1; }
    …
  }}>
  <input hidden type="checkbox" name="favorited" checked={article.favorited} />
  <button class="btn btn-sm {article.favorited ? 'btn-primary' : 'btn-outline-primary'}">
```

**Elm**: messages and a total `update`.
```elm
ClickedFavorite cred slug ->
    fave Article.favorite cred slug model

CompletedFavorite (Ok article) ->
    ( Model { model | articles = PaginatedList.map (replaceArticle article) model.articles }, Cmd.none )

CompletedFavorite (Err error) ->
    ( Model { model | errors = Api.addServerError model.errors }, Cmd.none )
```

**Solid**: an optimistic store write that rolls back on failure.
```js
async makeFavorite(slug) {
  const article = state.articles[slug];
  if (article && !article.favorited) {
    setState("articles", slug, (s) => ({ favorited: true, favoritesCount: s.favoritesCount + 1 }));
    try { await agent.Articles.favorite(slug); }
    catch (err) { setState("articles", slug, (s) => ({ favorited: false, favoritesCount: s.favoritesCount - 1 })); throw err; }
  }
},
```

## 4. The same feature in each: the home feed with tabs and paging

**Declare**: the request is a function of where the user is, with no handler.
```
tab: "feed" | "global" | "tag" = "global",
tag: string = "",
page: number = 0,
…
listQuery: string = { "limit=" + app.pageSize + "&offset=" + app.page * app.pageSize },
articles: ArticleList [
    url = { app.dest == "" ? (app.tab == "feed" && app.authed ? app.api + "/articles/feed?" + app.listQuery
                            : app.tab == "tag" ? app.api + "/articles?tag=" + encodeURIComponent(app.tag) + "&" + app.listQuery
                            : app.api + "/articles?" + app.listQuery)
          : app.dest == "profile" ? app.api + "/articles?" + (app.favoritesTab ? "favorited=" : "author=")
                                    + encodeURIComponent(app.profileName) + "&" + app.listQuery
          : "" } ],
…
Tab [ label = "Global Feed", on = { app.tab == "global" }, press() { app.tab = "global" } ],
```
The same `Feed` class and the same `ArticleList` source serve the home page and both profile tabs.

**React + RTK**: one small component per tab, and a thunk that reads the store back.
```js
function GlobalFeedTab() {
  const dispatch = useDispatch();
  const currentTab = useSelector((state) => state.articleList.tab);
  const isActiveTab = currentTab === 'all';
  const dispatchChangeTab = () => { dispatch(changeTab('all')); };
  return (<li className="nav-item"><button type="button"
      className={isActiveTab ? 'nav-link active' : 'nav-link'} onClick={dispatchChangeTab}>Global Feed</button></li>);
}
```

**Vue 3 (mutoe)**: an if-chain over the feed type, re-run by watchers on the route and the page.
```ts
if (articlesType.value === 'my-feed')
  responsePromise = api.articles.getArticlesFeed(pageToOffset(page.value)).then(res => res.data)
else if (articlesType.value === 'tag-feed' && tag.value)
  responsePromise = api.articles.getArticles({ tag: tag.value, ...pageToOffset(page.value) }).then(res => res.data)
…
watch(metaChanged, async () => { if (page.value === 1) await runWrappedFetchArticles(); else changePage(1) })
watch(page, runWrappedFetchArticles)
```

**SvelteKit**: a server `load` reads the URL. Tabs and page links are plain `<a href="?tab=feed&page=2">`.
```js
export async function load({ locals, url }) {
  const tab = url.searchParams.get('tab') || 'all';
  const tag = url.searchParams.get('tag');
  const page = +(url.searchParams.get('page') ?? '1');
  const endpoint = tab === 'feed' ? 'articles/feed' : 'articles';
  …
  const [{ articles, articlesCount }, { tags }] = await Promise.all([
    api.get(`${endpoint}?${q}`, locals.user?.token), api.get('tags')]);
  return { articles, pages: Math.ceil(articlesCount / page_size), tags };
}
```

**Angular**: route params, query params and auth state are combined, then a list config is pushed into `<app-article-list>`.
```ts
combineLatest([this.userService.isAuthenticated, this.route.params, this.route.queryParams])
  .subscribe(([isAuthenticated, params, queryParams]) => {
    const tag = params['tag']; const feed = queryParams['feed'];
    const page = queryParams['page'] ? parseInt(queryParams['page'], 10) : 1;
    if (feed === 'following' && !isAuthenticated) { void this.router.navigate(['/login']); return; }
    …
```

SvelteKit and Declare have the least feed code. SvelteKit gets there by putting all state in the URL and running a server `load`. Declare gets there by making the request URL a constraint. Solid's `createResource` sits between them.

## 5. Feature coverage against the spec (static reading, not tested)

| | Feeds + tag + paging | Tag chips | Markdown | Comments | Follow / fav | Settings / logout | Spec routes | Spec `jwtToken` key + debug hook | Official E2E |
|---|---|---|---|---|---|---|---|---|---|
| Declare | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | hash variant of spec paths | no (`conduit/jwt`) | not run |
| React+RTK | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | old `/@user` | no (`jwt`) | no |
| React FSD | ✓ | text field | **no** | ✓ | ✓ (optimistic) | ✓ | ✓ | no | no |
| Angular | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vue 3 mutoe | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | hash, `/article/create`, `/my-feeds` | no | own suite |
| Vue 3 official | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| SvelteKit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `/profile/@user` | cookie | no |
| Elm | ✓ | text field | ✓ | ✓ | ✓ | ✓ | hash | no | no (old API) |
| Solid | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | hash, `/@user` | no (`jwt`) | no |

Things Declare does that most others don't, as written: responsive layout down to phone width, including touch-sized targets and icon-only nav when narrow. Accessibility roles and labels on tabs, page numbers and icon buttons. Page titles per route. Loading, empty and failure text for every list. Things it lacks: spec web fonts, the Ionicons glyphs (it draws four of its own), the home tab and page in the URL, and the spec's selector contract. The selector contract is not applicable to a non-HTML renderer.

## 6. Fairness caveats

1. **Styling reuse cuts both ways.** Every other implementation pastes the spec's HTML templates and leans on the 1,205-line shared CSS, the Ionicons font and Google Fonts. Its own styling is 0–69 lines plus class attributes, which cost 1,100–1,800 tokens. Declare cannot use that CSS. Its theme, four drawn icons, colours, strokes, fonts and the whole layout (`SimpleLayout`, `ResponsiveLayout`, widths, padding) are in the 750 lines. Estimate: ~20% of its tokens are visual styling and ~15% more are layout. Declare's count therefore includes work the others got for free. Its *structural* code (data, routing, state, logic) is smaller than its total suggests.
2. **Lines flatter Declare.** It averages 15.8 tokens per line against 6–9 for the others, and Prettier or elm-format would never allow its long lines. By tokens, Declare is similar to SvelteKit and Solid, not 2–5× smaller. The honest summary is "roughly the size of the leanest JS implementations, plus its own styling, in one file". The line ratios (e.g. 2.7× vs React+RTK) are not that summary.
3. **Feature coverage differs.** React FSD skips Markdown and tag chips. Elm skips tag chips. SvelteKit is server-rendered, which moves fetching to the server and makes the client code smaller. Only Angular and the official Vue meet the full selector/debug/E2E contract. That contract adds code: `__conduit_debug__`, `name` attributes, exact texts. Declare doesn't meet it and hasn't been run against the official suite.
4. **Generated code is not counted** but does real work. React FSD's Orval client is not in the repo at all. Vue 3 mutoe's `api.ts` is committed: 572 code lines. Both also give typed API models, which Declare gets through `schema` declarations (~5 lines).
5. **Framework conventions inflate some counts.** Elm's elm-format layout and explicit decoders and types, React FSD's file-per-concern architecture (written as a teaching template for large apps), Angular's decorators and DI, and the JSDoc in React+RTK all add lines without adding features. The React+RTK repo is a partial Redux Toolkit migration (a fork of the archived 2021 gothinkster app).
6. **Age and maintenance vary.** Elm (2019) and Solid (2022) target older APIs and framework versions. Angular, Vue and SvelteKit were updated in 2026.
7. **Authorship.** The Declare version was written in one session by an AI agent that, by its own account, knows RealWorld well from training data. The spec's design work was already done. Its test (`flow.mjs`) was written by the same agent. The others are human-written, mostly by experienced maintainers, and refined over years.
8. **The measurement is mine.** The category split uses path rules and, for Declare, line ranges. These are reproducible (`tools/count.py`) but involve judgment calls, e.g. Angular `UserService` counted as API rather than state, and Elm model modules counted as "other". HTML shells were left out, although Elm's holds 25 lines of port JS.

## 7. Candidates looked at and left out

- **gothinkster/react-redux-realworld-example-app** (5.6k stars) is archived and was last changed in 2021. Its RTK fork was used instead.
- **hesxenon/realworld-htmx** (11 stars, 2023) is a Bun server with its own database and htmx partials. It is not a client of the RealWorld API, so its "front end" can't be separated out.
- **Qwik** (joma1021/realworld-qwik, 5 stars) and **Lit** forks are too small or too inactive to be representative.
- codebase.show, the project's own listing, is a JS-rendered app and could not be read statically. Implementations were picked from the realworld-apps organisation and from GitHub search by stars.

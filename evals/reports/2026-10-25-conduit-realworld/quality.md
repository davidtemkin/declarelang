# RealWorld (Conduit) front ends: code quality, density, and maintainability

Date: 2026-10-25. This is a follow-up to [`report.md`](report.md) in the same folder, whose opening lists the clones and their commits. It is a static reading only: nothing was installed, built or run, and no clone was changed.

**Sources**

| Implementation | Path |
|---|---|
| Declare | this folder (`conduit.declare`, `conduit.ts`, `session.ts`) |
| The other eight | each clone's `src/` (commits in [`report.md`](report.md)) |

Line numbers refer to those files. Paths for the other eight are relative to their `src/` folder.

**How the reading was done**

For each app I read:
- the home feed, including tabs and paging
- the article preview
- the article page
- the editor
- the data and auth layer

Helper agents did the first pass over the eight non-Declare apps, using one fixed brief. I read the Declare app and its language document (`docs/declare.md`) myself. I then checked the strongest claims against the source, including every bug called out below.

**How to read the results**
- All ratings are my judgment, not measurements.
- Line counts in the traces are approximate. They count what a reader has to read, not file sizes.

**Fairness caveats (from the first report, all still apply)**
- The Declare app was written by an AI agent in one session. The others are human-written and were refined over years.
- Declare has to do its own styling. The others get the shared 1,205-line Conduit stylesheet for free.
- Only the Declare app and Elm were checked against their own languages' rules by me. For the JS apps, "bug" means a defect plainly visible in the code, not one confirmed by running it.

---

## Part A — Code quality: readability and structure

### Declare (`conduit.declare`, 902 lines, plus two small TS files)

**Verdict.** The app reads top to bottom in a fixed order: schemas, a `DataSource` subclass, the theme, icons, about 19 small view classes, then one `App [...]`. That `App` holds all state, every request and every page.

Names are good and specific: `toggleFavorite`, `favSlug`, `shown` (the article being viewed), `mine`, `shownProfile`, `listQuery`, `draftSource`. Finding a behaviour is easy, because there is only one place it can be: the class that draws it, or the `App` section headed `── reading ──`, `── writing ──` or `── session ──`.

The fetching model is the strongest part. It uses the language as intended (declare.md §7):
- every read is an `auto` DataSource whose `url` is a constraint over app state
- `""` means "don't fetch"
- loading, failure and empty states are bound directly in the view

The weaknesses are:
- **One large object.** `App` is a god object of about 370 lines.
- **Classes tied to globals.** Several classes are not reusable: `Feed` reads `app.articles` directly, and `ArticleActions` reads `app.shown` directly.
- **Silent write failures.** Writes have no error display, except the forms and the comment post.
- **Hard-coded icon lists.** Two classes list their icons by hand.
- **Style mixed with behaviour.** Styling is interleaved with logic on almost every view line (see Part B).

Type safety is good for an untyped-looking language. Schemas make `:path` reads and `.value` typed at compile time (§7), and every `{ }` body is type-checked TypeScript. There are a handful of `!` and `as` escapes.

**Examples**
- Good, the fetch decision as a single constraint: `articles: ArticleList [ url = { app.dest == "" ? (app.tab == "feed" && app.authed ? … : "" } ]` (584–590). The tags, article, comments, profile and draft sources follow the same pattern (591–599).
- Good, loading, error and empty states in one bound text: `text = { app.articles.failed ? "Couldn't load articles: " + app.articles.error : app.articles.loading && !app.articles.loaded ? "Loading articles..." : "No articles are here... yet." }` (295–296).
- Good, forms built fresh on each visit: `form: EditorForm [ exists = { app.dest == "editor" && app.authed && (app.slug == "" || app.draftSource.loaded) } ]` (865). This also guards against showing an empty edit form before the article arrives.
- Weak, coupling through the tree: `TagChip.press()` does `const form = parent.parent as EditorForm` (476). That is a cast plus a structural assumption. Declare's own rule is that "a child reports to its owner by calling a method" (§8).
- Weak, `Feed` is welded to one source: `datapath = { app.articles.value }` and eight more `app.articles.*` reads (291–304). The class cannot show any other list. This matters in Part C.
- Weak, adding an icon means editing two classes: `Btn` hard-codes one child per icon (`HeartIcon [ visible = { classroot.icon == "heart" } …` through `GearIcon`, 158–162), and `NavLink` does the same (898–899).
- Weak, inconsistent page gating and tabs. Some pages use `visible = { app.dest == "" }` (720, 761, 816, 863) and others use `shows = "login"` (853, 856, 859). Home tabs are state (`press() { app.tab = "feed" }`, 736–741), while profile tabs are links (`link = { "#profile/" + … }`, 842–843). The comment at 566–567 explains the tab choice, but the reader still has to hold two models.
- Weak, silent write failures: `favorite`, `followReq`, `removeArticle` and `removeComment` (613–676) have `onLoad` but nothing binds their `.failed`. A failed delete just does nothing. The preview's favorite `Btn` also has no `busy` (267), unlike the form buttons.
- Leftover: the comment "Icons — the five marks the templates use" (68) sits above four icon classes. `PlusIcon` and `CloseIcon` come from the library.

### React + Redux Toolkit (khaledosman fork)

**Verdict.** The codebase is stuck halfway through a migration. The newer RTK slices in `features/` are tidy, with co-located selectors (`features/auth/authSlice.js:235-239`) and a `Status` enum. The older `reducers/` files are not.
- **Feed state is overloaded.** `reducers/articleList.js` holds feed, tag, author and favorites state.
- **State shape varies.** Different reducers replace the whole state with different shapes.
- **Fetch decisions are hidden.** They live inside thunks that read `getState()`.
- **Router v6 migration bugs remain.**
- **Typing is unchecked JSDoc.**
- **Rejected thunks are ignored.**
- **Leftovers from connected-react-router remain**: `app/history.js`, plus `app/store.js:2,24,30`.

**Examples**
- The fetch choice is buried in a thunk: `thunkApi.getState().articleList.tab === 'feed' ? agent.Articles.feed(page) : agent.Articles.all({…` (`reducers/articleList.js:16-28`).
- State shape drifts: `getArticlesByTag.fulfilled` returns a fresh object without `tab` (`reducers/articleList.js:102-108`).
- Bug (verified): `useEffect(() => { … dispatch(getArticle(slug)) … }, [match]);` (`components/Article/index.js:30-36`). `match` is always undefined under Router v6, so moving from one article to another does not refetch.
- Bug (verified): `dispatch(slug ? updateArticle(article) : createArticle(article)); navigate('/');` (`components/Editor.js:113-114`). It navigates before the reply arrives, so validation errors are never shown. The intended redirect is commented out (`App.js:42`).
- Bug: `navigate.push(...)` on the function that `useNavigate` returns (`components/Profile.js:60`).
- Missing: there is no favorite or follow button on the article page, because `ArticleMeta` renders `isAuthor ? <ArticleActions /> : null` (`components/Article/ArticleMeta.js:43`).
- Good: `agent.js:221-314` is one readable, commented API surface. It is plain `fetch`, despite superagent appearing in `package.json`.

### React "FSD" (React Router 7 + TanStack Query + Zod)

**Verdict.** This is the most framework-native of the React pair. Each page is a folder of `*.route.ts`, `*.loader.ts`, `*.ui.tsx`, `*.paths.ts` and `actions/*.action.ts`, so file names tell you where behaviour lives.
- **URL state is validated.** It is parsed with Zod and normalised with a `replace` redirect.
- **One error policy.** It is applied everywhere (`shared/api/handleApiError.ts:12-35`).
- **Optimistic UI is derived, not stored.** It comes from `fetcher.formData`.
- **Heavy duplication.** Pages may not import from each other, and there are no shared entity or feature layers. The three `article-favorite-toggle.action.ts` files are identical, the favorite button is copied three times, and `parseTags` twice.
- **The generated client isn't in the repo.** Neither are its types, so the checked-in code is not self-contained.
- **TanStack Query is used only as a request de-duplicator.** There is no `useQuery` and no invalidation.
- **No Markdown.** The article body renders as `<p>{body}</p>` (`pages/article/article.ui.tsx:54`).

**Examples**
- Good, validated URL state: `feed: zod.catch(zod.optional(zod.literal('personal')), undefined)` (`pages/home/home.state.ts:16-19`), plus `throw replace(...)` (`home.loader.ts:23-26`).
- Good, an optimistic count with no extra state: `favoritesCount + Number(isFavorited) - Number(favorited)` (`home.ui.tsx:178`).
- Weak, copies: `pages/{home,article,profile}/actions/article-favorite-toggle.action.ts` are identical, 29 lines each.
- Minor inconsistency: tabs build links with `toHomeSearch` (`home.state.ts:88-112`), but pagination edits `location.search` by hand (`home.ui.tsx:210-214`).
- Good, the editor: an uncontrolled `<Form method="POST">` with `fieldset disabled={isSubmitting}` and errors from `useActionData` (`editor.ui.tsx:32-49`).

### Angular (realworld-apps reference)

**Verdict.** This is conventional, well-organised modern Angular. The layout is `core/` plus `features/<area>/{components,pages,services,models}`, so the right file is usually guessable.
- **The best part.** The auth and error layers are documented and centralised: `errorInterceptor` handles 401 once (`core/interceptors/error.interceptor.ts:40-51`), and `AuthState` is a four-value union (`core/auth/services/user.service.ts:10`).
- **Mixed styles mid-migration.** Constructor injection sits next to `inject()`, and `@Input()` next to signals.
- **No shared article state.** Each preview keeps its own copy, patched through `(toggle)` events.
- **Type-safety holes.**
- **One latent subscription bug.**

**Examples**
- Bug (verified): `this.userService.isAuthenticated.pipe(switchMap(…), takeUntilDestroyed(this.destroyRef)).subscribe(…)` (`features/article/components/favorite-button.component.ts:53-68`). There is no `take(1)`, so each click leaves a live subscription, and a later `currentUser` emission re-runs the favorite call. In the signed-out branch `isSubmitting` stays `true`.
- Type holes:
  - `// @ts-ignore` (`articles.service.ts:17`)
  - `articleForm: UntypedFormGroup = new FormGroup<ArticleForm>(…)` (`editor.component.ts:25`)
  - `type: string` instead of a union (`article-list-config.model.ts:2`)
  - `signal<Article>(null!)` (`article-preview.component.ts:36`)
- Error handling: `runQuery` subscribes with only `next`, so a failed list stays `LOADING` forever (`article-list.component.ts:121-132`). It also mutates its input: `this.query.filters.limit = this.limit` (117).
- Duplication: `article.component.html:16-41` and `63-88` are the same block, and the header nav is repeated (`header.component.html:24-53` and `56-82`).
- Leftover: an `isAuthenticated` signal that is set but never read (`home.component.ts:22,45`).

### Vue 3 (mutoe, TypeScript)

**Verdict.** This is the more carefully organised Vue app. Composables (`use-articles`, `use-favorite-article`) own data, one `useAsync` wraps loading and 401 handling, and the generated client gives types end to end. `ArticlesList` serves every feed, driven by route name, and routes are a typed `AppRouteNames` union.
- **Robustness gaps.** Async `setup` runs under `<Suspense>` with no error boundary, and the editor has no error handling at all.
- **A half-done 401 handler.** It clears localStorage but not the Pinia user.
- **Indirect favourite flow.** State goes from the preview up through an emit into an index write.
- **Repeated feed types.** They are listed in four parallel places.

**Examples**
- Good, exhaustive typing: `computed<Record<ArticlesType, boolean>>` (`components/ArticlesListNavigation.vue:93`). A new feed type won't compile until it is handled.
- Weak, the fetch dispatch: an if-chain of five near-identical `.then(res => res.data)` branches (`composable/use-articles.ts:20-39`, verified).
- Bug: `userStorage.remove()` on 401 does not reset the store (`utils/use-async.ts:23`), so the nav still shows the user as signed in.
- Error handling: `reactive(await api.articles.getArticle(slug)…)` has no catch anywhere (`components/ArticleDetail.vue:60`).
- Editor: `addTag` pushes empty and duplicate tags and fires on both `@change` and Enter (`pages/EditArticle.vue:41-42, 101-104`). There is a `// FIXME` at 112.

### Vue 3 (realworld-apps official, plain JS)

**Verdict.** Easy to read line by line. `common/api.service.js:4-35` is a short fetch layer whose comments explain why, not just what.
- **Global singleton stores.** `home` holds the one list shared by Home and Profile, and `article` holds both the open article and the editor draft. Stores reach into each other.
- **Auth re-checked on every navigation** (`main.js:20-21`).
- **Almost no static safety.** It is plain JS.
- **Real bugs** in follow and in error handling.
- **Sync is centralised.** That makes cross-view features cheap (see Part C).

**Examples**
- Good, a centralised sync point: `useHomeStore().updateArticleInList(data.article); this.article = data.article;` (`store/article.js:45-49`).
- Bug: `if (props.article.following)` should be `article.author.following`, and the profile store it follows through is never loaded on the article page (`components/ArticleActions.vue:90-93`; `views/Article.vue:70-76`).
- Stale data: `fetchArticle(...).catch(() => null)` has no reset, so a failed load shows the previous article (`views/Article.vue:73`).
- Inconsistent tabs: the tag tab is a raw `<a :href>` and reloads the page, while the others call `goTo` (`views/Home.vue:33-35`).
- Duplication: the favorite toggle is near-identical in `ArticleMeta.vue:83-93` and `ArticleActions.vue:73-83`, and neither awaits or catches.

### SvelteKit

**Verdict.** The codebase is small and flat. File-based routes mean the URL tells you where behaviour lives, every `load` or action is 10–30 lines, and `lib/api.js` is 40 lines. The server owns the token (`hooks.server.js`), and components only render.
- **Light on types.** It is plain JS with spotty JSDoc.
- **Mixed reactivity APIs.** `$app/stores` sits next to `$app/state`.
- **Inconsistent error paths.**
- **Some real bugs.**
- **Missing controls.** The article page has no favorite or follow button.

**Examples**
- Bug (verified): `api.post(\`articles/${params.slug}/favorite\`, …)` with no `await`, then `redirect(307, …)` (`routes/article/[slug]/+page.server.js:59-65`). The reload can race the write. Without JS, a 307 re-POSTs to `/`, which has no action.
- Naming: `const favorited = data.get('favorited') !== 'on'` actually means "should favourite now" (same file, 57).
- Non-idiomatic optimistic update: it mutates the `article` prop (`article.favoritesCount -= 1`, `lib/ArticleList/ArticlePreview.svelte:24-30`).
- Inconsistent errors: creating an article uses `fail(400, result)` (`editor/+page.server.js:29`), while editing uses `error(400, result.errors)` (`editor/[slug]/+page.server.js:31`).
- Leftovers:
  - `routes/profile/+page.svelte` is empty.
  - `profile/@[user]/+page.server.js:7` destructures `page` from a function that returns `pages`, so profile paging is missing.

### Elm (elm-spa-example)

**Verdict.** This is a deliberately pedagogical TEA codebase.
- **Opaque types enforce invariants.** `Cred` cannot leak its token (`Api.elm:32-51`), `Endpoint` can only be built in one module, and `Article Preview` and `Article Full` are distinct phantom types (`Article.elm:62, 162-164`).
- **Every page has the same shape**: `Model`, `Msg`, `init`, `update`, `view`, `subscriptions` and `toSession`, with an explicit `Status` for loading.
- **Heavy boilerplate.** `Main` routes every page by hand.
- **Long indirection.** A click passes through about eight modules.
- **A dead backend.** `Api/Endpoint.elm:56` points at it.
- **Dead code and a few copy-paste bugs.**

**Examples**
- Bug (verified): `CompletedLoadComments (Err error) -> ( { model | article = Failed }, Log.error )` (`Page/Article.elm:355-356`). A failure to load comments blanks the whole article.
- Bug: `ClickedTab` and `ClickedTag` fetch page 1 but never reset `feedPage` (`Page/Home.elm:246-260`).
- Bug: the `edit` encoder has no `tagList`, so tag edits are dropped (`Page/Article/Editor.elm:549-553`).
- Dead code:
  - `Api.decode`, and `cacheStorageKey`/`credStorageKey` (`Api.elm:72-78, 293-300`). The real key is `"store"` in `index.html`.
  - `Log.error` is just `Cmd.none` (`Log.elm:18-20`).

### SolidJS

**Verdict.** Compact and clever, but fragile.
- **One store.** All state is a single `createStore` whose fields are getters over `createResource`s (`store/index.js:16-36`).
- **Hidden origins.** Domain factories add methods to a shared `actions` object, so you have to read `index.js` to learn where an action comes from.
- **Untyped and terse.** It is untyped JS with comma-chained `const`s and regex-string routing.
- **Real bugs on the main paths.**

**Examples**
- Bug (verified): `article.favorited ? unmakeFavorite(slug) : makeFavorite(slug);`, where `slug` is never declared (`components/ArticleList.js:8`). Clicking Favorite in any list throws a ReferenceError.
- Error handling (verified): `fetch` doesn't reject on HTTP errors, and the `catch` returns `err` instead of throwing (`store/createAgent.js:17-26`). So the 401 logout and the optimistic rollbacks in `createArticles.js:51-56` are dead code.
- Inconsistency:
  - `feed: () => send("get", "/articles/feed?limit=10&offset=0")` ignores the page it is passed (`createAgent.js:52`).
  - `byAuthor` hard-codes limit 5, while paging divides by 10.
- Reactivity footguns: destructuring the store into non-reactive snapshots (`pages/Home/index.js:7`, `components/ArticlePreview.js:6`).
- Good: `makeFavorite`'s fine-grained, optimistic path update (`createArticles.js:42-59`) updates every view of that slug.

### Summary table (my judgment, 1–5)

| | Readability | Structure | Consistency | Type safety | Idiomatic use | Notable defects seen in reading |
|---|---:|---:|---:|---:|---:|---|
| Declare | 3.5 | 3.5 | 3.5 | 4 | 4 | silent write failures; `parent.parent` cast; `Feed` tied to one source |
| React+RTK | 3 | 2 | 2 | 1.5 | 2 | Router v6 refetch bug, editor errors never shown, `navigate.push` |
| React FSD | 4 | 4 | 4 | 3.5 | 4.5 | three-way duplication; no Markdown; generated code absent |
| Angular | 4 | 4 | 3 | 3 | 3.5 | leaking favorite subscription; list stuck loading on error |
| Vue 3 (mutoe) | 4 | 4 | 3 | 4 | 4 | 401 leaves store signed in; no error boundary |
| Vue 3 (official) | 4 | 3 | 3 | 1 | 3 | follow-on-article bug; stale article on failed load |
| SvelteKit | 4 | 4 | 3 | 2 | 3 | un-awaited favorite + 307; profile paging missing |
| Elm | 3.5 | 4 | 4 | 5 | 4 | comments error blanks article; tag edits dropped |
| Solid | 3 | 3 | 2 | 1 | 3 | favorite from list throws; errors swallowed |

**Notes on the ratings**
- Declare's readability score assumes a reader who has learned the language. For one who hasn't, see Part B.
- Its type-safety score reflects compile-time-checked schemas, datapaths and theme tokens, plus type-checked `{ }` bodies.
- None of the Declare defects found are crash bugs. Several JS apps have crash or wrong-behaviour bugs on main paths, which the years of maintenance did not remove.
- Declare has a 53-step end-to-end test against a live API. The test was written by the same agent, so it proves less than an independent suite would.

---

## Part B — Does Declare's density make it harder to read?

**Short answer.** Line for line, yes. Per feature, no: it is usually easier, provided the reader knows the language. Learning the language is the real cost, and it is not small.

### What the numbers say

Non-blank lines, characters per line:

| | Median | 90th percentile | Max | Lines > 100 | Lines > 120 |
|---|---:|---:|---:|---:|---:|
| Declare | **53** | **110** | 152 | **114** of 787 | **41** |
| React FSD | 31 | 78 | 120 | 70 | 0 |
| Angular | 31 | 69 | 169 | 42 | 1 |
| Solid | 30 | 63 | 108 | 5 | 0 |
| Elm | 29 | 65 | 203 | 22 | 5 |
| Vue (official) | 27 | 56 | 85 | 0 | 0 |
| React+RTK | 25 | 55 | 109 | 2 | 0 |
| Vue (mutoe) | 25 | 54 | 152 | 22 | 3 |
| SvelteKit | 24 | 51 | 184 | 1 | 1 |

The typical Declare line is about twice as long as anyone else's, and 15.8 tokens per line against 6–9. About one line in seven runs past 100 characters, and about one in twenty past 120, where an editor split pane or a GitHub diff will wrap or scroll. Extreme lines are not the problem; Elm and SvelteKit have longer ones. What is different is that dense lines are the norm.

### What fills a dense line

Take the preview's title, line 274:

```
Text [ width = 100%, fontSize = 24, fontWeight = semibold, textColor = { provided("theme").ink }, text = :title ],
```

That line carries one data binding and four styling facts. In React+RTK the same thing is `<h1>{article.title}</h1>` (`components/ArticlePreview.js:83`). The four styling facts live in a different file the authors never wrote: `.article-preview .preview-link h1 { font-weight: 600; font-size: 1.5rem; … }` (`_spec/assets/theme/styles.css:1204-1209`).

So most of Declare's extra density is **co-located facts, not noise**. What JSX spreads across markup, a class name and a stylesheet rule, Declare puts on one line. The favorite button shows the same thing for behaviour (267–270):

```
fav: Btn [ tone = "brand", icon = "heart", label = { "" + :favoritesCount }, solid = :favorited,
    accessibilityLabel = { (:favorited ? "Unfavorite " : "Favorite ") + :title },
    press() { app.toggleFavorite(:slug, !:favorited) }
    ]
```

Those four lines hold the look (tone, icon, solid when favorited), the data (count, state), accessibility and the click. In RTK the equivalent is:
- the JSX at `ArticlePreview.js:76-78`
- the class-picking constants and `handleClick` at `8-9, 39-51`
- the thunk at `reducers/articleList.js:40-48`
- the reducer at `72-82`
- the `.btn-outline-primary` rules in the shared CSS

There is genuine noise too:
- **`provided("theme").` appears 83 times.** That is about 500 tokens, roughly 4% of the file, spent saying "from the theme". A shorter spelling, or a local alias, would remove most of it.
- **`classroot.` appears 117 times.** It is necessary for correctness inside classes (§4), but it adds weight to every icon and label line.
- **Touch sizing is repeated.** `app.touchDevice ? 44 : …` appears on 7 lines; it is responsive sizing that a CSS file would state once.

The cost of co-location is that **you cannot skim for behaviour**. To find the logic in `Preview`, the eye has to step over `fontSize`, `padding` and `stroke` on nearly every line. In JSX plus a stylesheet, the markup is mostly structure and the styling is out of sight.

### Two concrete traces

I counted the distinct places a reader must visit and the lines they must actually read.

**(a) "What happens when I click Favorite on a preview?"** This covers the button, the request, the state update and the re-render, plus the signed-out case.

**Declare.** One file, about 6 locations, about 36 lines:
1. The button: `Preview.fav` (267–270).
2. `toggleFavorite`, including the signed-out redirect to `register` (625–630).
3. The `favorite` DataSource: method and URL derived from `favSlug`/`favOn`, and `onLoad` merging into the list and the open article (611–624).
4. `ArticleList.merge` (47–52).
5. The auth header, one fact: `app.auth` (552).
6. The list's datapath, which makes `:favoritesCount` re-read (297–299).

| | Files | Locations | Lines read |
|---|---:|---:|---:|
| **Declare** | **1** | **6** | **~36** |
| React+RTK | 5 | 8 | ~120 |
| SvelteKit | 6 | 7 | ~120 |
| Solid | 6 | 8 | ~130 (and the path throws) |
| Angular | 9 | 11 | ~150 |
| Vue (official) | 8 | 10 | ~170 |
| Vue (mutoe) | 9 | 11 | ~210 (75 of it generated client) |
| Elm | 8 | ~16 | ~230 |
| React FSD | 12 (+1 not in repo) | 14 | ~330 (the refresh is an implicit loader revalidation) |

**(b) "How does the home feed decide what to fetch?"** This covers tab and tag clicks, the page number, and the request.

**Declare.** One file, about 5 locations, about 45 lines:
1. The tabs and their `press` (736–742), plus `TagButton.press` → `showTag` (195, 691–695).
2. The `tab`, `tag` and `page` state (569–571).
3. `onChange` resetting the page (573–579).
4. `listQuery` and the `articles` URL constraint (583–590).
5. `ArticleList`, which has `auto = true` and the headers (43–46).

| | Files | Locations | Lines read |
|---|---:|---:|---:|
| **Declare** | **1** | **5** | **~45** |
| SvelteKit | 5 | 7 | ~100 |
| Solid | 8 | 10 | ~190 |
| React+RTK | 6 | 11 | ~210 (plus reasoning about state left by earlier actions) |
| Angular | 6 + interceptors | 9 | ~230 (one page click causes two requests) |
| Elm | 7 | 13 | ~240 |
| React FSD | 6 | 8 | ~250 |
| Vue (official) | 7 | 11 | ~260 |
| Vue (mutoe) | 9 | 12 | ~320 |

On both questions, Declare needs 3–9× fewer lines read, and one file instead of five to twelve. The dense lines are fewer, and they are the *right* lines. SvelteKit is the only one close, and for the same structural reason: the request is a function of the URL.

### The cost of an unfamiliar language

The traces assume the reader understands what they read. For Declare that is a real assumption. To follow trace (a) correctly a reader needs several pieces of the language:
- **Constraint vs. computed default.** `url = { … }` is an owned constraint, while `favSlug: string = ""` is plain state (§5, "What you can assign").
- **The settle.** §5 says that inside a handler "nothing derived from it has moved yet". That raises an obvious question about `toggleFavorite`, which writes `favSlug` and then calls `this.favorite.fetch()`: does the fetch see the old URL? The end-to-end test favorites and unfavorites successfully (`flow.mjs:111-125`), so the runtime evidently resolves this. But nothing on the page tells the reader so, and the document's own wording points the other way. "Set the parameters as state, then fetch" is the pattern used for every write in the app (favorite, follow, delete comment), so this is the one place where the model is genuinely not self-explaining.
- **Datapath scope.** `:favoritesCount` resolves against the nearest `datapath`, here `:articles[]` on line 299, which is three classes away from the button.
- **The precise words.** `classroot`, and `exists` versus `visible`.

`declare.md` is 928 lines and covers all of this. A React developer reads the RTK trace on day one. A Declare newcomer needs perhaps an hour or two with the document first. Declare is not in any model's or developer's training data, so tooling help (completion, Stack Overflow, LLM recall) is also thinner. That is a fixed entry cost. The per-feature saving above pays it back across a codebase, but not on a one-off read.

### Where Declare is genuinely harder, and how to split it

1. **Boolean soup in one attribute** (294):
   ```
   visible = { app.articles.loading && !app.articles.loaded || app.articles.failed || app.articles.loaded && app.articles.articles().length == 0 },
   ```
   This mixes `&&` and `||` with no parentheses, and the reader has to recall precedence. It should be named facts on `Feed`:
   ```
   firstLoad: boolean = { app.articles.loading && !app.articles.loaded },
   empty:     boolean = { app.articles.loaded && app.articles.articles().length == 0 },
   status: Text [ visible = { classroot.firstLoad || app.articles.failed || classroot.empty }, … ]
   ```
   The same names would then simplify the ternary on 295–296.

2. **Nested ternaries for style** (150, 157):
   ```
   toneColor: Color = { tone == "brand" ? provided("theme").brand : tone == "danger" ? provided("theme").danger : provided("theme").textFaint },
   ink: Color = { filled && (tone != "plain" || solid) ? provided("theme").onBrand : tone == "plain" ? provided("theme").quiet : toneColor },
   ```
   Hoisting the theme once removes about a third of the characters: `th: object = { provided("theme") }`, if the token typing allows it. Otherwise move the choice into a method `toneOf(t)`. Either way, one condition per line.

3. **The feed URL** (585–590): three levels of ternary across six lines. Name the branches instead:
   ```
   homeUrl: string    = { app.tab == "feed" && app.authed ? app.api + "/articles/feed?" + app.listQuery
                        : app.tab == "tag" ? app.api + "/articles?tag=" + encodeURIComponent(app.tag) + "&" + app.listQuery
                        : app.api + "/articles?" + app.listQuery },
   profileUrl: string = { app.api + "/articles?" + (app.favoritesTab ? "favorited=" : "author=") + encodeURIComponent(app.profileName) + "&" + app.listQuery },
   articles: ArticleList [ url = { app.dest == "" ? app.homeUrl : app.dest == "profile" ? app.profileUrl : "" } ],
   ```

4. **Leaf lines that pack three concerns** (521):
   ```
   trash: Control [ width = { app.touchDevice ? 44 : 24 }, height = { app.touchDevice ? 44 : 24 }, visible = { app.username == :author.username },
   ```
   That is size, size and an ownership rule at 151 characters. Put `visible` on its own line, and size both axes from one `hit: number = { app.touchDevice ? 44 : 24 }`.

5. **Behaviour hidden by globals.** `Feed [ ]` (744, 845) and `ArticleActions [ x = center ]` (781) look parameter-free. What they show is decided by `app.articles` and `app.shown`, which the reader has to know. This is the opposite of density (too *little* on the line), and it is the most important readability defect for maintenance (see Part C).

The house rule "a leaf goes on one line" (§12) is what produces most of the long lines. The formatter does not wrap them. A rule such as "one line per concern (look / data / behaviour) when a leaf passes ~100 characters" would keep the co-location and fix most of the wrapping.

### Verdict

Density makes each Declare line slower to read: about twice the characters, with frequent nested ternaries and repeated `provided("theme")`. It also makes behaviour harder to skim, because styling sits on the same lines. But the density is mostly facts that other stacks scatter across markup, class names, stylesheets, handlers, thunks and reducers. On the two traced questions, a Declare reader reads 36–45 lines in one file, against 100–330 lines in five to twelve files elsewhere.

For a reader who knows the language, comprehension is easier overall. For a newcomer, the language's concepts are the dominant cost, especially the settle and constraint-ownership rules, and one pattern (write state, then `fetch()`) is not self-evidently correct from the document. The fixable part is mechanical: name compound conditions, hoist the theme, and split leaves past ~100 characters by concern.

---

## Part C — Maintainability: one envisioned feature, not built

**Feature:** "Reading list. A signed-in reader can save any article for later, from an article preview in any feed and from the article page. Saved articles appear under a new 'Reading list' tab on the home page, newest-saved first, paged like the other feeds, and can be removed from there. The nav shows how many are saved. The RealWorld API has no endpoint for this, so the list is kept in the browser (localStorage), per user, and must stay in sync across all views without a reload."

Two decisions apply to every implementation.

**1. What to store.** The API has no "fetch by slugs" endpoint, so storing only slugs costs up to 10 `GET /articles/:slug` per page, and deleted articles 404. A snapshot of the preview fields plus `savedAt` renders instantly, but `favorited`, `favoritesCount` and `author.following` go stale. Unless favorite replies also patch the snapshot, favoriting from the Reading list tab shows the wrong count or toggles the wrong way.

**2. Two bugs every version must avoid.**
- **Empty last page.** Removing the last item on the last page leaves an empty page, so the page must be clamped.
- **Username rename.** Renaming the user in Settings orphans a storage key built from the username.

### Declare

**What changes.** Two files: `conduit.declare` and `session.ts`.

**Persistence (`session.ts`).** This is the right home: it is already the `host = browser` script, and §5 allows `window`/`localStorage` only there. Add:

```ts
export function loadSaved(user: string): Article[]   // JSON.parse(localStorage["conduit/saved/" + user] ?? "[]"), try/catch
export function saveSaved(user: string, list: Article[]): void
```
That is about 12 lines. The `Article` type comes from the schema. The script cannot see schema names, so it returns `object[]` and the App casts once.

**State (`App`).** Add about 10 lines:
- `saved: Article[] = []`, the list, newest first. Every change assigns a new array, which is what notifies (§5).
- `savedSlugs: string[] = { app.saved.map((a) => a.slug) }`
- `toggleSaved(a: Article) { app.saved = app.savedSlugs.includes(a.slug) ? app.saved.filter((x) => x.slug != a.slug) : [{ ...a }, ...app.saved] }`
- `savedPage: Dataset [ contents = { { articles: app.saved.slice(app.page * app.pageSize, (app.page + 1) * app.pageSize), articlesCount: app.saved.length } } ]`. It has the same shape as an `ArticleList` reply, so `Preview`'s datapaths (`:articles[]`, `:slug`, `:author`, …) work unchanged.

**Per-user loading and saving.** Extend `trackChanges` to `["token", "location", "tab", "tag", "username", "saved"]`. In `onChange`:
- on `username`, `app.saved = loadSaved(app.username)`
- on `saved`, `saveSaved(app.username, app.saved)` when `app.username != ""`

**Trap in the existing code.** The current `onChange` (574–579) is `if (c.name == "token") … else app.page = 0`. Adding `"saved"` without rewriting that `else` would reset the page on every save or remove. That is exactly the kind of bug the feature invites. The loop needs an explicit `switch`.

**Sign-in, sign-out and reload come out right without extra code:**
- On reload, `username` is `""` until `me` loads (555–556), then it changes and the list loads.
- Sign-out makes `username` `""`, and the list empties.
- A save made while `token` is set but `me` hasn't arrived must be refused, so gate the buttons on `app.username != ""`, not `app.authed`.

**The tab and the fetching model.** This is where Declare is awkward, and the awkwardness is architectural.
- **The type and the button.** Add `"saved"` to `tab`'s type (569), and a `Tab [ visible = { app.authed }, label = "Reading list", on = { app.tab == "saved" }, press() { app.tab = "saved" } ]` beside the others (736–742).
- **Stopping the fetch.** The `articles` URL constraint needs a first branch, `app.tab == "saved" ? ""`, so nothing is fetched. "Empty URL means don't fetch" handles that cleanly.
- **The view is the problem.** `Feed` is welded to `app.articles`. Nine reads at 291–304 bind its list, status text, loading opacity and page count to that one DataSource. So `Feed` has to be generalised, either with an attribute it takes or with App-level facts such as:
  - `listValue: object = { app.tab == "saved" && app.dest == "" ? app.savedPage.value : app.articles.value }`
  - `listPages`, `listLoading` and `listFailed`
- **Collateral edits.** All nine reads in `Feed` change. `PageNum` and the pager read `app.articles.pages()`, so they change too. That is about 6 new lines and 9 edited ones.
- **Why it fits badly.** The pattern "a list is a DataSource whose URL is a constraint" is elegant for server lists. A local list does not fit it. It fits beside it, through a derived `Dataset`. Also, `ArticleList` is not reused for the local list: it holds an `auto` request, not data you assign.

**Paging.** Reuse `app.page`, which already resets when `tab` changes (`onChange`). `savedPage` slices by it. Removing the last item on the last page needs a clamp in `onChange` on `saved`: `if (app.page > 0 && app.page * app.pageSize >= app.saved.length) app.page = app.page - 1`.

**Buttons and sync.**
- **Preview.** Add a `Btn [ label = { app.savedSlugs.includes(:slug) ? "Saved" : "Save" }, solid = { app.savedSlugs.includes(:slug) }, visible = { app.username != "" }, press() { app.toggleSaved(:@) } ]` beside `fav` (267). This uses `:@`, the record itself (§7). The same button removes from the list on the Reading list tab, which covers "can be removed from there".
- **Article page.** In `ArticleActions` (489–507), add the same with `app.shown!`. It must be visible whether or not the article is `mine`, while the existing buttons split on `mine`.
- **Sync is free.** Every view reads `app.saved` through constraints, so the preview in any feed, both action bars on the article page, the tab and the nav count update in the same settle, with no events or store subscriptions. This is the clearest win for the architecture.
- **Snapshot staleness.** It needs one addition in `favorite.onLoad` (616–623): replace the matching entry in `app.saved`. That is about 3 lines.

**The nav count.** `NavLink` (883–902) is link-only: `link = { "#" + to }`, with no `press`. Because the home tab is not in the URL (by design, 566–567), a nav item can't link to "the Reading list tab". The options are:
- **Show the count without a link.** Use a `Text` or badge with `text = { "Reading list · " + app.saved.length }` (about 3 lines).
- **Make it clickable.** Give `NavLink` an optional press, about 5 lines, and it then needs to become a `Control` to be keyboard-activatable.
- **Put the reading list in the location** (`#reading`). Then `homePage`'s `visible` and the `dest` checks in `articles.url`, `tags.url` and the page title all have to learn a second home address.

None is hard, but each is a design decision the existing code forces.

**Not covered.** Cross-tab sync, which the brief doesn't require. A `storage` event can't reach node state from a script, because "a constraint reading a script `let`" and script writes to state are refused (§5). That would need a host event member, if one exists. I did not check.

**Risks**
- The `onChange` `else` trap above.
- Forgetting one of `Feed`'s nine `app.articles` reads, which would show the loading or empty text of the hidden API feed over the local list.
- Writes under `""` before `me` arrives.
- Stale snapshots if the favorite merge is skipped.
- `loadSaved` output isn't schema-validated unless it is routed through a `Dataset` with `schema`, so a corrupted entry fails later, in a binding.

**Size.** About 12 lines in `session.ts`. In `conduit.declare`, about 55–75 lines added or changed, in about 8 places: App state, `onChange`, the URL, `Feed`, `Preview`, `ArticleActions`, the tabs, nav and `favorite.onLoad`. That is 2 files, plus an optional bookmark icon class (about 12 lines, plus one more line in `Btn`'s hard-coded icon list). **Difficulty 2/5.**

### React + Redux Toolkit

**New pieces**
- **A slice:** `features/readingList/readingListSlice.js`, about 90 lines.
  - State: `{ owner, entries: [{ slug, savedAt, article }] }`.
  - Actions: `save`, `remove`, `hydrate`.
  - Selectors: `selectIsSaved`, `selectReadingListCount`, `selectReadingListPage`.
- **A button:** `SaveButton.js`, about 30 lines.

**Wiring**
- **Store.** Register the slice in `app/store.js:16-24`.
- **Persistence.** It belongs in the existing `app/middleware.js:4-18`: write after `save` or `remove`, `hydrate` on `getUser`/`login`/`register.fulfilled`, and clear on `logout`.

**Fetching.** This fits the thunk model well. Add a `tab === 'reading'` branch to `getAllArticles` (`reducers/articleList.js:16-28`) that returns a resolved `{articles, articlesCount}` built from `getState().readingList`. The existing `fulfilled` reducer and `ListPagination` then work unchanged.

**Sync**
- **Mostly free.** Everything reads one slice.
- **Except the tab, which holds a copy.** It shows the copy in `articleList.articles`, so a remove there needs an extra reducer in `articleList` on `readingList/remove`, or a re-dispatch.
- **Snapshots** stay fresh with `extraReducers` on `favoriteArticle.fulfilled`. That kind of cross-slice reaction is where Redux is strongest.

**Changes elsewhere**
- `ArticlePreview.js:75-79`.
- `Article/ArticleMeta.js:43`. This is the first non-author action on that page.
- `Header.js:43-82`.
- `Home/MainView.js:101-117`.

**Risks**
- **Late hydration.** On reload, `getUser` resolves after Home mounts (`reducers/common.js:22-27`), so the list hydrates late.
- **Lost tab.** `getArticlesByTag.fulfilled` drops `tab` (`articleList.js:102`).
- **Reset on unload.** `homePageUnloaded` resets the list.
- **No signed-out guard.** Nothing in the code handles signed-out actions, so the guard must be written.

**Size.** About 9 files, about 230 lines added and 30 changed. **Difficulty 2.5.** The friction is the untyped, action-history-dependent `articleList` state.

### React FSD

**New pieces**
- `shared/lib/reading-list/reading-list.storage.ts`, about 70 lines, Zod-validated on read.
- A `reading-list-toggle.action.ts`.

**Duplication.** Following the codebase's rule that pages don't import each other, the action has to be registered as a child route in `home.route.ts`, `article.route.ts` and `profile.route.ts`. That means three copies, as with favorites, or the codebase's first cross-page shared action.

**Fetching.** This fits well:
- **Feed parsing.** `home.state.ts:16-26` accepts `feed: 'personal' | 'reading-list'`.
- **Loader.** `home.loader.ts:34-48` gains a branch: `Promise.resolve(paginate(read(user.username), offset, limit))`. It returns the API's shape, so `Await` and pagination are unchanged.
- **Paging.** It is already in the URL.

**Sync.** Free through revalidation. After any fetcher action, the root loader and the page loader re-run, so the nav count (`app.loader.ts`), the preview, the article page and the tab all re-read storage. There is no store at all.

**Cost**
- **Wasted requests.** Every save also re-fetches the current API feed, because there is no `shouldRevalidate`.
- **The count snaps back.** Favoriting on the Reading list tab updates optimistically, then revalidation re-reads the stale snapshot. The fix is to patch the snapshot inside each `article-favorite-toggle.action.ts`, which means three files again.

**Size.** About 12 files, about 260 lines added and 40 changed. **Difficulty 2.5–3.** The friction is the per-page duplication the architecture encourages.

### Angular

**New service.** `ReadingListService` (`providedIn: 'root'`):
- `entries = signal<SavedEntry[]>`, plus `count` and `isSaved` computeds.
- It loads `localStorage['readingList:'+username]` from `userService.currentUser` (`user.service.ts:50`) and persists with an `effect`.

**New button.** A `SaveButtonComponent` reads the service, so no `(toggle)` plumbing is needed.

**Where the button goes**
- `article-preview.component.ts:12-16`.
- Both duplicated blocks in `article.component.html` (31–40 and 78–87).
- A nav item in `header.component.html:24-52`.

**The tab**
- **Link.** Add a tab with `[queryParams]="{feed:'saved'}"`.
- **Component logic.** In `home.component.ts:51-67`, generalise the login redirect and set `type = 'saved'`.
- **Model.** Widen `ArticleListConfig.type` (`article-list-config.model.ts:2`).

**Fetching.** Fair. Branch in `runQuery` (`article-list.component.ts:121`) and use `of(readingList.page(page, limit))`. But `runQuery` is one-shot and imperative, so a removal on the tab doesn't re-run it. You need a `toObservable(entries)` subscription or an `effect`, and it has to coexist with the existing double-request on page clicks.

**Sync**
- **The new state.** The service signal keeps the button, the nav count and the tab in step.
- **Favorites don't sync.** There is no shared article store: each preview holds its own copy (`article-preview.component.ts:36`). "Saved" must be derived from the service, never stored on `Article`.
- **Snapshot staleness** needs patching from the favorite path.

**Risks**
- **Wiping during load.** Writing `[]` while auth is still `'loading'` would wipe the stored list.
- **Feed beats tag.** `?feed=saved` must win over a `/tag/:tag` route.

**Size.** About 10 files, about 170–200 lines. **Difficulty 2.5.**

### Vue 3 (mutoe)

**New store.** `store/reading-list.ts`, a setup-style Pinia store:
- **Interface.** `entries`, `count`, `isSaved`, `toggle`, `page(n)`.
- **Persistence.** A `Storage` instance keyed per user, re-created by a `watch` on `useUserStore().user?.username`.

**Routing**
- Add `'reading-list'` to `AppRouteNames` and a route with an auth `beforeEnter` (`router.ts:5-17, 54`).

**Feeds**
- **Fetching.** `use-articles.ts` takes it cleanly. The if-chain (20–39) only expects a promise of `{articles, articlesCount}`, so `Promise.resolve(readingList.page(page.value))` drops in.
- **The cost.** The feed type has to be added in four places: the union, the list and the map (83, 85, 89–95), plus the chain. `Record<ArticlesType, boolean>` in `ArticlesListNavigation.vue:93` forces the tab to be added, which is a plus.
- **Removals.** A `watch` on `entries` is needed, active only for this type, so removals re-run the fetch.
- **Paging.** It is a local `ref` (`use-articles.ts:14`), not in the URL, which is fine for a local list.

**Sync**
- **The saved state** comes through the store.
- **Favorites** are copied per list and passed by `emit('update')`, so snapshots stay stale unless the `useFavoriteArticle` callers also call `readingList.updateSnapshot`.

**Risks**
- **401 leaves the user in the store** (`use-async.ts:23`). The `username` watcher then never fires, so the old user's list stays visible.

**Size.** 1–2 new files (about 80 lines) and about 7 files touched (about 70 lines). **Difficulty 2.5.**

### Vue 3 (official)

**New store.** `store/readingList.js`, loaded from `setAuth` and cleared in `purgeAuth` (`store/auth.js:18-36`). It must skip a reload when the username hasn't changed, because `checkAuth` runs on every navigation (`main.js:21`).

**Fetching**
- **Where to intercept.** `store/home.js:12-18` `fetchArticles` must intercept `type === 'reading'` before `ArticlesService.query`. That function treats any non-`"feed"` type as `/articles` (`api.service.js:76`), so forgetting the intercept silently shows the global feed.
- **Paging.** It is already in the URL and is passed as offset and limit (`ArticleList.vue:66-75`), so it works unchanged.
- **Removals** need a watch on `entries` (`ArticleList.vue:86-94`).

**Sync.** This is the best fit among the JS apps. Every favorite reply already passes through one action (`store/article.js:45-55`), so one added line, `useReadingListStore().updateSnapshot(data.article)`, keeps snapshots current.

**Other changes**
- `main.js:25-27` `needsAuth`.
- `views/Home.vue` (tab, `feedMode`, empty message).
- `ArticleMeta.vue:23-34`.
- Both branches of `ArticleActions.vue`.
- `TheHeader.vue:39-80`.

**Risks**
- **No compiler.** Bare-string feed modes mean nothing flags a missed branch.
- **Shared state flashes.** The shared `home` list can briefly show the wrong content.

**Size.** One new store (about 65 lines) and 8 files touched (about 70 lines). **Difficulty 2.**

### SvelteKit

**New store.** A module-level `$state` store in `lib/readingList.svelte.js`, guarded by `browser`. A `$effect` in `+layout.svelte` reloads it from `page.data.user?.username`, which re-runs after login and logout actions. Sync across preview, article page, nav and tab is then free, since it is one reactive module.

**The fetching model does not fit, and this is the main friction.**
- **The server can't see it.** The home feed is a server `load` (`routes/+page.server.js:5-28`), and the server cannot see localStorage.
- **The server side.** `+page.server.js` must skip the API call for `tab === 'saved'`, or it wastes a global-feed fetch.
- **The client side.** `+page.svelte` must render from the store instead of `data.articles`, slicing for paging and reusing `Pagination` with `page_link_base = 'tab=saved'`.

**SSR and hydration**
- **The mismatch.** On first load the server renders `/?tab=saved` and the nav count without the list. Reading localStorage during the first client render then causes a hydration mismatch.
- **The gate.** Everything must wait for a `mounted` flag, so the tab first shows a placeholder and then fills in. Otherwise `ArticleList/index.svelte:8-9` flashes "No articles are here... yet".
- **Alternatives don't help.**
  - A universal `+page.js` load still runs on the server for the first request.
  - `ssr = false` removes SSR for every tab.
  - A cookie of slugs breaks the localStorage requirement and the size limit.

**Snapshot staleness is worse here**
- **Wrong-way toggles.** The favorite action decides POST vs DELETE from the client's checkbox (`+page.server.js:57`), so a stale `favorited` toggles the wrong way.
- **No client fetch.** A client-side refresh would need the token, which lives only on the server.

**Server-shared state.** A module-level store must never hold user data on the server, because module state is shared between requests under SSR.

**Size.** 1 new file and about 7 touched, about 150–220 lines. **Difficulty 3.**

### Elm

**Ports.** Add an outgoing `storeReadingList` and an incoming `onReadingListChange`, modelled on `storeCache` and `onStoreChange` (`index.html:29-46`). Flags change from a JSON string to `{ store, readingList }` (`Api.elm:141-146`), with migration for existing `"store"` data.

**New module.** `ReadingList.elm` holds the opaque type, its codec, `member`, `toggle`, `page` and `count`. It is carried in `Session`'s `LoggedIn` (`Session.elm:18-20`).

**Sync is manual, by design**
- **Per page.** Every page that shows a button or the count needs a subscription and a `GotReadingList` Msg.
- **The nav.** `Page.view` (`Page.elm:42`) must take the count, not just `Maybe Viewer`.

**Two traps in the existing code**
- **The redirect trap.** Riding on the existing `GotSession` would redirect Home on save, because the Article page does that on any session change (`Page/Article.elm:479-482`).
- **The stale-session trap.** `Feed` holds its own stale `session` (`Feed.elm:57`), and Home's `GotSession` doesn't update it.

**Fetching**
- **The tab.** Add `FeedTab = … | ReadingListTab Cred` (`Home.elm:50-53`), all three `viewTabs` branches, and a `fetchFeed` case.
- **What to store.** `Article` has decoders but no encoders, and `Author` can hold a `Cred`, so encoding snapshots means new encoders across three modules. The pragmatic choice is slugs, fetched per page with `Task.sequence` and per-item `onError`, or one deleted article fails the page. That is 10 requests per page, but always fresh.
- **Pre-existing bug.** The existing `feedPage` reset bug has to be fixed too.

**Size.** About 12 files, about 350–500 lines. **Difficulty 4.** The compiler will find every missed case, which makes it laborious but safe.

### SolidJS

**New store.** `store/createReadingList.js` is registered in `store/index.js:41-45`, with a getter. A memo on `state.currentUser?.username` loads it, and an effect persists it, following `createCommon.js:9-11`.

**Fetching**
- **Easy part.** The `$req` switch (`createArticles.js:25-32`) takes `if (predicate.saved) return Promise.resolve({...})` easily.
- **Removals don't refresh.** The resource only refetches when its source changes, so the source must include a list version.
- **The shared map.** The result replaces `state.articles`, the one map shared with the article page.

**Paging and tabs**
- **Paging.** It uses the global `state.page`, which tab changes don't reset.
- **Tags collide.** Any tab other than `feed` or `all` is treated as a tag (`pages/Home/index.js:24-25`), so a tag called "saved" becomes unreachable unless a separate query key is used.

**Sync.** The fine-grained store makes saved-state sync nearly free.

**Prerequisite.** The existing favorite bug (`ArticleList.js:8`) must be fixed first, since the new handler would copy it.

**Size.** About 9 files, about 120–150 lines, plus about 10 lines of fixes. **Difficulty 2.5.**

### Comparison

| | Files touched (new) | Est. lines added/changed | Difficulty (1–5) | Main friction |
|---|---:|---:|---:|---|
| **Declare** | **2** (0) | **~70–90** | **2** | `Feed` hard-wired to `app.articles`; local list sits beside "URL is a constraint" rather than in it; nav link vs non-URL tab; `onChange` `else` trap |
| React+RTK | ~9 (2) | ~260 | 2.5 | untyped `articleList` state shaped by earlier actions; tab holds a copy |
| React FSD | ~12 (2) | ~300 | 2.5–3 | per-page action duplication; revalidation re-reads stale snapshots |
| Angular | ~10 (2) | ~185 | 2.5 | one-shot imperative `runQuery`; no shared article state; duplicated template |
| Vue 3 (mutoe) | ~9 (1–2) | ~150 | 2.5 | feed type in four places; per-list article copies |
| Vue 3 (official) | ~9 (1) | ~135 | 2 | no types; `checkAuth` on every route; silent fallback to global feed |
| SvelteKit | ~8 (1) | ~185 | 3 | server-first loads can't see localStorage; hydration gating; server-only token |
| Elm | ~12 (1) | ~425 | 4 | threading state through every page by hand; no article encoders; stale `Feed` session |
| Solid | ~9 (1) | ~145 (+10 fixes) | 2.5 | resource keyed only on predicate; global page; tab/tag namespace; existing bug on the path |

**What this says about maintainability.** The feature is mostly a cross-view state problem plus one odd feed, and each architecture's cost tracks how it shares state.

- **Global reactive stores** (Declare's `app`, Solid's store, the official Vue's Pinia stores, Redux) make "in sync across all views" nearly free. Declare is cheapest here: there is no store module, no subscription and no action plumbing, because every view already reads `app.*` through constraints. Its total is also the smallest by a wide margin, about 2 files and under 100 lines against 135–500.
- **Per-component copies with events** (Angular, Vue mutoe) need extra wiring to keep saved state and snapshots honest.
- **Server-first loading** (SvelteKit) and **loader revalidation** (FSD) handle URL-shaped data well, but are wrong-footed by browser-only state. SvelteKit gets a hydration problem, and FSD gets refetch churn and stale-snapshot snap-back.
- **Elm** pays the most lines for the most safety.

**Where Declare is awkward.** Declare's awkwardness is real and specific. Its best idea, a list as a DataSource whose `url` is a constraint, doesn't cover a local list. You add a derived `Dataset` beside it and, more costly, generalise a `Feed` class that was written for exactly one source. That is a maintainability lesson about this app rather than the language. One-off classes that read `app.*` directly (`Feed`, `ArticleActions`) are cheap to write and expensive to reuse. The single-file layout means the 8 change sites are easy to find, but also that everything is in one 900-line merge-conflict zone.

**Caveat.** None of these estimates was tested by building the feature. The Declare estimate assumes the language behaves as `declare.md` describes, in particular that `trackChanges` can name `username` and `saved`. The JS estimates assume the frameworks behave as their current documentation says.

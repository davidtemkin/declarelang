# RealWorld (Conduit) run 2: Opus 5.5, Declare, on the local tree

Built on the local working tree, the same subject as Presentify run 7 plus that run's fixes.
**15.0 min, 87 turns, 80k output tokens, no source reads.** The hidden drive as it stood passed
**37 of 47 scenarios (109/130 tests)**, both delivered and at first boot (9.3 min). The audit
found **5 of the 10 failures are the drive's own**. With its three bugs fixed, the delivered
app scores **42/47 (118/130)**, the same as run 1 (19.3 min, 107 turns). The audit also found
platform, tool and message defects, so the run is **not clean on any count**. Timing record:
`evals/timings/2026-11-12-realworld-run2-local.txt`.

**Scoring note.** The app calls its API on 8380, so the drive must own that port
(`--service-port=8380`, with the build's service stopped first). A first pass with the drive's
service on 8381 left the app talking to the build's service and scored 13/47. That pass is void.

## Figures

| | Run 1 (2026-11-08 tree) | **Run 2** |
|---|---|---|
| time, turns | 19.3 min, 107 | **15.0 min, 87** |
| output tokens | 102k | **80k (31.9k thinking)** |
| phases: reading · writing · checking | 9.0 · 1.8 · 8.5 | **5.7 · 2.6 · 6.7** |
| hidden drive | 42/47 (118/130) | **37/47 as it stood; 42/47 (118/130) with the drive fixed** |
| first boot | — | 37/47 at 9.3 min, the same as delivered |
| lines of Declare (without comments) | 863 | 818 |

## The hidden-check failures

| Scenario | Verdict | Evidence |
|---|---|---|
| `errors_auth_forms`, `errors_editor`, `errors_settings`, and the network check in `errors_article` | **Drive** | The library Form shows its default `uncertainMessage` ("No answer came back, so this may or may not have been saved…"), which the drive's `ERRORISH` pattern doesn't match. Since v0.6.8 a network failure shows `uncertainMessage`, not `failedMessage`, and the drive wasn't updated. |
| `nulls_bio_fields` | **Drive** | The "" is the Ionicons gear glyph (U+F13D), hidden from screen readers but present in `innerText`. |
| `article_delete` | **Drive** (proxy) | The deletion and the move to `/` succeed. The banner shows only when signed out, by design (the React-Redux reference does the same). |
| `xss_images` | **App** (as run 1) | A failed picture draws nothing. The Avatar falls back only on an empty URL. |
| `errors_article`, 403 on a comment | **App** (as run 1) | No error display on a comment's delete. |
| `auth_guard_session`, `user_fetch_protected` | **Spec-unstated** | The sign-in form is shown in place at a protected address. The redirect is the official suite's convention, not the handed spec's. |
| `user_fetch_4xx` | **Spec-unstated**, app weak | The app signs out only on 401, as `API.md` describes. |

## The deep audit

Repros are in `audit/`; each file ends with its output against the local tree.

| min | What | Verdict | Repro |
|---|---|---|---|
| 8.3 | 5000: a class named `Card` | True positive; its position drops the included file's name (**M3**) | `M3-…` |
| 8.3–8.5 | 2000: `State` overriding `fontSize` | True positive; the message names no rewrite (**M4**) | `M4-…` |
| 8.3 | roles `alert`, `tablist` | Hinted | — |
| 8.3 | `accessibilityCurrent` ×2 | No hint; no capability (**N2**, design g3) | `N2-…` |
| 8.6 | 4001 for `light`/`regular` inside `{ }` in a class body | **M2**: an instance gets 4005 with the rewrite; a class body doesn't | `M2-…` |
| 8.6 | 4005, 4022, 4026, 1002 ×8 | True positives | — |
| 8.9 | 3006: a datapath to a literal | True positive | — |
| 9.0 | 6001 `classroot.form` ×3 | Fair; no pointer to the nested child (**N1**) | `N1-…` |
| 9.6–10.2 | Port 8200 occupied | Harness | — |
| 11.2 | `GET /api/articles//comments`, `/api/profiles/` → 404 | **P1** | `P1-…` |
| 11.6–14.7 | "never built … (1 checked)" after a 70-step flow | **T1** | `T1-…` |
| 12.4 | 6001 ×3: an `exists`-gated child `signIn` beside a method `signIn` | **M1** | `M1-…` |
| — | Untrusted Markdown builds program classes and runs their code | **P3** | `P3-…` |
| — | An Image whose `source` reads its own `failed` loops forever | **P2** (latent) | `P2-…` |

**Platform:**
- **P1.** When `exists` turns false in the same assignment that changes a DataSource's `url`,
  the source still fetches the emptied URL before teardown (`runtime/src/data.ts`, `$maybeAuto`).
- **P2 (latent).** `source = { failed ? fallback : url }` loops: about 40,000 requests in 6 s,
  boot times out, and nothing is diagnosed. It is the natural fix for `xss_images`.
- **P3.** Markdown from an untrusted source can build the program's own view classes, with the
  author's attributes, and run their code. The docs warn only about interpolation.

**Tools:**
- **T1.** After a real-pointer locator click, the manual clock reads "settling", so every
  `settleData` layout checkpoint is deferred to the script's end. A 70-step flow got one layout
  check, and the "never built" note named pages that were plainly built.

**Hidden drive** (our own instrument): `ERRORISH` misses the Form's default messages,
`bioArea` reads text hidden from screen readers, and `article_delete` uses the banner as proof
of the home page.

**Messages and names:** M1 (the namespace check skips `exists` children), M2, M3, M4, N1,
N2, and **N3**: `failedMessage` no longer covers network failures, and the agent's wording was
silently replaced.

### Clean bill

| Count | Verdict |
|---|---|
| Platform | **Not clean.** P1 and P3 met; P2 latent |
| Tools, incl. the driver | **Not clean.** T1 met: a false note, and layout coverage lost for the whole flow |
| Names | **Not clean.** M1–M4, N1–N3 |
| Reference | **Not clean.** The State/provided exception, untrusted Markdown and the `failedMessage`/`uncertainMessage` split are untaught where first needed |

**Friction cost:** about 1.0 min of 15.0 (≈7%) and about 5k tokens of platform, tool and name
friction, plus about 0.8 min of harness friction (port 8200). T1 cost no time but gave false
assurance.

### Against run 1

It was faster (15.0 against 19.3 min, 80k against 102k tokens), with the same app-level
result: both fail the same 5 scenarios for the same reasons. The five new failures were all
the drive's. Run 1's findings (`WrappingLayout` width, the use-site method hint, doubled
`expect.text`) stayed fixed.

## Fixed on the local tree after this run

The full suite passes on the local tree after these fixes.

- **Hidden drive:** an error counts when something new appears in an alert or assertive live
  region; `bioArea` drops private-use glyphs; `article_delete` proves the home page by the Global
  Feed tab. **Re-score: 42/47 (118/130)** (`drive/delivered-drive-fixed/`).
- **P1:** an auto-fetch inside a settle is decided at the settle's end, and dropped if the
  source was discarded (`runtime/src/data.ts`). Regression test added.
- **P2:** the loop is detected. After 3 quick returns to an address that just failed, it is
  reported once with the layered rewrite, and the Image holds the fallback
  (`runtime/src/image.ts`). The meaning of `failed` is unchanged. Regression test in
  `test/network-browser.test.mjs`.
- **P3 (docs):** Markdown, HTMLText and RichText say that untrusted text can name the program's
  classes, with what to do today.
- **T1:** a checkpoint finding motion in flight runs it to rest (up to 2 s of driven clock), then
  asks the layout questions. The runtime records constructed classes, and the note says "never
  built" or "built, but never checked for layout". The 70-step flow now gets 32 checks, not 1.
  Regression test added.
- **M1–M4, N1, N3:**
  - `exists` children are in the collision check;
  - 4005 resolves through the base chain;
  - 5000 carries the included file's name;
  - the State/provided refusal names the rewrite, and declare.md states the exception;
  - a 6001 points through unnamed views;
  - the Form reference says which message covers which failure.
- **New runtime fields** (the loop detector's, and the deferred auto-fetch's) are `$`-named,
  so they take no name from a program's namespace.

**One behaviour change to know:** checkpoints now advance motion, so a later step sees motion
finished where it used to see it mid-flight.

## Deferred: design

1. A fallback picture for `Image` (it bears on P2).
2. Markdown inline views: opt-in by class list, and off for constraint-fed text by default?
3. "Where you are" for accessibility (`aria-current`) on nav links and page buttons.
4. Form default wording ("saved" on a sign-in form), and whether one author message should
   cover every failure.
5. Persistence (JWT apps all need it).
6. Repeating a computed list of strings without a derived Dataset.
7. Whether a `State` may override provided values such as `fontSize`.
8. Pages that need an account: redirect, or show the sign-in form in place?

## Is it idiomatic Declare?

`idiom.py`: 818 lines without comments (run 1: 863; to-do: 843); 2 colour literals outside a
theme; 79 theme reads; 4 States; 1 browser script (as run 1). The line-by-line read wasn't done.

## The agent's account

Pasted whole. Where the audit contradicts it, the audit's reading is above.

# Building Conduit in Declare: an account for the people who make Declare

The short version: I wrote about 1,100 lines of Declare across three files and reached a clean compile after about eight runs of the checker. Two test scripts now pass: 39 assertions on the user flows and 35 on unit logic. Most of the friction was small and local, and the compiler's messages carried most of it. I hit no single big obstacle. Two patterns recurred:

- **Reaching parts of my own tree from outside.** This covers reaching the form nested inside a page, and naming views so tests could find them.
- **The edge between "provided" values and declared attributes.**

Each pattern cost a few check-and-fix cycles, not hours.

## (a) Getting up to speed

**What I read, in order:**

1. The repository `README.md`, then the brief and every spec file (features, routing, expectations, styles, the API).
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, whole.
4. Guide chapters `01-what-declare-is`, `04-structure`, `05-run-and-check` and `06-layout`, all whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
6. The spec's `templates.md`, whole.
7. `styles.css`, partly. I grepped the middle section (lines ~62–730) and read only the variables and lines 730 to the end properly.

After that I read on demand:

- `14-data.md` and `20-urls.md`, whole.
- `12-text.md` and `08-controls.md`, whole.
- Sections of `operational/verify.md`.
- `declare-help` entries for about twenty names: `link`, `shows`, `location`, `localStorage`, `Markdown --all`, `RichText`, `Form --all`, `TextInput`, `Image`, `WrappingLayout`, `Control`, `ResponsiveLayout`, `ChoiceControl`, `ChoiceItem`, `accessibilityHidden`, `Spacer`, `App.appName`, `shadow`, `Text.lineHeight`, `TextInput.concealed`, and a few more.
- A grep of `apps/birds/birds.declare` to see how it parses `location`.

**What I skipped:**

- Guide chapters `02-notation`, `03-constraints`, `07`, `09`–`11`, `13`, `15-schemas`, `16-collections`, `17`, `18-overlays` and `19-accessibility`.
- The tracker app and the sampler's `SignUp`.

The skill says to stop reading after the core and look things up when a need arises, and I followed that. The skip I'd most question is `15-schemas`. I used schemas on every reply, and I relied on one sentence in `declare.md` — "`km: number | null` is `km?: number`" — to believe that `bio?: string` would accept the API's nulls. It did, but I was trusting a single sentence.

**What taught me the most:**

- **`declare.md`**, for the model as a whole.
- **The to-do app**, for the shape of a whole program. Specifically: a `DataSource` subclass as the place records live, user state on the App, an alias like `list: View = { app.main.col.list }`, and `exists` on per-state children. I copied its patterns directly.
- **`14-data.md` § A form** and the `Form --all` reference. These told me the refusal machinery existed, which became the backbone of all four forms.

**What was missing or misleading:**

- **Persistence.** Nothing in the guide covers it. I only learned the answer because `declare-help localStorage` gave an unusually direct one ("Persistence is not in the language yet…").
- **Untrusted Markdown.** `Markdown --all` says a self-closing tag naming one of the program's view classes builds a real view. The RichText entry warns about this when *you* build content: "`escapeHtml` every interpolated value". It never addresses content written by someone else, which is exactly the Conduit case. I noticed the risk myself; the docs didn't flag it.
- **RealWorld's error shape.** `14-data.md` says "the common standard shapes are read the same way". RealWorld's `{ "errors": { "email": ["…"] } }` (an object of arrays) isn't one of the shapes `Form.refusal` reads, so I had to override it. That's reasonable; it just isn't obvious until you read the reference.
- **Parenthesis style.** The to-do app writes `({ … })` liberally. Copying that style produced eight `DECLARE1002` "redundant parentheses" hints. This is trivial, but the model program and the linter disagree.

## (b) Expressing what I wanted

**Where Declare fit my intent well:**

- **Pages as `exists`-gated children of the App, driven by a derived `page`.** Each page is built fresh on arrival and discarded on leaving. For forms this was exactly right: no reset code anywhere.
- **Requests as members.** `DataSource` members with `autoFetch = true` and a URL constraint meant an article page fetches when its slug changes, with no lifecycle code. `headers = { app.authHeaders }` made signing in and out a single assignment.
- **Writing a reply back into a record.** A favorite button in a replicated preview writes into its own record with `changed(a: Article) { :favorited = a.favorited; :favoritesCount = a.favoritesCount }`, and the view followed. This worked the first time, and I find it elegant.
- **Fields bound to page attributes.** `value <-> classroot.title`, combined with computed defaults (`title: string = { classroot.loaded?.title ?? "" }`), made the edit-article form trivial: it follows the loaded article until the person types.
- **Form refusals.** Overriding `refusal(body)` in one class (`ApiForm`) gave every form server-error display, read from `form.problems`.

**Where I worked around something:**

- **Rows over a computed list of strings** (error messages, page numbers, editor tags) need an intermediate derived `Dataset`.
- **Reaching a form nested two anonymous containers down** needed names plus an alias.
- **Styling by size variant** couldn't change `fontSize` from a `State`.
- **The theme's breakpoints** became a script function, `containerWidth`.
- **Icons** became Text views in a web font, with code points kept in a script table.

All of these are in (g).

## (c) The first time it ran

The first full verify booted cleanly at rung 4. My first attempt to *see* it failed: `declare-look --url` against port 8200 said "the runtime never started on the page… 404". Port 8200 was another checkout's dev server, which I only discovered when `npm start` refused with "port 8200 is already taken by another Declare dev server, serving a different tree". Once I was on 8201, the first screenshots of home, an article, a profile and sign-in all looked right to me. I saw nothing visually wrong, though I compared against my reading of `styles.css`, not pixel for pixel.

The problems found after that weren't visible in pictures:

- **Stray requests.** Notes in the first assert run reported `GET /api/articles//comments answered 404` and `GET /api/profiles/ answered 404`. Leaving a page made it fetch with an empty slug before it was torn down.
- **Phone overflow.** At 390px, layout findings showed the header links and the footer line running off the right edge.
- **Leftover test data.** My first failed test run left Jake's bio changed. I found it in a screenshot of the settings page ("Bio mwenqjkw") and restored it through the API.

## (d) Every refusal and surprise

1. **`DECLARE5000`: my class named `Card`.**
   - *Platform:* refused, because `Card` is a library class.
   - *Change:* renamed it `CommentBox`.
   - *Judgement:* my mistake. I had seen `Card` mentioned in `06-layout` and `08-controls`. One oddity: the error was positioned "(line 398, col 1)" with no file name, but the class was in the included `conduit-pages.declare`. Other errors in included files did carry the file prefix. That looks like a platform bug in the diagnostic's position.

2. **`DECLARE2000`: `fontSize` overridden in a `State`.**
   - *Platform:* three sites, in `Btn`'s two size states and `Entry`'s large state.
   - *Change:* I fixed `Btn` by declaring `textSize: number` with `fontSize = { classroot.textSize }`. I left `Entry` alone at first, unsure whether `TextInput.fontSize` behaved the same way, and the next run flagged it. I changed it to `fontSize = { classroot.large ? 20 : 16 }`.
   - *Judgement:* my code was wrong by the platform's rules, and the second failure came from my incomplete fix. But the docs don't prepare you for this. `declare.md` §10 says a state overrides "its own element's attributes", and `fontSize` *looks* like one of the element's attributes. The message says what is wrong, not what to write instead, which makes it unusual among these diagnostics.

3. **`DECLARE2000`: `accessibilityRole = alert`.**
   - *Platform:* told me exactly what to write: `status` plus `accessibilityLive = assertive`.
   - *Change:* did that.
   - *Judgement:* a model diagnostic.

4. **`DECLARE2000`: `accessibilityCurrent`.**
   - *Platform:* said `Control`, and then `NavLink`, has no such attribute.
   - *Change:* removed it; the active nav link and the current page number are now marked by colour only.
   - *Judgement:* my guess from ARIA. I'm unsure whether an equivalent exists under another name; I didn't search for one.

5. **`DECLARE2000`: `accessibilityRole = tablist`.**
   - *Platform:* "ARIA's word; Declare's is tabList".
   - *Change:* fixed the case.
   - *Judgement:* a good message.

6. **`DECLARE4001`: `fontWeight = { classroot.outline ? light : regular }`.**
   - *Platform:* "cannot resolve 'light'".
   - *Change:* wrote them as strings.
   - *Judgement:* my mistake. But compare `DECLARE4005` in the same run, for `purpose = { … ? newPassword : password }`. That one explained that an enum token is bare only as the whole value and should be a string inside `{ }`. `4001` could carry the same hint when the name is a known enum token. That's a gap in the diagnostic, not in the language.

7. **Warnings `DECLARE4022` and `DECLARE4026`.**
   - *Platform:* `4022` said `FavoriteButton` shows `on` but says nothing to a screen reader; `4026` said the `FeedTab`s are one choice but sound like separate toggles.
   - *Change:* added `accessibilityPressed`, and rebuilt the tabs as `ChoiceItem`s inside a `ChoiceControl`.
   - *Judgement:* both were right and improved the app. These were the most valuable warnings of the build.

8. **`DECLARE3006`: a `datapath` to a literal (three sites).**
   - *Platform:* refused, and named the derived-`Dataset` rewrite.
   - *Change:* `shown: Dataset [ contents = { { items: classroot.messages } } ]`, and the same for pages and tags.
   - *Judgement:* the message was clear and I applied it mechanically. Whether the rule is necessary for read-only lists of strings, I'm unsure. It is ceremony in that case.

9. **`DECLARE6001`: "'form' is not a member of AuthPage" (and of the other two form pages).**
   - *Platform:* refused `classroot.form`, because the form sat inside an unnamed `Container`/`Col`.
   - *Change:* named them `box:` and `col:`, and added `form: ApiForm = { classroot.box.col.form }` on each page.
   - *Judgement:* my mistake. The fix is the alias pattern from `04-structure`.

10. **The stray empty-slug fetches.**
    - *What I wrote:* the page's sources had `url = { app.api + "/articles/" + encodeURIComponent(classroot.slug) }`, with the page under `exists = { app.page == "article" }, slug = { app.arg }`.
    - *Platform:* on leaving the page, its URL re-derived with `slug == ""` and fetched before teardown.
    - *Change:* guarded each URL with `classroot.slug == "" ? "" : …`.
    - *Judgement:* the platform looks questionable, or at least surprising. I'd expect a view whose `exists` turns false in a settle not to start new requests in that same settle. Unsure whether this is intended ordering.

11. **`app.signIn` collided with a page I named `signIn`.**
    - *Change:* renamed the pages `login:` and `register:`.
    - *Judgement:* my mistake. But the error ordering hurt: the first two messages ("Cannot invoke an object which is possibly 'null'", "Type 'this AuthPage' has no call signatures") were consequences of the collision. They pointed at a call site in another file, and the cause, "Duplicate identifier 'signIn'", came last.

12. **Layout findings at 390px.**
    - *Platform:* the header's children needed 432 of 390; the footer's needed 404 of 360.
    - *Change:* the root cause was mine. `Container`'s `width = { app.containerW }` ignored the NavBar's padding. I changed it to `Math.min(app.containerW, parent.contentBox("width"))`, made the links a flexing `WrappingLayout`, and gave the footer text `shrinks = true`.
    - *Judgement:* the findings were precise and each one suggested fixes.

13. **Test-script refusals.**
    - *What happened:* `.or()` is not supported. View paths failed for the unnamed `app.ArticlePage.page`, then `app.article.page.tags`, then `app.home.2.row.main.1`.
    - *Change:* each time, I named views or used the index the error offered.
    - *Judgement:* clear messages. The underlying friction is that anonymous views are awkward to address from tests.

14. **The note "never built … so never checked for layout".**
    - *Platform:* the note listed `ArticlePage`, `CommentForm` and others, with "(1 checked)", after a script that plainly visited and clicked through them.
    - *Judgement:* misleading, or I don't understand when the layout checks run. My guess is that they run only after `drive` verbs, not after Playwright-locator actions. Unsure.

## (e) Verifying it

**What I ran:**

- **`declare-verify`, rungs 1–4**, after each round of edits. This caught all the compile-time issues in (d).
- **`declare-look --url`**, for screenshots of five pages signed out.
- **A throwaway assert script in `/tmp`** that signed in, took `page.screenshot`s of each signed-in page, then switched to a 390px touch device. This is what surfaced the layout findings.
- **`tests/assert.mjs`**, the flows against the live service. Its first run caught only my `.or()` misuse, plus the stray-fetch notes.
- **`tests/units.mjs`.** It reads values through `window.__declare.find` and calls `form.refusal(...)` in the page, to check routing, endpoints, paging and the error mapping.

**How the tools served me:**

- **The diagnostics were excellent.** Most named the fix and I applied it without opening docs.
- **`declare-help` was fast and authoritative.** It's the main reason I could skip so much of the guide.
- **The live-service notes were useful.** These were "the script sent 15 writes…" and "earlier runs of this program wrote to…".

**Weak spots:**

- The layout-coverage note in (d)14.
- There's no obvious way to unit-test `script` functions on their own. I tested them through the running app instead. I considered moving them to a `.ts` file to test under Node, but didn't know whether a `script [ "file.ts" ]` may `export`.

## (f) Confidence

**High** — each of these is covered by tests or screenshots:

- Sign in, sign up, logout, and a token that survives a reload.
- The feeds, tag tabs and paging.
- Creating, editing and deleting articles.
- Posting and deleting comments.
- Favorite and follow.
- Settings.
- Error display.
- The overall look on desktop.

**Medium:**

- The phone width. I checked the profile page and found and fixed the overflows, but the other pages weren't re-checked at 390px after the fixes.
- Markdown rendering of odd content.

**Where I'd expect a tester to find problems:**

- **Refetching after sign-in or sign-out.** I believe changing `headers` triggers `autoFetch` sources to refetch, but I didn't test it. If it doesn't, `favorited` and `following` could stay stale after signing in or out until the reader navigates.
- **Back doesn't undo a tab change.** The home tab and the feed's page number aren't in the URL.
- **Tags typed but never entered.** In the editor, a tag the person typed but didn't confirm with Enter is silently dropped.
- **Signed-in visitors to `#/login`** still see the form.
- **Only `/user` 401s sign you out.** A 401 from any other endpoint is just shown as an error.
- **Error wording is raw.** Messages come straight from the service's field names: "credentials invalid", "article forbidden".
- **Dates read "November 11, 2026"**, not the template's "January 20th" style.
- **URLs are hash-based** (`#/article/slug`).
- **Not tested at all:** keyboard-only use, Tab order and screen readers.

## (g) Gaps I worked around

1. **Persistence of the JWT.**
   - *What I did:* `declare-help localStorage` said persistence isn't in the language. I used a `script [ host = browser ]` block with `savedToken()` and `keepToken()`, and seeded the token with `token: string = { savedToken() }`.
   - *Judgement:* genuinely absent, by the platform's own statement.

2. **Icons.**
   - *What I did:* I fetched the Ionicons 2.0.1 stylesheet with curl to get the code points. I load the woff through `Font`/`FontFace` and draw glyphs as `Text` (the `Ion` class).
   - *Judgement:* there's a library `Icon` with drawn marks that might have had a heart and a gear; I didn't look. Possibly there, unchecked.

3. **CSS breakpoints for `.container`.**
   - *What I did:* a script function, `containerWidth(w)`.
   - *Judgement:* `ResponsiveLayout` handles shares, not stepped max-widths. A theme value or a small layout of my own might be more idiomatic. Unsure.

4. **Path routing (`/article/slug`).**
   - *What I did:* `location` is the URL fragment, so I used `#/…` and parsed it myself.
   - *Judgement:* probably intentional (static hosting). I didn't look for a path mode.

5. **Gating routes on sign-in.**
   - *What I did:* the docs suggest two views sharing a `shows` name, split on `visible`. I derived `page` instead: if the route needs an account and no one is signed in, it reads `"login"`.
   - *Judgement:* available both ways; mine was a deliberate choice.

6. **Untrusted Markdown building my classes.**
   - *What I did:* `untrustedMarkdown()` inserts a zero-width space after any `<` that's followed by a capital letter.
   - *Judgement:* a hack. I'd want an attribute to turn inline views off. I didn't search for one, so: unsure.

7. **`aria-current`.** Dropped (see (d)4). Unsure whether it exists.

8. **Rows over a computed array** needed a derived `Dataset` (see (d)8). Present, just verbose.

9. **Unit-testing script helpers.** Done through the running app instead (see (e)).

## (h) Changes of direction

1. **Routing.** I first planned `shows` for the static pages (two `EditorPage` instances, auth gating by a shared `shows` name). Before writing any code I switched to slash paths and a derived `page`. My reasons:
   - `link = "#editor"` needs a registered name, whereas a reference containing a slash is parsed by the program itself.
   - I wanted every page built fresh.
   - Gating was simpler in one constraint.

   This was second thoughts during planning.

2. **Home row layout.** I considered `ResponsiveLayout` and settled on `SimpleLayout [ axis = { app.md ? "x" : "y" } ]`. Planning.

3. **Form errors.** I considered collecting the messages in `refusedWith`, then chose to override `refusal` and show `form.problems`. Planning.

4. **Unit tests.** I considered helpers in a `.ts` file tested under Node, and dropped it for in-app checks. This was uncertainty about `export`.

5. **Tag pills in previews.** I first wrote `datapath = :tagList` with an inner `:[*][]`, and rewrote it as `:tagList[]` before compiling. Self-review.

6. **Feed tabs.** `Control` with `accessibilityRole = tab` became `ChoiceItem` inside a `ChoiceControl`. Prompted by warning `DECLARE4026`.

7. **Smaller changes, each forced by a refusal or finding:**
   - `Card` became `CommentBox`.
   - `fontSize` in `State`s became `textSize`.
   - Literal datapaths became derived `Dataset`s.
   - Unnamed pages became named pages, and `signIn` became `login`.
   - The Container width became phone-safe.

## (i) The code, quoted

These are reconstructed from the session. Line numbers are as reported at the time.

**A `Card` class in an included file:**
```
class Card [ width = 100%, cornerRadius = 12, clip = true,
    fill = { provided("theme").background }, stroke = { stroke(1, provided("theme").border) }, … ]
```
> 'Card' is a library class — a class of the program can't take its name; rename yours, as 'ConduitCard' (the library's is used as 'Card [ … ]') [DECLARE5000] (line 398, col 1)

The class was at line 398 of `conduit-pages.declare`; the position doesn't name that file.

**`fontSize` overridden in a `State`:**
```
class Btn extends Control [ cornerRadius = 8, padding = [8, 16, 8, 16], fontSize = 16, …
    State [ applied = { classroot.size == "sm" }, padding = [4, 8, 4, 8], cornerRadius = 6, fontSize = 14 ],
    State [ applied = { classroot.size == "lg" }, padding = [12, 24, 12, 24], cornerRadius = 10, fontSize = 20 ], …
class Entry extends TextInput [ width = 100%, cornerRadius = 8, padding = [8, 12, 8, 12], fontSize = 16, …
    State [ applied = { classroot.large }, cornerRadius = 10, padding = [12, 24, 12, 24], fontSize = 20 ] ]
```
> State.fontSize: a state override sets a declared attribute of the view, not a provided value — 3 sites, also on lines 199, 311 [DECLARE2000] (conduit-parts.declare:198:104)

**An ARIA role name:**
```
class ErrorList [ … accessibilityRole = alert, … ]
```
> …got 'alert' — an alert is `accessibilityRole = status` with `accessibilityLive = assertive`, said at once on every host [DECLARE2000]

**An ARIA attribute name:**
```
Control [ datapath = :items[], … accessibilityCurrent = { this.here }, … ]
```
> Control has no attribute 'accessibilityCurrent' [DECLARE2000] (conduit-parts.declare:405:13)

**An enum token inside braces:**
```
fontWeight = { classroot.outline ? light : regular },
```
> cannot resolve 'light' — not a member of TagPill, a parameter, or one of the globals a body may use (Math, JSON, Date, URL, console, …) [DECLARE4001] (conduit-parts.declare:260:40)

**A datapath to a literal:**
```
lines: View [ width = 100%, datapath = { { items: classroot.messages } },
    Text [ datapath = :items[], width = 100%, text = { "•  " + :@ } ] ]
```
> a datapath is a place in declared data, and a literal is in none — … [DECLARE3006] (conduit-parts.declare:299:44)

**A form nested inside unnamed views:**
```
class AuthPage [ …
    Container [ Col [ span = 6, … ErrorList [ form = { classroot.form } ], form: ApiForm [ … ] ] ] ]
```
> 'form' is not a member of AuthPage — declare it (form: <type> = …) or fix the name — 2 sites, also on line 108 [DECLARE6001] (conduit-pages.declare:98:44)

**A page name colliding with an App method:**
```
signIn: AuthPage [ exists = { app.page == "login" }, mode = "login" ],   // beside the App method signIn(u: User)
```
> Cannot invoke an object which is possibly 'null'. — 2 sites, also on line 135 [DECLARE6001] (conduit-pages.declare:86:13)
> This expression is not callable. Type 'this AuthPage' has no call signatures. … (conduit-pages.declare:86:17)
> Duplicate identifier 'signIn'. [DECLARE6001] (line 78, col 5)

**The stray empty-slug fetch.** To reproduce: on an article page, delete the article. Its `remove.onLoad() { app.go("/") }` triggers the requests.
```
article: ArticlePage [ exists = { app.page == "article" }, slug = { app.arg } ]
// inside ArticlePage:
comments: DataSource [ autoFetch = true, schema = CommentList, headers = { app.authHeaders },
    url = { app.api + "/articles/" + encodeURIComponent(classroot.slug) + "/comments" } ],
```
> note the program's request GET /api/articles//comments answered 404 …
> note the program's request GET /api/profiles/ answered 404 …

**Phone overflow:**
```
class NavBar [ width = 100%, padding = [8, 16, 8, 16], …
    Container [ layout: SimpleLayout [ axis = x, align = center ], Text [ … "conduit" ], Spacer [ ],
        links: View [ layout: SimpleLayout [ axis = x, spacing = 16, align = center ], NavLink [ … ] … ] ] ]
class Container [ x = center, width = { app.containerW }, … ]
```
> layout after device 390x844 touch: app.header.0's children need 432 across and it has 390, so app.header.0.links runs past its end. …
> layout after device 390x844 touch: app.footer.0's children need 404 across and it has 360, so app.footer.0.1 runs past its end. …

**The coverage note**, after `tests/assert.mjs` had opened and used every page:
> note never built — at boot or in any state the scripts reached (1 checked) — so never checked for layout: FollowButton, SettingsPage, Rule, EditorPage, RemovableTag, ArticlePage, Reading, ArticleMeta, CommentForm, CommentBox, CardFooter, CommentCard, …

**The occupied port:**
> port 8200 is already taken by another Declare dev server, serving a different tree.

## Overall

**Surprises:**

- A `DELETE` returning 204 with no body still ran `onLoad`, so comment deletion worked the first time.
- The accessibility warnings improved the design, not just the markup.
- A whole program in a language I'd never seen converged in about eight checker runs.

**Good:**

- Diagnostics that name the rewrite.
- `declare-help`.
- `exists` for fresh pages.
- `DataSource` as a member.
- `Form` refusals.
- The value pattern with computed defaults.
- Assert scripts that accept Playwright-style locators.

**Bad:**

- Error ordering that leads with consequences.
- A file-less position in one error.
- The confusing layout-coverage note.
- `State` versus provided values being undocumented where you'd first need it.
- Derived-`Dataset` ceremony for small lists.
- No guidance on untrusted rich text or on persistence.

**How it differs from what I know, and what it reminded me of:**

- **QML**, most of all: bindings, states and a declarative tree.
- **Flex/MXML and OpenLaszlo:** the heritage the README names.
- **SwiftUI's environment**, for provided values.

Compared with React, the big differences are:

- No render function.
- Replication over data paths instead of `map`.
- Fetching as a declared member instead of effects.
- The compiler refusing what it can't follow.

It felt less like writing code and more like declaring wiring.

**Where I'd most want improvement:**

1. Make layout checks run after every kind of script action, or say clearly when they don't.
2. Put the cause first when a name collision produces type errors.
3. An opt-out for inline views in `Markdown`.
4. A storage primitive.
5. Let a `State` override provided text attributes, or document clearly that it can't.

**What I'd use it for:** CRUD apps, internal tools, dashboards and forms like this one, where its checks pay off immediately. Also interfaces where motion matters, which I didn't exercise here. I'd hesitate for a large team today only because the ecosystem is thin, and that's a judgement about adoption, not about the language.

**The sharpest edge** was a pattern, not one obstacle: reaching views by name across class and nesting boundaries. It showed up in the form alias, the `signIn` collision and three test-path failures, and cost perhaps five or six cycles in total. To have written it right the first time, I'd have needed a habit, stated up front in the docs, of naming every structural child and aliasing anything reached from afar. `04-structure` hints at this, but I didn't take it as a rule.


## The names ledger

```
NAMES — eval-realworld-2: 8 missed name(s), 1 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     1 · global    · localStorage         ·                          · browser/Node global · foreign hint · ×1  ·    1 · resolved
         'localStorage' is the host's, not Declare's — a program runs on three renderers and names none of their globals. Persistence is not in the language yet — hold the state in a Dataset; a host can supply
     8 · value     · alert                · ErrorList.accessibilityR · browser/Node global · foreign hint · ×1  ·    8 · resolved
         ErrorList.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | 
     8 · attribute · accessibilityCurrent · Control                  · —                  · none         · ×1  ·    8 · resolved
         Control has no attribute 'accessibilityCurrent' [DECLARE2000] (conduit-parts.declare:405:13)
     8 · value     · tablist              · View.accessibilityRole   · —                  · foreign hint · ×1  ·    8 · resolved
         View.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | row |
     8 · attribute · accessibilityCurrent · NavLink                  · —                  · none         · ×1  ·    8 · resolved
         NavLink has no attribute 'accessibilityCurrent' [DECLARE2000] (line 161, col 5)
     9 · member    · form                 · AuthPage                 · —                  · none         · ×1  ·    9 · resolved
         'form' is not a member of AuthPage — declare it (form: <type> = …) or fix the name — 2 sites, also on line 108 [DECLARE6001] (conduit-pages.declare:98:44)
     9 · member    · form                 · SettingsPage             · —                  · none         · ×1  ·    9 · resolved
         'form' is not a member of SettingsPage — declare it (form: <type> = …) or fix the name — 2 sites, also on line 155 [DECLARE6001] (conduit-pages.declare:141:44)
     9 · member    · form                 · EditorPage               · —                  · none         · ×1  ·    9 · resolved
         'form' is not a member of EditorPage — declare it (form: <type> = …) or fix the name — 2 sites, also on line 223 [DECLARE6001] (conduit-pages.declare:202:44)

COLLISIONS (min · held by · name)
     8 · library class  · Card

SUMMARY: 5 of 8 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```

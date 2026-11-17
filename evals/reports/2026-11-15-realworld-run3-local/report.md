# RealWorld run 3: Opus 5.5, Declare, on the local tree, standard

The first RealWorld (Conduit) run at `standard` (run 2 had the bare prompt, so the comparison is
across levels), on the global-names tree with the settle's rounds and the fixes since Venue 37.
**15.9 min, 90 turns, 84k output tokens** (30k thinking). Audited, and the hidden drive run as a
guard. Timing record: `evals/timings/2026-11-15-realworld-run3-local.txt`.

## 1. The comparison

| | 1 | 2 (bare) | **3 (standard)** |
|---|---|---|---|
| total | 19.3 | 15.0 | **15.9 min** |
| turns | 107 | 87 | 90 |
| output tokens (thinking) | 102k (44k) | 80k (32k) | 84k (30k) |
| reading · writing · checking | 9.0 · 1.8 · 8.5 | 5.7 · 2.6 · 6.7 | 5.1 · 3.1 · 7.7 |
| verify calls · help | 23 · 17 | 22 · 10 | 18 · 10 |
| hidden drive (scenarios, ported tests) | 42/47 (118/130) | 42/47 (118/130), drive fixed | **40/47 (112/130)** |

- **In line with run 2,** a minute longer at `standard`; two assert scripts (`assert.mjs` 59
  assertions at laptop size, `phone.mjs` 19 at 390×844 with touch).
- **Code:** 1,197 lines in two Declare files, 908 by `idiom.py`. **Download:** 219 KB gzip.
- **Source reads:** `library/textinput.declare` and `library/form.declare` — the second to learn
  what a refusal naming no field becomes (`error = rest.join(" ")`), which the reference doesn't
  say (finding 4).

## 2. The hidden drive, and findings for the platform

**Drive: 40 of 47 scenarios, 112 of 130 ported tests.** The four failures are the app's:
- `xss_images` (2/7): a picture that fails to load shows nothing, not the default avatar — as runs
  1 and 2. The agent skipped the fallback "worried about a value depending on itself" (account,
  g) — the loop run 2 found (P2) is now detected, but the way to write a fallback isn't taught.
- `errors_article`, `errors_profile`: a 500, a 404 or the network down on an article or a profile
  leaves the page blank between header and footer; a 403 deleting a comment says nothing.
- `user_fetch_4xx` (1/4): a 400, 403 or 404 from `/api/user` leaves no "Sign in" link — the app
  signs out only on 401.

**Findings for the fix round.**

1. **A token-dependent request after a reload went out without its header** (account, d13 and i).
   `currentUser: DataSource [ url = { app.token == "" ? "" : app.api + "/user" }, autoFetch = true,
   headers = { app.auth } ]` answered 401 after a reload, while other sources carrying the same
   `headers` worked. The likely cause: an auto-fetch fires when `url` takes its value, before
   `headers` has. The agent fetched in `onReady` instead. **To reproduce:** an auto-fetching
   source whose `url` and `headers` both derive from one value must send both — the request
   should be made from the settled source, not the first attribute to move.
2. **Two `:path = …` writes on consecutive lines don't parse** without a `;` (`DECLARE2000 …
   Declaration or statement expected`, conduit-parts.declare:235). The docs show only single
   writes. To check the body lowering of `:path` statements across a newline.
3. **Views built with `exists` show as `$1 (a State)` in a path's "nearest" list** — confusing in
   a test path (d16).
4. **A form's refusal that names no field becomes one joined string** (`error`); the API's
   `{ errors: { field: [msgs] } }` wanted a list. The agent overrode `refusal()` and kept its own
   list, after reading `form.declare`. The Form reference should say what happens to the rest.
5. **`--requests` doesn't show request headers,** which would have explained finding 1 at once.
6. **A wrapping layout inside a view sized by its content can't wrap**; the overflow finding could
   say so (d14).
7. **Translating a CSS theme by hand** was a third of the build (`.btn` variants, pills,
   pagination borders) — a guide section mapping CSS terms to Declare's would serve every port.
8. **Persistence:** the token is kept with a `host = browser` script over `localStorage`, as the
   spec requires; `declare-help localStorage` said plainly that persistence isn't in the language.
   **Out of the fix round** (DT, 2026-11-15): to be designed systematically later.

The branch's new rules: none fired.

## 3. Is it idiomatic Declare?

| | Run 3 |
|---|---|
| code | 908 lines Declare |
| bytes | 52 KB |
| lines over 150 characters | 0 |
| colour literals outside theme declarations | 6 |
| theme reads | 66 |
| States | 0 |
| visible switches | 2 |
| branches on width or phone | 12 |
| flexes | 2 |
| browser scripts | 1 (the token) |
| page lookups | 0 |

**What it gets right** (account, b): routing as `location` parsed into `page` and `arg`, each page
`exists` while named; `headers = { app.auth }` on every request, an empty header not sent; each
write a `DataSource` whose `onLoad` writes the reply into the record on screen (`:favorited = …`
from inside a preview's source); `Form` for sending once and judging every field; computed
defaults for Settings; the signed-out gate as the guide's pattern; tabs as a `ChoiceControl`
(from 4026).

**Missteps.**
- **The editor keeps its fields between articles** (the agent found it writing its account): going
  from `#/editor/<slug>` to New Article leaves `page` at "editor", so the page isn't rebuilt. A
  page keyed on the whole route (`exists` on `page` and `arg`, or an `identityKey`-style key) starts
  fresh. The same for a comment draft between articles.
- **No error states for a failed load** (drive): `source.failed` is a fact the page can show.
- **Three derived Datasets only to replicate computed arrays** (errors, page numbers, tags) — the
  agent's own complaint; replication needs a place in declared data.
- **`Math.max(44, this.contentWidth)` for a touch minimum** — a size reading its own content width;
  `minWidth = { app.touchFirst ? 44 : 0 }` says it.

## 4. Names

**Misses:** `localStorage` (the host hint), `tablist` and `alert` (ARIA hints), `col` ×3 and
`commentForm` on pages (the message named the unnamed container — "name it"). **Lookups that
missed:** `FormProblem` → Form.

## 5. The agent's account

Asked after the build by resuming the session read-only; 12k output tokens, 334k cache reads.

# Building Conduit in Declare: an account for the Declare team

I haven't changed anything for this. One thing needs correcting first. My handover said the dev server was running at `http://127.0.0.1:8601/…`. That server was stopped (exit 143) right after I handed over, so that address won't answer until `npm start` is run again. It may also pick a different port: it chose 8601 because 8200 was taken.

## (a) Getting up to speed

**What I read, in order**
1. `README.md`, then `AGENTS.md` and `skill/SKILL.md`. The skill file overflowed my first `cat`, so I re-read it whole.
2. The four task spec files, `styles.css`, and `API.md`.
3. The required reading, whole and in order: `docs/declare.md`, then guide chapters 01, 04, 05 and 06, then `apps/todo/todo.declare` and `todo-parts.declare`.
4. Then only what the build needed:
   - `20-urls.md` (whole), `14-data.md` (whole), `08-controls.md` (whole), `12-text.md` (whole).
   - The opening sections of `13-media.md` and `11-paint-and-themes.md`.
   - About 30 `declare-help` lookups: `App.location`, `Markdown --all`, `Form --all`, `globals`, `View.shows`, `View.link`, `ResponsiveLayout --all`, `ChoiceControl`, `DrawContext`, `"theme tokens"`, `Sheet`, `RichText`, and others.
   - The headers of `birds.declare` and `homepage.declare`.
   - Library source: `library/textinput.declare` (the class body) and `library/form.declare` (the `Form` class).
   - `docs/operational/verify.md` and `declare-look --help`.

**What I skipped, and why**
- I didn't read the tracker, the sampler's `SignUp`, or chapters 07 (scrolling), 09 (pointer and keyboard), 15 (schemas), 16 (collections), 17 (your own views), 18 (overlays) or 19 (accessibility).
- The reason was that `declare.md` and the todo app covered what I needed, and `declare-help` answered the specific questions.
- Skipping 18 meant I used `Sheet` from its one-line help entry and an example in the todo app. Skipping 15 cost nothing that I noticed.

**What taught me the most**
- **The todo app.** It showed how to organise a whole program: state on the App, records in datasets, `exists` for things that should start fresh, `afterSettle`, computed defaults. It also had working examples of `Sheet`, `Control` subclasses and `Icon.draw`, which I copied the shape of.
- **`declare.md` §5–7.** This is where I learned "what you set with `{ }` is owned by the constraint" and "a datapath points into declared data".
- **Reading `form.declare` directly.** It answered something the reference prose didn't: what happens to a refusal that names no field. In `refuse()`, those messages become `error = rest.join(" ")`. That one line decided how I built the error list.

**What was missing or misleading**
- Nothing was actively misleading.
- **Missing: the order things happen at boot.** Nothing says when an auto-fetching `DataSource` sends its request relative to its other attributes (like `headers`) taking their values. This is where my one real bug came from; see (d) item 13.
- **Persistence.** `declare-help localStorage` said plainly that persistence isn't in the language, and pointed me to a script block. That was clear and honest.
- **The redundant-parentheses hint (`DECLARE1002`)** fired on `{ ({ rows: … }) }`. I had written it that way because the todo app writes `({ … })` everywhere. Small, but the canonical example and the linter disagree.

## (b) Expressing what I wanted

**Where it fit well**
- **Routing.** `location` as a string, parsed into `page` and `arg`, with each page as `exists = { app.page == "x" }`, took about ten lines.
- **Auth headers.** `headers = { app.auth }`, where an empty header isn't sent, worked on every request with nothing more to wire.
- **Writes.** Each one is a `DataSource` whose `onLoad` writes the reply back into the record on screen.
  - In a list preview, `:favorited = …` inside a `DataSource` writes the record the preview stands on. That was elegant.
- **Forms.** `Form` handled not sending twice, Return-to-submit and judging every field.
- **Signed-out guard.** "Show the sign-in form at the same address" was a documented pattern, and I used it as written.
- **Settings.** Computed defaults (`username: string = { app.me?.username ?? "" }`) gave me fields that start from the account and then belong to the person, with no copying code.

**Where I worked around it**
- **Rebuilding a CSS theme by hand.** I re-derived every `.btn` variant, every `.nav-pills.outline-active` rule and the pagination borders as attributes. This was a pattern, not one obstacle, and it was the bulk of the effort; my rough guess is a third of the build. It wasn't hard, just slow, and a translation table from CSS terms to Declare would have helped.
- **The API's error shape.** `{errors:{field:[msgs]}}` isn't one the form understands, and a form-level error is a single joined string. I overrode `refusal()` to return `[]` and kept my own `serverErrors` list.
- **Replicating over a computed array** needs a derived `Dataset` every time. I needed three small ones: the error list, the page numbers and the editor's tags.

## (c) The first time it ran

The first screenshot of the home page already looked like Conduit. What I could see was wrong at that point:
- **A sloppy query string**, `/api/articles?&limit=…`, visible in the `--requests` output. My own assert script then failed on it.
- **Nothing else visibly wrong** on home, article, phone home or login.

Problems that only turned up later, by driving it:
- After a reload, a signed-in session was lost. My laptop flow found this.
- On a phone, the author line under an article ran past the screen edge. Found by the phone flow's layout check.
- The editor's tag-remove buttons were too small to tap. Found by a `declare-look --phone` picture run.
- Article body headings were in Lora, not the sans face Conduit uses. I noticed this in a screenshot.

## (d) Every refusal and surprise

1. **Two writes to the record in a row**
   - What I wrote: `onLoad() {\n :favorited = this.value.article.favorited\n :favoritesCount = this.value.article.favoritesCount\n }`
   - What it said: `DataSource.onLoad(…) is not a valid method body — Declaration or statement expected. [DECLARE2000] (conduit-parts.declare:235:18)`
   - What I changed: added `;` after the first line.
   - Judgement: probably the platform. The two `:path` lines seem to be read as one expression, and the message doesn't say why. The docs only ever show a single `:x = v`. I'm unsure of the exact parse.
2. **`accessibilityRole = tablist`**: it said ARIA's word is `tablist` and Declare's is `tabList`. My mistake; an excellent message.
3. **`accessibilityRole = alert`**: it said an alert is `status` with `accessibilityLive = assertive`. My mistake; excellent message.
4. **`width = { app.wide ? this.parent.contentBox("width") / 2 : 100% }`**: it said there are no percentages inside `{ }`. My mistake, and `declare.md` says so. The fix was `parent.contentBox("width")`.
5. **`fontWeight = { classroot.size == "lg" ? semibold : normal }`**: `DECLARE4005`, write it as a string inside `{ }`. My mistake; clear.
6. **`datapath = { ({ rows: classroot.tags }) }`**: `DECLARE3006`, "a datapath is a place in declared data, and a literal is in none". My mistake (chapter 14 says it). I changed it to `tagRows: Dataset [ contents = { … } ]`.
7. **Warnings**
   - `DECLARE4022`: `Btn` shows `on` but tells a screen reader nothing. I added `accessibilityPressed`.
   - `DECLARE4026`: Tabs should be `ChoiceItem`s inside a `ChoiceControl`. I switched to that.
   - `DECLARE4025`: too many nested `? :` choices, in `Input` padding and `containerW`. I named the parts and used a lookup.
   - All fair, and they made the code better.
8. **`accessibilityCurrent = { … ? "page" : "" }`**: `DECLARE6001`, it wanted an `AccessibilityCurrent`. I guessed `""` meant none; it's `"none"`. My mistake.
9. **`classroot.col.form.submit()`**: "'col' is not a member of AuthPage — a child's is: '<Container>.col', inside a view with no name". I named the containers `box:`. My mistake; a very helpful message.
10. **Pagination width (boot)**: "Pagination.width … is 0 — it takes its width from its children, and every one of them … takes its width from it". I added `width = 100%`. My mistake, and it is chapter 06's own example.
11. **Phone: buttons too small**: "3 control(s) smaller than 44 × 44 … 39.9×44". I wrote `width = { app.touchFirst ? Math.max(44, this.contentWidth) : this.contentWidth }`. It worked; I'm unsure it's idiomatic.
12. **My query string**: my test failed with `expected a GET /…limit=10&offset=10$/ — sent … ?&limit=10…`. My code: `path: string = { classroot.query == "feed" ? "/articles/feed?" : "/articles?" + classroot.query + "&" }`. Fixed by joining the parts.
13. **Lost session after reload — the one real puzzle**
    - What I wrote: see (i).
    - What happened: after logging in and reloading, `GET /api/user` returned 401. My `onError` then signed out, which wiped the stored token. That made the evidence confusing: before the reload the token was in localStorage, after it was `null`.
    - What I changed: no auto-fetch; the user is fetched in `onReady()` instead.
    - What I tested: profile pages deep-linked after a reload did carry the header (`following` came back true). So the problem seems specific to this source, whose address itself depends on the token.
    - Judgement: unsure whether this is a platform ordering bug or something I misunderstood. I never saw the headers actually sent, because `--requests` doesn't show them. Cost: about six tool calls.
14. **Phone: article foot overflow**: "app.main.article.body.col.3.0 runs past the window's right edge at 390 wide (it ends at 408)".
    - What I wrote: `ArticleMeta [ x = center, page = { classroot } ]`. That view was sized by its content and used a wrapping layout, so it could never wrap.
    - What I changed: `width = 100%`, a `centered` flag that sets `justify`, and the actions capped with `width = { Math.min(this.contentWidth, classroot.width) }`.
    - Judgement: my code. The finding could say "a wrapping layout in a view sized by its content can't wrap". I'm unsure the cap I used is legitimate; it reads its own content width.
15. **Editor tag "×" buttons**: `declare-look` reported "2 control(s) smaller than 44 × 44 … 32×36". Mine; fixed.
16. **A path that didn't exist**: `declare-look --click 'app.main.1.box.col.form.2'` failed with "'app.main' holds nothing called 1; nearest there: $1 (a State)…". Surprise: children built with `exists` seem to be listed as States. I named the pages instead. Unsure whether that is meant to show.
17. **An ambiguous locator in my test**: the strict-locator error named both matching elements. My script's mistake; a very good message.
18. **Not a platform issue — the dev server's port**: I assumed port 8200, and my curl got exit 7. The server had printed 8601. My mistake; the docs say to use the address it prints.

## (e) Verifying it

- **`declare-verify --phone --desktop`, rungs 1–4.** It caught items 1–10 above, and every message named its fix.
- **Two assert scripts against the live service.**
  - `tests/assert.mjs`, at laptop size: 65 steps, 59 assertions.
  - `tests/phone.mjs`, with touch at 390×844: 46 steps, 19 assertions.
  - They caught item 12, the session bug (item 13) and the phone overflow (item 14).
- **`declare-look` screenshots** of about ten screens. These caught the Lora headings and the small "×" targets.

**How well the tools served me: very well.**
- Playwright-style locators by role and name made the scripts readable.
- The note that some classes were "built, but never checked for layout" pushed me to add settle points on the editor and settings screens.
- The warning that a script writes to the live service was considerate.

**Friction**
- Anonymous view paths like `app.main.0.1.body.feed.1.4` are hard to read.
- `--requests` doesn't show request headers, which would have explained item 13 at once.
- Rung 4 fed `currentUser` a sample of its schema at boot, so the boot check could never have seen the reload bug.
- Each run takes about a minute.

## (f) Confidence

**High** for these, because the flows drive them:
- home tabs, tags and paging
- sign in and sign up, including errors
- writing and editing an article, tags included
- comments
- following and favoriting
- profile tabs
- settings and logout
- the session surviving a reload
- the signed-out gate on editor and settings

**Medium** for the look on unusual widths (around 640–770px), and for keyboard and screen-reader use: the automated accessibility checks pass, but nothing more was done.

**Where I'd expect a tester to find problems**
- **The editor keeps its fields between articles.** Going from `#/editor/<slug>` to "New Article" doesn't rebuild the editor page, because `page` stays "editor". The old title and body would remain, and publishing could create a copy. I believe this is a real bug, found while writing this account.
- **A comment draft stays when moving between articles**, for the same reason, if you ever navigate article to article directly.
- **No fallback avatar** when an image URL is broken.
- **After being sent to sign in** (for example by pressing favorite while signed out), signing in goes home, not back to the article.
- **The tab title** is "Article — Conduit", not the article's own title.
- **Unknown routes** quietly show the home page.
- **Article body headings** are smaller than Conduit's.

## (g) Gaps I worked around

- **Persisting the token.** The help entry says persistence isn't in the language, so I wrote a `script [ host = browser ]` block around localStorage. The platform really lacks it, by its own account.
- **Path-style URLs** (`/article/x`). `location` is the part after `#`, so the app uses `#/article/x`. I think it's a deliberate design choice; unsure whether real paths could be supported.
- **The API's error shape.** I read `form.declare` and overrode `refusal` and `refusedWith`. A list of form-level errors would be a small addition; right now it's one joined string.
- **The Ionicons stylesheet.** I drew the seven icons by subclassing `Icon`. I didn't look for a way to load an icon font; drawing seemed to be the intended route.
- **Google Fonts.** A `FontFace` needs a font file, not a CSS URL, so I curled the stylesheet to get the `woff2` addresses. Probably by design; it was a small detour.
- **Conduit's button variants.** I built my own `Btn` from `Control` rather than restyling the library `Button` through theme tokens. I didn't try the token route, so it may well be possible.
- **A minimum size on touch.** I used `Math.max(44, contentWidth)`. There may be a cleaner way I didn't find; unsure.
- **Falling back to the default avatar when an image fails.** I skipped it, worried about a value depending on itself. It's probably expressible (for example a second image layered underneath).

## (h) Changes of direction

- **Button colour lookups.** Planned as App methods; moved into `Btn` before the first compile. Reason: my own second thoughts after reading that `provided()` never finds the node it's called on.
- **Feed and profile tabs.** First `Control`s with an `active` flag; became a `ChoiceControl` with `ChoiceItem`s. Reason: the `DECLARE4026` warning.
- **`Input` padding and `containerW`.** First nested ternaries; became named parts and a breakpoint lookup. Reason: `DECLARE4025`.
- **Editor tag rows.** First a literal datapath; became a derived `Dataset`. Reason: `DECLARE3006`.
- **The current-user fetch.** First auto-fetched on a token-dependent address; became an explicit fetch in `onReady`. Reason: the reload failure, late in the build.
- **The article's foot author line.** First centred and sized by content; became full width with centred wrapping. Reason: the phone layout finding.
- **The list's query string.** Rebuilt after my own test failed.
- **Page names.** The pages were unnamed; I named them so test paths could reach them.
- **Form errors (before writing any code).** I considered three approaches:
  1. per-field refusals, with `Field` showing each under its field;
  2. not using `Form` at all;
  3. a refusal override that keeps a list of messages.

  I chose the third. Reason: the brief's templates put all errors in one list at the top.
- **Article body headings.** Changed late to the sans face via `tagStyles`, after seeing Lora headings in a screenshot.

## (i) The code, quoted

The session bug (item 13), as it stood:

```
token: string = { storedToken() },
auth: object = { ({ Authorization: app.token == "" ? "" : "Token " + app.token }) },
currentUser: DataSource [ url = { app.token == "" ? "" : app.api + "/user" }, autoFetch = true,
    headers = { app.auth }, schema = [ user: User ],
    onError() { if (this.statusCode == 401) app.signOut() } ],
```

To reproduce: sign in, then `page.reload()`. The requests are then `… "GET /api/user 401"`, and `localStorage.jwtToken` reads `null` after the reload. Signing in during a session, by contrast, produced `GET /api/user → 200`.

The other refusals are quoted with their code in (d) items 1, 4–6, 8–12, 14 and 16.

## Overall

**Surprises**
- How often the compiler's message was itself the fix.
- That `exists` children appear as States in view paths.
- That a single unexplained boot-order issue was the only real bug in roughly 1,200 lines.

**Good**
- The diagnostics.
- The layout model, once "one decider per value" sank in.
- `DataSource` writes with `onLoad`.
- `Form`.
- The verify and look tools.
- Markdown being safe by default: raw HTML stays text.

**Bad**
- Hand-translating CSS.
- Opaque behaviour at boot.
- Anonymous view paths.
- No headers in `--requests`.

**What it reminded me of**
- QML and OpenLaszlo for the tree-plus-constraints model.
- SwiftUI for state driving views.
- A spreadsheet for its dependency model.

Unlike React there's no render pass to reason about, and unlike CSS every size and position has exactly one decider.

**Where I'd most want improvement**
1. Document, or make predictable, the order things happen at boot for `DataSource`s.
2. A guide for translating an existing CSS theme into Declare.
3. Clearer messages for a wrapping layout that can't wrap, and for two consecutive `:path` writes.

**What I'd use it for:** app-like frontends with real data, such as dashboards, CRUD tools and readers, especially when an LLM is doing the writing and the compiler acts as the reviewer.
## 6. The names ledger

```
NAMES — eval-realworld-3: 7 missed name(s), 0 collision(s), 1 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     1 · global    · localStorage         ·                          · browser/Node global · foreign hint · ×1  ·    1 · resolved
         'localStorage' is the host's, not Declare's — a program runs on three renderers and names none of their globals. Persistence is not in the language yet — hold the state in a Dataset; a host can supply
     8 · value     · tablist              · Tabs.accessibilityRole   · —                  · foreign hint · ×1  ·    8 · resolved
         Tabs.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | row |
     8 · value     · alert                · ErrorList.accessibilityR · browser/Node global · foreign hint · ×1  ·    8 · resolved
         ErrorList.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | 
     9 · member    · col                  · AuthPage                 · —                  · none         · ×1  ·    9 · resolved
         'col' is not a member of AuthPage — a child's is: '<Container>.col', inside a view with no name — name it (box: View [ … ]) to read it through that name [DECLARE6001] (line 236, col 45)
     9 · member    · col                  · SettingsPage             · —                  · none         · ×1  ·    9 · resolved
         'col' is not a member of SettingsPage — a child's is: '<Container>.col', inside a view with no name — name it (box: View [ … ]) to read it through that name [DECLARE6001] (line 288, col 45)
     9 · member    · col                  · EditorPage               · —                  · none         · ×1  ·    9 · resolved
         'col' is not a member of EditorPage — a child's is: '<Container>.col', inside a view with no name — name it (box: View [ … ]) to read it through that name [DECLARE6001] (line 377, col 45)
     9 · member    · commentForm          · ArticlePage              · —                  · none         · ×1  ·    9 · resolved
         'commentForm' is not a member of ArticlePage — a child's is: '<Container>.col.commentForm', inside a view with no name — name it (box: View [ … ]) to read it through that name [DECLARE6001] (line 521,

DECLARE-HELP MISSES (min · asked for · answered)
     4 · FormProblem · 'FormProblem' is not a Declare name — the Declare concept is Form:

SUMMARY: 4 of 7 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```

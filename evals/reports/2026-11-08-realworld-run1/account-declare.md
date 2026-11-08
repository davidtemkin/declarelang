# Building Conduit in Declare: an account for the people who make it

Two things to know before the account.

- **The dev server may be down.** In my last summary I said the app was served on port 8201. That server, started in the background, has since exited with code 1. It did return HTTP 200 for the app URL before the summary. I tried to read its log just now, but the shell is disabled in this session, so I don't know why it stopped.
- **The source files changed after my last edit, and not by me.** All three `.declare` files changed on disk after I finished. I haven't read them and changed nothing. The code quoted below is as it stood during my session.

---

## (a) Getting up to speed

**What I read, in order**

1. **`README.md`**, which pointed to `skill/SKILL.md`.
2. **`SKILL.md`**, whole. It sets the reading list and the working order: plan, check the plan, write, check and look.
3. **`docs/declare.md`**, whole.
4. **Guide chapters 01, 04, 05 and 06**, whole.
5. **`apps/todo/todo.declare` and `todo-parts.declare`**, whole.
6. **The task spec**: `features.md`, `routing.md`, `expectations.md`, `styles.md`, `templates.md`, and all of `styles.css`, which I needed for its exact values.
7. **Read when I needed it:**
   - `20-urls.md` and `14-data.md`, whole;
   - the birds app's header and its location parsing;
   - `declare-help` on `Form` (with `--all`), `DataSource`, `Markdown`, `Image`, `TextInput`, `Font`, `FontFace`, `ResponsiveLayout`, `Icon`, `WrappingLayout`, `RichText`, `ChoiceControl` and `classFor`, plus the theme-tokens list;
   - the source of `library/form.declare` (the `Form` class body) and parts of `textinput.declare` and `button.declare`.

**What I skipped, and why.** I didn't read guide chapters 02 (notation), 03 (constraints), 07 (scrolling), 08 (controls), 11 (paint and themes), 12 (text), 15 (schemas), 16 (collections) or 18 (overlays). I also didn't read the tracker app or the sampler's `SignUp`, which the skill names as the model for forms. The skill told me to stop after the four chapters and the to-do app, and to read the rest when needed. When I needed controls, forms, text or schemas, the reference or a library source answered faster than a chapter.

That was mostly fine. Two misses probably trace to it:

- **Chapter 16 (collections).** It would likely have told me how replicated and conditional views keep or rebuild their instances (see (h)4).
- **The sampler's `SignUp`.** I never looked at how a library form shows its errors.

**What taught me the most**

- **The to-do app.** Its comments taught the shape of a program: a dataset class that makes every write, state on the App, and parts that take `press()` at the use site.
- **`declare.md` §7 (Data).** This is where `DataSource` and `autoFetch` became clear.
- **The `Form` reference and source.** Reading `refusal()`, `refuse()` and `problems` in `form.declare` showed me exactly how to map the RealWorld error shape onto fields.

**What was missing or misleading**

- **"A computed value" read as "any value".** In `14-data.md`, "`datapath = :rows[0]`, or `datapath = { app.newest }`" is described as "a computed value". I took that to mean a `{ }` could hand a datapath any value. It must be a place inside a Dataset (DECLARE3006, in (d)).
- **No way to list a family of attributes.** `declare-help accessibility` returned only the `Accessibility` namespace (announce), not the `accessibility*` attributes on View. I found the real names by grepping `runtime/src/view.ts`.
- **A type the docs use has no entry.** `declare-help FormProblem` answered "no entry", but `Form.refusal` returns that type and I had to type my override with it. I wrote `-> FormProblem[]` on trust, and it compiled.
- **How the checker names views.** `verify.md` does say how drive paths name views: by member name, by index, or by what the view says. I still assumed class names would work, and they don't (see (d)).

---

## (b) Expressing what I wanted

**Where it fit well**

- **Routing as a derived value.** `location` plus derived `route`, `section`, `param` and `page`, with `link = "#/login"` everywhere. There was no router to configure, and Back worked without code.
- **Reads as `DataSource`s whose path derives from state, with `autoFetch`.** This was the best fit in the build. "Opening an article loads it and its comments" is two lines:

  ```
  path = { app.page == "article" ? app.slugPath + "/comments" : "" }
  ```

  An empty path means no request. Because a path goes to "" when the user leaves a page and comes back on return, every revisit refetched without any code of mine. I didn't plan that; it fell out of the model.
- **Auth headers.** A shared base class did it in one line: `class Api extends DataSource [ ..., headers = { app.session.auth } ]`. The docs' note that an empty header isn't sent made the signed-out case free.
- **The `Form` refusal pipeline.** Overriding `refusal(body)` to read `{"errors":{"email":["has already been taken"]}}` put each message on the right field. Once I'd found the hook, this was about ten lines.
- **Computed defaults for edit forms.** Settings and the editor use `title: string = { classroot.a?.title ?? "" }`: it follows the loaded record until the person types, then becomes theirs. That's exactly the right semantics, and it took no code.
- **Themes.** A `theme Conduit [ … ]` record spread over `SanFrancisco` gave both the library controls and my parts the Conduit palette.

**Where I worked around it**

- **Lists of plain values.** Replicating over a computed array needs a Dataset wrapper (see (g)).
- **Overriding a nested child's method.** You can't from the use site.
- **Rebuilding a view when a key changes, rather than when a boolean flips.** I used a one-record Dataset with `classFor`.
- **Bootstrap's grid.** I wrote my own `Container` and `Column` classes with arithmetic widths. This is close to the skill's drift tell, "equal widths by arithmetic".
- **A footer pinned to the bottom of a short page.** I guessed `flexes = true, minHeight = { this.contentHeight }`. It worked, but I'm unsure it's idiomatic.

---

## (c) The first time it ran

After seven fix-and-recheck rounds (listed in (d)), the program got through R4 cleanly. My first screenshot was the signed-out home page at 1280×900, and it looked like Conduit at a glance. I saw nothing wrong in it.

The problems appeared later:

- **Stale editor state.** Going from `/editor` to `/editor/<slug>` kept the tags I had typed on the earlier visit. I saw this in a screenshot after the flows passed.
- **The phone header ran past the window edge.** Found by a layout finding.
- **The signed-out comment prompt wrapped.** It broke after "sign up", leaving room unused. Found in a screenshot.
- **The pagination stacked vertically, one number per line.** Found in a screenshot.
- **Markdown code blocks had a bluish background.** The library default; found in a screenshot.

Nothing broke at runtime. Every failure was found by the compiler, a layout finding, a screenshot, or an assert-script failure that was really my own script's fault.

---

## (d) Every refusal and surprise

### 1. Overriding a nested child's method (R1)

I wrote this at the use site of `TagChip`, whose class had a child `remove: Control [ … ]`:

```
TagChip [ datapath = :tags[], label = :@, remove.press() { classroot.dropTag(:@) } ]
```

The compiler said:

```
'remove.…' — a member sets this element's OWN attributes, never a child's. Write the attribute on 'remove' itself, usually as a { } constraint reading the state or flag that drives it [DECLARE5000] (conduit-pages.declare:197:67)
expected ']', got '(' [DECLARE5000] (conduit-pages.declare:197:79)
```

I made the whole chip a `Control` (`class TagChip extends Control`), so its `press()` removes the tag and the × is just a mark.

**Judgement: my code was wrong.** I half expected the refusal. The message, though, talks about attributes; this was a method. A sentence like "a use site can't override a child's method; make that child the control, or give the class a method the child calls" would have handed me the fix. The second error, `expected ']'`, was noise that followed from the first.

### 2. A guessed attribute name (R1)

On `PageLink` I wrote:

```
accessibilityCurrent = { classroot.active ? "page" : "" },
```

The compiler said `PageLink has no attribute 'accessibilityCurrent' [DECLARE2000] (conduit-parts.declare:301:5)`. I changed it to `accessibilitySelected = { classroot.active }`.

**Judgement: my guess was wrong.** The message suggested no near names, though for `color` the docs show it saying "the CSS instinct: text color is 'textColor'". `aria-current` is the honest semantics for the current page in a pager, and Declare doesn't seem to have it. Unsure whether it exists under another name.

### 3. A datapath that points at a fresh value (R1)

I wrote three of these. In `ErrorList`:

```
datapath = { ({ rows: classroot.messages }) },
```

On the pager: `datapath = { ({ pages: app.pageNumbers }) },`. On the editor's chips: `datapath = { ({ tags: classroot.tagList }) },`.

The compiler said:

```
a datapath is a place in declared data, and a literal is in none — the value is fresh, so no Dataset holds it and the cursor has nowhere to point. Declare the records as data and point there: 'items: Dataset { { "rows": [ … ] } }' for fixed records, or 'items: Dataset [ contents = { … } ]' for records you compute, then 'datapath = { app.items.value }' and replicate with ':rows[]' — 3 sites, also on lines 448, conduit-pages.declare:195 [DECLARE3006] (conduit-parts.declare:231:16)
```

I added derived datasets, for example `shown: Dataset [ contents = { { rows: classroot.messages } } ], datapath = { classroot.shown.value }`.

**Judgement: my code was wrong.** This was an excellent message: it gave the cause, the exact rewrite, and every site. The docs' "a computed value" wording led me there (see (a)). The rule itself costs a named dataset per array, which I'd call verbose (see (g)).

### 4. Advice on the same run

- **DECLARE4026** said my two TabPills each had an `active` that was one choice among several, and should be ChoiceItems in a ChoiceControl. Good advice, and I took it ((h)2).
- **DECLARE4025** said `solid decides on one condition of 4 parts`, for `solid: boolean = { classroot.kind == "primary" || classroot.filled || hovered || pressed }`. I named `engaged: boolean = { hovered || pressed }`. That was mildly useful.
- **DECLARE1002** flagged the redundant parentheses in `{ ({ … }) }`. I had added them out of habit, because the docs write `({ … })` inside method bodies.

### 5. A value that might be absent (R3)

I wrote:

```
user: User? = { classroot.signedIn && classroot.me.loaded ? classroot.me.value.user : null },
```

The compiler said:

```
'classroot.me.value' may be absent here — check it ('if (classroot.me.value != null) …'); or, if it is always there, declare its type without '?' … [DECLARE6001] (line 109, col 65)  hint: TypeScript 18047
```

I changed it to `{ classroot.signedIn ? classroot.me.value?.user ?? null : null }`.

**Judgement: a minor platform rough edge.** The docs define `loaded` as "`value` is not null", but the type checker can't use that. The fix was trivial. The message gave line 109 without a file name, while other messages named the file.

### 6. R4 boot

Clean on the first try, with these notes:

- "4 data source(s) fed a sample of their schema at boot … `app.session.me`, `app.article`, `app.comments`, `app.profile`".
- A list of classes not built at boot.

I was surprised that the boot invented sample data for some sources. Useful for coverage, but I'm unsure what it means for screens that read `loaded`.

### 7. Drive paths with class names (R5)

My script used `"app.main.HomePage.Container.row.feed.ArticleFeed.list"`. The checker said:

```
no node at 'app.main.HomePage.Container.row.feed.ArticleFeed.list' (after: settleData → request GET /\/api\/articles\?limit=10&offset=0$/ ✓)
```

`--outline app.main` showed that anonymous children are numbered (`0 HomePage`, `1 Container`). I named the members a script or a reader would reach for (`home:`, `body:`, `articles:`, `heart:`, `col:`, `buttons:`, `compose:`) and changed the paths.

The same happened twice more: `…list.0.meta.Btn` (renamed `heart:`) and `app.main.article.banner.Container.meta.buttons` (renamed `col:`).

**Judgement: my assumption was wrong, and the docs do say it.** Three rounds, maybe 10–15 minutes. A "did you mean `0` (a HomePage)?" in the no-node message would have ended it in one round. Naming things also made the code read better, so the cost wasn't all waste.

### 8. A locator that found nothing

My script clicked `list.1.body` and then `page.getByRole("button", { name: /^Favorite Article/ }).first()`. The checker said:

```
… found nothing within 5 s — motion is still in flight on the program's clock, which the script holds: let it land first (drive.settleMotion()) — at conduit/conduit.flows.mjs:109
```

The real cause was that item 1 of the feed was jake's own article, which shows Edit and Delete instead. I chose the first article by someone else.

**Judgement: my script was wrong.** The motion hint was a red herring here. It's appended whenever motion is pending, which made me briefly wonder whether waiting was the problem.

### 9. Doubled text in an expectation

My script expected `Unfavorite Article(${fav + 1})`. The checker said:

```
expected 'app.main.article.banner.col.meta.buttons' text to contain "Unfavorite Article(6)", got "Follow eli_w Unfavorite Article (6) Follow eli_w Unfavorite Article (6)"
```

The missing space was my mistake. I fixed it.

**Judgement: the doubled text is unexplained.** The whole sequence appears twice. Maybe `expect.text` combines accessible names and visible text, or maybe each `Btn` contributes both its `accessibilityLabel` and its `TextLabel`s. I didn't investigate. It's worth checking that `expect.text` doesn't double-count.

### 10. A failed run left state behind

After the fix in item 9, the favorite step failed again: the article was already favorited. My previous failed run had stopped between favoriting and unfavoriting.

I rewrote that step to read the current state and flip it and back. I also cleaned up with curl: four leftover `flow-check-*` articles and the stray favorite.

**Judgement: my script's fault.** `verify.md` warns that a live service remembers. I didn't notice the run itself saying so, though the docs say it should ("a run that fails after earlier runs wrote to the same service says so"). Unsure whether it did and I filtered it out: I was piping through `grep -v "^  note"`.

### 11. A wheel scroll that didn't scroll

In my throwaway screenshot script, `await page.mouse.wheel(0, 900); await drive.waitReal(400);` left the page unscrolled; the screenshot matched the previous one. I switched to `drive.reveal(path)`.

**Judgement: unsure.** The docs push you to `drive` verbs and say Puppeteer is for rare questions, so this may be expected.

### 12. Layout finding: the phone header

The finding:

```
layout after device 390x844 touch: app.header.0's children need 404 across and it has 328, so app.header.0.links runs past its end. Let a child give room up (shrinks = true), take what is left rather than the whole (flexes instead of width = 100%), or let app.header.0 scroll or clip.
```

The code at the time was a `SimpleLayout [ axis = x ]` Container holding the brand `Text`, a `Spacer [ ]`, and `links: View [ layout: SimpleLayout [ axis = x, spacing = 16, align = center ], … ]`. I changed `links` to `flexes = true` with `WrappingLayout [ spacing = 16, rowSpacing = 0, justify = end, align = center ]` and dropped the Spacer.

**Judgement: my layout was wrong, and the finding was exactly right.** It named the view, the numbers and the remedies.

### 13. The comment prompt wrapped early (seen in a screenshot)

I wrote:

```
prompt: View [ visible = { !app.session.signedIn }, padding = [0, 0, 12, 0],
    layout: WrappingLayout [ spacing = 4 ],
    Anchor [ link = "#/login", text = "Sign in" ],
    Text [ text = "or" ],
    Anchor [ link = "#/register", text = "sign up" ],
    Text [ text = "to add comments on this article." ] ],
```

It rendered as "Sign in or sign up" on one line, with "to add comments on this article." on the next, though the 720px column had plenty of room. I replaced it with a Markdown line: `"[Sign in](#/login) or [sign up](#/register) to add comments on this article."`.

**Judgement: unsure.** The likely cause is that `prompt` had no width, so the WrappingLayout's room came from its content. Item 14 is the same failure, but there the width was clearly 0; here three items fit on a line. I don't know how a content-sized WrappingLayout decides its width. Verify raised no finding.

### 14. The pagination stacked (seen in a screenshot)

I wrote:

```
pager: View [ padding = [16, 0, 16, 0], visible = { … }, datapath = { app.pages.value },
    layout: WrappingLayout [ spacing = -1, rowSpacing = 4 ], PageLink [ … ] ]
```

The page numbers rendered one per row, 1 through 6 down the page. I added `width = 100%`.

**Judgement: my code was wrong, but this deserves a layout finding.** A WrappingLayout in a view sized by its content can't wrap meaningfully, and verify was silent. Chapter 06's "nothing decides it" message exists for the width-from-children cycle; this is a close cousin.

### 15. Stale editor state (seen in a screenshot)

Each page was built with `exists = { app.page == "editor" }`. Going from `/editor` (where I had added tags "one" and "two") to `/editor/how-i-structure-…`, the edit form showed the article's title and body but my tags "one" and "two". The same instance was kept, and `tagList` had been taken over by an assignment. I rebuilt pages per address ((h)4).

**Judgement: my design was wrong.** `exists` rebuilds when its boolean flips, and the boolean didn't flip. I'd have liked the docs to say plainly, where `exists` is introduced, that it's keyed on its condition and not on the data.

### 16. Things that weren't refusals

- **The code-block background was bluish.** The default `codeBackground`; I set it to the theme's wash.
- **My `cat` of `button.declare` "failed" with `(eval):1: ===== not found`.** That was zsh expanding `======` in my own `echo`. Not the platform.

---

## (e) Verifying it

- **`declare-verify` R1–R4.** Every compile round took about two seconds. Each error came with its fix; I applied it, and the next round was clean. Seven rounds to a clean boot.
- **`--outline`.** Indispensable for drive paths and for checking real sizes (for example, the feed column at 810 of 1110).
- **`declare-look --shot`.** My first visual check.
- **Screenshots from inside an assert script.** For the signed-in pages I wrote throwaway assert scripts that sign in and call `page.screenshot` at each address. `declare-look` alone can't easily get through a sign-in.
- **`conduit.flows.mjs` (R5).** It ended at 74 steps and 48 assertions against the live API. It caught my bad paths and script mistakes; it caught no app bugs, because the app behaved. `expect.request` with a RegExp and a body match was very good for asserting what was sent.
- **Device changes.** `drive.device({ width: 390, … touch: true })` mid-script, with the automatic layout check after it, gave me the header finding for free.

**What the tools missed:** both WrappingLayout problems ((d)13 and (d)14), and the stale editor. Screenshots caught all three. **What they caught well:** compile and type errors, the overflowing phone header, and when a script "asserted nothing".

**Rough edges in the tools:**

- the misleading motion hint ((d)8);
- the doubled text ((d)9);
- `verify` and `look` boot at 1280×800 by default, which is fine;
- the boot's sample data, which was a bit opaque.

---

## (f) Confidence

**High confidence.** These were exercised end to end against the live API:

- signing in and up, refusals worded per field, token persistence, signing out, the 401-on-stale-token sign-out (by code path only; untested);
- the global, feed and tag lists and paging;
- the article page: Markdown, author vs reader buttons, favorite, follow;
- comments: post and delete;
- the editor: create and edit, tags, blank-field errors;
- settings: update and redirect;
- the profile and its favorites tab.

**Medium confidence:**

- **Visual fidelity at every breakpoint.** I checked 1280 and 390 only. The container steps between (544, 768, 992) are untested by eye.
- **Fonts.** These are woff2 URLs I scraped from Google; Lora is variable, so one file covers all its weights. If those URLs change, the app falls back to Georgia and Helvetica.
- **Editing someone else's article by URL** (`/editor/<their-slug>`). It loads their article into the form; the server refuses with 403, shown as a generic message. Not checked.

**Where I'd expect a tester to find problems:**

1. **Rapid favorites on two different rows.** One `favorite` source is aimed per click, and a later `fetch()` supersedes an earlier one. I disable the hearts while a request is pending, which mostly prevents it, but it's a race by design.
2. **Long or unusual text.** A very long word in a title, or an image URL that fails to load: `Avatar` only falls back for null or "", so a broken URL shows a broken image.
3. **A hand-typed URL with a malformed `%` escape.** `decodeURIComponent` throws inside a constraint.
4. **Visual details against `styles.css`.** Paragraph spacing in articles is tighter than the stylesheet's 2rem margin-bottom. The profile's follow button sits on its own line rather than floating beside the name. Hover states on the brand link and on the pagination are approximations.
5. **A screen reader on the article list.** Each preview has a link wrapping a title, a description and tags, which may read verbosely.
6. **Back after publishing.** Back goes to the editor, now rebuilt empty for `/editor` (or holding a stale slug), which is arguably fine.

---

## (g) Gaps I worked around

1. **Persisting the token.** I wanted a Declare-level persistent attribute. `declare-help localStorage` told me directly: "Persistence is not in the language yet … keep the mirror in a script". I used `script [ host = browser ]` with `storedToken()` and `storeToken()`, plus `trackChanges = ["token"]` and `onChange` on `Session`. **Judgement: genuinely absent, and the docs say so honestly.**

2. **Replicating over a computed array.** I wanted `datapath = { ({ rows: someArray }) }`. DECLARE3006 refused it, so I declared a derived `Dataset` per list: error messages, page numbers, editor tags. **Judgement: absent by design.** Three extra named members for "repeat over these strings". A `datapath` that takes a computed array directly would cut that.

3. **Overriding a nested child's method from the use site.** I wanted `remove.press() { … }`. It was refused, so the whole chip became a Control. **Judgement: absent by design.** The other route is a method on the class that the child calls, which the skill calls a drift tell. Unsure what the intended pattern is for a composite with one action button inside.

4. **Rebuilding a view when its key changes.** I wanted something like `exists = …` plus `key = { app.location }`. I didn't look hard. I used a one-record `screen: Dataset` keyed by `id: app.location`, with `classFor` choosing the page class. **Judgement: this may exist and I missed it.** `key = :field` exists on replicated nodes; something similar for a single conditional view might too. My workaround reads well but is indirect, and it made every page `app.main.0` in drive paths.

5. **`aria-current`.** I wanted `accessibilityCurrent`, found none by grepping `view.ts`, and used `accessibilitySelected`. **Judgement: likely absent.**

6. **The Bootstrap grid** (`.container` steps, `col-md-N offset-md-M`).
   - I looked at `ResponsiveLayout`, which I used for the home row.
   - For centred offset columns I wrote `Column` with `width = { (parent.contentBox("width") + 30) * (app.md ? span : 12) / 12 - 30 }`.
   - For the container steps I wrote `Container` with `containerMax` from a method on `app.width`.

   **Judgement: unsure whether a library layout covers "a centred column of N/12".** It may be expressible with `ResponsiveLayout` share plans; I didn't try.

7. **Loading web fonts from a stylesheet URL.** `FontFace.src` takes font files. I curled Google's CSS to extract the latin woff2 URLs. **Judgement: absent, reasonably so.** It is brittle for users, though.

8. **Ionicons.** I drew seven icons with `Icon.draw`. The spec allowed substitutes. Fine.

9. **A queue of writes to one endpoint.** I wanted rapid favorites on different rows to all land. I disabled the buttons while one is pending. **Judgement: unsure.** The documented pattern is a target attribute plus one source, and I didn't look for a way to have several in flight.

10. **A footer pinned to the bottom of a short page.** I used `flexes = true, minHeight = { this.contentHeight }` on `main`. It worked. **Judgement: unsure whether that's the intended idiom.**

---

## (h) Changes of direction

1. **The editor's tag chip.** First a View with a nested `remove: Control` that the use site tried to override. It became a chip that is itself a `Control`. Changed right after the first compile; trigger: refusal DECLARE5000.

2. **The feed tabs.** First `TabPill extends Control` with `active` and a `press()` per use. They became `TabPill extends ChoiceItem`, the tab rows became `ChoiceControl`s with `value` and `commit`, and the profile tabs commit through `followLink`. Changed on the second compile; trigger: warning DECLARE4026. I agreed with it.

3. **Inline arrays under a datapath.** They became derived `Dataset`s, on the same compile; trigger: refusal DECLARE3006.

4. **Pages.** First seven named instances in `main`, each with `exists = { app.page == "…" }`, `AuthPage` taking `signingUp = true` for register, and `ArticlePage` with `datapath = { app.current }` on itself. They became one `screen: Dataset` record `{ id: location, page }` with `Page [ datapath = :pages[], classFor = { … } ]`. All pages now extend a `Page` base, `AuthPage` reads `signingUp = { :page == "register" }`, and the article cursor moved onto `banner` and `page`, because the replicated node's own datapath took the class's slot.

   This came late, after the full flow passed. Trigger: the stale-editor screenshot. This change cost the most of anything after the first boot, maybe 20 minutes including updating script paths.

5. **The signed-out comment prompt.** First a WrappingLayout of Anchor and Text. It became one Markdown line. Late; trigger: a screenshot.

6. **The header links.** First `SimpleLayout` plus a `Spacer`. They became `flexes` plus a `WrappingLayout` with `justify = end`. Late; trigger: the layout finding at phone size.

7. **The pager.** It gained `width = 100%`. Late; trigger: a screenshot.

8. **The test's favorite step.** First it assumed the article was unfavorited. It became state-agnostic. Mid-testing; trigger: my own failed run leaving state behind.

9. **`Session.user`.** A `loaded` ternary became optional chaining (DECLARE6001).

**Considered and decided before writing:** I chose not to use `shows`, because routes with parameters can't be named literally. In an early experiment, `shows = "/login"` plus `link = "#/login"` compiled.

One surprise I only noticed while writing this account: the final app declares no `shows` at all, yet literal links like `link = "#/login"` and `link = "#/editor"` compiled. The docs say every literal reference "is checked at build against the registry". Either the check is skipped when no `shows` exists, or something else applies. **Unsure, and worth checking:** it means the typo-catching promise didn't apply to my app.

---

## (i) The code, quoted

The exact messages are quoted in (d), each with the code that caused it: items 1, 2, 3, 5, 7, 8, 9, 12, 13 and 14. Two reproductions worth isolating:

- **Content-sized WrappingLayout (no finding raised).** A `View [ layout: WrappingLayout [ spacing = -1 ], Child × 6 ]` with no width stacks one child per row. This is (d)14; (d)13 is the partial-wrap variant with four Texts.
- **Literal links with no registry.** An App with no `shows` anywhere and `Text [ link = "#/nope" ]`. Did that compile silently? My app's links did.

I never went round in a circle on one problem. The nearest was the three rounds of drive paths in (d)7.

---

## Surprises

- **How little broke.** Seven fix-and-recheck rounds to a clean boot for about 900 lines across three files, and no runtime exceptions at all.
- **`autoFetch` with empty paths.** It gave refetch-on-revisit for free.
- **Literal links compiled with an empty registry** (see (h)).
- **The boot fed my sources sample data** derived from my schemas.
- **`expect.text` returned doubled text** ((d)9).

## Good

- **The diagnostics.** Every refusal named its fix, and DECLARE3006 listed all three sites at once.
- **The data model.** `DataSource`s with derived paths, `Form` with an overridable `refusal`, computed defaults for drafts.
- **`declare-help`** for exact signatures, and library sources readable as models.
- **`--outline`, `drive.device` with its automatic layout checks, and `expect.request`.**
- **The skill's discipline.** Read a fixed set, then plan, then check. It kept me from guessing names; nearly every name I guessed without asking (`accessibilityCurrent`) was wrong.

## Bad

- **Path naming in drive scripts.** Anonymous children get indexes, so naming members becomes a testing tax.
- **Instance lifetime.** That `exists` keeps its instance as long as its boolean stays true is easy to miss.
- **Small arrays need ceremony** (a Dataset each).
- **Reference gaps.** No entry for `FormProblem`; `declare-help accessibility` doesn't list the attributes.
- **Two layout mistakes no finding caught** (the content-sized WrappingLayouts).
- **Misleading hints** in the motion message and the doubled text.

## How it differs, and what it reminded me of

**Closest relatives**

- **QML and Flex MXML.** A tree of typed instances with bindings and named ids. Also OpenLaszlo, which the README cites.
- **MobX and Solid.** The constraint model reads as compiler-traced signals.
- **SwiftUI.** `@State` versus derived values, and `.task(id:)` for something like keyed rebuilds.

**Unlike React:** there is no render or reconcile step, and no hooks. **Unlike everything above:** routing is one attribute, and the compiler refuses things the others accept, like reading untracked state or assigning to derived values. **The language's lens:** layout's "one decider per value" rule felt like a real idea rather than flexbox with new names.

## Where I'd most want improvement

1. **View lifetime and identity.** A way to say "rebuild this when X changes" on a single view, and a sentence about it where `exists` is introduced. This was one obstacle, but the most expensive late fix (about 20 minutes). To get it right the first time, I'd have needed one line in `declare.md` §4 or `04-structure.md`: "`exists` keeps its instance while its condition stays true; to rebuild per record or address, key it."
2. **Layout findings for content-sized wrapping layouts.** This was a pattern: two occurrences, both caught only by eye.
3. **Drive-path ergonomics.** Let paths use class names, or have the no-node error suggest them. Three rounds.
4. **Reference completeness.** Entries for the `accessibility*` family and for `FormProblem`.
5. **Datapaths over computed arrays** without a Dataset each.

None of these was hard in the sense of blocking me. The sharpest edge was the `exists` lifetime: one obstacle, found late, fixed in one restructure.

## What I'd use it for

Data-backed CRUD apps against an API (dashboards, admin tools, content apps like this one), where the derived-request model and `Form` remove most of the code. I'd also try it for anything with continuous motion between states, which I barely touched here. I'd hesitate on apps that need persistence or rich host integration, and on teams that need a large ecosystem of third-party components.

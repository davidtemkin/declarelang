# React Presentify run 1: round 1, Opus 5.5, recorded

**Run:** 2026-11-01, launched with
`evals/craft/launch.sh --stack React presentify ~/Code/eval-presentify-react-1 claude-opus-5-5 280238f4 8361`.
The prompt: "Build the app described in `task/brief.md` as a React application. The data service is described in
`task/api/API.md` and is already running on port 8361; do not modify it." The brief is round 1
(`evals/apps/presentify/brief.md`), the same one Declare Presentify run 1 built from; the service starts with the same
three presentations. Recorded with `evals/craft/record.sh`. The side-by-side page with Declare Presentify 1
(figures, flows, code review, 29 matched screenshots) is the Artifact https://claude.ai/artifact/4XFttZkHrdEcu7qNdAcQA7.

**Files beside this report:**
- the app's source (`src/`, `public/`, its config and its own `README.md`);
- the agent's own Playwright scripts (`agent-qa/`, 12 files; it kept them in `/tmp`, outside the app);
- the hidden checks' results, delivered and at first boot (`drive/`);
- the prompt and the questions it was asked (`prompt.txt`, `impressions.txt`).

## Figures

| | Declare Presentify 1 | **React Presentify 1** |
|---|---|---|
| time | 39.4 min, 166 turns | **29.8 min, 106 turns** |
| model · tools | | **24.9 · 4.9 min** (edits 3.7) |
| output tokens | 195.1k | **181.7k** (thinking 40.0k) |
| cached input re-read | 45.4M | **12.6M** |
| first app file · first check · first boot | 7.2 · — · 19.6 min | **2.9 · 18.7 · 19.0 min** |
| code, excluding blanks and comments | 2,500 (Declare 2,198, TypeScript 302) | **5,770 (TS/TSX 4,297, CSS 1,473)** |
| download, gzipped | 190 KB (app 53, runtime and kernel 137) | **167 KB** JS, CSS and page (fonts on demand) |
| its own checks | 3 assert scripts | **12 Playwright scripts, 14 screenshots read** |
| hidden checks at first boot | 2 of 19 | **18 of 19** |
| hidden checks delivered | 19 of 19 | **18 of 19** |

## Process

1. **Setup (0–2.9 min).** It read the brief and API, curled the seed decks and slides, scaffolded Vite's
   `react-ts` template, and installed Zustand, Radix (dropdown, context menu, dialog, popover, tooltip),
   react-colorful, react-router and two variable fonts. It read no documentation and searched nothing.
2. **Writing (2.9–18.7 min).** The whole app, 37 files, with no build in between: the model and API client first,
   then the store, sync engine and commands, then the components, pages and CSS.
3. **First check (18.7 min).** `tsc -b`: three impossible comparisons in `Inspector.tsx`, fixed in one round.
4. **First boot (19.0 min).** The dev server and a Playwright smoke script.
5. **Checking (19–29.8 min).** Twelve Playwright scripts of its own; 14 screenshots read; `oxlint`; a production
   build (it lazy-loaded the editor page when Vite warned the chunk was over 500 kB).

## First boot

The recording's snapshot at 19.0 min (the source as the dev server first served it), built and served on its own,
passed **18 of 19** — every flow the delivered app passes. Everything the agent fixed after that was outside what
the hidden checks reach: a giant icon on the "New presentation" card, a clipped focus ring, Delete and ⌘D acting on
the slide list instead of the canvas, a 256.19 × 256.18 proportional resize, full screen refused outside a gesture,
and a line lost if the tab closed within the save delay (it added a `localStorage` backup).

## The hidden checks, and their audit

`evals/apps/presentify/drive.mjs`, the same 19 flows that scored Declare Presentify 1, run against a production
build of the delivered source (and of the first-boot snapshot) on the run's service.

**One failure, `inspector_mixed_and_applied`, in both.** It has two causes:
1. **The check's.** It looked for the fill control by a name of exactly "Fill"; this app names it with its value
   ("Fill: Mixed", "Fill: #AA2200"). The drive's own header promises a loose match for the inspector, so this was a
   defect of the check: it now matches a name that starts with "Fill".
2. **The app's.** With the control found, the colour still isn't stored. The hex field in the popover commits on
   Enter or on blur; the check types the hex and presses Escape, which closes the Radix popover and unmounts the
   field before it blurs, so the typed colour is dropped. A person who types a colour and dismisses the popover the
   usual way loses it. That is the app's defect, and the flow fails on it. Declare Presentify 1 still passes the flow with the loosened
   match.

## What the agent said

Its account answers the comparison set (`impressions.txt`, from `account-stack.txt`).
- **Hardest:** saving and conflicts (`sync.ts`), rewritten twice, "perhaps a quarter of the effort".
- **Checked by reading, before running:** a Zustand selector returning a fresh array (an endless re-render) and a
  "Move Down" disabled on the wrong condition.
- **Where it expects a tester to find problems:** the save status says "All changes saved" while a slide is held in
  a conflict; a possible false conflict when its own save lands between the 5-second poll's read and the response;
  the inspector changes shape between the slide panel and the selection panel, against the brief; copy and paste
  only through `localStorage`.

## Code review

A full read of `src/` by a separate reviewer (nothing run), judged as a pull request a team would keep. Two of its
claims were confirmed against the source: nothing listens for the `presentify-clipboard` event Copy dispatches, and
`detach` awaits the running save outside its `try`.

**Verdict.** Unusually well structured for a 30-minute build: an immutable document, gesture-aware undo, plain-function
commands and a thought-through sync engine. Approve only with changes: several failure paths in sync and in the input
fields lose or misreport work, module-level singletons make the riskiest code untestable, and there are no tests.

**Good:** undo as `apply` / `begin → preview → commit` over immutable snapshots, keeping unmoved elements' identity so
memoized views don't redraw (`store.ts:110-152`, `SlideView.tsx:47`); local slide ids, so undo never rewrites when the
service assigns ids (`doc.ts:7-9`); ordered sync passes with conflicts held as data (`sync.ts:366-429`); a pure model
layer (`elements.ts`, `resize.ts`, `snapping.ts`); the canvas drag as a discriminated union in a ref, with pointer capture
and a cleaned-up Escape effect (`Canvas.tsx:50-57, 448-462`); effects that clean up; the editor lazy-loaded and keyed
per deck; real accessibility basics (Radix, a listbox slide list with roving tabindex and Alt+Arrow reorder).

**Real bugs, most severe first:**
1. A failed "Reload presentation" leaves the editor with nothing saving: `reload` detaches before awaiting the load,
   and the rejection is unhandled (`sync.ts:237-240`, `ConflictBanner.tsx:29`).
2. `whenClosed()` can reject for good, so every later refresh of the list fails, "Try again" included (`sync.ts:173`).
3. Escape in a number field probably commits rather than reverting, and Enter may commit twice; `TitleField` already
   works around the same thing (`ui.tsx:230-241`, `TopBar.tsx:106-108`). Unverified in a browser.
4. Menu enabled-states read the store during render and go stale: Paste stays disabled after Copy until something
   else re-renders (`TopBar.tsx:150,170`, `CanvasContextMenu.tsx:28,32`, `commands.ts:144`).
5. Permanent refusals (a 400, a `last_slide` 409) show as "can't reach the service" and are retried forever,
   blocking every later save (`sync.ts:347-356`).
6. The local backup misses deletions and reorders, and can restore a slide created within the debounce as a duplicate
   (`sync.ts:128-158`).
7. `sendAll` indexes `this.doc` across awaits; a slide deleted mid-pass throws (`sync.ts:373-383`).
8. A possible false conflict with its own save (`sync.ts:272-290`) — the agent named this one too.
9. No-op undo steps (Alt+↑ on the first slide; align on items already aligned).
10. No error boundary or route `errorElement`.

**Performance:** the slide-list item memo is defeated by an inline handler, so every thumbnail's context menu
re-renders each drag frame (`SlideList.tsx:100, 202`); tree helpers clone unchanged groups; per-frame
`JSON.stringify` and a forced text layout during drags; thumbnails not virtualized.

**Architecture and style:** global singletons (`useEditor`, `editor`, the active sync) hard-wire the service, the
store and timers; "every action, once" holds for the actions but labels, shortcuts and enabled-states are repeated in
four places; `Canvas.tsx` is one 529-line component; prop-to-state syncing through effects; `forwardRef` no longer
needed in React 19; dead icons and menu items.

**TypeScript:** `strict` not set explicitly, `noUncheckedIndexedAccess` off; unchecked casts at every trust boundary
(service responses, `JSON.parse` of the backup, the clipboard); duplicate types that could be derived with `Pick`.

**CSS:** tokens exist, but the accent and reds leak as literals; a duplicated `@keyframes`; generic global class names
(`.row`, `.slider`, `.banner`) and ad hoc z-indexes.

| Area | Rating | Why |
|---|---|---|
| Maintainability | adequate | clear modules and comments; singletons, duplicated bindings, a 500-line Canvas |
| Idiomatic React | adequate | good effects, refs and selectors; render-time store reads, effect-synced state, a defeated memo |
| Type safety | adequate | good unions; casts at every I/O boundary |
| Correctness risk | weak | solid happy path; failure paths lose work or misreport status |
| CSS | adequate | real tokens; literal leaks, generic globals |
| Tests | none | no test script; the model layer is easy to test, sync needs injection first |

## The agent's account, verbatim

## (a) Choices

**Stack.** I used Vite's `react-ts` template, React 19 and TypeScript, plus these libraries:

| Library | Why |
|---|---|
| **zustand** | The editor store and undo history (`editor/store.ts`). It can be read and updated from outside React, which the sync engine and command functions need. |
| **Radix** (dropdown, context menu, dialog, popover, tooltip) | Focus, keyboard and screen-reader behaviour I didn't want to hand-roll. |
| **react-colorful** | The colour picker. |
| **react-router** | The list and editor pages. |
| **@fontsource-variable Inter and Fraunces** | The UI typeface and the wordmark, so the identity doesn't depend on installed fonts. |

**Libraries I installed and then dropped:**
- **immer.** I chose pure immutable functions instead (`model/elements.ts`, `editor/doc.ts`).
- **A drag-and-drop library.** I considered `@dnd-kit` for reordering slides but wrote my own drag. The brief says the list must not reflow under the pointer, and sortable libraries shift items by design. Mine shows an insertion line instead.

**Structure.**
- **Immutable document, snapshot undo.** Each undo step stores the whole document and the selection before and after. Structural sharing keeps this cheap, and it made "undo restores the selection" trivial.
- **One function per action** in `commands.ts`. Menus, buttons, shortcuts and context menus all call these.
- **A separate sync engine** (`sync.ts`) that compares the document with what the service last confirmed. Edit code never calls the API.
- **Local slide ids**, so slides created offline and undo history never need rewriting when the service assigns real ids.
- **One `SlideView` component** draws slides everywhere, which is how presenting "looks exactly as in the editor". Text is drawn with SVG `foreignObject`.

**What I looked up:** nothing on the web. I read `brief.md` and `API.md`, and used `curl` to look at the seed data, which showed me the shape of text elements, real fonts (Georgia, Helvetica Neue) and nested groups. Everything else came from memory. That is a risk: I didn't confirm Radix, react-colorful or zustand v5 behaviour against their docs, and I relied on tests to catch mistakes.

## (b) The first time it ran

My first screenshots (`list.png`, `selected.png`) showed:

- **A giant plus on the "New presentation" card.** The `.deck-thumb svg { width:100% }` rule was overriding the icon's size. I found it by eye.
- **A clipped ring on the current slide** in the slide list. The scroll container's 2px top padding was cutting it off. Found by eye.
- **A focus outline around the whole slide-list item**, from the global `:focus-visible` rule. I noticed it in a later screenshot (`drag.png`).

Selection, the inspector, the thumbnails and the layout were otherwise right on first run. There were no runtime exceptions at any point.

## (c) Every error and surprise

### Build and type errors

| What happened | Cause | Fix |
|---|---|---|
| `tsc` TS2367 three times in `Inspector.tsx` | My code. `filter()` had already narrowed the element types, so my later `l.kind === 'text'` checks were impossible comparisons. | Removed the redundant checks. |
| `fn(s.doc)` on a nullable value in `store.apply` | My code. I spotted it while editing, before `tsc` ran. | Added a non-null assertion. |
| Lint warnings: `recomputeDrop` used before declaration, refs read during render (drop-line position), `indexRef.current =` set during render (`Presenter.tsx`), and `setState` in effects in dialogs and `EditorPage` | My code | Restructured the slide drag to measure once when the drag starts. Keyed the dialogs and the editor route so their state starts fresh instead of being reset in effects. Four `set-state-in-effect` warnings remain on the field components that copy their value into a draft. |
| Production build warned the JS chunk was over 500 kB | Tooling threshold, my bundling | Lazy-loaded `EditorPage`. |

### Bugs I caught by reading, before running

- **SlideList selector.** `useEditor((s) => s.doc?.order ?? [])` returns a new array on every call, which can make zustand v5 re-render endlessly. I replaced it with a constant `NO_SLIDES`. My code.
- **"Move Down".** It was disabled with `disabled={lifted}` instead of "this is the last slide". My code.

### Runtime results that weren't what I wrote

- **Delete and ⌘D acted on the slide list instead of the canvas.** I found this when ⌘D in a paste test duplicated the whole slide. Clicking the canvas never moved focus off the slide-list item. My code. The fix: the canvas area now takes focus when pressed, list items clear the shape selection, and the list ignores Delete and ⌘D while shapes are selected.
- **Proportional resize gave W 256.19 and H 256.18.** `transformInto` rounded each edge separately. My code; it now scales width and height directly.
- **A hover outline stayed on a rectangle** after drawing. My code; hover is now cleared on pointer down.
- **Three click-created text boxes overlapped** and ran off the slide: the default width of 480 was too wide. I reduced it to 360, which is a judgement call.
- **Full screen was refused** with "API can only be initiated by a user gesture", because I requested it in the Presenter's mount effect. My code. It's now requested inside the click or key handler (`cmd.present`).
- **A line drawn just before the browser closed was never saved.** The ~1 s save delay hadn't elapsed. With the service unreachable, the same thing would lose work in real use, so I added the `localStorage` backup (`backup.ts`).
- **The delete dialog said "and all its slide".** My code.

### Problems in my test scripts, not the app

- Playwright strict-mode violations on `'Text'` and `'New Slide'`. My labels are ambiguous only when names aren't matched exactly: "Text" also prefixes "Text Colour".
- **`page.mouse.click(..., { modifiers })` silently ignores modifiers.** That made grouping look broken for two runs. It was my misuse of Playwright.
- **One shift-click missed the circle** because I had the coordinates wrong.
- **Port 5173 was already in use** on the machine. Tooling.
- **Paste appeared to land at X=120 twice.** After adding a 300 ms wait it read 140, which was correct. Unsure: I believe the test read the inspector field before React had re-rendered, but I didn't prove it.

### Design changes made mid-build (my code)

- I first let text boxes grow but never shrink, then switched to always fitting their text (`snugTextHeight`).
- `flush` first refused to save while typing. That would have broken "saved within about two seconds", so I allowed saves during editing.
- `loadDeck` first used an `__deck` property hack, which I replaced.
- `sync.ts` was rewritten so the last save can finish after the editor closes. It keeps its own copy of the document and of the held (conflicted) slides.

## (d) Verifying it

**Checks:** `tsc -b`, `oxlint` and `vite build`, plus Playwright scripts in `/tmp/pwscripts`. These were never added to the repo, and I read their console output and screenshots myself.

**What the scripts covered:**
- The brief's scenario: new deck, title, styled text, align and distribute, group, move, undo twice, duplicate the slide, retitle it, drag-reorder, present from the start.
- A colleague's PUT through the API, which brought up the banner, and "Use their version".
- Offline via `page.route` abort, showing the "Not saved" status, then recovery.
- The offline backup across a closed tab.
- Shift-drawn circles keeping proportions, the corner-radius handle, radius surviving a resize, lines with shift-angle, nudging, copy and paste across slides, the context menu opening, rename and delete in the list, the "Mixed" inspector, a long title, 100 slides.

**What it caught:** the problems listed in (c).

**What I left unchecked:**
- **Browsers:** Safari, where `foreignObject` scaling is historically buggy, and Firefox. Only headless Chromium was tested.
- **Input:** real trackpads, and screen readers.
- **Undoing a slide delete,** which should re-create the slide on the service. Not tested at all.
- **Conflict paths:** "Keep mine", "deleted in another window", the deck-level conflict and its reload button.
- **Colour picker:** dragging in it. I only used the hex field.
- **Inspector controls:** the radius slider, the X/Y/W/H fields, and the order buttons.
- **Commands:** cut, ungroup, distribute vertically, shift-marquee, nested groups.
- **Gestures:** Escape to cancel a drag, and shift to toggle proportions while resizing.
- **Keyboard:** Alt+arrow to reorder slides, Enter, Home and End in the list.
- **Other:** two live tabs editing at once, and 100 slides that have content (mine were empty).

## (e) What was hard

1. **Saving and conflicts (`sync.ts`)** — a pattern, not one obstacle. Local and service ids, retries, held slides, flushing on close, the backup, and polling for others' edits all interact. It was rewritten twice and was perhaps a quarter of the effort. To get it right first time I'd have needed to design closing and offline persistence before writing the first version.
2. **Gestures as single undo steps** (`begin`, `preview`, `commit` in `store.ts`). Text editing, colour-picker drags and click-to-create text each needed special handling, for example a text box created and then left empty must vanish without leaving a step. This was moderate effort, mostly reasoning rather than debugging.
3. **Canvas interaction** (`Canvas.tsx`, about 450 lines): choosing click targets inside groups, the drag threshold, snapping and the different handle types. It worked on first run, which I partly attribute to luck, given how little of it is tested.
4. **Focus and keyboard ownership** between the slide list, canvas, fields and menus — a pattern. One bug was found and fixed; I suspect there are more.

## (f) Confidence

**High:**
- The presentation list.
- Drawing the four kinds of thing, and selection.
- Moving and resizing, keeping proportions, corner radius.
- Grouping, undo/redo for the paths I tested.
- Presenting.
- The three save states.
- The tested offline and conflict paths.
- The labels: Select, Rectangle, Ellipse, Line and Text on the tools; Slide 1, Slide 2… in the list; the slide region labelled "Slide" with a 16:9 box.

**Medium:**
- The inspector and the "Mixed" state.
- Align, distribute and order.
- Slide-list reordering by keyboard.
- Text fidelity between editing and display (visually close; not measured).

**Where I'd expect a tester to find problems:**
- **The save status can be wrong.** It shows "All changes saved" while a slide is held back in a conflict. That arguably breaks "always says, exactly".
- **A possible false conflict.** If the 5-second check reads the slide after our own save has landed on the service but before its response comes back, our own save could be reported as "someone changed this slide" while the person keeps typing. I haven't confirmed this happens, but the code allows it.
- **The inspector changes shape** between the empty "Slide" panel and the selection panel, against the brief's "does not change shape".
- **Escape** first returns a drawing tool to Select rather than clearing the selection.
- **"Use their version" isn't undoable.** It rewrites history, so earlier undo steps on that slide become no-ops. That's deliberate but untested.
- **Seeded text boxes change height** to fit their text the first time they're edited.
- **Copy and paste** only works within this browser, through `localStorage`, not through the system clipboard.
- **Safari rendering** of text in slides.
- **Focus edge cases** after menus or dialogs close.

(Asked after the build by resuming the session with read-only tools; 1.1 minutes, 5.9k output tokens, counted apart.)

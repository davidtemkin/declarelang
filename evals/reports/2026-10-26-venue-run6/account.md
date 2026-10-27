# Building Venue in Declare: an account for the people who make Declare

This covers about one long session: from the README to a working app that passes four browser-driven checks. I didn't change anything while writing it. The file-change notices in this session came from `declare-format --write`, which I ran at the end of the build.

## (a) Getting up to speed

**What I read, in order.** I read `README.md`, then `skill/SKILL.md`, which told me exactly what to read and when to stop. That was `docs/declare.md`, guide chapters 01, 04 and 05, and the to-do app (`todo.declare` and `todo-parts.declare`). After that I read only by need:
- `14-data.md`: Talking to a server, Streams, and Editing text and forms
- `08-controls.md`
- `19-accessibility.md`
- parts of `18-overlays.md` and `10-touch.md`
- `06-layout.md`
- the top of `20-urls.md`
- the flags and assert sections of `docs/operational/verify.md`

**What taught me the most:**
- **`docs/declare.md`.** It gave me the model and the rules that would bite. "Assignment is the setter", the two kinds of `{ }`, set versus declared-with-default, and "a layout places its children, and what it places a child does not declare" all came up during the build.
- **The to-do app.** It is where I learned the idioms the spec only names. Examples: computed defaults as fields that "follow until the person types", `afterSettle(() => Focus.focus(...))`, `trackChanges`/`onChange`, `Control` with `press()`, and the theme spread `{ ...SanFrancisco, ...Paper }`. I copied its Fraunces `Font` declaration outright.
- **`npx declare-help`.** It was the best single tool. Lookups like `TextInput.judgeOn`, `TextInput.purpose`, `DataSource.credentials`, `DataSource.errorSchema`, `View.focusScope` and `EventStream` each answered the exact question in a paragraph.

`TextInput.judgeOn`'s entry says: "A field marked wrong while the person is still typing in it for the first time is a common annoyance." That is nearly the brief's sentence. The platform clearly anticipated this class of app. I can't tell whether that reflects good taste or docs written with this brief in view.

**What was missing or misleading:**
- **How values are spelled.** Bare tokens versus strings is learnable, but the rules are scattered and I learned most of them from errors:
  - `judgeOn = "leave"` is wrong; it must be `leave`.
  - `purpose = "email"` is wrong for a declared `InputPurpose` attribute; it must be bare `email`.
  - Inside braces it flips: `fontWeight = { x ? semibold : regular }` is wrong; it needs `"semibold"`.

  A single table of "how a token is written in each position" would have saved three compile rounds.
- **Type names for library enums.** I wanted `purpose: string` on my own `FormField`. I only discovered the type is called `InputPurpose` from a typecheck error.
- **`Combobox` docs.** The docs say `value` is "the chosen member", and that when it's constrained you override `input`. Nothing says that setting `value` from outside doesn't put text in the field. The entry's text is written only in `pickIndex`. The saved billing country (GB) showed "Choose" until I read `library/combobox.declare` and synced `entry.text` myself.
- **Event payload shapes.** I guessed `e.changed("perfId")` on a `ChangeEvent`. It is an array of `ValueChange`. The error was clear, but the guide's `onChange` examples never use the payload.
- **Lost reads.** Some reads came back "too large" and were saved to files. I had to re-read them in pieces. That's a harness issue, not Declare's, but it is a cost the skill's "read these whole" advice doesn't account for.

## (b) Expressing what I wanted

**Where it fit well.** Several requirements turned out to be ordinary features of the language:
- **"Sign in halfway and lose nothing."** `PayForm extends Node` lives on the App. Its fields are computed defaults: `email: string = { classroot.me?.email ?? "" }`. They follow the account until typed into, then belong to the person. That one idiom covered fill-from-account, don't-overwrite-what-was-typed, and survive-the-sheet. I think it is the nicest thing in the language for forms.
- **Service calls.**
  - Each call is a `DataSource` with `method`, `body = { app.orderBody }` and `credentials = include`.
  - `errorSchema = Refusal` typed the 402/409/422 bodies, so `r.conflicts` and `r.field` were checked at compile time.
  - `EventStream [ url = {...}, active = {...}, listenTo = ["seatchanged"] ]` needed no connection code.
  - Because `fetch()` settles before it sends, the body was always current.
- **Back button.** `location` holds the performance and `waypoint = "pay"` holds the checkout. That gave correct Back behaviour with no router code.
- **The seats.** Each seat is a `Control` with `draw()`, a `Spring` for the "pop", `accessibilityRole = checkbox`, a computed `accessibilityLabel`, and `disabled = { sold }`. That gave keyboard support, aria state and a test-findable name for 648 seats almost for free. `focusScope = stop` per section turned 648 Tab stops into four. `focusShape()` let the focus ring hug the circle.
- **The hall layout.** It came from a dataset class (`SeatingPlan extends Dataset`, `contents = { build(source) }`), so a seat sold on the stream changes the room just by writing one status into the seat map. I didn't do any profiling, though: 648 seats get rebuilt on every stream message, and I only know it felt fine in headless Chrome.

**Where I had to work around it:**
- **A labelled field with its error.** I couldn't make "a labelled field" by putting a use-site `TextInput` inside a wrapper. The wrapper can't read its child's `error`, and `entry.purpose = email` is refused with DECLARE5000. That message was clear and right. So `FormField` owns its `TextInput` and takes `check`, `regroup`, `edit` and `submit` as overridable methods. It works, but it re-exports half of `TextInput`'s surface by hand. I'm not sure this is the intended shape.
- **Server-side field errors.** I never tested whether `validate()` re-runs when app state it reads changes, so I didn't rely on it. A 422 is stored as `refusedField/Value/Message` and merged into a `shownError`, which I pass to `accessibilityError` myself. I'd like a sanctioned way to give a field an outside error.
- **No "un-judge".** After a decline the code field has already been judged, so clearing it marks it wrong at once. I added a `fresh` flag that hides the error until blur or Pay. Something like a `reset()` that clears the judged state would be cleaner.
- **Refused requests.** As far as I could find, a `DataSource` has no failure event. I used `trackChanges = ["loading"]` with `onChange() { if (!loading && failed) ... }`. Watching `failed` alone would miss a second failure in a row. I didn't check whether an `onError` exists; it may.
- **Double payment.** I kept my own `paying` flag. I wasn't sure `loading` becomes true within the same settle as `fetch()`. Possibly that's redundant.
- **Layout.**
  - A `SimpleLayout` axis that changes with width, combined with `flexes`, collided with "don't declare what the layout places". `width = { wide ? undefined : … }` isn't a valid Length. I restructured into a fixed-axis row containing a column.
  - `padding = [32, app.gutter, …]` failed with `expected ']', got '.'`. That was the only diagnostic that didn't name its fix (it needed braces).
  - I used hand arithmetic for scale and centring: `x = { max(0, (parent.width - this.width * hallScale)/2) }`. It is drift by the skill's own checklist. I think it's justified for a scaled scene, but I'm not certain.
  - `{ parent.width }` means the padded box. That misplaced my checkout column once, even though the docs warn about it.
- **Small compile surprises.** These were each fixed in one round:
  - `valueOf` is a reserved member.
  - `TextInput` has no `numeralWidth`.
  - `Animator.running` is read-only, so I used `started`/`paused`.
  - `this` inside a `State` is the State.
  - The nested-ternary warning (DECLARE4025) pushed `stage` into a method. That was a better shape.
- **Focus ring in the dark hall.** A subtree `theme` override doesn't reach the focus ring, which seems to read the app's theme. The ink ring vanished on the dark floor. I used a two-tone ring (`focusRingInnerColor`/`Width`), which I found by reading `focusring.declare`.
- **Unwanted Tab stop.** Chrome made an empty `scrolls = y` list into a Tab stop, and `focusable = false` didn't override it. I made it scroll only when it had seats. That's the browser's behaviour, but Declare could own it.

## (c) Verifying it

`declare-verify` was the core loop: structure, resolution, analysis, then boot at a laptop size and a phone size, in seconds. Most errors named a precise fix, and applying it literally worked. The boot check also caught a 134×40 touch target in the header.

The `--assert` scripts were the real verification.
- **What worked well:**
  - `drive`/`expect` by view path or by accessible name.
  - `expect.request("POST", "/api/orders", { count: 1, body: {...} })` with a partial body match. It let me prove "a second press sends nothing" and "the postcode sent was 95014" directly.
  - `drive.selectAll`, `drive.set` (to force a 409 deterministically), touch presses under `device`, and screenshots via `page`.
  - Buying a seat from the test script through the real API, then watching the stream remove it from the person's choice, felt like testing the real thing.
- **Friction:**
  - Paths into anonymous children and library frames, such as `Sheet` bodies, were hard to guess. `app.signInSheet.Password` matched the label `Text`, not the field, and the error said "not a text field". I ended up naming things (`signForm`, `pay`) just for the tests.
  - `count` combined with `body` counts only matching requests. That's reasonable, but I misread it once.
  - `declare-look --key Tab …` didn't seem to move focus the way the same keys did in an assert script. I never found out why, and switched to assert scripts for focus pictures.

What I could not verify: a real phone keyboard covering fields, browser card and address autofill, VoiceOver or NVDA, and performance on a real phone. The checks are also my own scripts written against my own understanding. They show the app does what I think the brief says, not that my reading of the brief is right. The checker reported "454 of 613 constraints statically wired", and I don't know what the remaining third costs or risks.

## Surprises

- How little runtime debugging there was. Almost every bug was a compile error or a visual issue. The one real logic bug I found by looking was the `Combobox` text.
- A first draft of about 1,500 lines across five files compiled after roughly eight rounds, and the first boot drew a recognizable room.
- 648 `Control`s with custom `draw()` booted and responded without any virtualization.

## Good and bad

**Good:**
- Constraints plus computed defaults.
- Data sources as declared, reactive members.
- `location`/`waypoint`.
- Accessibility roles checked as contracts.
- `purpose` for autofill and keyboards.
- Diagnostics written to be acted on.
- `declare-help`.
- Assert scripts that see network requests.
- One program for phone and desk without media queries.

**Bad:**
- The token-versus-string rules.
- The library's edges: `Combobox` text sync, a focus ring that ignores subtree themes, no field-level outside error or un-judge.
- The compiler's strictness about layouts sometimes forces restructuring for responsive designs.
- Test paths into unnamed structure.

## Differences from what I usually use

- No re-render or component tree: views are long-lived nodes and state writes propagate. It's closer to a spreadsheet than to React.
- No CSS at all, which I didn't miss.
- Handlers are synchronous and timers are members.
- The compiler polices reactive reads and refuses what it can't follow (DECLARE7001 never fired for me, but its threat shaped how I wrote code).

## What it reminded me of

- **QML,** most strongly: property bindings, `State`s, anchors-like `x = center`, ids by name. Also Flex/MXML, and OpenLaszlo, which the README names as its ancestor.
- **SwiftUI,** for the declare-the-destination motion model.
- **Elm-ish** single-source-of-truth discipline, but with mutation allowed.

## Where I'd most want improvement

1. A first-class form story: outside or server errors on a field, a reset that clears the judged state, and a wrapper that can read its child field's state.
2. Library controls that fully follow the value pattern: `Combobox` should display its `value`.
3. One page on literal and token spelling per position, and a fix-naming message for names inside bare lists.
4. Overlays and the focus ring respecting subtree themes.
5. A clear failure event or idiom for `DataSource`.
6. Stable, documented test paths for library frames, and a way to address "the field labelled X" rather than the label itself.

## What I'd use it for

Interactive consumer flows like this one — forms, a live surface, motion that means something — and internal tools, where its built-in accessibility and autofill save real work. It's also good for prototypes that need to feel finished. I'd hesitate for a large team needing a big ecosystem, for apps leaning heavily on third-party widgets, or anywhere the canvas renderer's missing accessibility tree would matter.

My confidence is moderate. One app is a narrow sample, and this brief fit Declare's strengths unusually well.

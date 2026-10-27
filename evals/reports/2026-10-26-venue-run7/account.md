# Building Venue in Declare: an account for the people who make Declare

I haven't changed anything for this. One housekeeping note: when the last session ended, the dev server I'd restarted may have stopped with it. If http://127.0.0.1:8200/my-apps/venue/venue.declare doesn't answer, run `npm start` in `declarelang/`.

## (a) Getting up to speed

**What I read, in order:** `README.md`, then `skill/SKILL.md` (the skill file for agents), then `docs/declare.md` whole, then guide chapters 01, 04 and 05. Then the to-do app whole (`todo.declare` plus `todo-parts.declare`, about 1,350 lines). After that I read only what I needed:
- the forms half of `14-data.md` (§ Talking to a server, § Streams, § A form)
- `08-controls.md` § Text fields
- most of `19-accessibility.md`
- `library/form.declare` and `library/radiogroup.declare`, as source
- many `npx declare-help` lookups

**What taught me the most:**
- **`declare.md` gave me the model.** "Seven differences" and the table of set attribute versus declared computed default were the two passages I used most. The computed-default idea became the backbone of checkout.
- **The to-do app showed me the shape of a whole program.** Where state lives, `classFor`, `exists`, a Spring on a control. It was expensive in context, and I'm not certain all of it paid off. About a third of it (Glide, swipe rows, menus) never applied to Venue.
- **§ A form in `14-data.md` was the most valuable single page.** It matched my brief almost line for line: judging a field on leave, `submit()` judging everything, focus going to the first problem, `pending`, refusals landing by `name`. It even uses a `postalProblem(v, app.country)` example and mentions `refusedWith` "releasing seats a conflict names." That fit is useful but slightly unsettling. Either the docs were tuned on tasks like this one, or I got lucky, and I can't judge how well they generalise.
- **Reading `form.declare` as source answered timing questions the prose didn't.** For example: when `_sending` flips, and that `refusedWith` runs before `showProblems`. Library source was more trustworthy than my guesses.
- **`declare-help` was excellent.** The `TextInput.purpose` table, and the note under TextInput about regrouping a card number and restoring the caret with `select()`, were exactly what I needed, exactly where I looked.

**What was missing or misleading:**
- **No way to mark a view as decorative (hidden from screen readers).** I wanted 52 row letters to be decorative and found no attribute for it. I moved them into a `draw()` call instead, which works but is a dodge.
- **No documented mapping from roles to the DOM.** I couldn't tell from the docs what `accessibilityRole = toggle` becomes. I found out with `--js` that it's `role="button"` plus `aria-pressed`. That mattered because the brief's test looks things up by role.
- **`accessibilityDescription` doesn't exist; `accessibilityHint` does.** That's fine, but I only found it by elimination.
- **Cross-file child paths took trial and error.** That `Sheet.form` is an attribute only surfaced when I named a child `form`, and the path into a sheet's body was trial and error too.
- **`parent.width` ignores padding, and it bit me.** It is documented ("the escape hatch that still names the parent's literal box"), but `width = { Math.min(420, parent.width) }` inside a padded view reads naturally and is wrong. The ticket card ran edge to edge on the phone until I noticed it in a screenshot.

## (b) Expressing what I wanted

**Where it fit my intent well:**
- **Signing in without losing anything.** `email: string = { app.account?.email ?? "" }` on a `Checkout extends Node` follows the account until the person types, and assigning replaces the formula. "Sign in halfway, keep what you typed, fill what's empty" took zero lines of merge logic. That was the best moment of the build.
- **The Form contract.** Server 422s landed on fields by `name` with focus moved there, with no code from me. The double-submit guard came mostly free.
- **Navigation state.** `location` held the performance, so it can be linked; `waypoint` held "gone to checkout", so Back undoes it but a stranger never sees it. That split was exactly right.
- **Live seats.** An `EventStream` with `listenTo = ["seatchanged"]` and `onOpen() { house.fetch() }`, writing into the seat-map DataSource, meant every seat view followed with no extra code.
- **Motion.** The seat pop is a Spring on a number that `draw()` reads. The summary's kick sets the value to 1 and springs it home to 0. Each took about three lines.
- **Placement.** Seats as `Control`s placed by `x`/`y` from one pitch number felt legitimate, because the skill explicitly allows hand placement for a scene.

**Where I worked around it:**
- **Replicating a computed array.** I wanted `datapath = { { rows: app.chosenSeats } }`. DECLARE3006 refused it and told me to declare a Dataset, so I added `chosenData` and `cardData`. The diagnostic was clear, but it is ceremony for a common case.
- **Phone zoom.** There's no notion of "zoom this scrolling pane about a point." I switched the pitch and called `scrollTo` in `afterSettle`, with no animation, because springing the pitch would fight the scroll position. This is the part of the app I'm least satisfied with.
- **Tap-to-zoom.** It is a plain `View` with `onClick(e)`, because I needed coordinates. The drift check says a pressable thing should be a `Control`, but a `Control`'s `press()` has no point.
- **Arrow keys in the seat map.** `focusScope = stop` walks the tree's order, and the docs say plainly that a spatial grid needs its own `onKeyDown`. I wrote a neighbour search. A spatial-grid focus scope would have saved this.
- **"Return moves to the next field."** I wrote `advance()` on my Form subclass using the internal `_counts`. Reaching into an underscore member feels wrong.
- **Country.** There's no native select, so it's a `RadioGroup`, and browser autofill can't fill a country. I compensated by inferring the country from an autofilled postal code.
- **Small compile-time corrections.** None cost much; all are listed under (c).

## (c) Verifying it

**The `declare-verify` ladder** (rungs R1 structure through R4 boot) ran in seconds and named the fix every time. Examples:
- the `align = baseline` error told me the exact `baseline:` line to declare
- DECLARE4005: bare `semibold` isn't allowed inside braces; write it as a string
- `super.onFocus()` refused: a handler has no base method to call
- a wrong argument count on `Toast.say`
- hints about redundant parentheses

The most valuable was **DECLARE4013**: overriding `press()` on a `Button` means pointer clicks never reach the action. My "Whole house" button would have looked fine and done nothing when clicked. No other toolchain I know catches that.

**`declare-look`** screenshots, `--semantics` and `--js` covered looking and probing. **Assert scripts (rung R5)** carried the real verification: the brief's §10 story, a keyboard-only booking, a seat bought from outside mid-choice, sign-in with reload and sign-out, a phone purchase with an Amex card. `expect.request` with a partial body and `drive.requests()` let me assert exactly one declined order and then one accepted order. That is the brief's "checks what the service is asked", directly.

**Where the tools hurt:**
- **Paths by accessible name are ambiguous.** `"Security code"` matched the hidden saved-card field before the visible one, and `"Password"` resolved to something without `select()`.
- **Retyping a field was unreliable.** Neither `drive.selectAll` nor `Meta+a` selected the text, so my retyped password went in front of the old one ("correct horse batterywrong"). I fell back to End plus Backspace.
- **Paths into screens that aren't built at boot were hard to discover.** `--outline` couldn't see the sign-in form.
- **Some messages left me unsure whether to act.** "662 timers still waiting" on every failure was noise. "392 of 538 constraints statically wired": I don't know whether I should care.
- **The dev server exited with code 1 and no message**, right after rebuilding one of its bundled files. A later check I ran also died with exit 137; that may have been my script, I'm not sure.
- **I couldn't verify autofill, password-manager behaviour, real on-screen keyboards, Safari, or a real screen reader.**

## Surprises

- How directly the docs anticipated this exact domain.
- That the settle model, plus `afterSettle` and `trackChanges`/`onChange`, removed every timing bug I'd normally expect in a checkout.
- That a write to a constrained attribute is refused at runtime rather than silently ignored.
- That 648 controls, each drawing itself with a Spring, ran without complaint.

## Good and bad

**Good:**
- diagnostics that prescribe the fix
- forms that match how people actually make mistakes
- computed defaults
- `location` and `waypoint`
- live data with no subscription code
- springs and drawing that are cheap enough to use casually
- tests that assert on what was sent to the service

**Bad:**
- a large up-front reading cost
- no decorative flag for accessibility
- no native select
- no zoom or camera for scroll panes
- ambiguous test paths
- reaching into Form internals to step between fields
- a silent server crash

## Compared with what I'm used to

Coming from React or Vue: there's no render step and no `.map()`, since lists come from replicating over data. There's no CSS cascade, since theme values pass down by `provided()`. Events don't bubble, and layout is an attribute. The nearest relatives:
- **QML** is the strongest resemblance: property bindings, States, and animation attached to a property.
- **Flex/MXML** (and OpenLaszlo, its stated ancestor) for binding plus declarative trees.
- **SwiftUI** for `shown` with an `input` handler, like `isPresented`.
- **Spreadsheets** for the reactivity itself.

Compared with React, I wrote much less state-synchronisation code and more geometry code.

## Where I'd most want improvement

1. A zoomable scroll pane with a focal point and continuous motion.
2. A spatial focus scope for grids.
3. A decorative flag for screen readers, and a documented role-to-DOM table.
4. A select-like control that browser autofill fills, especially for country.
5. Built-in "next field on Return" with the matching keyboard key hint.
6. Test paths that prefer visible matches or fail on ambiguity, and a working `selectAll`.
7. Allowing a computed literal as a datapath.
8. Crash diagnostics from the dev server.

## Would I use it again?

For flows like this one (forms, checkouts, dashboards, interactive diagrams with live data), yes, if I had the choice. Validation, live data and motion were where it most clearly beat my usual stack.

I'm uncertain about:
- large teams and the library ecosystem
- performance well beyond a few thousand views
- how far beyond the DOM renderer the accessibility support holds up
- whether my code is truly idiomatic, rather than idiomatic-looking

# 7GUIs: Declare compared with six other implementations

*An independent review based only on reading the code, 2026-11-08. Nothing was installed, built or run.
Criteria: the 7GUIs [cognitive dimensions](https://eugenkiss.github.io/7guis/dimensions) (Abstraction
Level, Closeness of Mapping, Hidden Dependencies, Error Proneness, Diffuseness, Viscosity, Commentary),
plus size, correctness against the [original task text](https://eugenkiss.github.io/7guis/tasks), and
accessibility and keyboard use as they show in the code. The rankings are judgments, not measurements.*

## Sources

| # | Implementation | Where | Commit |
|---|---|---|---|
| 1 | Elm (Elm 0.13/0.14-era `Signal`/`Graphics.Input`) | https://github.com/eugenkiss/7guis-Elm | `56c5eb16` (2018-02-22) |
| 2 | React + MobX + TypeScript | https://github.com/eugenkiss/7guis-React-TypeScript-MobX | `e1210764` (2018-04-02) |
| 3 | Vanilla React (class components, styled-components) | https://github.com/andreasgruenh/7guis | `1a486e83` (2021-09-03) |
| 4 | Svelte 5 (runes): official examples | https://github.com/sveltejs/svelte.dev, `apps/svelte.dev/content/examples/20-7guis/` | `e81fda24` (2026-11-06) |
| 5 | Vue 3: official examples (Composition API counted, Options API noted) | https://github.com/vuejs/docs, `src/examples/src/{counter,temperature-converter,flight-booker,timer,crud,circle-drawer,cells}/` | `40aa88af` (2026-09-15) |
| 6 | Java 8 / JavaFX (+ ReactFX variants) | https://github.com/eugenkiss/7guis-Java8-JavaFX | `a9b9a8e9` (2018-02-22) |
| 7 | Declare | `evals/reports/2026-11-08-7guis-run1/app/` (`*.declare`, `formula.ts`) | working tree |

The downloaded copies are in `/private/tmp/claude-503/-Users-temkin-Code-declare-overlay/6a505da1-0494-4b83-acec-f4d7f2048458/scratchpad/7guis-impls/`, one folder per source. `SOURCES.txt` in that folder lists each URL and commit.

**Coverage.**
- **Elm** covers only Counter, Temperature, Flight Booker and CRUD. Its README says *"This implementation is incomplete and rather old!"*. The file named `timer.elm` is not a timer: it is a near-copy of `flight.elm` with a combobox, date fields and "Book" (`timer.elm:17-48`). Elm has no Circle Drawer and no Cells. There is also no shared `Main`: each file has its own `main`, and `util.elm` holds the shared helpers.
- **Svelte** has six examples and no Cells.
- Everyone else covers all seven tasks.

**Variants and how I chose among them.**

| Implementation | Files counted | Alternatives noted |
|---|---|---|
| Elm | `counter.elm`, `temp2.elm`, `crud.elm` | `temp.elm` is marked by its author as wrong for non-numeric input (`temp.elm:75`). `crud2.elm` is an earlier list-based version. |
| MobX | `tempconv.tsx` (both of its variants) | `drawer-mst.tsx` is a one-line TODO. |
| JavaFX | The file named after the task (`Counter.java`, `TemperatureConverter.java`, …) | The `*ReactFX.java` variants are counted in parentheses. `cells2` is an alternative Cells model. |
| Vue | Composition API | The Options API version is within ±8 lines. |

**About provenance.** Humans wrote implementations 1–6 against the original task text. An agent wrote Declare in one session, from a restatement of the tasks that fills in details the originals leave open (for example the formula language and the date format). I judge everyone's **correctness against the original text**, and I compare notation, not provenance. Two things are worth knowing:
- The official Svelte and Vue examples are written as short teaching samples, and their brevity reflects that goal.
- The Elm code targets a version of Elm that no longer exists.

---

## 1. Summary table: size per task

**How I counted.**
- I counted **code-only lines**: comments and blank lines are removed by a string-aware stripper (`scratchpad/tools/sloc.py`), handling `//` and `/* */` comments, Elm's `--` and `{- -}`, and HTML `<!-- -->`.
- `import`, `package` and Declare `include` lines are left out of the main count and reported separately.
- CSS that can be separated (Svelte `<style>`, Vue `style.css`) is shown as `+N css`.
- CSS-in-JS (emotion, styled-components) and Declare's inline look attributes (`fill`, `stroke`, `padding` …) cannot be separated, so they are **included**. That makes the React, MobX and Declare counts larger relative to Svelte and Vue.
- React task counts include each task's 8-line `*Page.js` wrapper.

| Task | Declare | Elm | React+MobX | Vanilla React | Svelte | Vue (comp.) | JavaFX (ReactFX) |
|---|---|---|---|---|---|---|---|
| 1 Counter | 14 | 6 | 7 | 20 | 5 | 10 | 18 (19) |
| 2 Temperature | 34 | 31 | 92 ¹ | 72 | 14 +3 css | 22 | 44 (42) ² |
| 3 Flight Booker | 59 | 50 | 85 | 91 | 36 +7 css | 52 +13 css | 51 (54) ² |
| 4 Timer | 27 | — ³ | 88 | 76 | 25 | 43 +7 css | 34 (33) |
| 5 CRUD | 86 | 73 | 97 | 227 ⁴ | 54 +16 css | 63 +18 css | 65 |
| 6 Circle Drawer | 138 | — | 373 | 222 | 73 +27 css | 84 +45 css | 195 (197) |
| 7 Cells | 205 + **221** `formula.ts` = 426 | — | 463 | 611 | — | 85 +34 css | 430 (`cells2`: 394) |
| **Shared helpers** | — | `util.elm` 48 | `basic.tsx`+`css.ts`+`utils.ts`+`global.d.ts` 250 | `__shared__/*` + `Page.js` 140 | — | — | each task has its own ~6-line `Application`/`main`, counted in the task |
| **Host / navigation** | `7guis.declare` 69 (+7 `include`) | — | `index.tsx` 85 | `App`/`index`/`Navigation`/`GithubCorner`/`screens` 164 | docs REPL (not counted) | docs REPL (not counted) | — |
| Import/package lines (all tasks) | 0 (library auto-includes) | 3–14 per file | 4–16 per task | 6–30 per task | 0–1 | 1 per task | **8–29 per task** |

¹ `tempconv.tsx` holds two variants ("Manual" and "Auto"). Manual plus the shared view is about 61 lines.
² Includes the per-package `Util.java` (temperature 23, flight 17).
³ `timer.elm` exists but implements Flight Booker again.
⁴ Includes a simulated asynchronous "person API" with `sleep()` delays (`personApi.js`, 29 lines), which the task does not ask for.

Not counted: Declare's `flows.mjs` (85 lines of scripted UI test), which no other implementation has. Test code is a strength that the size table does not show.

**Reading the sizes.**
- Svelte and Vue are the smallest everywhere they meet the task. They lean on native HTML controls (`type=date`, `type=number`, `<select size>`, `<progress>`), and some of their brevity comes from skipping requirements (§10).
- Declare sits in the middle on tasks 1–6. Its lines carry theme-aware styling, accessibility labels and keyboard support that the small examples leave out.
- On Cells, Declare is in the same band as MobX and JavaFX (about 430–460 lines). Its formula language accounts for about half of that, in plain TypeScript.

---

## 2. Task 1: Counter

| Impl | Meets original? | Notes (file:line) |
|---|---|---|
| Declare | **yes** | The read-only field is built by hand from a `View` + `TextLabel` (`counter.declare:16-22`). Text is the constraint `{ "" + classroot.count }`, and the handler does `count + 1` (`:24`). |
| Elm | **yes** | The button's *message payload* is `count + 1` (`counter.elm:9`), so the state lives in the input signal. |
| MobX | **yes** | A module-global `observable.box(0)` (`counter.tsx:11`). The author's comment says this is deliberate. |
| React | **no** | `state = { value: 1 }` (`Counter.js:8`): it starts at 1, not 0. |
| Svelte | partial | `<input type="number" bind:value={count}>` (`App.svelte:6`): the value is editable, where the task asks for a label or a read-only field. |
| Vue | **yes** | `{{ count }}` and `count++` in the template. |
| JavaFX | **yes** | The **widget's text is the state**: `count.setText(1+Integer.parseInt(count.getText())+"")` (`Counter.java:19-20`). The ReactFX variant accumulates a click stream instead (`CounterReactFX.java:27-29`). |

- **Abstraction Level.**
  - Declare needs three concepts: a class with declared reactive state, a constraint, and `classroot`.
  - Svelte and Vue need one: reactive state.
  - Elm needs the signal and input machinery, which is heavy for this task.
  - MobX adds `observer` and `observable`. React adds `setState` with an updater function.
  - JavaFX needs no reactive concept at all.
- **Closeness of Mapping.** Every version lays the widgets out in tree or row order. Declare, Vue, Svelte and MobX express "label = count" directly. JavaFX maps worst: the number round-trips through a string. Elm's "the button carries the next value" is an encoding trick.
- **Hidden Dependencies.**
  - In MobX, the global box means two `<Counter/>` instances share state silently.
  - In Elm, state hides inside `clicks.signal`.
  - Declare's dependency is local and explicit.
- **Error Proneness.**
  - React shipped with the wrong initial value.
  - JavaFX's `parseInt` would throw if the field could ever hold non-digits.
  - In Declare, `text` is a string, so `"" + count` is needed. That is one small piece of ceremony, which the type checker enforces.
- **Diffuseness.** Svelte 5 < Elm 6 ≈ MobX 7 < Vue 10 < Declare 14 < JavaFX 18 (+8 imports) < React 20. About half of Declare's lines are look (fill, stroke, radius, padding) and accessibility (`accessibilityRole = status`, `accessibilityLabel`).
- **Viscosity.** Low everywhere. In JavaFX, moving from a TextField to a Label means changing both the read and the write.
- **Commentary.** That Declare builds a read-only field from scratch (`counter.declare:13-15`) suggests either that the toolkit lacks a read-only `TextInput` mode, or that the agent did not find one. **I could not tell which from the code**, and it is a toolkit matter, not a language one.

**Rankings (judgment).**
- Closeness: Svelte ≈ Vue ≈ Declare ≈ MobX > React > Elm > JavaFX.
- Error proneness, least first: Vue ≈ Declare ≈ MobX > Svelte > Elm > JavaFX > React.
- Diffuseness, least first: Svelte > Elm ≈ MobX > Vue > Declare > JavaFX > React.

---

## 3. Task 2: Temperature Converter

| Impl | Meets original? | Notes |
|---|---|---|
| Declare | **yes** | Two text states. Each setter writes its own text and, when the text parses, the other one (`temperature.declare:35-44`). Fields bind with `value = {…}` + `commit` (`:47-53`). A non-number gets a red stroke through a `State` (`:25-28`). Results are rounded to 2 decimals. |
| Elm (`temp2`) | **yes** | `merge (always <~ normal.signal) (convert <~ f' ~ other.signal)` folded with `foldp (<|)` (`temp2.elm:68-74`), plus a 30-line comment explaining it. The first attempt, `temp.elm:75`, is annotated *"this is not enough, observe nonnumeric case"*. |
| MobX | **yes** | "Manual" handlers (`tempconv.tsx:52-64`), plus an "Auto" variant that needs `prevC`/`prevF` guards against loops (`:92-109`). Rounds to **whole degrees**, so typing 10.5 °C gives 51 °F. |
| React | partial | Starts at 5 °C rather than empty (`TemperatureConverter.js:29`), and adds a Kelvin field. Line 56, `if (name === format.name)`, reads an undeclared `name` (the browser global `window.name`), so that branch is dead. The second `setState` (`:61`) hides the mistake. |
| Svelte | partial | Starts at 0/32, not empty (`App.svelte:2-3`). `type="number"` plus `+value` means a cleared field counts as 0 and **updates the other field** to 32 / −17.8, against "non-numeric … not updated". |
| Vue | partial | Updates on `@change` (blur or Enter), not as the user types (`template.html:1-2`). Starts at 0/32. Same `+""` → 0 issue. Results are unrounded (37.77777777777778). |
| JavaFX | **yes** | `bindBidirectional` with a `StringConverter` (`TemperatureConverter.java:22-29`); JavaFX's binding guards re-entry. **ReactFX variant:** two unguarded streams (`TemperatureConverterReactFX.java:20-25`), so with integer rounding, typing 10.5 °C → 51 °F → **overwrites the Celsius field with 11**. `ReactFX2` fixes this with `guardedBy(mute)`. |

- **Abstraction Level.**
  - Declare: the library's "value pattern" (a value that derives down, `commit` that delivers up) and a `State` for the error look.
  - Elm: stream combinators (`merge`, `foldp`, `<~`, `~`). This is the highest level of abstraction here, and also the hardest to read.
  - JavaFX: one toolkit primitive that fits the task exactly (a bidirectional binding with a converter).
  - React: introduces its own abstraction, a table of units with convert/revert through Celsius (`:9-25`). Only React has one.
- **Closeness of Mapping.**
  - Declare, MobX Manual and JavaFX read like the task text: "on change of C, if numeric, set F".
  - Declare's `invalid` constraint maps directly to the convention of marking bad input.
  - Elm's mapping is indirect: you need the comment to see that "C → F" lives in the second `temperature` application.
- **Hidden Dependencies.**
  - **Declare** depends on a library rule you cannot see in the file: *"while an edit is open, the control shows the person's change, not your value"* (declare.md §11). That rule stops `setCelsius` from rewriting the field being typed into. It works, and it is documented, but it is invisible in `temperature.declare`.
  - JavaFX's converter reads the *other widget's* text for the non-numeric case (`celsius.getText()`, `:24`), a back-reference hidden inside the converter.
  - MobX Auto's correctness rests on closure variables (`prevC`, `prevF`) shared by two autoruns.
- **Error Proneness.**
  - Feedback loops are the classic trap here. MobX Auto and JavaFX ReactFX each show it, and their authors document it.
  - Declare avoids the loop by construction: assignments happen in handlers, not in constraints.
  - React's undeclared `name` passes silently because it is JavaScript; TypeScript or Declare would refuse it.
  - The Svelte and Vue `+value` coercion is an easy-to-miss error.
- **Diffuseness.** Svelte 14 < Vue 22 < Elm 31 < Declare 34 < JavaFX 44 (+11 imports) < MobX Manual ≈ 61 < React 72.
- **Viscosity.** Adding a third unit:
  - React: one table entry.
  - Declare, MobX and JavaFX: an extra setter or converter per pair. Each setter writes every other field, so the work grows with the square of the number of units.
  - Elm: one more `temperature` application per pair.
- **Commentary.** Declare's `parseNumber` sits in a `script {}` block and is opaque to the reactive system. That is fine, because it is pure (§5). Declare is the only one besides React with a visible error state, and the only one besides JavaFX that also accepts `.5` and `1e3` (its regex, `:15`).

**Rankings (judgment).**
- Closeness: JavaFX (bindBidirectional) ≈ Declare ≈ MobX Manual > React > Svelte ≈ Vue > Elm.
- Error proneness, least first: Declare ≈ JavaFX (plain) > MobX Manual > Elm `temp2` > Vue ≈ Svelte > React.
- Hidden dependencies, fewest first: MobX Manual ≈ Svelte ≈ Vue > Declare ≈ JavaFX > Elm.

---

## 4. Task 3: Flight Booker

| Impl | Meets original? | Notes |
|---|---|---|
| Declare | **yes** | The state is `kind`, `startText`, `returnText`. Everything else is a declared chain: `isReturn`, `start`, `back`, `bothDates`, `backTooEarly`, `canBook`, `problem` (`flight.declare:57-63`). Invalid dates get a red **stroke**, not a red background (`:39-42`); I count that as "turns red". The combobox is a `Button` with a `Menu` (`:73-85`). The message goes through `Dialog.notice` (`:70`). Dates are DD.MM.YYYY; 31.02 is rejected (`:24`). |
| Elm | **no** | No booking message: the `book` input is never consumed (`flight.elm:43`). The return field is *replaced by a label* `"disabled"` rather than disabled (`:56-58`), and Book is replaced by a label `"No Book!"` (`:59-62`). The `getOrFail` partial function crashes if called on `Nothing` (`:11`). |
| MobX | **yes** (minor) | `bookable` also requires the *hidden* return date to be valid in one-way mode (`flight.tsx:33`), which is stricter than the task. Uses luxon and `alert`. |
| React | **yes** (caveat) | Validity is computed twice: once in `render`, once in `isFormValid` (`FlightBooker.js:17-21`, `:42-52`). Dates are parsed with `new Date(\`${year}-${month}-${day}\`)` (`:92`). Zero-padded input produces an ISO string parsed as UTC; unpadded input ("1.2.2027") produces a non-ISO string parsed as local time. **Comparing the two can depend on the time zone**; unclear in practice. The regex has an unescaped `.` (`:86`). |
| Svelte | partial | Native `type=date` inputs, so no ill-formatted text to mark red. A cleared date gives `Invalid Date`, comparisons go false, and **Book stays enabled** (one-way with an empty start; `App.svelte:49`). `startDate >= endDate` **disables a same-day return**, but the task disables only when the return is *strictly before* the start. |
| Vue | partial | Same native-date gaps. `canBook` uses `stringToDate(returnDate) > stringToDate(departureDate)` (`composition.js:14`), so a same-day return is refused. No invalid-date handling. |
| JavaFX | partial | **No booking message.** None of the three variants sets an action on `book` (`FlightBooker.java:29-48`). Otherwise good: `disableProperty().bind(...)`, ISO dates, `lightcoral` style. The return field turns red even while disabled (`:35-37`). |

- **Abstraction Level.** Declare, MobX, Svelte and Vue all use derived values, under different names: declared attributes with `{}` defaults, `computed`, `$derived`, `computed()`. JavaFX uses `Bindings.createBooleanBinding(…, deps…)`, and its ReactFX variant uses stream `combine`.
- **Closeness of Mapping.**
  - Declare's lines 57-63 are the closest of all to the task text. Each requirement is one named boolean, and the UI reads the names (`disabled = { !classroot.canBook }`).
  - The pop-up `Button` + `Menu` is a plausible mapping of "combobox", but less direct than `<select>` or `ComboBox`. I could not tell why the library's `ComboBox` (`library/combobox.declare`) was not used; perhaps it is an editable combo.
  - Elm swaps widgets instead of disabling them, which strays from the specified UI.
- **Hidden Dependencies.**
  - **JavaFX's** `createBooleanBinding` needs its dependencies **listed by hand** (`FlightBooker.java:46`). Forget one and the binding goes stale silently.
  - **ReactFX's** result depends on the order things are initialized: *"It is very important to initialize the values … after the definition of the functional dependencies due to combine's semantics!"* (`FlightBookerReactFX.java:48-49`, also `:23-25`).
  - **Declare:** `startText: string = { classroot.today }` is a declared-with-default constraint. It follows `today` until the first user edit, then the "formula is gone" (declare.md §5 table). That behaviour is intended here, but nothing at the use site shows it.
- **Error Proneness.**
  - Date handling causes most of the bugs: Svelte and Vue have the off-by-strictness and invalid-date bugs, and React has the time-zone risk.
  - Declare validates real calendar dates by round-tripping through `Date.UTC` (`:23-24`), which avoids both. Its `back! < start!` non-null assertions are guarded by `bothDates`.
- **Diffuseness.** Svelte 36 < Elm 50 < JavaFX 51 (+20 imports) < Vue 52 < Declare 59 < MobX 85 < React 91. Declare adds a visible reason ("The return date is before the start date.") and a hint line, which the task does not ask for.
- **Viscosity.**
  - React's duplicated validity logic means two edits per rule change.
  - In Declare, adding a rule means adding one named boolean and reading it.
  - In JavaFX, a new input means updating every hand-written dependency list.
- **Commentary.**
  - Declare uses `Time [ tick = day ]` to keep "today" current, which is a nice touch.
  - Svelte and Vue's use of native date pickers is a toolkit choice. It removes the "ill-formatted date" requirement rather than meeting it.

**Rankings (judgment).**
- Closeness: Declare > MobX ≈ JavaFX > Vue ≈ Svelte ≈ React > Elm.
- Error proneness, least first: Declare > MobX > JavaFX > React > Vue ≈ Svelte > Elm.
- Hidden dependencies, fewest first: Declare ≈ MobX ≈ Svelte ≈ Vue > React > JavaFX > JavaFX-ReactFX.

---

## 5. Task 4: Timer

| Impl | Meets original? | Notes |
|---|---|---|
| Declare | **yes** | `clock: Time [ tick = frame, running = { classroot.elapsed < classroot.duration }, onTick(dt) { elapsed = Math.min(duration, elapsed + dt) } ]` (`timer.declare:16-19`). Stopping, resuming when the slider rises, and restarting after Reset all follow from the gate. Elapsed time comes from real frame time (`dt`). |
| Elm | **no (absent)** | `timer.elm` is a copy of the flight booker. |
| MobX | partial | `elapsed` is the wall clock since `start`, clamped (`timer.tsx:26-30`). After the timer stops, raising the duration makes `e` **jump** to `now − start` instead of resuming from `e`. The computed also reads `new Date()` outside MobX tracking (`:28`), which is impure. |
| React | **yes** | `setInterval(100)` adding 0.1 per tick (`Timer.js:14,52-55`): counting ticks drifts from real time. Lowering the duration below `e` gives a gauge ratio above 1, so the label can show "150%". Duration 0 divides by 0. |
| Svelte | **yes** | `elapsed += Math.min(time - last_time, duration - elapsed)` in an endless `requestAnimationFrame` loop (`App.svelte:12-17`). One line handles stop and resume. Lowering the duration *pulls `e` down* to `d` (not specified). |
| Vue | partial | `elapsed = performance.now() - lastTime`. The rAF loop is cancelled once `e ≥ d` (`composition.js:10-17`), and nothing watches `duration`, so **raising the duration does not resume the timer**. |
| JavaFX | **yes** | A `Timeline` at 100 ms counts tenths (`Timer.java:35-39`), which also drifts. `progress.bind(elapsed.divide(slider.valueProperty()))` (`:28`). The ReactFX variant is a `StateMachine` over `(elapsed, duration)` tuples (`TimerReactFX.java:34-38`). |

- **Abstraction Level.** Declare's `Time` with a `running` gate is a dedicated toolkit abstraction for exactly this ("a period is `Time`"; "per-frame `onTick` … only to integrate", §10). The others build the clock by hand from `setInterval`, rAF, `Timeline` or `mobx-utils.now`.
- **Closeness of Mapping.** Declare's three lines state the rule ("tick while e < d, add elapsed time, never pass d"), and resume needs no code. JavaFX plain and Svelte are close behind. ReactFX's tuple state machine is the furthest from how the task is phrased.
- **Hidden Dependencies.**
  - MobX: the clamp branch reads untracked wall-clock time.
  - Vue: whether the timer runs is held in the rAF handle, not in reactive state, which is the root of its resume bug.
  - Declare: none visible. Whether `Time` stops ticking entirely while `running` is false is a toolkit fact I take from the guide (`docs/guide/22-time.md:49`).
- **Error Proneness.** Representing "running" as a side effect (Vue's rAF handle, React's interval) invites the resume bug. Declare and Svelte derive it instead.
- **Diffuseness.** Svelte 25 < Declare 27 < JavaFX 34 (+16 imports) < Vue 43 < React 76 < MobX 88. MobX spends lines on alignment hacks: an invisible "padder" label stacked under the real one (`timer.tsx:18,42-45`).
- **Viscosity.** Changing the tick rate:
  - Declare: one attribute.
  - Svelte and Vue: none needed (rAF).
  - React and JavaFX: the period *and* the increment, which are coupled (`0.1` and `100`).
- **Commentary.**
  - A frame-rate `Time` in Declare does work on every frame while running. That is a deliberate choice for a smooth gauge.
  - Svelte's endless rAF loop does work on every frame even when stopped.

**Rankings (judgment).**
- Closeness: Declare > Svelte ≈ JavaFX > React > Vue > MobX > JavaFX-ReactFX.
- Error proneness, least first: Declare ≈ Svelte > JavaFX ≈ React > MobX > Vue.

---

## 6. Task 5: CRUD

| Impl | Meets original? | Notes |
|---|---|---|
| Declare | **yes** | Domain class `People extends Dataset` with `create`/`update`/`remove` (`crud.declare:17-40`), typed by `schema Person` (`:14`). A derived `shown` dataset filters by surname prefix, case-insensitively (`:60-61`). `selected` is *derived* from `selectedId`, so a person hidden by the filter is deselected and Update/Delete turn off (`:62-63`). The list is a library `Table` that grows to fill (`flexes = true`, `:87-89`). The Delete key removes (`deleteRequested`, `:95`). |
| Elm (`crud.elm`) | partial | List rows carry **original** indices (`Array.toIndexedList`, `:87`; `displayEntry x i`, `:82`), but `index = filt2orig selected` treats the selection as a **filtered** position (`:88-90`). With a filter active, Update or Delete can hit the wrong entry. `crud2.elm` uses filtered positions and gets it right. Disabled buttons are replaced by "No Update" labels. The list is a fixed 200×300 and does not fill. |
| MobX | partial | The filter is a case-insensitive **substring** match on the whole `"Surname, Name"` (`crud.tsx:26`), not a surname prefix. Update and Delete are never disabled (`:91-93`). `update` gives the entry a **new uuid** (`:36`), so the selection is lost. `<select size={2}>` shows two rows and does not fill. |
| React | partial | The seed data swaps name and surname (`addPerson('Mustermann','Max')`, `personApi.js:35-37`, with signature `(name, surname)`). The filter is a substring match on name *or* surname (`PersonSelector.js:33-36`). A fake asynchronous API with `sleep()` adds race windows that the task does not have (`Crud.js:59-88`; `handleDelete` does not await). The list fills its grid cell (`1fr`). Disabling is correct. |
| Svelte | partial (layout) | The filter is a `"last, first"` prefix (`App.svelte:15-20`). Selection is an **index into the filtered list** (`:13,21`), synchronised into the inputs by `$effect` (`:23-25`). `<select size={5}>` with a fixed width does not fill the remaining space. Create is disabled for empty names (an extra rule). |
| Vue | partial | Update and Delete are never disabled; they are only guarded inside the handlers (`composition.js:31-44`). Records are plain strings, so identity is the string: `create` refuses duplicates (`:24`), an incidental rule. A selection hidden by the filter stays active. Fixed layout. |
| JavaFX | **yes** | `FilteredList` + `getSourceIndex` maps between the filtered and full lists correctly (`CRUD.java:53-61`). Disabled is bound to `selectedIndex == -1` (`:62-63`). The `ListView` sits in the `BorderPane` centre and fills. Selecting does not fill in the fields; the task does not require it. |

- **Abstraction Level.**
  - Declare offers the most structure: `schema`, a `Dataset` subclass holding the domain logic, a derived dataset, replication (`TableRow [ datapath = :people[] ]`), and the `Table` selection protocol (`input`/`selected`/`selection`). That is many concepts, but each pulls its weight here.
  - JavaFX gets a lot from one toolkit type, `FilteredList`.
  - Svelte and Vue get by with arrays and indices or strings.
- **Closeness of Mapping.**
  - Declare's domain / presentation split (described in the header comment, `:6-11`) and the derived "hidden person is not selected" rule (`:56-58`) follow the task closely, and go further than it.
  - String records (MobX, Vue, JavaFX) map *names* rather than *people*.
- **Hidden Dependencies.**
  - **Declare:** bare names resolve outward through the enclosing brackets, *innermost first* (§3). The task's `selected` therefore collides with the `Table`'s own `selected` attribute. Inside `list:` the code must write `selected = { classroot.selected }` (`:92`), because a bare `selected` there would mean the Table's own. The meaning of a bare name thus depends on the member set of every enclosing node, **library base classes included**. That is a fragile-base-class exposure: a future library attribute could silently change what a bare name means. The agent's defence is to write `classroot.` everywhere (18 times in this file, 144 across the app).
  - The Table's `input(sel: object)` is untyped, so the code casts (`sel as Person[] | null`, `:94`).
  - Svelte's index-based selection depends on the filter staying stable.
  - JavaFX's `externDb` mirror listener (`:44-52`) is extra logic that simulates an external database.
- **Error Proneness.** Selection identity is the trap. Index-based selection (Elm, Svelte) breaks under filtering or ordering. Svelte's `i = Math.min(i, filteredPeople.length - 2)` after delete (`:45`) is subtle. Declare's id-plus-derivation removes the class of bug, as does JavaFX's `getSourceIndex`.
- **Diffuseness.** Svelte 54 < Vue 63 < JavaFX 65 (+18 imports) < Elm 73 < Declare 86 < MobX 97 < React 227. React's size comes from decomposition (selector, form, API, page) plus the incidental asynchronous API.
- **Viscosity.**
  - Adding a field such as email: Declare needs the schema, the domain methods and a Field; React needs the API, form and selector. Both are moderate.
  - String records (MobX, Vue, JavaFX, Elm) need a **data-model change** first, so they resist this most.
- **Commentary.** Declare's typed schema means a misspelled field fails at compile time (§7). None of the JavaScript implementations get that. JavaFX gets it only partly, because its records are `String`.

**Rankings (judgment).**
- Closeness: Declare > JavaFX > React > Svelte > Vue > MobX > Elm.
- Error proneness, least first: Declare ≈ JavaFX > React > Svelte > Vue > MobX > Elm (`crud.elm`).
- Hidden dependencies, fewest first: JavaFX ≈ Vue > Declare ≈ Svelte > MobX > React > Elm.
- Diffuseness, least first: Svelte > Vue > JavaFX > Elm > Declare > MobX > React.

---

## 7. Task 6: Circle Drawer

**What the original asks for:**
- A click on empty space creates a circle.
- The circle **nearest the mouse pointer** that contains it is gray. This reads as pointer-based, i.e. hover, though the text does not say "hover".
- **Right-clicking** the selected circle opens a popup menu with "Adjust diameter..". That opens a frame with a slider whose changes apply immediately.
- **Closing** the frame records one undoable change.

| Impl | Meets original? | Notes |
|---|---|---|
| Declare | **yes** | `Drawing extends Dataset` holds the circles plus `done`/`undone` stacks of **Step records** (`kind: "draw"|"resize", from, to`; `circles.declare:24-94`). The selection is derived: the hovered circle, or the one being adjusted (`:113-114`). There is a `ContextMenu` (`:126-129`), and a `Window` whose `open = { adjusting != 0 }` and `input(v)` ends the adjust, recording **one** step only if the diameter changed (`:69-72`, `:186-188`). Undo and Redo are disabled while adjusting (`:142,145`), with ⌘Z/⇧⌘Z through `Shortcuts` (`:130-136`). The canvas paints itself from a reactive `draw(d)` (`:167-180`). |
| Elm | **absent** | |
| MobX | partial | A **left** click on a circle opens the menu (`frame.tsx:115-120`), not a right click. A diameter step is recorded on **slider mouseup** (`:238`), not on closing the dialog, so each release is a separate step, and **keyboard slider changes are never recorded**. Coordinates come from `pageX - offsetLeft` (`:112-113`), which is fragile. Document-level capture listeners close the popups (`:73-74`). |
| React | partial | A left click on the hovered circle opens a modal directly, with no context menu (`CircleDrawer.js:103-106`). Closing always pushes a snapshot, even with no change (`:85-88`). Hover selection is correct (`:124-133`). Radius instead of diameter (fine). |
| Svelte | partial | Selection is by **click** (`App.svelte:45-50`), not by pointer proximity. A right-click *toggles* an in-page panel with no menu (`:81-86`). `adjusted` is never reset to false (`:15,41`), so after the first adjustment every closing click pushes a history entry. Circles are placed at `event.clientX/Y` (page coordinates, `:28-29`), which is correct only while the SVG starts at the page origin. |
| Vue | partial | Selection by click. A right-click opens the dialog directly (`template.html:15`). Closing always pushes (`composition.js:12-16`). Undo is allowed while the dialog is open: `undo` swaps in **cloned** circles while `selected` still points at the old object, so the slider then edits a circle that is no longer drawn. |
| JavaFX | **yes** (caveat) | Hover selection (`CircleDrawerCanvas.java:50-53`), a `Popup` menu, a separate `Stage` with a slider, and a command-pattern `UndoManager`; closing records the step (`:107-108`). Caveats: the popup is opened on `MOUSE_PRESSED` + `isPopupTrigger()` (`:47`), and on Windows the trigger comes on *release*, so the menu may never appear there. Undo and Redo are never disabled. The dialog is not modal, so you can undo mid-adjust or open several dialogs. |

- **Abstraction Level.**
  - Undo comes in two styles: commands (Declare, MobX, JavaFX) and snapshots (React, Svelte, Vue).
  - Snapshots are simpler and shorter, and they suit this task's size. Commands are what a real application would need.
  - Declare's Step records are *data*, not closures, and the comment explains why: *"a step must remember the circle as the step left it"* (`:21-22`).
  - Declare also needs a fair amount of library protocol: `ContextMenu.open(this, e)`, `picked`, `Window.open`/`input`, `Slider.commit`, `Shortcuts.items`.
- **Closeness of Mapping.**
  - Declare and JavaFX match the specified interaction (hover-gray, right-click menu, separate frame, record on close).
  - Declare's `selectedId = { adjusting != 0 ? adjusting : pointed?.id ?? 0 }` is the task sentence written as a constraint.
  - Svelte and Vue simplify the interaction (click to select, no menu).
- **Hidden Dependencies.**
  - **JavaFX** must remember to call `draw()` after every mutation (`:52,104,113,118`). A missed call leaves stale paint.
  - **MobX** threads 15 callback props through a "pure" frame component (`frame.tsx:37-53`); data flows through many indirections.
  - **Declare's** canvas redraws when anything `draw` read changes (§3, "runs on invalidation"), so there is no forgotten-redraw bug. But `canvas.hovered` is a runtime intrinsic, and that the window closing arrives as `input(false)` is library knowledge, not visible in the file.
- **Error Proneness.** Snapshot-on-close implementations (React, Svelte, Vue) all push no-op entries. Vue's undo-during-adjust detaches the selection. MobX misses keyboard edits. Declare guards both: it skips no-op steps and disables undo while adjusting.
- **Diffuseness.** Svelte 73 < Vue 84 < Declare 138 < JavaFX 195 (+29 imports) < React 222 < MobX 373.
- **Viscosity.**
  - Adding a step kind such as "move circle": in Declare, extend `Step.kind` and the two `if` branches in undo/redo. Commands in JavaFX: a new class.
  - Snapshot implementations need nothing for undo. That is snapshot undo's real advantage.
- **Commentary.**
  - Declare's choice of a `Dataset` for the drawing gives fine-grained updates: a write wakes only the readers of what changed (§7).
  - The agent also made "pointer over the canvas" a precondition (`classroot.canvas.hovered ? …`, `:113`), which makes touch selection impossible. `hovered` is always false on touch (§8), and the app declares `devices = desktop` (`7guis.declare:38`), so that is consistent.

**Rankings (judgment).**
- Closeness: Declare ≈ JavaFX > React > MobX > Vue ≈ Svelte.
- Error proneness, least first: Declare > JavaFX > React > Svelte > MobX ≈ Vue.
- Diffuseness, least first: Svelte > Vue > Declare > JavaFX > React > MobX.

---

## 8. Task 7: Cells

**What the original asks for:** rows 0–99 and columns A–Z, scrollable; double-click to edit a formula; parse and evaluate it; re-evaluate **only the dependent cells**; a customised table widget is allowed but not a spreadsheet widget; domain logic kept separate from the GUI.

| Impl | Meets original? | Notes |
|---|---|---|
| Declare | **yes** | 100×26 grid (`formula.ts:39-40`); double-click or Enter/F2 to edit; Escape cancels; arrow keys and Delete (`cells.declare:22-24`, `:255-263`). `Spreadsheet.setFormula` works out the affected set by BFS over readers, evaluates in topological order (Kahn), reports cycles as errors, and **writes only the recomputed cells** (`:89-135`). The formula language (`formula.ts`) is pure TypeScript: infix `+ - * /`, unary minus, `SUM`/`PROD` over ranges, text and errors. Rows are virtualized; headings stay fixed through constraints on `pane.scrollX` (`:246`, `:280`). Built from views, not a table widget (allowed). |
| Elm, Svelte | **absent** | |
| MobX | partial | Only **10×5** cells (`cells.tsx:17-20`). A **single click** edits (`:122-129`). Propagation is MobX's own: each cell's `value` is a `computed` (`cell.ts:16-22`, *"This is the 'magic'"*). Parser bug: `application()` never consumes the closing `)` (`parser.ts:138-145`), so in `=add(sum(A0:A1), 1)` the outer call returns at the inner `)` and **drops its remaining arguments**. `getReferences` calls `result.concat(…)` without assigning the result (`formula.ts:140`); the code is dead. |
| React | partial | **26×26**, rows numbered 1–26 (`Cells.js:7-8`; `Grid.js:39`). Double-click edits. Explicit dependents graph with `getKeysToUpdate` (reverse, uniq, reverse) and a recursion cap of 1000 as cycle detection (`CellState.js:85-96`). **Blur cancels** an edit (`Cell.js:54`). A bare `=a1` evaluates to a one-element *array* that happens to display correctly (`evaluate.js:9-10`). An evaluation error anywhere is written onto the edited cell (`CellState.js:44-49`). |
| Vue | partial | **5×20** (`store.js:3-4`); single click edits. The formula language **is JavaScript**: `new Function('get', \`return ${exp}\`)` (`store.js:28`), so cells run arbitrary code. Vue's reactivity re-renders only the readers, but evaluation is **not memoized**: each dependent re-evaluates its whole chain (`getCellValue` → `evalCell` recursion). Cycles end in a caught `RangeError`. |
| JavaFX | **yes** (bugs) | 100×26 `TableView` with `TextFieldTableCell` (double-click to edit). Propagation goes through `java.util.Observable` per cell (`Model.java:39-93`), and only dependents are notified. Same parser bug as MobX (`Parser.java:97-112`). **A cycle recurses without bound** (`setValue`→`notifyObservers`→`update`, `Model.java:80-91`) and overflows the stack. Cancelling an edit is broken, by the author's comment: *"You must never cancel an edit"* (`SpreadSheet.java:12-13`, `:39-44`). Row headers are synchronised by looking up the table's internal scroll bar (`:68-73`). |

- **Abstraction Level.**
  - MobX and Vue lean on the framework's dynamic dependency tracking. A cell is a computed or a render function, and dependencies are discovered as reads happen.
  - **Declare cannot use its own reactive system for this.** Constraint dependencies are extracted at compile time, and what the compiler cannot follow is refused (§5). Formulas are run-time data evaluated in opaque `script` code, so the agent wrote a propagation engine by hand (about 45 lines, `:89-135`), much like React and JavaFX.
  - This is the clearest paradigm limit in this comparison. Static dependency extraction is a strength for the UI, but it gives nothing for user-defined dependency graphs. MobX's "magic" here is about 6 lines.
- **Closeness of Mapping.**
  - Declare's split matches the task's request to separate domain logic from GUI code: a pure language (`formula.ts`), a sheet (`Spreadsheet`), and a widget (`CellsTask`/`SheetCell`).
  - JavaFX maps a cell to a table cell; React maps one to a positioned div.
  - Vue's mapping is the shortest, but its formula language is borrowed from the host, which avoids the parsing part of the task.
- **Hidden Dependencies.**
  - **Declare** rebuilds the whole reader graph from every formula on each edit (`formulas()` scans all 2,600 records, `:81-85`, `:97-100`). That is O(sheet) per edit even though only dependents are *recomputed*. It is also the simplest way to never have a stale graph.
  - MobX's dependencies are invisible by design.
  - JavaFX's observer registrations are kept in step by hand in `setFormula` (`Model.java:64-71`).
- **Error Proneness.**
  - Cycles: Declare detects and reports them; MobX catches its framework's cycle exception and shows NaN; React relies on a depth cap; Vue catches the stack overflow; JavaFX crashes.
  - Parsers: the MobX/JavaFX shared parser has the nested-call bug. Declare's recursive-descent parser has a whole-input check (`formula.ts:94-97`) and typed AST unions.
  - Vue's `new Function` is a security and correctness hazard if anything ever loads a sheet that someone else wrote.
- **Diffuseness.** Vue 85 (+34 css) < JavaFX `cells2` 394 < Declare 426 (205 + 221) ≈ JavaFX 430 < MobX 463 < React 611. About half of Declare's size is the formula language, which is richer than the others' (infix operators and error messages).
- **Viscosity.**
  - A new function: Declare edits the token check, the AST union and the `call` evaluation (3 places). MobX and JavaFX: one `opTable` entry. Vue: none (it is JavaScript).
  - Changing the grid size: Declare changes two constants.
- **Commentary.**
  - Declare is the only implementation with a full keyboard model: arrows, Enter/F2, Escape, Delete, and scrolling to keep the selection in view (`reveal`, `:214-221`).
  - It is also the only one that virtualizes. Its rows are views over data, so a 100-row sheet costs only what is on screen.
  - **Two Declare documents disagree** on whether declaring `onDblClick` (`:273`) delays the single click that selects a cell:
    - declare.md §8 says the single click "wait[s] out the double window";
    - `docs/guide/09-pointer-and-keyboard.md:86-88` says "the first click arrives at once".

    If declare.md is right, selecting a cell lags by up to 400 ms. **I cannot tell from the code which is true.**

**Rankings (judgment).**
- Closeness: Declare > JavaFX > MobX > React > Vue.
- Abstraction (the framework does the work): MobX > Vue > JavaFX > Declare ≈ React.
- Error proneness, least first: Declare > MobX > React > JavaFX > Vue.
- Diffuseness, least first: Vue > JavaFX ≈ Declare > MobX > React.

---

## 9. Overall, by dimension

### Abstraction Level
- **Declare** has the most built-in, task-shaped abstractions: `Time` with `running`, `State`, `Dataset` and `schema`, `Window`, `ContextMenu`, `Shortcuts`, `Table`, virtualization. It also has the most concepts to learn: constraints versus declared defaults, settles, `classroot` versus `parent` versus bare names, datapaths and replication, the value/commit pattern, `provided()`. The 938-line reference is dense.
- **MobX** has the most powerful *general* abstraction for the hard task: tracking dependencies at run time, as Cells shows.
- **Elm (0.13)** has the most abstract notation (signal combinators) and the least help for the GUI itself.
- **Svelte and Vue** are low-ceremony and lean on HTML's own controls.
- **JavaFX** has strong widgets (FilteredList, bindBidirectional, TableView), but customising them is fiddly (the Cells comments).

### Closeness of Mapping
Judgment: Declare ≈ JavaFX (plain) > MobX ≈ Svelte ≈ Vue > React > Elm.
- Declare is closest on the tasks with rules: Flight's chain of named booleans, the Timer gate, and CRUD's derived selection.
- Svelte and Vue are closest on the trivial tasks.
- Elm swaps widgets instead of disabling them, and expresses two-way data as merged streams.

### Hidden Dependencies
Judgment, fewest first: Svelte ≈ Vue > Declare ≈ MobX > React > JavaFX > Elm.
- **Declare's** specific exposures:
  1. Bare-name resolution through every enclosing node's members, library classes included. The `selected` collision is the example, and 144 defensive `classroot.` prefixes are the symptom.
  2. Declared-with-default constraints that stop tracking once written.
  3. Library rules that shape behaviour without showing in the file (an edit in progress shows the person's text; a `Window` closing arrives as `input(false)`).
- **JavaFX's** exposures: hand-listed binding dependencies, hand-called `draw()`, and ReactFX's sensitivity to initialization order.
- **MobX's** exposures: global state and computeds that read untracked values.

### Error Proneness
Judgment, least first: Declare > JavaFX > MobX > React ≈ Svelte ≈ Vue > Elm.
- **Declare.** Assignment cannot create feedback loops. Bodies are type-checked; the CRUD schema is typed; `<->` is checked at compile time. Its found gaps (§10) are minor. Its known traps, from the reference: assigning to a constraint-owned attribute is refused only at **run time** (§5 table), and `:path` reads without a schema are dynamic. I could not tell whether `SheetCell`'s `:kind`/`:num` reads are checked against `CellRecord`.
- **JavaScript implementations.** Untyped names (React's `name`), `+value` coercions, and date-string parsing produce several of the shipped bugs.
- **Elm 0.13.** Typed, but the partial `getOrFail` and the index bug in `crud.elm` show that types alone did not prevent errors in logic.

### Diffuseness
Judgment, least first: Svelte > Vue > Elm > JavaFX ≈ Declare > MobX > React (see the summary table).
- Declare carries look and accessibility attributes inline, and `classroot.` repetition adds length.
- React's per-file decomposition and the fake API inflate its counts.
- JavaFX's import blocks (8–29 lines per task) are not in the counts, but they are real.

### Viscosity
Judgment, least resistant first: Declare ≈ MobX > Svelte ≈ Vue > JavaFX > React > Elm.
- Derived-value styles (Declare, MobX, Svelte, Vue) absorb new rules by adding one name.
- Viscous spots:
  - React's duplicated Flight validity;
  - JavaFX's dependency lists;
  - string records (MobX, Vue, JavaFX) when a field is added;
  - in Declare, the per-pair setters in Temperature and a function's three touch points in the formula language.

### Commentary: where each issue lives
- **Paradigm.**
  - Static dependency extraction (Declare) versus run-time tracking (MobX, Vue) decides Cells.
  - Snapshot versus command undo decides the Circle Drawer's size versus its correctness.
- **Language.**
  - TypeScript checking in Declare bodies and in MobX catches whole classes of bugs that the plain-JavaScript implementations shipped.
  - Declare's scoping rule (bare names resolve outward) is a language-level hazard.
- **Toolkit.**
  - Native HTML controls make Svelte and Vue short but shift requirements: date validity, editable counters.
  - JavaFX's `FilteredList` and `bindBidirectional` are excellent; its `TableView` is hard to customise.
  - Declare's library (`Time`, `Table`, `ContextMenu`, `Window`, `Shortcuts`) covers almost exactly what 7GUIs exercises.
- **Tooling and docs.**
  - Svelte suppresses its compiler's accessibility warnings with `svelte-ignore` (`06-7guis-circles/App.svelte:72,75`). The tooling caught the issue; the code opted out.
  - The Declare docs contradict each other on `onDblClick` timing.
  - Declare ships an executable flow test (`flows.mjs`); it covers Counter, Temperature, CRUD, Circles and Cells, **not** Flight or Timer.

---

## 10. Correctness gaps found by reading

Severity is my judgment: **major** means a stated requirement fails; **minor** means an edge case or a deviation from the spec.

**Declare**
- *minor*: Invalid dates and temperatures are marked with a red **stroke**, not a red fill (`flight.declare:41`, `temperature.declare:27`).
- *minor*: The combobox is a pop-up `Button` + `Menu` (`flight.declare:84-85`).
- *minor*: Circle selection needs `canvas.hovered`, so it is mouse-only (`circles.declare:113`). Consistent with `devices = desktop`.
- *minor*: Cells rebuilds the dependency graph from all formulas on every edit (O(sheet)), although it *recomputes* only dependents (`cells.declare:91-100`).
- *unclear*: Whether `onDblClick` delays single-click selection (the docs conflict).
- *unclear*: Whether `Field` gives the CRUD name inputs an accessible name.
- *unclear*: What the Escape path does when the editor is torn down right after `cancelEdit()` (`cells.declare:171`).
- *unclear*: Why `ComboBox` and a read-only `TextInput` were not used.
- Flight and Timer are not covered by `flows.mjs`.

**Elm**
- *major*: Timer missing (the file duplicates Flight); Circle Drawer and Cells missing.
- *major*: Flight has no booking message (`flight.elm:43`), and replaces widgets with labels instead of disabling them.
- *major*: `crud.elm` maps selection indices wrongly under a filter (`:82`, `:88-90`); fixed in `crud2.elm`.
- *minor*: The CRUD list does not fill the space.

**React + MobX**
- *major*: CRUD filter is a substring of the full name rather than a surname prefix (`crud.tsx:26`).
- *major*: CRUD Update and Delete are never disabled (`crud.tsx:91-93`).
- *major*: Timer does not resume from `e` after raising the duration (`timer.tsx:26-30`).
- *major*: Circle Drawer opens the menu on left click and records on slider release (`frame.tsx:115-120,238`); keyboard changes are not recorded.
- *major*: Cells is 10×5 and edits on single click.
- *major*: Cells parser drops arguments after a nested call (`parser.ts:138-145`).
- *minor*: Temperature rounds to integers.
- *minor*: CRUD Update changes the entry's id, so the selection is lost.
- *minor*: Flight one-way checks the hidden return date.

**Vanilla React**
- *major*: Counter starts at 1 (`Counter.js:8`).
- *major*: CRUD seed data swaps name and surname (`personApi.js:35-37`).
- *major*: CRUD filter is a substring of name or surname.
- *major*: Circle Drawer has no context menu (`CircleDrawer.js:103-106`).
- *major*: Cells grid is 26×26, numbered from 1.
- *minor*: Temperature starts at 5 °C, has an extra Kelvin field, and a dead line using an undeclared `name` (`:56`).
- *minor*: Timer counts ticks (drift) and can exceed 100%.
- *minor*: Circle close pushes no-op snapshots.
- *minor*: Cells blur cancels an edit; errors are attributed to the edited cell.
- *unclear*: Flight's time-zone-dependent comparison for unpadded dates.

**Svelte**
- *major*: No Cells.
- *major*: Flight enables Book for an empty or invalid date and disables a same-day return (`App.svelte:49`).
- *major*: Circle Drawer selects by click, has no menu, uses page coordinates, and pushes spurious history (`adjusted` never reset).
- *minor*: Counter is editable.
- *minor*: Temperature starts at 0/32 and treats an emptied field as 0.
- *minor*: CRUD list does not fill.

**Vue**
- *major*: Timer does not resume after raising the duration (`composition.js:10-17`).
- *major*: Flight refuses a same-day return (`:14`) and does not handle invalid dates.
- *major*: CRUD Update and Delete are never disabled.
- *major*: Circle Drawer selects by click with no menu; undo during adjust detaches the selection.
- *major*: Cells is 5×20, edits on single click, and evaluates formulas as JavaScript (`store.js:28`).
- *minor*: Temperature updates on change (not live), is unrounded, and treats empty as 0.

**JavaFX**
- *major*: Flight has no booking message in any variant.
- *major*: Cells overflows the stack on a cycle (`Model.java:80-91`) and shares the parser bug.
- *major*: Cells edit-cancel is broken (author's note).
- *minor*: The ReactFX temperature variant overwrites typed input.
- *minor*: The popup may not open on Windows (`isPopupTrigger` on press).
- *minor*: Undo/Redo never disabled; the dialog is not modal.
- *minor*: The return field turns red while disabled.
- *minor*: "Musterman" is misspelled in the seed data.

## 11. Accessibility and keyboard (as visible in code)

- **Declare.**
  - Accessible names are set on nearly every input: `accessibilityLabel` on the temperature fields, date fields, slider, filter, table and canvas, and a `status` role on the counter.
  - Keyboard: the library's focus traversal (§11); `Table` keyboard selection with Delete (`deleteRequested`); ⌘Z/⇧⌘Z; full spreadsheet navigation.
  - Gaps: cells have no grid or cell semantics and no per-cell names (only the editor is labelled), although the library's `DataGrid` exists and is announced as a grid (`library/table.declare:172-174`). As everywhere, adjusting a diameter is reachable only by pointer.
  - Whether the default renderer exposes all of this to a screen reader is a runtime fact I could not check (§1, item 5).
- **Elm.** Old `Graphics.Element`: no labels, and CRUD rows are `clickable` containers that cannot be reached from the keyboard (`crud.elm:73-74`).
- **React + MobX.** No `<label>`s anywhere. The native `<select>` for CRUD is keyboard-usable. The context menu is a clickable `div`. Cells has Enter and Escape, but no keyboard way to start an edit.
- **Vanilla React.** `<label htmlFor>` on the temperature fields (good). The CRUD list is `ul`/`li` with `onClick` (no keyboard). The modal's close control is a `span` "X". Cells: Enter, Tab and Escape, but editing starts only by double-click.
- **Svelte.** Native controls, but CRUD inputs have only placeholders as names (`App.svelte:62-63`), and the circle accessibility warnings are suppressed.
- **Vue.** CRUD inputs are wrapped in `<label>` (good), with a native `<select>`. The canvas and cells are click-only.
- **JavaFX.** Native controls are keyboard-navigable (Tab, ListView and TableView keys), but no `Label.setLabelFor`. The canvas is mouse-only.

## 12. Conclusions (with confidence)

1. **Correctness against the original tasks:** Declare meets all seven on reading, with only minor deviations. No other implementation meets more than four cleanly. *Confidence: medium-high.* My Declare reading leans on the reference and library for behaviour I could not run (`Time.running`, the `Window` close path, `Table` input), and the agent worked from a more detailed restatement, which helps with the details the originals leave open.
2. **Closeness of mapping:** Declare reads closest to the task text on the tasks with rules (Flight, Timer, CRUD, Circle Drawer), because derived state is declared by name and assignment never loops. *Confidence: medium.* This is a judgment on notation, and JavaFX's plain binding versions come close on Temperature and Flight.
3. **Size:** Declare is mid-pack. It is larger than Svelte, Vue and Elm on every task they finish, and smaller than React, MobX and JavaFX on Timer, CRUD and Circle Drawer. Its counts include styling and accessibility that the smallest examples omit. *Confidence: high for the numbers, medium for what they mean.*
4. **Declare's main weakness is Cells' propagation.** Its compile-time dependency model gives nothing for run-time formula graphs, so it hand-writes what MobX and Vue get from the framework. Close behind: a scoping rule that makes bare names depend on enclosing (library) members, which leads to heavy `classroot.` use; and a large concept count. *Confidence: high.*
5. **The official Svelte and Vue examples are the most concise but the least faithful.** Native controls and simplifications remove requirements: date validation, the menu-based circle interaction, timer resume (Vue), live temperature updates (Vue). *Confidence: high.*
6. **The 2018 Eugen Kiss implementations (Elm, MobX, JavaFX) are honest sketches, not finished work.** Elm is incomplete, and the comments in MobX and JavaFX document known limits. Their value is the comments about each paradigm. *Confidence: high.*

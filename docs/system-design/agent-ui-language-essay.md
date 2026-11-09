# A UI language for agents — an outside view of Declare

**Status: ESSAY, 2026-11-08. Not a plan.** An agent that had not seen Declare was asked to
design, from first principles, a UI language and toolchain for AI agents to write, debug and
verify interfaces with maximum speed and accuracy, keeping enough expressiveness for any modern
UI (Part 1); then to study Declare — its docs, library, tools, corpus and eval record — and
assess it against that design, with proposals however disruptive (Part 2); then, given the
author's statement that Declare's aim is new, better interfaces marked by continuity and visual
dynamism, steered by a designer through an agent, to reconsider (Part 3). Part 4, on tools that
return edited programs, is in `toolchain-as-contributor.md`.

How to read it:
- Part 1 was finished at 2026-11-08 19:22:24 PST, before its author opened anything about Declare, and was not
  edited after. Its context did include this project's saved working notes, which mention
  Declare's features, so it was not wholly blind to the project's themes.
- The agents' self-reported time costs in the eval accounts have been found overstated about
  tenfold; Part 2 leans on timestamps, but a few figures it quotes come from accounts.
- Several proposals run against standing project rulings (no convenience components, no new
  diagnostics, bare-name scoping left alone); the essay says so where they come up. They are
  recorded here as the outside view, not as decisions.

---

## Part 1 — A UI language for agents, from first principles

### 0. The objective, stated as a cost function

An agent building a UI is not a human building a UI faster. Its costs are shaped differently, and a language designed for it should be optimised against those costs, not against human taste.

What an agent does, in order:

1. **Reads** documentation and examples, usually once per session, into a context window that is large but not free. Whatever it reads early shapes everything it writes; whatever it did not read is filled in from priors — React, SwiftUI, Flutter, CSS, Tailwind, HTML.
2. **Writes** in large blocks. An agent will happily emit 400 lines in one write. The probability that a 400-line write is entirely correct is the product of the per-line correctness, so per-construct error rates matter enormously: 0.5% per line is an 87% chance of at least one error in 400 lines.
3. **Runs a loop**: compile → run → look → test → fix. Each turn of this loop costs wall-clock seconds to minutes, thousands of tokens of tool output, and — most expensively — a fresh round of reasoning. A design that turns three loop turns into one is worth more than any amount of syntactic elegance.
4. **Cannot see the screen** except through tools. A screenshot is lossy for it: it can tell that "something is overlapping" but it is unreliable at pixel geometry, alignment, and subtle state. Text it reads exactly.
5. **Decides it is done.** This is where accuracy is actually lost. An agent that declares victory on a UI that is broken at a different window width, or under a slow network, or when a list is empty, has failed silently — and the human only finds out later.

The error classes agents actually produce, roughly in order of frequency from experience with agents writing React/SwiftUI/Flutter/CSS:

- **Guessed names**: a prop, modifier, method or token that does not exist, borrowed from a neighbouring framework (`onPress` vs `onClick` vs `action`; `spacing` vs `gap`; `justifyContent`).
- **False-friend idioms**: a construct that exists but means something different than in the framework the agent is pattern-matching against (an effect that runs every render; a binding that copies instead of references; margins that collapse).
- **Layout misconceptions**: percent heights of auto-height parents, flex items that won't shrink because of min-content, scroll containers without a bounded size, z-order surprises, things that look fine at one viewport and break at another.
- **State and reactivity bugs**: derived values cached and stale, mutations that don't notify, two sources of truth, state in the wrong owner so it resets on re-render.
- **Async races**: responses arriving out of order, setting state after unmount, double-submits, loading flags that never clear on error.
- **Unverified "done"**: the most damaging, because it compounds all of the above.

So the objective is: **minimise expected loop turns to a correct program, and maximise the probability that "verified" means correct.** Everything below is ranked by its expected effect on that product.

### 1. Ranked design principles

Ranked by my estimate of impact on (agent speed × accuracy). The estimate is a judgement, not a measurement; I give the reasoning.

1. **Close the vocabulary and make the checker the source of truth.** Every name an agent can write — component, property, event, token, style value — is checked statically, with "did you mean" suggestions that include the *other frameworks'* spellings. Guessed names are the most common error and the cheapest to eliminate entirely. Impact: very high; it converts the most frequent runtime-visible error into a zero-turn fix (the compile error tells you the answer).
2. **A persistent, textual, structural view of the running UI as the primary verification channel** — a semantic tree with roles, names, states and resolved geometry, diffable between turns, plus automatic audits (overlap, clipping, truncation, off-screen, tiny targets, contrast) at multiple sizes. Impact: very high; it addresses the "cannot see" and "declares done" failure classes together.
3. **Determinism.** Virtual time, virtual network, seeded randomness, animations that can be settled, layout that is a pure function of inputs. Every test and every look is reproducible. Impact: high; nondeterminism is the main source of wasted turns ("it passed, then failed, then passed").
4. **One reactive model with no manual bookkeeping**: state cells, pure derivations, and effects with owners. No dependency arrays, no subscriptions to manage, writes inside derivations forbidden by the checker. Impact: high; eliminates the whole stale-state family.
5. **A small, explicit, local layout model** — constraints down, sizes up, parent places — with a handful of containers and sizing that is always one of `fit`, `fill`, a number, or a range. No cascade, no collapse, no percent-of-unknown. Impact: high; layout is the class agents most often "fix" by trial and error.
6. **Structured async**: resources keyed by their inputs, latest-wins and cancellation by default, exhaustive handling of loading/error/value enforced by the checker. Impact: medium-high.
7. **One way to do each thing, and deliberately un-familiar spellings where semantics differ from familiar frameworks** (avoid false friends), with deliberately familiar spellings where they agree. Impact: medium-high; it's how priors get recruited instead of fought.
8. **Documentation built for a single cold read**: one compact normative spec, one "coming from X" translation table, a pattern catalogue, and a machine-queryable reference reachable from the error messages. Impact: medium; it sets the per-line error rate for the first big write.
9. **Collapse the loop into one call**: a watch session in which an edit returns compile diagnostics, runtime errors, a tree diff and audit results in a single response. Impact: medium-high on speed, low on accuracy. (Could rank higher; it depends how expensive turns are in the host agent.)
10. **Compactness without cleverness**: programs that are short because there is no boilerplate, not because there are many operators. Impact: medium; fewer tokens written and re-read, fewer places to be wrong.
11. **Accessibility as structure, not annotation**: the accessibility tree *is* the test tree, so a UI that is testable is accessible and vice versa. Impact: medium on speed, high on quality.
12. **Bounded, typed escape hatches** for native code, custom drawing and custom layout. Impact: low on the average task, decisive on the hard 5%.
13. **Performance by construction** (fine-grained updates, virtualised lists by default) with diagnostics rather than tuning knobs. Impact: low on speed for most tasks; prevents a class of late surprises.

The rest of this part works through these concretely. The notation is hypothetical; I'll call the language **Weft**.

### 2. The core model

#### 2.1 Components, state, derivation

```weft
component TodoApp {
  state todos: [Todo] = []
  state draft: Text = ""
  state filter: Filter = .all

  derived visible = todos.filter(filter.matches)
  derived remaining = todos.count(where: not .done)

  view {
    Column(gap: 12, padding: 16) {
      Row(gap: 8) {
        TextField(bind: draft, label: "New to-do", onSubmit: add)
          .width(fill)
        Button("Add", action: add, enabled: not draft.isBlank)
      }
      Picker(bind: filter, label: "Show", options: Filter.all)
      List(visible, key: .id) { todo in
        TodoRow(todo: todo, onDelete: { todos.remove(id: todo.id) })
      }
      Text("\(remaining) left").style(.caption)
    }
  }

  action add() {
    todos.append(Todo(title: draft.trimmed))
    draft = ""
  }
}
```

Rules, each chosen against a specific error class:

- **`state` is the only mutable thing.** It is owned by exactly one component instance (or one store, see below). Mutation is only legal inside `action` blocks and event handlers. The checker rejects writes in `derived` and in `view`. That removes the "setState during render" class and makes "where did this change come from?" answerable by grep.
- **`derived` is pure and automatically tracked.** No dependency arrays. The compiler knows the dependencies from the expression. Derivations are memoised and invalidated precisely. A cycle between derivations is a compile error naming the cycle.
- **Collections are value-typed with structural sharing.** `todos.append(...)` is a mutation of the state cell, which notifies. There is no way to mutate a todo "in place" without the system knowing, because there is no reference to it that escapes the cell. (This kills the classic "I pushed into the array and nothing re-rendered".)
- **Keys are mandatory for dynamic lists** and must be a stable field, statically checked to be of an identity type (`ID`, not `Int` index). A list without a key is a compile error, not a warning.
- **`bind:` is explicit two-way binding** and only to a state path. It's never implicit; a `TextField(value: draft)` without `bind:` must provide `onChange`, or it's a compile error ("this field would be read-only; did you mean `bind: draft`?").

#### 2.2 Shared state and stores

```weft
store Session {
  state user: User? = nil
  derived signedIn = user != nil
  action signOut() { user = nil }
}

component Header {
  use session: Session          // resolved from the nearest provider
  view {
    if session.signedIn { Button("Sign out", action: session.signOut) }
  }
}
```

A store is a component without a view. `use` resolves the nearest provided instance up the tree, and the checker verifies that a provider exists on every path that can mount the consumer — this is a static whole-program check, possible because the language owns the structure. "No provider found" becomes a compile error, not a runtime crash in one branch.

#### 2.3 Effects

Effects are the place frameworks hurt agents most (React's `useEffect` is probably the single largest source of agent bugs). Weft has two forms only:

```weft
effect on(mount) { analytics.screen("todos") }           // runs once, owned by this instance
effect when(selectedID) { id in                            // runs on change, previous run cancelled
  await scroll.reveal(id)
}
```

Every effect has an owner and is torn down with it. An `effect when(x)` names its trigger explicitly — the one place where explicit dependencies are better, because an effect *is* an intent to react to a particular change, and inferring triggers from the body causes surprise re-runs. The checker warns when the body reads a state that is not the trigger and not stable ("this effect reads `filter` but won't re-run when it changes — add it to `when(...)` or read it through `snapshot(filter)`").

#### 2.4 Async: resources

```weft
component Profile(userID: ID) {
  resource user = api.users.get(userID)       // keyed by userID; latest wins

  view {
    match user {
      .loading        -> Spinner(label: "Loading profile")
      .failed(error)  -> ErrorPanel(error, retry: user.reload)
      .ready(u)       -> ProfileCard(u)
    }
  }
}
```

- A `resource` is a derivation over an async source. It re-fetches when its inputs change, cancels the previous request, and ignores late responses. Races are not something the programmer handles.
- **`match` over a resource must be exhaustive.** An agent cannot forget the error state; the checker says "`user` can be `.failed`; add a branch or use `user.value(or: placeholder)`".
- Mutations are `task`s with a lifecycle the view can read:

```weft
task save = api.todos.update(todo)            // not run until called
Button("Save", action: save.run, enabled: save.idle and form.valid)
if save.failed { InlineError(save.error) }
```

`task.run` while running is a no-op by default (double-submit prevention), configurable to `.queue` or `.restart`. That's one option with three named values, not a pattern the agent has to reimplement.

#### 2.5 Events, gestures, keyboard, focus

Events are named, typed members of the component that emits them — there are no string event names. Gestures are recognisers attached to a view with typed phases:

```weft
Card(item)
  .on(tap) { open(item) }
  .on(longPress) { menu.show(at: $0.location) }
  .on(drag(axis: .horizontal)) { phase in
    match phase {
      .changed(d)  -> offset = d.translation.x
      .ended(d)    -> if d.predictedEnd.x < -120 { delete(item) } else { offset = 0 }
      .cancelled   -> offset = 0
    }
  }
```

The checker requires `.cancelled` handling for any gesture that mutates state in `.changed` — a frequent source of stuck UIs. Gesture arbitration (a drag inside a scroll view) has documented defaults per container and an explicit `priority:` option.

Keyboard: commands are first-class, bound to keys, scoped to focus regions, and listed by the tooling:

```weft
command delete = Command("Delete", key: .delete, enabled: selection.any) { removeSelected() }
```

Focus is a state like any other (`state focused: Field? = .title`, bound with `.focus(bind: focused, as: .title)`), so it's inspectable and testable.

#### 2.6 Layout

Layout is the area where I'd depart hardest from the web. The model is the one SwiftUI and Flutter converged on: **the parent proposes a size range, the child picks a size within it, the parent places the child.** It is local: to understand why a view is a given size, you read the view and its parent, never a stylesheet.

Containers (the complete list for v1):

- `Row`, `Column` — linear, with `gap`, `align`, `distribute`.
- `Grid` — explicit tracks (`columns: [fit, fill, 120]`), named areas optional.
- `Flow` — wrapping line layout.
- `Stack` — overlay along z, with per-child alignment.
- `Scroll(axis:)` — the only place an axis becomes unbounded.
- `Adaptive` — switches between layouts by the container's own size (not the window).

Sizing is one closed type:

```weft
.width(fit)                   // as small as content allows
.width(fill)                  // take what the parent offers
.width(240)                   // fixed points
.width(fill, min: 200, max: 480)
.width(fill(weight: 2))       // share of leftover space
```

There is no percentage of an unknown size. There is no margin (spacing belongs to the container: `gap` and `padding`), so nothing collapses. There is no `position: absolute` in normal layout; overlays go in a `Stack` or in a named `layer` (popover, toast, modal) owned by the host.

The checker can catch real layout contradictions statically:

- `fill` along the scroll axis of a `Scroll` → error ("a Scroll's content is unbounded vertically; `.height(fill)` has nothing to fill. Use `fit`, a number, or move the Scroll").
- A `Scroll` inside a `fit`-sized parent along the same axis → warning (it will never scroll).
- `min > max`, conflicting alignments, etc.

What it can't catch statically, the runtime audits catch (§4.3).

Responsiveness:

```weft
Adaptive {
  when(width < 600) { Column { sidebar; content } }
  otherwise        { Row { sidebar.width(280); content.width(fill) } }
}
```

Breakpoints are relative to the `Adaptive`'s own proposed width (container queries), because that's the only definition that composes. The tooling renders every `Adaptive` at each side of each threshold during audit by default.

#### 2.7 Styling and theme

Style values are typed tokens: `.color(.accent)`, `.style(.caption)`, `.radius(.medium)`. A theme defines the tokens; views may only reference tokens or literal values of the right type. There's no cascade and no selector language. Variants (pressed, hovered, focused, disabled, selected) are a closed set of states a style can respond to:

```weft
style PrimaryButton: ButtonStyle {
  background: .accent
  foreground: .onAccent
  pressed { background: .accent.darker(0.1) }
  disabled { opacity: 0.4 }
}
```

The trade-off is real: designers lose the power of the cascade, and some theming tricks become verbose. But cascade is the single most non-local thing in web UI, and non-locality is what agents get wrong.

#### 2.8 Motion

```weft
.offset(x: offset).animate(.spring(response: 0.3))     // any change to offset animates
Panel().transition(.slide(.leading), when: showPanel)   // enter/exit
```

Animations are interruptible by default (retarget from current value/velocity). Under test the clock is virtual: `settle()` runs all animations to completion, and `advance(150ms)` lets a test inspect mid-flight geometry. The audit never measures a view mid-animation unless asked.

#### 2.9 Text and rich text

- `Text` takes plain text or an attributed value; attributes are typed (`bold`, `link(url)`, `code`, custom).
- Text measurement, truncation (`lines: 2, truncate: .tail`) and wrapping are part of layout, and truncation is reported by the inspector ("Text 'Weekly summary for…' truncated: 214pt needed, 160pt available").
- Rich text editing is a built-in component over a structured document model with a schema — not contenteditable. `RichTextEditor(bind: doc, schema: .notes)`. The document is a value, diffable, serialisable, testable (`doc.paragraphs[2].marks`). This is one of the few places where I'd ship a large built-in rather than primitives, because agents cannot be expected to build a correct editor out of primitives.
- Localisation: all user-visible strings in `Text("…")` are extracted keys by default; plurals and interpolation are typed.

#### 2.10 Data-backed apps against real services

Services are described by schema (OpenAPI, GraphQL, or a Weft schema), and a typed client is generated:

```weft
service api from "openapi.yaml"
```

Generated clients give the checker field names (no guessed JSON keys — a major real-world error), and give the test toolchain **automatic fakes**: a schema-conforming in-memory server with seeded data, latency and failure injection. A UI can be built and verified entirely against the fake, then pointed at the real service with one switch. The trade-off: schema-less services need a hand-written schema, which the toolchain can draft from recorded responses.

#### 2.11 Forms

```weft
form Signup {
  field email: Email           required
  field password: Text         required, minLength(12)
  field confirm: Text          must(equal: password, message: "Passwords don't match")
  submit = api.accounts.create(email, password)
}

view {
  FormView(signup) {
    EmailField(signup.email, label: "Email")
    SecureField(signup.password, label: "Password")
    SecureField(signup.confirm, label: "Confirm password")
    SubmitButton("Create account")
  }
}
```

Validation is derived state; touched/dirty/error display timing has a single default policy (errors show after first blur or first submit attempt); server errors map back to fields by name; submit is a `task` with the double-submit rule. Forms are the most-repeated UI in business apps and agents write them with subtle timing bugs; one canonical model is worth the inflexibility.

#### 2.12 Accessibility

- Every built-in control has a role. Every interactive control requires an accessible name at compile time: `Button(icon: .trash)` without `label:` is an error.
- Custom controls declare their role and value (`role: .slider, value: volume, range: 0...1, adjust: setVolume`) and the checker requires the operations that role implies (a slider must be adjustable by keyboard).
- The accessibility tree is the tree the test tools query. If a test can find "Delete" by role and name, a screen reader can too.
- Focus order follows structure; explicit overrides are visible in the inspector.

#### 2.13 Hosts: web and native

Weft compiles to a semantic view tree rendered by host backends: web (DOM for text/inputs/accessibility, with a canvas/GPU path for custom drawing), iOS/macOS (native views), Android. Built-in controls map to native controls where the host has them (text fields, menus, pickers, scroll physics) because users notice when these are wrong and because native text input is very hard to replicate. Custom visuals go through a retained vector `Canvas` that every host implements identically.

Trade-off: the classic lowest-common-denominator problem. I'd accept it, with `platform(.ios) { … }` blocks and native escape hatches (§7), because the alternative — separate code per platform — doubles the agent's verification surface.

### 3. The compiler and checker

#### 3.1 What it catches

Statically, at minimum:

| Class | Check |
|---|---|
| Names | Unknown component/property/event/token, with suggestions drawn from edit distance **and a synonym table of other frameworks' names** (`onClick` → `action`, `spacing` → `gap`, `justifyContent` → `distribute`) |
| Types | Units, colours, sizes, optionals; no implicit coercion |
| Reactivity | Writes outside actions; derivation cycles; effect reading untracked state; state declared but never read or never written |
| Structure | Missing list keys; non-identity keys; provider missing on a mount path; duplicate IDs |
| Async | Non-exhaustive match on resources/tasks; awaiting in a derivation; unhandled task errors |
| Layout | Static contradictions (fill in unbounded axis, min > max, dead `Scroll`) |
| Accessibility | Missing names; custom role missing required operations; images without description or `decorative` |
| Forms | Field without label; submit without failure display |
| Dead code | Unreachable branches given types (`if user != nil` where `user` is non-optional) |

#### 3.2 How errors are phrased for an agent

An agent reads errors as instructions. So each error:

1. **States the fact**, at a precise location.
2. **States the rule**, in one sentence.
3. **Gives the fix as an edit**, when there's a likely one — machine-applicable.
4. **Names the false friend** when the error pattern matches a known import from another framework.
5. **Links one doc anchor**, which the CLI can print inline.

```
error[W0213] app/Profile.weft:14:5  `user` can be `.failed`, but this match has no `.failed` branch.
  rule: a match over a resource must handle loading, failed and ready.
  fix:  add   .failed(error) -> ErrorPanel(error, retry: user.reload)
  see:  weft help resources#exhaustive
```

```
error[W0102] app/Row.weft:8:12  Row has no property `spacing`.
  did you mean `gap`? (`spacing` is SwiftUI's name; Weft containers use `gap`)
```

Also:

- **One root cause per error.** The checker suppresses cascades (an unknown name doesn't produce 12 type errors downstream).
- **All errors in one pass**, sorted by file then line, with a count, so one big write gets one big fix list instead of fix-one-recompile-repeat.
- **Machine-readable output** (`--json`) with the fix edits, which a harness can apply automatically.
- **Warnings are rare and meaningful.** A warning must be something an agent should act on; anything else is noise that trains it to ignore warnings.

#### 3.3 Runtime errors

When something does fail at runtime (a service returns an unexpected shape, an invariant breaks), the error carries the component path in the view tree, the triggering action, and the state diff that led to it — "action `add` in TodoApp > Row#2 set `todos[3].title` to nil; `TodoRow.title` requires Text". The time-travel log (every action with its state diff) is queryable from the CLI.

### 4. The verification toolchain

This is where I'd spend the most engineering, because it determines whether "done" is true.

#### 4.1 One session, one call per turn

```
$ weft dev --session s1 app/        # long-running; hot reload; virtual clock option
$ weft step s1                       # after an edit: compile + reload + report
```

`weft step` returns, in one response: compile errors (or "ok"), runtime errors since the last step, a **diff of the semantic tree** against the previous step, and the audit results. An agent that edits and calls `step` gets everything it needs to decide the next action without a separate run/look/test sequence.

#### 4.2 Seeing: the semantic tree

```
$ weft inspect s1 --size 390x844
Window 390×844
└ Column  (0,0 390×844)
  ├ Row  (16,16 358×44)
  │ ├ TextField "New to-do" value="" focused  (16,16 286×44)
  │ └ Button "Add" disabled  (310,16 64×44)
  ├ Picker "Show" value=All  (16,72 358×32)
  ├ List 3 items  (16,116 358×660) scroll=0/0
  │ ├ TodoRow[id=a1]  "Buy milk" checkbox=off
  │ …
  └ Text "3 left"  (16,788 358×20)
```

- It is the accessibility tree plus geometry plus the state flags an agent cares about. Compact by default; `--depth`, `--path`, `--props` to zoom.
- Every node has a stable path (`TodoApp/List/TodoRow[a1]/Button "Delete"`) usable in drive commands and assertions.
- Screenshots exist (`weft look s1 --size … --annotate`) and annotate the image with node outlines and labels so an agent can correlate pixels to names. But the tree is primary; the screenshot is for visual qualities the tree can't express (colour, polish, "does this look right").

#### 4.3 Audits: the checks an agent wouldn't think to run

`weft audit s1` runs, at a matrix of sizes (phone portrait, phone landscape, tablet, desktop narrow/wide, plus both sides of each `Adaptive` threshold), light and dark, and largest accessibility text size:

- overlap of sibling interactive elements; content clipped by its parent; text truncated where truncation is not declared;
- off-screen interactive elements not inside a scroll;
- targets smaller than the platform minimum; contrast below threshold;
- unlabeled controls; focus order inconsistent with visual order; focus traps;
- empty states (every `List` rendered with zero items), error states (every resource forced to `.failed` via the fake), loading states;
- long-content stress (strings ×3, localisation pseudo-language).

Output is a short list of findings, each with a node path and the size at which it occurred. The key design idea: **an agent should not need to imagine edge cases to find them.** The toolchain enumerates state space the UI declares (resource states, adaptive thresholds, list cardinalities) and renders it.

#### 4.4 Driving and asserting

The same small language drives the UI interactively and in tests:

```weft
test "adding a todo" {
  type "Milk" into TextField("New to-do")
  press Button("Add")
  expect List.items.count == 1
  expect Text("1 left").visible
  expect TextField("New to-do").value == ""
}

test "save failure shows error" {
  fake api.todos.update fails with .server(500)
  press Button("Save")
  settle()
  expect InlineError.visible
  expect Button("Save").enabled
}
```

- Queries are by role and accessible name, never by CSS selector or test ID (though `id:` exists).
- `press`, `type`, `drag`, `scroll`, `key` go through the same input pipeline as a real user, including hit-testing — so a button covered by an overlay can't be "pressed" by the test. (A test that clicks through overlays verifies the wrong thing.)
- `settle()` advances the virtual clock until no animations, timers or fake requests are pending. Tests are therefore synchronous and deterministic, and there is no `sleep`.
- `expect` failures print the relevant subtree, not just "expected true".
- From an interactive session, `weft drive s1 'press Button("Add")'` returns the tree diff caused by that action — an agent can explore and then paste the steps into a test.

#### 4.5 Performance observation

`weft profile s1 'scroll List to end'` reports frame times, updated nodes per action and the derivations that re-ran, flagging obvious waste ("TodoRow re-rendered 500 times because it reads `todos` instead of `todo`"). Again: textual, attributable to code.

#### 4.6 Real hosts

The same drive language runs against the iOS simulator, Android emulator and macOS host through each platform's accessibility/automation APIs. Because the semantic tree is the same, tests are shared. Pixel-level differences are expected; semantic differences are failures.

### 5. Documentation and learnability for a model that has never seen the language

A model has never seen Weft. It will read what we give it once and then write from that plus its priors. Design for that:

1. **One normative spec, readable in one sitting** — I'd aim at 15–25k tokens. It defines the whole model (state, derived, effect, resource, task, layout, style, events) with a short example for each and the rule that the checker enforces. Prose, but dense.
2. **"Coming from" tables** — React, SwiftUI, Flutter, CSS/HTML — listing each familiar construct, its Weft equivalent, and *where the semantics differ*. This is the cheapest high-leverage document: it intercepts priors at the moment they'd be used.
3. **A pattern catalogue** of ~30 complete small programs covering the shapes UIs actually take: list-detail, master-detail with routing, form with server validation, infinite feed, drag-to-reorder, modal flow, settings screen, dashboard with charts, chat, editor. All idiomatic, all passing audit, all kept compiling by CI. Agents copy structure from examples more than from prose.
4. **A reference reachable from the CLI** (`weft help Row`, `weft help Row.gap`) generated from the same source as the checker, so it can never be out of date, and so the agent can query instead of loading everything.
5. **Name design by measurement.** For each API name, ask several models (cold) what they'd call it, and choose the modal guess unless it's a false friend. Guessability is a design criterion. Run this as a regression test on the docs: give a cold model a task, count unknown-name errors, and treat a rise as a bug.
6. **Docs say what not to do** only where a prior is strong and wrong. Otherwise, absence of a thing is communicated by the closed vocabulary and the checker.

### 6. Program size and performance

- **Size**: a typical screen should be 50–200 lines. The main levers are: no boilerplate imports (the vocabulary is closed and global), no hook ceremony, no CSS files, no prop drilling (stores via `use`), generated service clients. Keep one component per file or a few small ones; agents navigate by filename and by grep.
- **Smaller isn't always better**: I'd reject operator-heavy terseness. Every identifier should be guessable; every construct should read aloud. Token cost is dominated by the agent's reasoning and tool output, not by the program's own size.
- **Performance**: fine-grained reactivity (only nodes depending on a changed cell update), compile-time static structure where possible, `List` virtualised by default with measured row heights cached, image decoding and layout off the main thread on native hosts. Agents should not have to know about memoisation; the profiler should tell them when something is wrong, with the line.

### 7. Escape hatches

Every escape hatch is typed at its boundary and visible in the inspector as an opaque node with its declared role and size, so verification still sees *something*:

- `native component MapView(region: Region) for ios { … Swift … } for web { … TS … }` — a native view with a typed interface; the checker requires an implementation per targeted host and an accessibility description.
- `Canvas { ctx in … }` — immediate-mode drawing into a retained surface, with `hitTest` and `accessibility` callbacks required if it is interactive.
- `layout Masonry: Layout { measure(children, proposal) -> Size; place(children, in: rect) }` — the same protocol the built-in containers use, so custom layouts are first-class and inspectable.
- `extern fn` for host functions (file pickers, platform APIs), with async results typed as tasks.

The rule: escape hatches exist for capability, not for style. If agents routinely reach for one to do something ordinary, that's a missing feature in the language.

### 8. What I'd deliberately leave out

- **The CSS cascade, selectors and specificity.** Replaced by typed local styles and theme tokens.
- **Margins.** Spacing is the container's job.
- **Inheritance between components.** Composition and slots only.
- **Implicit two-way binding** and implicit coercion.
- **String-named events, string-keyed props, `any`.**
- **Macros, user-defined operators, metaprogramming.** They make every program a new dialect, defeating the one-read model.
- **Effect-based data fetching.** Resources only.
- **Multiple styling systems, multiple state libraries, multiple routers.** One of each, built in.
- **Configurable build pipelines and a plugin ecosystem in v1.** Every configuration knob is a place an agent's guess diverges from the project's reality.
- **`sleep` in tests.** Replaced by `settle()` and virtual time.

### 9. The big trade-offs

**A new language versus a TypeScript-embedded DSL.** This is the central bet. Agents know TypeScript and React extremely well; a new language costs a cold read and forfeits that prior. Against that, an embedded DSL inherits every false friend (closures that capture stale values, `this`, truthiness, structural types that accept misspelled optional props, the whole npm surface). My judgement: a new surface syntax that *looks* like Swift/TypeScript where semantics agree (so the prior helps), owned end to end by its checker (so the prior can't silently hurt). The cold-read cost is paid once per session; the false-friend cost is paid on every line. But I hold this with moderate confidence; a strict TypeScript subset with a custom checker and lint rules that ban the false friends is a credible alternative, and its advantage — zero novelty in syntax — is real.

**Closed vocabulary versus ecosystem.** Closing the vocabulary is what makes "did you mean" exact and docs complete. It costs the long tail of community components. I'd accept this with strong escape hatches and a curated, versioned standard library that grows deliberately.

**Native controls versus pixel-identical rendering.** Native wins for text input, menus and scroll physics; pixel-identity wins for brand-heavy custom UI. I'd default native for controls and identical for `Canvas` and custom styles, and make the inspector report which is which.

**Strict checker versus fast first draft.** Very strict checking can make the first compile of a 400-line write produce 40 errors. That's still one turn, if errors are all reported at once, de-cascaded and machine-fixable — much better than 40 runtime discoveries. Strictness is only a cost when errors are vague.

**Built-in audits versus false positives.** Audits that cry wolf train agents to ignore them. Each audit must have a near-zero false-positive rate on the pattern catalogue before it ships, and every finding must be silenceable at the node with a stated reason (`.audit(allow: .truncation, because: "intentional preview")`), which is itself visible to reviewers.

### 10. How I'd know if it works

Measure, don't argue: a benchmark suite of UI briefs (from to-do to data-heavy dashboard to drag-and-drop editor to native phone app), built by cold agents with only the docs, scored by hidden acceptance tests and by humans for quality, with wall-clock timestamps, turns, tokens, and categorised errors per run. Compare against the same agent building in React/SwiftUI. The most important number is not time-to-first-render; it's **the defect rate at the moment the agent says "done"**, because that's the cost the human pays. Every recurring error category in those runs becomes either a checker rule, an audit, a doc fix or a name change — in that order of preference.

---

## Part 2 — Declare, assessed against that dimension

*Written 2026-11-08, after Part 1 was finished and saved. Sources: `README.md`, `skill/SKILL.md`, `docs/declare.md` (whole), guide chapters 03, 05, 06, 27 and parts of 31, `docs/operational/verify.md`, the to-do app, `declare-help` run on a few names, the tool sources at a glance, and the eval record: Ledger 1, RealWorld 1, 7GUIs 1 and its comparison, Presentify 5, Cadence 30, Murmur 15, Venue 20, the habits riff, with their timing files. I ran nothing long and changed nothing.*

### 0. How to read the evidence

Some cautions first, because they decide how much weight each claim can carry.

- **Most comparisons are n = 1 per brief and stack.** Run-to-run spread is large. Cadence's clean runs range from 15.0 to 19.4 minutes. Murmur ranges from 18.2 to 33.9, and the 33.9 includes a runtime defect. A difference of a few minutes between Declare and React on one brief is inside the noise.
- **Agents' own accounts overstate their time costs by roughly ten times.** The Ledger agent said the DatePicker problem cost "about 25 minutes" and the DECLARE7001 pattern "about 20". The timestamps show 2.8 minutes and under one minute. So I use the accounts for *what* happened and the timing files for *how long*.
- **Hidden checks are near ceiling for both stacks.** Ledger is 8/8 for both, Presentify 19/19 for both, and RealWorld 42/47 against 44/47. That means the runs mostly don't separate the stacks on accuracy. They show parity, not an advantage either way.
- **The stacks don't verify equally.** Declare agents write and keep assert scripts: 9 in Ledger, a 74-step flow in RealWorld. React agents mostly wrote first and checked less; the Ledger React agent deleted its Playwright scripts. The riff report says it outright: "Declare's cost is verification, not language." Wall-clock comparisons therefore charge Declare for extra checking that the React runs mostly didn't do.

With those caveats, here is the record:

| Brief | Declare | React | Hidden checks (D / R) | Code (D / R) |
|---|---|---|---|---|
| Cadence (run 30) | 16.4 min, 73 turns | 15.4 min, 63 turns | — | 1,174 / 2,943 lines |
| Murmur (run 15; best 18.2) | 33.9 min, 141 turns | 18.1 min, 76 turns | — | 1,120 / 3,612 |
| Venue (run 20) | 23.0 min, 102 turns | 30.9 min (run 2) | 11/11 / — | — |
| Presentify (run 5) | 37.3 min, 126 turns | 35.2 min, 133 turns | 19/19 / 19/19 | 3,307 / 8,375 |
| Ledger (run 1) | 46.2 min, 196 turns | 39.5 min, 166 turns | 8/8 / 8/8 | 4,017 / 11,047 (+19 npm packages) |
| RealWorld (run 1) | 19.3 min, 107 turns | 8.8 min, 70 turns | 42/47 / 44/47 | 863 / 1,456 + 1,291 CSS copied |
| Habits riff (7 turns) | 20.9 min | 9.2 min | — | 879 / 969 |
| 7GUIs (run 1) | 15.0 min, 105 turns | — | 6/8 | 788 + 221 TS |

What this record supports:

1. **Declare is at rough wall-clock parity with React on medium and large apps:** Cadence, Venue, Presentify and Ledger fall within about ±20%.
2. **Declare is clearly slower on small apps and on small iterative changes:** RealWorld takes 2.2× as long and the riff 2.3×. The cause is a fixed reading cost of 4.3–9.0 minutes plus heavier per-change verification.
3. **Correctness against hidden checks is at parity.**
4. **Declare programs are 2.5–3× smaller.**
5. **Declare agents leave behind executable checks.**

Two more patterns show up across the timing files:

- **Model time dominates tool time.** Ledger shows 38.1 model minutes against 8.1 tool minutes; RealWorld 15.6 against 3.7. Turn count and per-turn deliberation are the levers that matter.
- **The "checking" phase dominates the run:** 7.5 of 16.4 minutes in Cadence, 25.2 of 33.9 in Murmur, 38.0 of 46.2 in Ledger.

Part 1 argued that the most important number is the defect rate at the moment the agent says "done". The record doesn't measure that well yet, because the hidden checks saturate. I come back to this at the end.

### 1. Declare in one paragraph, mapped onto Part 1

Declare has two delimiters. `[ … ]` is the view tree: attributes, children, methods. `{ … }` is TypeScript, type-checked against the real class APIs. A `{ }` used as an attribute value is a *constraint*. The compiler extracts its dependencies statically and refuses what it can't follow (DECLARE7001).

The pieces map onto Part 1's design as follows:

- **State.** State is declared attributes. Assignment is the only write, and it notifies. Derived values refuse writes. A handler's writes land together in one "settle".
- **Data.** Data is JSON in `Dataset`s. Views bind with `:path` datapaths and replicate with `[]`, with identity inferred from `id`. Remote data is a `DataSource` whose lifecycle is reactive state, so a derived `url` means latest-wins with no extra code.
- **Layout.** A layout is an object on the view. Every size and position has exactly one decider, and children state facts about themselves (`flexes`, `shrinks`, ranges).
- **States and motion.** `State` is a reversible bundle of overrides. `Spring` moves an attribute toward a target. Time is an input.
- **Library.** It is written in Declare and auto-included: controls, `Table`, `Form`, overlays, `Shortcuts`.
- **Tools.** `declare-verify` is a six-rung ladder: parse → resolve → typecheck → boot with layout findings → behaviour scripts → pixel baselines. `declare-look` takes screenshots and acts from the command line. `declare-help` is a generated reference that also answers *absences*. Assert scripts use Playwright-style locators, real input and a virtual program clock.
- **Docs.** A ~21k-token language file, a 31-chapter guide, and a skill that tells the agent what to read first and lists "drift tells".

Read against Part 1's ranked principles, Declare has independently arrived at most of them: a closed vocabulary with fix-naming errors (#1), a structural textual view of the running UI (#2), virtual time (#3), one reactive model with no effects bookkeeping (#4), a local single-decider layout (#5), latest-wins async (#6), and docs built for one cold read (#8). It is weakest where Part 1 put the loop-collapsing and state-enumerating parts of verification (#2's audits, #9), and it carries two costs that Part 1 didn't anticipate:

- a static analysis that refuses some correct code;
- an open, inherited namespace that bare names resolve through.

### 2. What Declare gets right, with evidence

#### 2.1 The checker really is the reviewer, and its messages are written for the reader who acts on them

This is Declare's strongest result, and the evidence for it is consistent across agents and briefs:

- **RealWorld:** seven fix-and-recheck rounds to a clean boot for about 900 lines, and "no runtime exceptions at all".
- **Presentify:** "the first real compile needed about ten fixes, not fifty", and compiler refusals took about 4% of its effort.
- **Ledger:** "diagnostics name the fix nearly every time, and … the fix was nearly always right."

The messages do what Part 1 asked for. They give the fact, the rule and the fix, and they name the false friend:

```
Text has no attribute 'color' — the CSS instinct: text color is 'textColor' …
'?' after a type is the declaration's shorthand … a body is TypeScript, so write string | null
a datapath is a place in declared data, and a literal is in none … Declare the records as data
  and point there: 'items: Dataset [ contents = { … } ]' … — 3 sites, also on lines 448, …
```

`declare-help borderWidth` answers an *absence*: "the CSS instinct: a border is `stroke = …`". Part 1 proposed a synonym table of other frameworks' names. Declare has one in practice, though not complete: `declare-help onPress` returns "no entry" with no pointer to `press()`.

Verify is cheap enough to use after every edit: median 2.3–7.4 seconds per call, with all independent errors reported in one pass. Rung 3 can run without a browser, which makes "compile, then think" a fast inner loop.

Some warnings found real bugs before anyone ran the app. DECLARE4023 (`rowIndex` read by a non-replicated child, "would have been a silent bug in most frameworks") and DECLARE4031 (a key handler that replaces the control's own key handling) both did. That matches Part 1's rule that warnings must be ones an agent should act on.

#### 2.2 The reactive model removes the bug families Part 1 worried about most

There is no `useEffect` analogue, no dependency array and no render. Derived values refuse writes. Every handler's writes land in one settle. In the code I read, and in the reviewer's reading of 7GUIs, this removes several bug classes:

- **Feedback loops.** The Temperature converter loop bit MobX-Auto and ReactFX. In Declare, assignments happen in handlers, not in constraints.
- **Forgotten redraws.** JavaFX has them; Declare's `draw` re-runs on invalidation.
- **Stale or duplicated derivations.** React's Flight Booker computes validity twice.

The independent 7GUIs reviewer ranked Declare first or tied-first on error proneness in every task. On correctness against the original task text, it found Declare the only one of seven implementations meeting all seven tasks. That comparison is of an agent working from a fuller brief against human teaching samples, so it is not like-for-like. Still, the specific bugs it found in the others (index-based selection under filters, timers that don't resume, wrong strictness on date comparisons) are exactly the stale-state and two-sources-of-truth bugs the model is designed to prevent.

The async model is a quieter win. A `DataSource` whose `url` derives from state gives latest-wins without any code: a newer fetch supersedes an older one, and the old value stays while the new one loads. The Ledger agent wrote no code for "an answer for filters since replaced is never shown". The RealWorld agent got refetch-on-revisit "without any code of mine… it fell out of the model". Part 1's `resource` design had the same semantics and more ceremony.

#### 2.3 Layout's single-decider rule is a real model, and the boot rung is a real oracle

"One decider per value" is the idea Part 1 reached for with "constraints down, sizes up, parent places". Declare states it more sharply and enforces it at runtime: a child that states what its layout decides is refused, and the message names `ignoreLayout`. Agents internalise the rule. Venue 20 called it "the real model, and once internalized it's good", and RealWorld said it "felt like a real idea rather than flexbox with new names". The trend shows it: Venue's first-boot hidden checks went from 2/11 to 11/11 once the layout chapter was rebuilt.

The boot rung's layout findings are what Part 1's §4.3 "audits" asked for, and they work. Ledger's agent called them "a real test oracle, not noise": 21 findings at 1024 wide, every one a real bug, plus phone target sizes. The message form is good:

> `app.header.0's children need 404 across and it has 328, so app.header.0.links runs past its end. Let a child give room up (shrinks = true), take what is left rather than the whole (flexes instead of width = 100%), or let app.header.0 scroll or clip.`

That is the view, the numbers, and three remedies.

#### 2.4 The verification toolchain is close to Part 1's design, and better in several places

Part 1 matches:

- **Virtual time.** `drive.wait(6000)` takes a fraction of a second, and `settleMotion` runs springs to rest frame-exactly.
- **Real input with hit-testing.** A press on a covered view fails and names what covers it. Scrolling happens by native swipes, not by writing offsets.
- **Accessibility queries.** Role-and-name locators double as accessibility checks.
- **A textual view of the tree.** `--outline` and `--semantics` print geometry and the accessibility tree as text.
- **Reads.** `--read` reads values from the running program.

Where Declare's choices are better than mine:

- **It reuses Playwright's locator API** instead of inventing a drive language, as Part 1 did. Agents already know `getByRole(...)` and `toHaveText(...)`, so this recruits a strong prior, which Part 1's own principle #7 says to do.
- **`expect.request` lists every request the program sent.** The Ledger agent called it "the single best debugging aid". It is how that agent found that Tab never reached its cell editor: the PATCH simply never arrived. Part 1 had a fake server but no assertion on outbound traffic. Asserting on what was sent is a better oracle for data apps than inspecting UI state.
- **Coverage is reported.** Verify lists "the program's classes the boot never built — screens that appear only after data or a change of state — which it could not check", and R5 repeats this for classes no script reached. That honesty about blind spots is something Part 1 lacked.
- **Schema samples at boot.** Each `DataSource` with a `schema` is fed a conforming sample, so screens that depend on data are exercised at rung 4 with no service. This is a lightweight version of Part 1's auto-fakes.
- **"A script asserted nothing" is itself a failure.** This guards directly against the declare-done-without-checking failure.

#### 2.5 The library covers the expensive middle of business UI

`Table` handles multi-select, Shift-click, Space, virtualisation of 4,171 rows and arrow travel. `Form` handles field-addressed server refusals and focuses the first problem. `Combobox`, `Popover`, `Sheet`, `Toast`, `Shortcuts` and `MenuBar` complete the set, and menu records double as the shortcut table.

Ledger's agent judged Declare's `Table` a better fit than TanStack or AG Grid for its brief. It said `Form` "was the best surprise of the build", and that overlays "worked first time". Subclassing `Control` gives focus, Enter and Space, disabled-aware hover and pressed states, and roles: "the big win". This is a large part of why Declare programs are 2.5–3× smaller than React's, and why the React Ledger needed 19 npm packages.

#### 2.6 Decisions where Declare is better than my Part 1 design

- **TypeScript inside the braces.** Part 1 agonised between a new language and a TypeScript DSL and leaned toward a new surface. Declare splits at exactly the right seam. Structure, reactivity, layout and data binding get a small new notation the compiler owns. Logic is plain TypeScript, riding the largest corpus there is, and it is type-checked. The evidence is that agents rarely err in the TypeScript and often in the structure. That is the right place to spend novelty.
- **Identity inferred from `id`.** Part 1 made keys mandatory. Declare infers identity from the `id` field and lets `key = :email` override it. That costs no ceremony in the common case, and I found no eval where it went wrong.
- **`location` and `waypoint` instead of a router.** "Would you hand the value to a stranger? Yes → `location`. No, but Back should undo it → `waypoint`." That is a cleaner model than any router I would have specified.
- **States as reversible override bundles,** so "set on enter, forget to unset on exit" can't be written. Part 1 had nothing this good for modes.
- **Motion as a first-class part of the reactive core.** `Spring` on an attribute, `TweenLayout` for arrangement changes, and animating a few geometry scalars that everything else reads. Part 1 treated motion as decoration. Presentify's agent got the editor growing out of its card from one spring, and the rail's reorder glide for free.
- **The eval discipline.** Hidden checks run by accessible role against service state, every refusal audited against the runtime, timestamps preferred over self-report, and findings fed back as fixes to the platform. Part 1's §10 sketched this. Declare actually does it, and it is the reason the claims in this essay can be checked at all.

### 3. Where Declare falls short, with evidence

#### 3.1 A large fixed onboarding cost, and the skipped-chapter tax on top of it

The mandatory first read is about 50k tokens: declare.md at ~21k, four guide chapters at ~70 KB, the to-do app at about 850 lines, and the skill itself at 28 KB. It costs 4.3–9.0 minutes of every run. On a 16-minute Cadence run that is 30–40% of the time. On RealWorld it is about 9 of 19.3 minutes (≈2.5 reading and ≈6.5 planning, per the report), and it is most of the gap to React's 8.8.

The project's own experience is that cutting this read makes results worse. I take that as established. Cutting the read is not the fix.

The second cost is what agents *don't* read. Every account I read names a skipped chapter that later cost it:

- Ledger skipped 03 (constraints) and met DECLARE7001 repeatedly.
- RealWorld skipped 16 (collections) and met `exists` instance lifetime, its "costliest late fix".
- Presentify skipped 08 (controls) and never adopted `ChoiceControl`.
- Venue 20 skipped 07 (scrolling) and chose panes against the model.

The skill tells agents to "stop reading" after the core, and they do. The knowledge they need then has to come back through the checker, and it does so only partly: DECLARE4026 taught `ChoiceControl` well, but nothing taught `exists` lifetime.

There is also a symptom in the timing files. **Model time after a `declare-help` call is large**: 7.05 minutes over 15 calls in Ledger, 7.22 minutes over 17 in RealWorld, 5.30 minutes over 9 in Cadence 30, with medians up to 33 seconds. That is more than after verify. Help returns a member list. The agent then has to work out how to use it, and sometimes goes on to read library source:

- `Sheet` scrolling is described only in `--all`.
- Theme tokens: Presentify opened `sanfrancisco.declare`, though a hint pointed to `declare-help "theme tokens"`.
- `FormProblem` has no entry.
- `declare-help accessibility` doesn't list the `accessibility*` attributes; RealWorld grepped `runtime/src/view.ts` instead.

Part 1 treated reading library or runtime source as a documentation gap, and the project's own memory says the same.

#### 3.2 Static dependency analysis refuses correct code, and that shapes programs

DECLARE7001 appears in the diagnostic list of **every** run's timing file: Ledger 15 times, Murmur 6, 7GUIs 4, Presentify 3, Cadence 2–3, RealWorld 2. Guide chapter 03 says "in practice the rule rarely bites". The evals say it bites in every app, though cheaply each time. Ledger's three instances took under a minute in total by timestamp.

The measured time cost is small. The cost to the code is not. To get past 7001, the Ledger agent:

- moved chart lookups *out of methods and into a `script` file*, which is exactly the opaque region the drift check says to keep small;
- hoisted a ternary out of a call;
- named intermediate totals only to satisfy the analyser.

Each time, the analysis pushed code away from the model the language teaches.

The analysis also produced the run's most confusing failure. A program method named `split()` made the analyser treat `iso.split(…)` inside library `DatePicker` code as a call it couldn't follow, and the refusal pointed into `library/datepicker.declare:366`. The cause was fixed after the run. The class of failure is structural, though: whole-program analysis that crosses into library code can produce library-located errors triggered by user code. An agent can't debug those, because the cause isn't where the message points. And a type error elsewhere hides 7001 entirely, so bisection gives false negatives.

Then there is the paradigm limit the 7GUIs reviewer named as Declare's main weakness. For dependencies that are data, like a spreadsheet's formulas, compile-time extraction gives nothing. The agent wrote a propagation engine that MobX gets in six lines. The runtime already has a runtime-tracked path (`~dynamic`) for reads it can see but not name. So the refusal isn't technically forced. It is a policy choice to keep dependency sets visible in the text.

Part 1 ranked "make wrong programs unrepresentable" first. Declare shows the corollary that Part 1 missed: **a checker that refuses correct programs taxes the agent twice.** It costs a turn, and it bends the code into a less idiomatic shape.

#### 3.3 Name resolution through an open, inherited namespace

A bare name resolves outward through every enclosing bracket's *whole member set*, and that includes the members library classes inherit from `View`, `Control` and `ValueControl`. The consequences show up in nearly every account:

- **7GUIs.** A task's `selected` collided with `Table.selected`. The reviewer counted 144 defensive `classroot.` prefixes across the app and called it "a fragile-base-class exposure: a future library attribute could silently change what a bare name means".
- **Ledger.** `valueOf`, `blend`, `filter` and `key` were all taken. Script functions share one scope with the library's script code, and the agent renamed `parts` to `dateParts` straight into another collision.
- **Presentify.** `bounds` and `key` were taken, and "built-in method names silently shadow script functions".
- **The corpus.** `classroot.` appears 86 times in the 898-line to-do app.

The compiler catches most collisions, so the time cost is again small. But the design is the opposite of Part 1's principle #1. The vocabulary *the agent* writes is closed and checked, while the vocabulary *the agent's names compete with* is large, inherited, and not listed anywhere an agent reads. Several accounts asked for exactly that list.

#### 3.4 Runtime maturity: the agent can't debug the platform

Recent runs hit real platform defects at a steady rate:

- **Murmur 15.** `Media.playing` echoing play and pause about 67,000 times a second. That hang accounts for most of the run's 14.5 minutes of tool time, and it is why the run took 33.9 minutes rather than about 20.
- **Presentify 5.** An `<input>` swapped for a `<textarea>` reported a blur that ended edits.
- **Ledger 1.** The DatePicker analysis bug, and Tab never reaching a text field's `onKeyDown`.
- **7GUIs 1.** The reference says `onPointerMove` means hover, but the runtime delivers it only during a press, which caused the one app failure. Also `onDblClick` timing documented two ways, and `Table.selection` typed `any[]` though it can be `null`.
- **Cadence 30.** `fontFamily = null` passes typecheck and renders in Times.
- **RealWorld 1.** A `WrappingLayout` in a content-sized view stacking one child per row.

Each was fixed quickly once filed, which is to the project's credit. But agents meet these with no means of diagnosis. Their whole model of the platform comes from the docs, and a defect is precisely where the docs and reality disagree. An agent hitting a runtime defect behaves like one hitting a wall: it bisects, rewrites around it, or blames its own code. The Ledger report puts the platform's share of that run at about 5–6 of 46 minutes, and Murmur's was larger.

For a language whose pitch is "the toolchain keeps the text honest", every defect costs more than it would in React, where the agent can find the issue on GitHub or in training data.

#### 3.5 Verification: strong primitives, but the loop is still script-shaped and screenshot-shaped

The checking phase is where the time goes, and its composition is revealing:

- **A large share of check-phase failures are in the agent's own scripts.** Ledger: "about half of the failures were in my scripts", from locators matching two elements, guessed roles, the default window size, a no-break space in a regex, and non-idempotent runs against a live service. RealWorld's 74-step flow "caught no app bugs, because the app behaved", but it took several rounds to get right. Drive paths written with class names don't resolve, because anonymous children are numbered. That cost three rounds, which the agent estimated at 10–15 minutes (likely overstated, per §0).
- **Screenshots still find what findings don't.** RealWorld's three late bugs were the pager stacking, an early wrap, and the stale editor. All three were found by eye, none by a finding. Cadence met zero-width cells under `WrappingLayout [ columns = 5 ]` two runs in a row, also silent.
- **Fixed defaults hide defects.** One window per boot by default (1280×800, plus the phone with a flag). The Ledger agent's detail pane disappeared at 1024 because of its own width logic, and it found this through a debug print.
- **Real time can't be compressed for live services.** Murmur made 41 `declare-look` calls totalling 12.4 minutes, many waiting 26–60 seconds for a socket's next message. The program's clock is virtual; the service's clock is not.
- **There is no state diff between steps.** Each verify or look call boots fresh (Chrome is shared, so it is cheap) and re-drives to the state. The agent's model of "what changed since my edit" is rebuilt by reading new output in full.
- **Failure and empty states are not swept.** Schema samples cover the happy path. Nobody forced a `DataSource` to fail. RealWorld's remaining failures were failure paths: a refused deletion showing no error, and a 4xx on `/api/user` keeping the signed-in header. Ledger's "Not saved · Retry" was untested. Part 1's §4.3 point applies: an agent should not have to imagine edge cases to find them.

#### 3.6 Layout traps that still recur

The single-decider model is sound, but its defaults diverge from CSS priors in ways that recur:

- **A view is content-sized unless told otherwise, and nothing stretches without `align = stretch`.** Agents expect a field in a column to fill it (Ledger 17). They expect a wrapping row to wrap within its parent (RealWorld 13 and 14). They write `flexes` in a column that has no room to share (Ledger 16).
- **A scroller sized by its content "has nothing to scroll".** declare.md's own "grow to a cap" example pairs the cap with `clip`, which led the agent straight to the scroll version (Ledger 18).
- **Cycle messages don't name the attribute that closes the loop.** Murmur's `align = end` in a content-sized column took three runs to find.

Findings catch most of these, so each costs one loop rather than a silent bug. That is the system working. But it is the same few traps across runs, which says the defaults, not the agents, are the cause.

#### 3.7 Library gaps that become a quarter of a build

The agents name the same absences:

| Absence | Where it hurt |
|---|---|
| Chart kit | About a quarter of the Ledger build; `draw` plus transparent `Control` slots |
| Two-handled range slider | Ledger |
| Colour picker | Presentify |
| Undo/history for app data | Presentify (whole-document snapshots), Ledger |
| Sortable, drag-reorderable list | Presentify (computed the drop slot by hand) |
| Persistence | RealWorld ("not in the language yet") |
| File save | Ledger |
| Clipboard, full screen, unload warning | Presentify |

Each fell back to `script [ host = browser ]`, which by construction can't run on the Mac host. React agents reach for Recharts, Radix Slider, react-colorful, dnd-kit or zundo. The Ledger agent judged that React "would get to a good-looking first version faster, mainly because of charts and the range slider". Its judgement on accessibility is just as telling: in Declare the chart cost more to get on screen, and its accessible version cost less.

#### 3.8 Ceremony and noise in smaller places

- **Repetitive theme reads.** `provided("theme").token` appears 52–99 times per app.
- **Datasets for small arrays.** Replicating over a computed array of strings needs a named `Dataset` each time (RealWorld: three; Murmur: one per row's reaction chips).
- **Instance lifetime is easy to miss.** `exists` keeps its instance while the boolean holds. To rebuild per address, RealWorld used a one-record Dataset with `classFor`.
- **A lint that shows up everywhere.** DECLARE4025, which flags nested ternaries, appears in every run, 13 times in Ledger. It prompts end-of-run rewrites that change no behaviour.
- **Misleading hints.** "Motion still in flight" is appended whenever motion is pending, and sent the RealWorld agent the wrong way once.

#### 3.9 Expressiveness against Part 1's target

Against "any modern UI, desktop and phone, native hosts as well as the web":

- **Strong:**
  - custom visuals (`draw`), custom layouts (`place()`), motion, overlays;
  - data-backed apps against real services;
  - forms, with accessibility built in;
  - text, including rich-text *display* (`HTMLText`, `Markdown`, inline views in a line);
  - one program for phone and desktop on the web.
- **Partial:** native hosts. There is a Mac host. Phone native is "within reach", which means not built.
- **Absent:** a rich-text *editor*, and persistence.

The 7GUIs Cells task shows one more limit: in the reactive model, user-defined dependency graphs have to be written by hand.

### 4. Part 1 and Declare, side by side

| Part 1 principle | Declare | Verdict |
|---|---|---|
| 1. Closed vocabulary, checker as source of truth | TypeScript typecheck of every body, a names table with CSS and React hints, typed schemas, a link registry | Achieved, with two costs Part 1 missed: refusal of correct code (7001) and an inherited namespace |
| 2. Structural textual view plus audits | `--outline`, `--semantics`, `--read`, boot findings, unbuilt-class coverage | Mostly achieved. No diff, no state or size sweep, findings miss some wraps |
| 3. Determinism | Virtual program clock, settled motion, real input on real time | Achieved for the program. The service's clock is the remaining gap |
| 4. One reactive model, no bookkeeping | Constraints, settle, `afterSettle`, refused writes to derived values | Achieved, and better than Part 1's (states, the settle) |
| 5. Small local layout | One decider, layout objects, facts on children | Achieved. Defaults diverge from priors more than they need to |
| 6. Structured async | `DataSource`: derived url, latest-wins, lifecycle as state | Achieved with less ceremony. Failure handling not enforced |
| 7. One way; familiar where semantics agree | Mostly one way. TypeScript and Playwright reused | Better than Part 1 |
| 8. One cold read plus queryable reference | declare.md, the skill, `declare-help`, examples compiled by tests | Achieved, but the read is large and help answers names, not questions |
| 9. Collapse the loop into one call | Separate verify, look and assert scripts. Each call boots | Not achieved |
| 10. Compactness | 2.5–3× smaller than React | Achieved |
| 11. Accessibility as structure | `Control` roles, warnings, locators by role | Achieved (one miss: grid semantics in Cells) |
| 12. Typed escape hatches | `script`, `script [host]`, `DOMIsland`, `draw`, `Layout` | Achieved, though host scripts defeat portability |
| 13. Performance by construction | Static wiring, one-word virtualisation, a profiler with budgets | Achieved; not a factor in any eval |

Overall: Declare is a strong realisation of the design space Part 1 sketched, and better in its reactivity, motion, URL model and reuse of TypeScript and Playwright. Its deficits are concentrated in three places:

1. the *verification loop's shape*, which is script- and screenshot-shaped rather than session- and diff-shaped;
2. *runtime maturity*;
3. *two design choices that tax agents*: static refusal, and outward resolution through inherited members.

The evidence says it has reached parity with React on time and correctness for medium apps, with much less code and much more verification. It has not yet shown the step-change that its design makes plausible.

### 5. Proposals: changes for a major gain in efficacy

These are ranked by expected impact on speed × accuracy. The estimates are judgements anchored in the timing files, and I state each anchor. Many proposals cut against the project's present rules: a high bar for product changes, no new diagnostics, no convenience components. I flag where they do. The brief asked for out-of-the-box changes regardless of disruption, and some of these rules are, on this evidence, costing efficacy.

#### 1. Make tests part of the language, and make the loop a session with diffs

**Change.** Two halves.

**(a) Checks become a top-level Declare form that the compiler resolves.** Something like:

```declare
check "adding a task" [ device = phone,
    press "New task", type "Buy milk", key Enter,
    expect app.list has 1 row "Buy milk",
    expect request POST "/tasks" with { title: "Buy milk" }
    ]
```

The compiler checks paths, class names, roles and accessible names against the tree. It accepts class-name paths (`app.main.HomePage.list`) and resolves them, so a typo in a check becomes a compile error with "did you mean", not a five-second timeout. Playwright locators stay available as the escape hatch.

**(b) A persistent session.** `declare-verify --session s1` keeps the page alive and hot-reloads source while preserving state where the tree allows it. Each call returns compile results, new findings, and a **diff of the outline and semantics** since the last call. `declare-look` becomes `step s1 'press "Add"'`, which returns what changed. Explored steps can be saved straight into a `check`.

**Anchor.**

- The checking phase is 46–82% of each run (7.5 of 16.4 minutes in Cadence; 38.0 of 46.2 in Ledger).
- About half of Ledger's script failures were the script's own.
- RealWorld's path rounds, and Murmur's 41 looks, each rebooted and re-drove to a state.

**Estimate.** The checking phase falls by 25–35%: 2–3 minutes on a Cadence-sized run, 8–12 on a Ledger-sized one. Turns fall by 15–25%. Accuracy rises somewhat too, because checks become cheap enough to write for every brief scenario. Today Ledger left "edit date", "drag-select" and "Not saved · Retry" untested.

**Cost.** A grammar and resolver for checks. A session server with hot reload and state carry-over, which is the hard part. Diff rendering. Moving the corpus's `tests/*.mjs` across.

**Risk.** State-preserving reload can produce states unreachable from a fresh boot, so a final cold run must stay mandatory. The check form could grow into a second scripting language; keep it small and leave Playwright as the door.

#### 2. A runtime hardening campaign with invariants, plus blame that points at user code

**Change.** Treat "an agent met a platform defect" as the most expensive event in the system, and hunt defects before agents do:

- **Automated exploration across the corpus and every eval app.** Random real input (presses, drags, keys, wheel, focus moves, resizes, device switches, dark mode, fast data) under invariants: no hang, focus never lost to a removed view, no element echo loops, findings stable, DOM and canvas renderers agreeing on geometry and semantics.
- **Docs-versus-runtime conformance tests** generated from the reference. Every documented event, such as "`onPointerMove`: the pointer moved over the view", gets an executable claim.
- **Blame.** Any diagnostic or runtime error whose location is in `library/` or `runtime/` also names the user frame or declaration that triggered it. If none can be found, it says "this may be a platform defect" and shows how to file it.

**Anchor.** Murmur 15 lost about 13 minutes to one runtime echo loop: 33.9 minutes against the 18.2–21.2 of runs 12–14. Ledger had 2.8 minutes in the DatePicker report, plus a confusing bisect. Every run of the last ten days surfaced at least one docs-versus-runtime mismatch (the 7GUIs `onPointerMove`, Cadence `fontFamily = null`, RealWorld `WrappingLayout`).

**Estimate.** The median run loses 1–3 minutes less. The bigger gain is in the tail: the 30–60% blow-ups like Murmur 15 become rare. Accuracy improves wherever an agent today concludes "my code is wrong" and rewrites working code around a defect: Ledger replaced DatePickers with typed fields, and Murmur rewrote methods after the stale-title episode.

**Cost.** Building the explorer and invariants is substantial engineering, and so is triage; expect a flood of findings at first. There is no change to the language.

**Risk.** Low. This is the least disruptive item here and arguably the highest-certainty one.

#### 3. Sweep the declared state space at boot: sizes, schemes and data states

**Change.** Extend rung 4 from one boot into a **matrix that is on by default**:

- **Sizes.** Phone, a narrow laptop (1024), a laptop (1280) and wide (1440+), plus both sides of every width threshold the program reads (`app.width < N` and `ResponsiveLayout` plans are visible to the compiler).
- **Schemes.** Light and dark.
- **Text.** The largest text size.
- **Data states, for every `DataSource`.** The schema sample (as now), plus forced `failed`, empty, long strings, and, for write sources, a refusal and a 500.

Each cell runs the existing layout findings, plus three more:

- a content-sized `WrappingLayout` or a `columns` cell at zero width;
- contrast below threshold;
- **a write that failed while nothing on screen changed** (no text, no state, no announcement differs from the success-free baseline).

Report deduplicated findings with the matrix cell, as R5 already does with "after tap".

**Anchor.** Several defects were found only by eye or not at all:

- RealWorld's pager and early wrap (seen by eye);
- Cadence's zero-width cells in two consecutive runs (silent);
- Ledger's detail pane missing at 1024 (found through a debug print);
- RealWorld's failure-path misses, two of its five hidden-check failures (not found).

**Estimate.** The defect rate at "done" falls measurably on data apps. Of RealWorld's 5 failures, about 2 would have been caught. Murmur's 41 looks would drop somewhat, since agents look partly to check sizes and schemes. Wall time rises 5–15 seconds per full verify; incremental runs can sweep only what changed.

**Cost.** Moderate: the boot harness exists, schema samples exist, and the device switch exists.

**Risk.** Noise. Each new finding must meet the project's zero-false-positive bar on the corpus before it ships. This is the same discipline the existing findings meet, and it is the right one.

#### 4. Library: grow it in the places agents measurably build by hand

**Change.** Add, written in Declare like the rest of the library:

- a **chart kit**: bars, lines, areas, a comparison series, axes, a pointer card, keyboard travel across marks, a sentence per mark, and drill-down;
- a **range slider**;
- a **colour well and picker**;
- a **sortable list**, with keyboard reordering and announcements;
- **undo/history for Datasets**: one entry per settle, scoped, with labels for the menu;
- **persistence**: `persist = "key"` on an attribute or a Dataset;
- **host services** with portable implementations: save file, clipboard, full screen, a warning before unload.

This conflicts with the project's "no convenience components" rule. A chart kit or undo stack is not convenience in that sense: each is a recurring, hard, accessibility-laden piece that agents build at a quarter of a build's cost. And by falling back to `script [host = browser]`, they lose the Mac host.

**Anchor.** Charts were about a quarter of the Ledger build. Presentify built undo, a colour picker and drag-to-reorder by hand, and expected bugs in the last. RealWorld wrote a token mirror in a browser script. Ledger's agent judged React faster to a finished-looking first version "mainly because of charts and the range slider".

**Estimate.** On dashboards and editors, 15–25% of build time, plus a step up in accessibility quality, since the Ledger chart's accessible half was the part Declare made easier. On other briefs, little.

**Cost.** Large in design: an accessible chart kit is serious work. Each piece adds reference surface the agent has to find, which needs proposal 7.

**Risk.** Library bloat, and a chart kit whose look doesn't fit. Mitigate by making charts layouts and marks over data, in the same style as `Table`, rather than a configurable mega-component.

#### 5. Scoping reform: bare names stop resolving through inherited library members

**Change.** A bare name resolves to:

- the current node's declared and built-in members;
- then the declared (not inherited) members of the class being written (today's `classroot`);
- then the App's declared members.

It never resolves through an *intermediate library instance's* inherited members. When a bare name could resolve at two levels, the compiler gives an error naming both. Script functions get module scope per file, isolated from the library's scripts. `declare-help reserved View` (and `Control`, `ValueControl`) lists the names a declaration can't take, and declare.md gets that list as a one-paragraph table.

**Anchor.**

- 144 `classroot.` prefixes in 7GUIs, and 86 in the 898-line to-do app.
- Collisions in Ledger (`valueOf`, `blend`, `filter`, `key`, `parts`/`dateParts`) and Presentify (`bounds`, `key`).
- The reviewer's fragile-base-class finding: adding a library attribute could silently change the meaning of user code.

**Estimate.** A small time gain, perhaps one or two compile rounds per run. The larger gains are code that reads like the task without defensive prefixes (diffuseness), and a removed class of *silent* future breakage when the library grows. That second gain matters more if proposal 4 grows the library.

**Cost.** Disruptive. Every program changes meaning wherever it relied on outward resolution through library members. That should be mechanical: the compiler can rewrite each such use to an explicit path. A release with a migration step through `declare-changes`.

**Risk.** Some idioms read worse. A child reaching its enclosing control's `hovered` would now need `classroot.` or `parent.`. Measure on the corpus before committing.

#### 6. Replace DECLARE7001 refusals with runtime tracking as the fallback

**Change.** Wherever static analysis can't name a read, compile the constraint onto runtime tracking (the existing `~dynamic` path), so observed reads are recorded per run, as MobX and Solid do. Static wiring stays as the optimisation it already is, and verify's existing count ("351 of 460 constraints statically wired") stays as information. Two cases remain errors, because they are real errors rather than analysis limits: a constraint reading itself, and a script `let` read in a constraint. Library code is never refused because of a user program.

**Anchor.** DECLARE7001 appears in every run's diagnostic list (15 tool results in Ledger). It pushed Ledger code into `script` to avoid analysis, and its whole-program reach produced the library-located DatePicker failure. Cells needed a hand-written propagation engine.

**Estimate.** Measured time saved is small: about 1–2 minutes per run, since timestamps show these refusals are cheap. The quality gain is larger: programs stay in the idiom the docs teach, and one class of incomprehensible failure goes away. It also opens user-defined dependency graphs, so Cells could become cells with constraints.

**Cost.** A change of principle. "Dependencies are what the text says" becomes "mostly what the text says". Some runtime cost on the fallback path.

**Risk.** Observed-read tracking can miss dependencies on branches not taken in the first run. That is the standard dynamic-tracking caveat, and it is handled by re-tracking each run. A subtler risk: agents may write more opaque code if nothing refuses it. Keep a lint-level note listing un-wired constraints with their cost, not a refusal.

#### 7. Turn `declare-help` into a question-answering tool, and let diagnostics teach the skipped chapter

**Change.**

**(a) Help answers needs, not just names.** `declare-help "range slider"`, `declare-help "rebuild a view when the address changes"` and `declare-help "accessibility*"` search the reference, the guide's section headings, the skill's "What Declare handles for you" table, and the drift tells. They return the best two or three hits, each with its working example by default. Several names per call. Families listed. Every type the reference mentions gets an entry (`FormProblem`). The full prose stays one flag away (`--all`).

**(b) Teaching diagnostics.** When a finding or refusal matches a known costly gap, the message carries the ten-line before-and-after from the guide inline. Three examples:

- the first DECLARE7001 in a program carries guide 03's "What a constraint may read";
- a stale-looking `exists` instance carries the lifetime sentence;
- a content-sized scroller carries the `clip`-versus-`scrolls` distinction.

Teach once per program; afterwards, just the code.

**Anchor.** Model time after help is 5–7 minutes per run in Ledger, RealWorld and Cadence, more than after verify. Agents read library or runtime source when help fell short (Presentify themes, RealWorld `view.ts`, Ledger `table.declare`). Every account names a skipped chapter that later cost it.

**Estimate.** After-help model time falls by 30–50%, which is 2–3 minutes on the large runs, plus fewer late redesigns of the RealWorld-`exists` kind.

**Cost.** Moderate. The documentation model (`declare-model.json`) already holds the material; this is retrieval and presentation.

**Risk.** Inline teaching could bloat messages. Hold it to one paragraph, shown once per program.

#### 8. Make layout defaults match the priors where nothing is lost

**Change.** In a `SimpleLayout` along y, children stretch across by default, as CSS blocks and SwiftUI's `VStack` with `frame(maxWidth: .infinity)` usually do. `align = start` opts out. Today it is the reverse: content-sized unless `align = stretch`. A content-sized view holding a wrapping layout takes its parent's room instead of laying one child per row. A cycle report names the attribute that closes the loop.

**Anchor.**

- Ledger 17, the stacked Field not filling its column.
- RealWorld 13 and 14, two wraps in content-sized views, both silent.
- Murmur's `align = end` cycle, three runs.
- Cadence's zero-width cells.

The single-decider rule doesn't depend on which default is chosen.

**Estimate.** One or two fewer layout loops per run on form- and page-shaped apps.

**Cost.** Every program in the corpus that relies on content-sized children in columns needs `align = start` added, which can be done mechanically from a boot comparison. The guide's layout chapter is rewritten in places.

**Risk.** Medium. Changing a default can break visuals subtly. Pixel baselines (rung 6) across the corpus are the safety net, and they exist.

#### 9. Remove noise from the agent's loop

**Change.**

- Lint (DECLARE4025 and similar) is off by default under `declare-verify` and shown only in a `--review` pass at the end.
- The motion hint is appended only when the failed locator's target is actually moving.
- The verify window becomes part of every report header ("booted at 1280×800; R5 at 1280×800").
- `onPress`-style guesses get "did you mean `press()`".

**Anchor.** DECLARE4025 appeared in every run (13 times in Ledger) and drove behaviour-neutral rewrites at the end. RealWorld followed the motion red herring. Ledger found the window size through a debug print.

**Estimate.** Small: under a minute per run. It's cheap, and it keeps warnings meaningful, which matters for every other warning.

**Cost and risk.** Trivial and low.

#### 10. Longer horizon: expressiveness that agents can't build themselves

**Change.**

- A rich-text editor with a Declare API over a document model. This is already the project's stated direction.
- A phone host: iOS first, through the same drive vocabulary.
- A service clock: a fixture or proxy mode where `drive.wait` also advances the service's scheduled messages, so live-arrival flows don't cost real seconds.

**Anchor.** Murmur's 12.4 minutes of looks were mostly real-time waits for arrivals. For the editor and the phone host, the anchor is Part 1's expressiveness target rather than a measured loss.

**Estimate.** The service clock: 5–10 minutes on chat-like briefs. The editor and phone host are expressiveness, with no measured speed effect.

**Cost.** Large for the editor and phone host; moderate for the service clock.

**Risk.** Spreading a small team thin. These come after 1–3.

#### What I would *not* change

- **The notation.** No agent struggled with `[ ]` versus `{ }`. The accounts call it "quick to learn".
- **TypeScript inside braces.**
- **The constraint and settle model.**
- **The single-decider rule.**
- **`location` and `waypoint`.**
- **The mandatory first read.** The project has tested cutting it, and it got worse. The gain is in what arrives *after* the read (proposals 7 and 1), not in a smaller read.
- **The eval discipline.** I would extend it in one way. The hidden checks are near ceiling for both stacks, so they no longer separate them on accuracy. Add adversarial hidden checks for failure paths, unusual widths, long text, dark mode and keyboard-only use: the states Part 1 argued agents don't imagine. Measure the defect rate at "done" directly. That is the number on which Declare's design should show its advantage, and today's instruments can't see it.

### 6. Bottom line

Declare is the most serious attempt I know of at a UI language built for agents, and it gets the hard parts of the design right: a reactive model without effects, a layout model with one answer to "why is this here", fix-naming diagnostics, and a verification toolchain built on real input and virtual time.

On today's evidence, it delivers parity with React on time and correctness for real apps, in 2.5–3× less code and with much more self-verification. It has not yet shown a step-change in speed or accuracy. What stands in the way is not the language's core. It is:

- the shape of the verification loop;
- platform defects agents can't diagnose;
- the gaps where agents still build by hand;
- two design choices, static refusal and inherited name resolution, that tax every program a little.

Proposals 1–3 address the first two, and I would expect them together to move medium-app runs from parity to clearly ahead: on the order of 20–30% less wall time and fewer defects at "done". Proposals 4–6 address the rest, at the cost of breaking changes that the corpus's tooling is well placed to automate.

---

## Part 3 — Declare as a medium for crafted, continuous interfaces

*Written 2026-11-08, after Parts 1 and 2, in response to a statement of goal from Declare's author. The goal is not only to help agents build the same interfaces as everyone else, but to make **new and better** ones: interfaces marked by continuity and visual dynamism, expressed simply and at low cost, and best steered by a designer or design-minded engineer directing the agent. The calendar and desktop apps are the reference for the kind of craft meant.*

*What I studied for this part:*

- *`apps/calendar/calendar.declare` (930 lines), read whole.*
- *`apps/desktop/desktop.declare` (3,499 lines): its header, map, `DeskWindow`, the dock and the traffic lights.*
- *Both apps running through `declare-look`: still frames at rest and mid-transition (month → week, month → year, minimize to the dock, opening from the dock), plus the calendar on a phone in dark mode.*
- *Guide chapters 21 (motion) and 23 (animated arrangements), the headings and relevant sections of 17 (your own views) and 10 (touch), the `FocusRing` source, and the Inspector page.*

*I changed nothing in the repository, and every process I started has exited.*

---

### 1. What the two apps show

#### The calendar

**One surface, four views.** The calendar's four views (day, week, month and year) are one surface seen through a moving rectangle. Four sprung numbers (`c0`, `r0`, `nc`, `nr`) say which columns and rows of the month grid are in view. Every cell's `x`, `y`, `width` and `height` is a constraint that maps its grid slot through those numbers. A view switch is one assignment: `goMode` sets `mode`, the spring targets derive from it, the springs chase them, and 42 cells re-lay themselves in step. The frame I captured 180 ms into a month → week switch is not a crossfade or a scaled bitmap. It is a real layout. The anchor row has swollen to about 345 px, its neighbours are sliding out past the clip, and every label is still crisp and placed.

**Qualities morph too, not just geometry.** `blockness` is not a flag. It is `clamp(2 − nr, 0, 1)`, derived from the sprung row count. Each event reads it, together with `yearZoom`, through nested interpolation:

```declare-fragment
y = { lerp(lerp(26 + rowIndex * 20, :start / 1440 * parent.height, classroot.rowBlock),
           parent.height - 6, app.yearZoom) },
```

So a chip stacked in a month cell becomes a time block placed by its start time as its day grows, and then a 3-pixel dash in the year view. The fill colour, corner radius and opacity morph with it. The hour gutter opens by the same factor (`gutter = blockness * 52`).

**Year is the same surface, pulled back.** The current month's cells re-lay themselves into their mini's slot, so no bitmap is scaled and text stays sharp. The other eleven months sweep in around the shrinking board. The detail panel slides in on one spring and the grid narrows by the same value.

**Interaction stays live during motion.** Drag-to-reschedule works in every view, because `dayAt()` inverts the same mapping the cells use. All of this is about 930 lines, comments included.

#### The desktop

**Opening.** A window grows from the dock icon it launched from. An `Animator` drives `baseScale` from 0.15, with the pivot set at the launch origin.

**Minimizing.** A minimized window is not hidden. It *becomes* a dock citizen: its real `x`, `y`, `scale` and `cornerRadius` are blends, by `miniT`, between its free geometry and a slot computed from the same magnification wave the icons ride. My mid-flight frame shows the window part-way down while the dock is already widening a slot for it. The final frame shows a live thumbnail badged with its app's icon.

**The dock.** Magnification is layout, not paint, so neighbours really are displaced. Each icon springs toward a target computed from the raw pointer, so the swell stays smooth between coalesced pointer events.

**The small things.** The focus ring flies to each control and reshapes to its silhouette. The tilt and zoom easter eggs are two springs on every window.

#### What the apps also show

The apps are impressive, and I don't want to undersell them. But they also show some things the author's framing leaves implicit.

**The idiom is simple; the craft is not.** In the desktop's code, the craft sits in decisions the language makes *expressible* but not *automatic*:

- a root-coordinate walk so a closing window returns to an icon that may have moved;
- animator completion handlers that check they "actually arrived";
- a `paintsIn` hand-off between layers mid-journey;
- a face rendered at 96 px and GPU-scaled, so magnification never re-rasterises;
- a spring stiffness of 1300 chosen to beat pointer coalescing;
- a pivot that changes when a window is tilted.

This is expert work. The calendar is far simpler, and its mechanism really is "a handful of declarations", as chapter 23 says. Even so, its geometry is hand-written interpolation arithmetic, `lerp`, `mix` and `clamp` defined in a `script` block.

**The endpoints and in-betweens have unaudited seams.** At rest in week view, a strip about 25 px tall of the *previous* week's cell bottoms shows under the bar, above the weekday header. On a phone in day view, the next day's column peeks in at the right edge. Both are rows and columns "sliding out past the clip" that never fully leave. Mid-transition to year, weekday labels ("Sun", "Tue") ghost across the incoming minis. On the phone, boot reports 22 controls under 44 × 44, and the day view has no swipe between days. The flagship also carries a bug-level warning (DECLARE4031: `Ev`'s `onKeyDown` replaces `Control`'s key handling).

None of these is serious. Together, they say the reference apps have been crafted for the desktop at rest and in motion as the author watched them, not audited across frames and devices.

**"Low cost" is cost per idea, not one-shot cost.** The calendar has 39 commits since July and the desktop 95. Some of those are language migrations. The craft accumulated over many steered iterations. That is how craft is made in any medium, but it means the claim to test is *"each idea is cheap to express and revise"*, not *"an agent produces this unprompted"*.

---

### 2. (a) How the goal changes my reading of Part 2

Part 2 judged Declare on conventional apps against React, on time and on hidden functional checks. That yardstick was the one I was given, but it measures the wrong thing for this goal. Matching React's time on a CRUD app is the *floor* Declare must clear, not the result it is built for. Read again with the goal in mind:

#### Criticisms that weaken

- **The time parity is acceptable.** If the language's value is in the continuous version of an interface costing about what the discrete version costs, then equal time on discrete briefs is the right floor. The one brief that asked for motion as a requirement is the telling one: Presentify's round 1 ("motion and continuity throughout"). Declare built it in 37.3 minutes against React's 35.2. The agent counted polish and secondary screens at 3–5% of its effort, and called the editor growing out of its card "one `Spring` … the best moment of the build". So motion requirements arrived at no measurable time premium. That is weak but real evidence for the central claim.
- **The static-analysis criticism partly reverses.** Part 2's proposal 6 asked for runtime dependency tracking to replace the DECLARE7001 refusals. With continuity as the goal, static wiring is the opposite of incidental. Every frame of the calendar's zoom re-evaluates hundreds of constraints that read four springs, and statically wired dependencies make each read a plain field access. Turning the default toward dynamic tracking would tax exactly the path the language exists to make cheap. I now keep my criticism of the *refusals*, especially those triggered from library code. But I would alter the proposal: fall back to runtime tracking only for constraints that are off the motion path, and have the profiler flag any dynamic constraint that a spring reaches.
- **The library-breadth criticism shifts.** I still think charts, range sliders and undo matter for business apps. But for this goal the missing library pieces are of a different kind (§3), and Ledger's chart episode becomes evidence for that kind. The agent animated a chart between datasets by driving a 0–1 `Animator` and blending arrays in a constraint, because "Spring takes one scalar". The gap was not a chart component. It was springs over structured values.

#### Criticisms that strengthen

- **Verification is blind to the middle.** Every tool settles motion by default. `declare-look` runs motion to rest after each action. R5 asserts after `settleMotion`. Layout findings run when the program comes to rest. Chapter 23's discipline is "design the endpoints; audit the middle", and the toolchain audits only endpoints, and only at one or two sizes. The calendar's week-view strip and phone peek, which are endpoint seams, slipped through. The year transition's ghosted labels, which are middle seams, can't be checked by any current tool. For a language whose distinction is the middle, this is the largest gap. Part 2's proposal 3 (sweeps across states) must extend to sweeps across *time*.
- **Runtime maturity matters more.** Craft lives where Part 2's defects lived: interruption, input during motion, focus moving across view swaps, media under constraints. Presentify's lost blur and Murmur's play/pause echo are the kind of defect that breaks the continuity promise exactly where people notice.
- **Constraint-dense code makes scoping and verbosity worse.** Craft code is mostly constraints, many of them interpolations. `classroot.`, `provided("theme").` and nested `lerp` dominate the calendar's `Ev` and `Cell`. A designer reading the code (the person the author says should steer) meets arithmetic, not intent.
- **The layout/scene divide matters more.** Both apps get their craft by *leaving* the layout system: hand-placed scenes in which geometry is formulas over springs. `TweenLayout` exists for layout changes, but it is duration-based with `retarget`. Ordinary layouts (lists, grids, forms, which most of any app is) don't get the calendar's continuity without a drop into hand math. Part 2 treated "placing everything by hand" as drift. For crafted scenes it is the sanctioned and documented route, and that is a sign the layout system lacks a continuous mode of its own.

#### Proposals from Part 2: drop, alter, reorder

| Part 2 proposal | Now |
|---|---|
| 1. Checks in the language; a session with tree diffs | Keep, and alter: the session needs a **timeline** (scrub, film, annotate), not only diffs between states. It is the base for proposals 1 and 2 below. |
| 2. Runtime hardening campaign | Keep, near the top. Add invariants about motion: an interrupted transition never jumps, input mid-motion lands where it is seen, no focus loss across swaps. |
| 3. State sweeps at boot | Keep, and extend into time (new proposal 1). |
| 4. Library: charts, range slider, undo… | Lower for this goal. Replaced in priority by continuity primitives (new proposal 3). Charts stay, as charts that animate between data. |
| 5. Scoping reform | Keep. It also helps the designer read constraint-dense code. |
| 6. Runtime tracking instead of 7001 refusals | Alter: fall back only off the motion path; the profiler flags dynamic constraints on hot paths. Lower priority. |
| 7. `declare-help` answers questions; diagnostics teach | Keep. Add a motion pattern catalogue to what it can answer. |
| 8. Layout defaults closer to priors | Lower. It is orthogonal to this goal. |
| 9. Less noise in the loop | Keep. Cheap. |
| 10. Phone host, rich-text editor, service clock | The phone host moves up: craft on a phone is half of "modern UI", and the flagship isn't yet finger-grade. |

---

### 3. (b) Declare as a medium for crafted, continuous UX

#### What it makes cheap that others make expensive

1. **Arrangement as a function of a few sprung scalars.** This is the core idea, and nothing else I know expresses it as directly. In React with Framer Motion, a change from A to B gets layout animation (FLIP) and `layoutId` shared elements cheaply. But a *parametric* surface, where every frame is `f(sprung values)`, hit-testable, accessible, and draggable mid-flight, means leaving React's render model for `useMotionValue` and `useTransform` chains. Those don't participate in layout. SwiftUI's springs and `matchedGeometryEffect` are closer in spirit, but they animate *transactions*: the endpoints are layouts, and the middle is an interpolation of rendered frames, not a layout you can query or drop onto. In Declare the middle *is* the model. The calendar's drop target is computed by the same inverse mapping at any point in the zoom. Its event chips are focusable only "inside the rectangle the view is heading for", which is reasoning about the destination while in motion. I know of no mainstream framework where that is ordinary code.
2. **Qualities derived from motion.** Fill, corner radius, opacity, gutter width and text placement all derive from the same scalars (`blockness`, `yearZoom`, `miniT`). So appearance morphs *with* geometry instead of snapping at a threshold. Chapter 23 states the principle well: "A managed flag flips; a derived scalar flows."
3. **Interruption costs nothing.** A spring's target is a live constraint, so redirecting mid-flight is just a new target. `arrived` and `running` are facts to sequence from, not callbacks. Reversible `State`s can't leak. Most motion bugs in other stacks (stuck exit animations, queued tweens, completion handlers firing after a reversal) can't be written here.
4. **Hand to spring hand-off is one idiom.** Write the value and its target together while the finger drives; write only the target on release. Gesture claims make touch drags coexist with scrolling, and `onHold` lifts the calendar's ghost before the finger moves.
5. **Motion is accessible as well as visible.** The focus ring flies and reshapes to each control's silhouette. Every intermediate state is still a semantic tree, so keyboard and screen-reader users are inside the same continuous interface rather than beside it.
6. **Readable at the right level, when it works.** The calendar's header comment explains the whole app in five sentences, and the code really is those sentences. That is rare, and it is what makes steering by a non-programmer plausible.
7. **Instruments exist.** The Inspector can freeze the app's clock, advance it one frame at a time, show what a spring is driving, and accept live constraint edits. Assert scripts use a driven clock, so motion is deterministic under test.

#### Where it still falls short

1. **The craft vocabulary lives outside the language.** `lerp`, `mix` (colours as `0xRRGGBB` numbers blended channel by channel), `clamp` and the phase arithmetic all live in `script`:

   ```declare-fragment
   opacity = { clamp((app.yearZoom - 0.5) / 0.3, 0, 1) }
   ```

   That line means "fade in over the middle of the zoom". There is no word for a phase, a stagger, an easing applied to a derived range, or interpolation between two colours or rects. Each crafted app rebuilds them, and the meaning a designer would recognise ("the labels lead, the minis follow") is buried in arithmetic.
2. **Springs are scalar only.** A rect, colour, point or array needs one spring per component, or a 0–1 driver plus hand blending (the Ledger chart, the desktop's `miniT`). I found no velocity hand-off from a released gesture into a spring, no decay or momentum, and no rubber-banding. The strip example in chapter 21 snaps by rounding, not by fling velocity.
3. **No primitive for continuity across the tree.** "This view becomes that view" works when both are the same object on one surface: the calendar's trick, and a good one. When the two views live in different subtrees, the program must do root-space arithmetic by hand. Examples are a thumbnail in a grid becoming the hero of a detail page (the birds app does it by hand) and a window returning to an icon that has moved (the desktop's `beginClose` walk). That is the most-requested pattern in crafted UIs, and it is expressible but not cheap.
4. **Ordinary layouts aren't continuous by default.** `TweenLayout` glides between arrangements on a duration and can be retargeted. But it isn't driven by a spring with velocity, and an arrangement can't be a parametric blend of two `place()` results driven by a scalar. The calendar idiom therefore requires leaving the layout system.
5. **Nothing audits frames.** This is covered in §2. The seams I found in two afternoon minutes of looking (the week strip, the phone peek, the ghosted labels) are exactly what a frame audit would find.
6. **Phone craft lags desktop craft.** The flagship calendar on a phone has under-size targets, no swipe paging, and edge artifacts. The desktop is desktop by design. "Desktop and phone" craft parity isn't shown yet.
7. **Agents rarely reach for continuity unprompted.** The eval apps I saw (Cadence, Presentify) are well-designed but conventional in structure. Their motion is where the brief asked for it. The language makes continuity cheap to *express*. It doesn't yet lead an agent to *propose* it, and that is the designer's role in the author's framing. Nothing in the loop gives the designer purchase yet.

#### How the designer–agent loop works today, and how it could

**Today.**

1. The designer describes intent in prose.
2. The agent writes constraints and springs.
3. The designer opens the app in a browser, feels it, and perhaps uses the Inspector to freeze a frame or live-edit a stiffness or a constraint.
4. The designer tells the agent in words ("the panel feels late", "the labels flash during the zoom").
5. The agent reads the words, re-reads its code, and guesses which numbers to change.

The loop has three losses:

- **Critique of motion is temporal and spatial, and words lose both.** "The labels flash" doesn't say which labels, when, or at what size.
- **The agent can't see motion.** `look` settles by default. The agent can take timed stills with `--no-settle --wait`, as I did, but nothing tells it which moments matter or turns a run of stills into findings.
- **Tuning doesn't round-trip.** Inspector edits are "temporary … there is no write-back to source". A value the designer found by hand has to be re-dictated, and the agent has to find the line.

**What it could be.**

- **A transition is a named, scrubbable object.** Here `month→week` is the change of `mode` from month to week, and the scalars it moves are known statically: the springs whose targets read `mode`.
  - The designer scrubs it, or plays it slowed down, in the Inspector.
  - The designer pins a comment to a moment: "here, t ≈ 0.4, these labels shouldn't show".
  - The agent receives that pin as structured input: the frame image, the view paths under the pin, their attribute values at that frame, the constraints feeding them with source locations, and the scalar values.
- **Tuning writes back.** Stiffness, damping, durations, phase ranges and the numeric literals inside sprung constraints are knobs. "Keep" turns a knob's setting into a source diff that the agent can accept, reformat and test.
- **The agent can see motion.** A film strip (a contact sheet of N frames per transition, at chosen sizes) with per-frame findings attached gives the agent the designer's view, in a form it reads accurately.
- **The vocabulary is shared.** If the language has words for phase, lead and follow, stagger, overshoot and continuity keys, then the designer's critique maps onto a construct, not onto arithmetic. Then "make the minis follow the board by a beat" is a one-token edit the designer can verify by reading.

---

### 4. (c) How the evals should change

The current instrument (craft runs scored by hidden functional checks, timestamps, and comparisons with React) is excellent at what it measures, and Part 2 relied on it. For this goal it should become a regression guard. Five new instruments would measure the goal itself.

1. **The cost of continuity, as a difference.** Same brief, two passes, in each stack:
   - Pass A builds the discrete version.
   - Pass B is a follow-up: "now make these five changes continuous". Examples: a card grows into its page; a list reorders by travelling; a mode change is a morph; a sheet follows the finger and flings; a selection's handles follow what they hold.

   Measure the minutes, turns, lines changed and regressions *in pass B only*. Compare Declare against React with Framer Motion (the strongest web competitor) and SwiftUI. This tests the author's central claim directly: continuity costs about what discreteness costs. The habits riff harness (`evals/modes/`) already supports multi-turn follow-ups.

2. **Mechanical continuity checks, hidden like today's.** These run against the driven clock, which already exists:
   - **No jumps.** Trigger a transition, sample every frame, and bound each tracked element's per-frame displacement relative to the spring's own velocity.
   - **Interruptibility.** Reverse at 40%. The element must turn around from where it is (no jump), and arrive where it began.
   - **Object permanence.** An element the brief names (an event, a photo, a window) keeps one identity: a continuous bounding box from its source to its destination.
   - **Valid at every frame.** Per sampled frame: no interactive element covered by another, no focus lost, no unexpected clipped text, and the accessibility tree still names what is on screen.
   - **Input during motion.** A press or drag made mid-flight lands on what is seen there.
   - **Clean at rest.** After settling, nothing that left the view remains partly visible. This catches the week strip.
   - **A frame budget.** p95 frame time during the transition, at least on a reference machine. `drive.profile` exists.

3. **Judged craft, blind.** Film strips or video of the same transitions from each stack, judged blind by a design panel (human, plus a model panel checked against the humans) on a short rubric:
   - Does motion carry meaning, showing what came from where?
   - Is it interruptible in feel?
   - Is it consistent?
   - Is it restrained?

   Report agreement between judges, not just scores.

4. **Steered sessions with a design persona.** A simulated designer (and sometimes a real one) gives five to eight rounds of critique: motion feel, hierarchy, a moment in a transition. Measure:
   - the rounds needed to reach the designer's acceptance;
   - the time per round;
   - whether each critique was addressed without regressions, judged by the continuity checks above.

   This measures the loop the author says the language is for. It is also where the tooling proposals in §5 would show their effect.

5. **Ceiling tasks.** Reproduce a known high-craft interaction from a video and a designer's notes:
   - the calendar's zoom;
   - minimize into a slot;
   - a photo grid opening to full screen with drag-to-dismiss and velocity;
   - an iOS-style sheet with detents;
   - Lightwell's wall.

   Score fidelity to the reference with the mechanical checks, plus a blind comparison against the reference recording.

Two cautions carry over from Part 2:

- Prefer timestamps to self-report.
- Keep the hidden checks from saturating. Today's functional checks sit at 100% for both stacks, which tells nothing apart.

---

### 5. (d) New proposals, ranked, aimed at this goal

These are ranked by expected effect on what the author names: crafted, continuous UX at low cost, steered by a designer through an agent.

#### 1. Time-aware verification: film strips, frame audits, generated interruption tests

**What.**

- **Film strips.** `declare-look --film "mode=week" --frames 12` (or a `drive.film(fn)` in scripts) runs a change on the driven clock. It returns a contact sheet: one image, N labelled frames. With it come per-frame findings: interactive overlaps, covered targets, clipped text, focus lost, tree-name changes, and per-element displacement continuity.
- **Rest audits.** After every settle, a check that whatever left the view has fully gone (it isn't partly visible at an edge).
- **Generated interruption tests.** The compiler knows each `Spring`'s target expression and the attributes it reads. From those, the toolchain derives "transitions" (the writes that move a target) and generates reverse-at-40% and input-mid-flight tests for each.
- **Matrix runs.** Film strips run in Part 2's size, scheme and device matrix.

**Why.** This is the only proposal that lets the agent *see* motion, in a form it reads accurately: one image plus text findings. It also closes the gap that let the flagship's seams through. Every crafted app gains a safety net without writing tests.

**Effect.** The endpoint and middle seams of §1 (the week strip, the phone peek, the ghosted labels, interruption bugs) are caught before a designer sees them. I estimate this removes one or two designer rounds per crafted feature, and that agents will try more ambitious continuity once trying it is safe.

**Cost.** Moderate. The driven clock, the layout findings and the screenshot pipeline exist. Generating tests from springs needs a little compiler support.

**Risk.** False positives mid-motion, where overlap is often intended. So scope frame findings to *invariants*: focus, targets, accessibility, continuity. Report geometry overlaps mid-flight only for interactive elements, and keep everything stricter for rest states.

#### 2. A designer's surface: scrub, slow, pin and tune, with write-back

**What.** Grow the Inspector (itself a Declare app) into the designer's half of the loop:

- every transition listed by name (from the analysis in proposal 1), with a scrubber over its scalars and 0.1×–1× playback;
- knobs for spring stiffness and damping, Animator duration and curve, and the literals inside sprung constraints (the 0.5 and 0.3 of a phase, the 52 of a gutter);
- **pins**: a comment attached to a moment and a view, exported as a structured note the agent reads (frame image, paths, values, source locations);
- **write-back**: "keep these values" produces a source diff for the agent (or the designer) to apply, format and test. That retires "there is no write-back to source" for tuning.

**Why.** The loop's three losses (critique in words, an agent blind to motion, tuning that doesn't round-trip) are all here. Tuning motion is the part of craft that most needs a human hand. It is where words fail worst ("a bit snappier"), and with write-back it becomes direct.

**Effect.** I estimate it halves designer rounds on motion tuning. It turns most of the rest into precise, anchored requests the agent resolves in one turn. This is the multiplier on the author's "designer steering an agent".

**Cost.** Substantial UI and runtime work: transition identification, a scrubbable clock (freeze and frame-step exist), source mapping for literals, and diff generation. Formatting is safe because `declare-format` owns layout.

**Risk.** Knobs on literals can tempt designers into pixel-pushing a structure that's wrong. Pins that name the constraint help the agent fix the structure instead.

#### 3. A continuity vocabulary in the language and library

**What.** Replace the hand arithmetic with words for what the arithmetic means, and remove the old spellings so there is still one way. Proposal 4 then gives the designer global control over these values:

- **Typed interpolation.** `blend(a, b, t)` over numbers, `Color`, points, rects and records of them. Colours stay typed (no `0xRRGGBB` channel maths).
- **Phases.** `phase(t, 0.5..0.8, ease = cubicOut)`, with `lead` and `follow` and `stagger(i, n, spread)` for replicated views.
- **Structured springs.** `Spring [ attribute = frame, to = { … rect … } ]` over rects, colours and arrays. Velocity hand-off from a gesture (`fling(e.velocity)` on release), `decay` for momentum, `snapTo` points, and rubber-band limits.
- **Continuity keys.** `continuity = "photo-17"` on two views in different subtrees. When one leaves and the other arrives in the same settle, the runtime flies the arriving view from the leaving view's root-space frame, by a spring, interruptibly. This is what the birds app and the desktop do by hand. It is shared-element transition done the Declare way, because the destination stays a real layout.

**Why.** It shrinks craft code, and it makes intent *readable* to the designer who is meant to steer. It removes whole classes of hand-math bugs: root-space walks, completion races, coordinate frames. Ledger's chart animation and the desktop's return trip become one declaration each.

**Effect.** For crafted features, I estimate 30–50% less code where the patterns apply, fewer motion bugs, and agents more willing to propose continuity because the words appear in the docs they read. The vocabulary itself teaches the patterns.

**Cost.** Language and runtime design, done carefully. Continuity keys especially need clear rules for which view wins and what happens to the leaving one. Rewriting the corpus's hand forms keeps one way to say each thing.

**Risk.** "A second way to say it" if the old forms aren't retired. Over-abstraction that hides what moves; keep the scalars visible (`frame.t` is readable).

#### 4. Motion as design tokens, and a motion plan the designer approves before code

**What.**

- **Motion tokens.** Theme records gain motion tokens (`snappy`, `gentle`, `emphasis`, durations, overshoot, stagger spread), read with `provided("motion")` exactly as colour tokens are. A designer can then tune the whole app's feel in one place. With proposal 2, they can do it live.
- **A motion plan.** The skill's planning step ("the changes between states") becomes a short, structured *motion plan* the agent writes before code: each state change, what persists through it (the scalars, per chapter 23), which views lead and which follow, and which interruptions must be smooth. The designer reviews and edits it as a design artifact.
- **A design skill.** A "designing with Declare" skill: a catalogue of continuity patterns (focus rectangle, card becomes page, minimize to slot, morph by a derived quality, hand-to-spring), each with when to use it, the scalars to choose, and an audit-the-middle checklist.

**Why.** The language lowers the cost of continuity. It does not, by itself, make an agent *propose* it. The eval apps show agents doing conventional structure well and continuity mostly when asked. A plan puts the designer's judgement in at the cheapest point, before any code exists. Tokens make "the app's feel" a design property rather than numbers scattered through the code.

**Effect.** More ambitious first drafts, earlier agreement with the designer, and a consistent feel across an app. Hard to estimate. I expect the largest qualitative gain of any proposal per unit of cost.

**Cost.** Low to moderate: docs, a theme schema, and a skill.

**Risk.** A recipe culture that runs against the project's "principles, not recipes" rule. Write the catalogue as principles (what persists, who leads), with the reference apps as examples rather than templates.

#### 5. Continuous layouts: arrangements driven by springs, not only by durations

**What.**

- `TweenLayout` (or a successor) can be driven by a spring with velocity, so arrangement glides retarget the way a spring does.
- A layout may expose a scalar, so an arrangement can be `blend(placeA(), placeB(), t)` with `t` sprung, giving the calendar's idiom for ordinary layouts (list ↔ grid, sidebar ↔ sheet, card ↔ page) without dropping to hand-placed scenes.
- Per-child phase and stagger (from proposal 3) are available inside `place()`.

**Why.** Most of any app is ordinary layout. Today, continuity there either costs a hand-written scene or settles for a fixed-duration glide. Closing the layout/scene divide spreads the language's signature quality from showcase scenes to whole apps.

**Effect.** Continuity becomes the default texture of ordinary screens. This is where the gap to React with Framer Motion's layout animations would widen most visibly, because the middle stays a real layout.

**Cost.** Moderate. The runtime already animates layouts; this generalises the driver and the blend.

**Risk.** Performance with large replicated sets. Pair it with the virtualisation rules and a frame budget (proposal 7).

#### 6. Finger-grade craft and a phone host

**What.** Momentum scrolling and paging with velocity, sheet detents driven by velocity, interactive back and dismiss gestures that scrub a transition with the finger and finish or cancel by velocity (using proposal 3's hand-off), and haptics. Then a native iOS host through the same drive vocabulary, so 120 Hz and native gesture physics are the baseline. Bring the flagship calendar to finger grade (targets, swipe paging, clean edges) as the proving case.

**Why.** "Modern UI, desktop and phone" means continuous *gestural* UX on phones, where the bar is set by native apps. Today the reference craft is desktop-only.

**Cost.** Large, especially the native host.

**Risk.** It spreads a small team thin. Sequence it after proposals 1–3, which make the phone work verifiable and expressible.

#### 7. Motion performance as a checked budget

**What.** Film strips (proposal 1) include frame timings. Verify fails a transition whose p95 frame exceeds a budget on the reference profile. The profiler names the constraints a spring wakes per frame, and flags any that run on runtime tracking or re-raster drawings per frame. The desktop's hand-learned rules (render once and GPU-scale, one spring per motion, no per-row springs in long lists) become diagnostics.

**Why.** Continuity that stutters is worse than none. The desktop's code shows its author learned these limits by hand. An agent won't, unless the toolchain tells it.

**Cost.** Low to moderate; `drive.profile` and `expect.budget` exist.

**Risk.** Machine variance. Count-based budgets (rules run per frame, drawings per frame) hold on any machine. The project already makes this split.

---

### 6. Bottom line

Read against the stated goal, Declare is stronger than Part 2 credited, and differently weak. Its central idea is genuinely distinctive: arrangement and appearance derived from a few sprung scalars, so the middle of every change is a real, queryable, interactive layout. The calendar demonstrates it in a few dozen lines, and the evidence suggests motion requirements arrive at no time premium. I'd now judge the static dependency design, which Part 2 half-criticised, as the reason that idea runs at frame rate.

What stands between the idea and the author's goal is mostly not the language's core:

- **A toolchain that audits only rest states,** blind to the middle where continuity lives.
- **A designer–agent loop with no shared, time-anchored medium,** and tuning that doesn't write back.
- **A craft vocabulary left to hand arithmetic,** with no words for phase, structured springs, velocity, or continuity across the tree.
- **A layout system whose continuous mode exists only in hand-placed scenes.**

Proposals 1 and 2 give the agent and the designer eyes and hands on motion. Proposals 3 to 5 give them words. Together they would turn "a capability standing by" into the default texture of what agents build. Measuring the cost of continuity directly, as a difference against React with Framer Motion and against SwiftUI, would show whether it worked.

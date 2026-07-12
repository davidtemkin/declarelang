# The Declare Developer's Guide — outline

The narrative companion to the generated API reference. The reference tells you
*what an attribute does*; the guide teaches you *how to think in Declare*. It
leads with what is non-obvious or counter to other frameworks' defaults, and
every concept earns one tight, idiomatic micro-example.

Read it in order the first time; reach back into a chapter when a concept bites.
Component and attribute detail lives in the reference — the guide cross-links to
it (e.g. "the `View` reference") rather than restating it.

---

## Part I — Orientation

- **`00-overview.md` — Why Declare.**
  The two-surface thesis (the DOM owns documents; Declare is a language for
  *applications*), the two delimiters `[ ]` / `{ }`, and the one defining idea:
  *a binding is a standing relationship the runtime keeps true, not a function
  you remember to re-run.* Establishes the mental model the rest builds on.
  *Key example:* the counter app — one button, two constraints, no update code.

- **`10-tutorial.md` — Build one small app.** *(outline)*
  A stat-card list, end to end: an `App` with state → a reusable `Card` class →
  reactive bindings → a `Dataset` and replication → a `State` toggle → a `Spring`.
  Each step introduces exactly one new idea and points at its Fundamentals
  chapter. *Key example:* the app grows across ~8 steps into ~40 lines.

## Part II — Fundamental Concepts

- **`20-composition.md` — The tree is the brackets.**
  Bracket nesting *is* the view tree; child instances, naming, and that
  components are classes; one-off inline subclasses vs. named classes; the
  "where does this code live" decision (class / method / function). *Key
  examples:* a nested `Card`, a one-off with its own state, class-vs-helper.

- **`21-constraints.md` — Reactive by construction.**
  `{ }` is a live TypeScript expression whose dependencies the *compiler* extracts
  statically — no hooks, no dependency arrays, no re-render. `=` is the setter.
  The value model (bare literals; `#` vs `0x` colours). Binding timing. What a
  constraint may and may not be. *Key examples:* re-centering, ternary colour,
  the reactivity demo.

- **`22-prevailing.md` — Inherited styling.**
  `prevailing` slots follow the nearest ancestor that sets them: the built-in
  text quartet, the `theme` token record, and your own. Set once high, reskin a
  whole subtree in one place. *Key examples:* font inheritance, a `theme` record.

- **`23-events.md` — Handlers and subscriptions.**
  `on<Event>` methods answer *this node's own* events; `<-` subscribes to an
  *external* source with lifetime managed for you; `event` declares a firable
  event. `<-` (event) vs `<->` (two-way data). *Key examples:* `onClick`,
  `keyup(k) <- Keys`.

- **`24-states.md` — Modes as override bundles.**
  A `State` is a named, reversible bundle of attribute overrides *and* conditional
  children, switched by one boolean. One declarative owner per slot, so the
  set-on-enter/forget-on-exit bug is unrepresentable. Precedence by declaration
  order; gate-by-constraint XOR drive-by-verbs. *Key examples:* button
  hover/press/disabled, a disclosure, edit-in-place.

- **`25-layout.md` — Layout is a swappable attribute.**
  Not a child (OpenLaszlo) and not the container's type (SwiftUI/Flutter): a
  reactive `layout:` attribute you set on a generic view, so you can swap,
  constrain, or animate it. Default is none (absolute `x`/`y`). *Key examples:*
  `SimpleLayout`, `WrappingLayout`, nested axes.

- **`26-data.md` — Datapaths, replication, sources.**
  A `datapath` cursor plus `:path` relative reads; `:arr[]` replicates one
  subtree per record; `Dataset` (embedded) vs `DataSource` (reactive remote,
  `.fetch()` explicit); a `schema` types and validates. *Key examples:* the
  components demo, a `DataSource` whose state drives the UI.

- **`27-scope-nouns.md` — `this` / `parent` / `classroot` / `app`.**
  Why four nouns; `classroot` resolves by *where the code is written*, not where
  the node sits; `app` reaches the root from any depth. The gotchas that follow.
  *Key examples:* a handler on a nested child calling `classroot.select()`,
  responsive reads off `app.width`.

- **`28-formatting.md` — The house style.**
  Members are order-inert, so one house style is what keeps every file reading the
  same way: four-space indent, trailing comma always, plain config on the header
  line, leaf bodies closing inline vs. bodies-with-children hanging their bracket,
  no column alignment, and `/* */` block comments as literate Markdown. Enforced by
  a formatter; `design/formatting.md` is the full canon. *Key example:* a `Counter`
  laid out to canon.

## Part III — In Depth

- **`30-animation.md` — Motion.** *(outline)*
  `Animator`/`AnimatorGroup` (imperative, `start()`), `Spring` (declarative,
  follows a reactive target), and how states supply end-states. *Key examples:*
  the tab slide, the spring demo.

- **`31-text-markdown.md` — Text & Markdown.** *(outline)*
  `Text` wraps within a bounded width and auto-extends; `Markdown` is a native,
  full-featured content type routed static-or-dynamic by the compiler. *Key
  example:* a live-streaming `Markdown` binding.

- **`32-sizing.md` — Sizing & host.** *(outline)*
  unset ⇒ auto · constant ⇒ fixed · constraint over `contentWidth`/`contentHeight`
  ⇒ any clamp; the App fills its host; `app.width` for responsive reads;
  `readonly`. *Key example:* `height = { Math.min(contentHeight, 480) }`.

- **`33-fonts.md` — Fonts.** *(outline)*
  A `font` names a family and owns its `Face` children; `fontFamily` is a
  fallback list; weight/italic pick the face at the use site. *Key example:* a
  web font plus a system fallback.

- **`34-input-focus.md` — Input & focus.** *(outline)*
  The `Keys` service, the `Focus` service and tree-order tab, `focustrap`, and
  `TextInput` (its `text` is the source of truth). *Key example:* a focus-trapped
  form.

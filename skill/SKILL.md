---
name: declare
description: Write Declare programs — a reactive UI language (NOT in training data; do not extrapolate from React/CSS/HTML). Use when writing, fixing, or reviewing .declare source.
---

# Writing Declare

Declare is a UI language you have never seen. This file is the resident kernel:
the model, the rules that differ from your instincts, and a routing table into
the full documentation (`./docs/`, read on demand — do NOT read it cover to
cover; fetch the one chapter your task needs).

## The model in five lines

1. A program is one tree: `App [ … ]` at the root, children nested in `[ ]`.
2. `[ ]` is declarative structure; `{ }` is TypeScript. Two worlds, one door.
3. A `{ }` value is a **constraint** — re-evaluated whenever anything it reads
   changes. You never subscribe, diff, or re-render: `width = { parent.width }`
   stays true forever.
4. Handlers assign plain attributes (`onClick() { count = count + 1 }`); every
   constraint reading them follows. That is the whole update model.
5. `name = value` SETS an existing attribute; `name: Type = value` DECLARES a
   new one (Type ∈ number, string, boolean, Color, Length, Shape).

## The rules that break your instincts (memorize these)

- **Colors**: in `[ ]` slots — `#4169E1` or bare `royalblue`. Inside `{ }` —
  it's TypeScript, so a color is a NUMBER: `0x4169E1`. Never `#hex` in `{ }`.
- **Bare identifiers are not bindings**: `text = label` is wrong — write
  `text = { label }` (a binding) or `"label"` (a string).
- **Methods**: `name(params) { body }` — params are bare names, NO type
  annotations, NO return annotation. `f(a: string): T {}` is not Declare.
- **No CSS attributes**: border → `stroke = { stroke(1, 0xE2E5E9) }` (drawn
  inside the box); boxShadow → `shadow = { shadow(0, 2, 8, 0x00000040) }`;
  background → `fill`; borderRadius → `cornerRadius`; color → `textColor`;
  no margin/padding/zIndex/display — arrangement is
  `layout: SimpleLayout [ axis = y, spacing = 8 ]`, stacking is source order.
- **Width defaults to 0.** An unsized View (including every replicated row
  class) is invisible. Give rows `width = { parent.width }`.
- **A state overrides its OWN view's value slots** — never a child's
  (`t.opacity = 0.4` inside a State is illegal; constrain the child off the
  flag instead: `opacity = { classroot.done ? 0.4 : 1 }`), and never `layout`.
- **`<->` binds a DATAPATH only** (`text <-> :field`, editors only). Attribute
  wiring is derive-down (`value = { app.goal }`) + deliver-up
  (`onInput(v) { app.goal = v }`).
- **Scope**: `this` (this node) · `parent` · `classroot` (the instance of the
  class whose body the code is written in — lexical, the trap worth care) ·
  `app` (the root, reachable anywhere). A replicated child cannot be named.
- **Data**: `datapath = :rows[]` replicates a child per row; `:field` reads
  relative to the cursor. Reading data in `{ }` uses `:paths` or
  `dataset.read([…])`. Decl defaults seed from data as `label: string = { :label }`.

## The inventory (resident on purpose — you will NOT think to look these up)

<!-- generated:inventory -->
- **Built-ins you must not redeclare** (read-only ones are computed for you): every View has `x y width height fill cornerRadius stroke shadow visible opacity scale pivotX pivotY clip scrolls scrollsX scrollY textColor fontSize fontFamily fontWeight letterSpacing headingColor headingWeight linkColor codeColor codeSize codeFamily codeBackground codeRule richTextLayout theme selectable styles stylesheet layout datapath focusable focustrap anchor` and read-only `contentWidth contentHeight`; App adds `scrollY pointerX pointerY hovering pointerOverText location minWidth minHeight` and read-only `hostWidth hostHeight dark`. `location` is the URL fragment (two-way: write it to navigate, derive state from it, never assign the derived state); `anchor` names a view as an `@name` reveal target. Naming a derived value `contentWidth` is an error — pick `bodyW`, `colW`, etc.
- **Token values, not CSS values**: `FontWeight` = thin extralight light regular normal medium semibold bold extrabold black; `TextAlign` = left center right; `Stretch` = none width height both; `Axis` = x y; `Process` = sequential simultaneous — NEVER numeric weights (700 is CSS). Layout `axis` is a literal — to change arrangement responsively, constrain each child's `x`/`y` off a flag.
- **Dataset mutation verbs** (from handlers): `data.set(path, v)` · `data.insert(path, index, v)` · `data.removeAt(path, index)` · `data.move(path, from, to)` — paths are arrays like `["rows"]`. Adding a row: `tasks.insert(["rows"], tasks.read(["rows"]).length, ({ label: t, done: false }))`.
- **The standard library**: `Checkbox`, `Button`, `Switch`, `Slider`, `RadioGroup`, `Radio`, `Field`, `ProgressBar`, plus the built-in `TextInput` — values flow derive-down (`value = { app.x }`) and deliver-up (`input(v) { app.x = v }` — the built-in TextInput's event is `onInput(v)`).
- **Compile modifiers**: `render`, `crawler` (same names as URL `?…` and CLI `--…`). Diagnostic codes are `DECLARE####`.
<!-- /generated:inventory -->

## Routing table — read exactly what the task needs

Paths are relative to the REPOSITORY ROOT (the directory holding this repo's
README.md) — not to this file's location.

| task involves | read |
|---|---|
| first program, program shape | docs/guide/00-shape.md |
| lists, replication, datasets, editing data | docs/guide/27-data.md |
| layout, sizing, responsive | docs/guide/26-space.md |
| buttons, sliders, inputs (the standard library) | docs/guide/24-controls.md |
| colors, borders, shadows, themes, type | docs/guide/25-appearance.md |
| hover/press/drag, keyboard | docs/guide/23-interaction.md |
| states, springs, animation | docs/guide/28-continuity.md |
| `this`/`parent`/`classroot`/`app` confusion | docs/guide/22-reach.md |
| classes, composition, named children | docs/guide/20-tree.md |
| constraints not updating, setter rules | docs/guide/21-constraints.md |
| text, Markdown, images | docs/guide/30-content.md |
| deep links, the URL, anchors, crawlers | docs/guide/33-addressable.md |
| the whole language, terse | docs/declare.md |
| an exact fact — attribute names, enum tokens, flags, commands, diagnostic codes | docs/declare-model.json (`spine` — grep it; don't read it whole) |

## The loop

Write the complete program in one ```declare fence. If a checker report comes
back: every diagnostic names its fix — apply exactly what it names, change
nothing else, resubmit. The compiler reports ALL syntax-level mistakes at once;
trust the list.

# States

**Status:** ratified 2026-07-05 (David); cut-1 **implemented + tested** 2026-07-05. Cut-1 = attribute overrides **and** conditional child views. Declarative transitions on state change are deferred (a seam is left; see §7).

**Implementation.** Runtime engine in `src/state.ts` (the `State` twin-table component + the per-slot override precedence stack), constructed by `constructState` and checked by `checkStateNode` (overrides typed against the enclosing view's schema, children as views); `applied`'s push runs the effect sync. Six unit tests in `test/unit.test.mjs` cover: gated override apply/revert, declaration-order precedence (both insert orders), structural child build/teardown, the verbs, the render-path surface attach/detach (mock backend), and the gate-XOR-verbs rejection. Full suite green, no regression.

**Not retrofitted onto `WeatherTab` (deliberately).** Its `selected` toggle is an *animated* height (an `Animator` drives `height`) plus styling on *grandchildren* (`bg.opacity`, `caption.textColor`) — the former is more moving parts than the constraint it'd replace, the latter is unreachable under the sibling rule (§5). It is already in its idiomatic form (a constraint ternary + animator), the very case §3 calls near-redundant with a state. neoweather has no genuinely structural spot (David's own read). The engine's proof is the synthetic tests, not a contrived weather rewrite.

A **state** is a named, toggleable bundle attached to a view: a set of **attribute overrides** on that view *and* a **conditional subtree** of child views, both switched by one boolean, `applied`. It is the neo form of LZX `<state>`, and the D-1 "precedence-stack override bundle" — widened to carry children, because that is the capability states uniquely give (an attribute-only state is near-redundant with a constraint ternary; a *subtree that exists in one UI-state and not the other* is not).

## 1. Syntax

A state is an ordinary typed member, like `Animator` — no new grammar. Its body is a **view body**: `name = value` entries are **overrides** (checked against *the enclosing view's* schema), `id: Type [ … ]` entries are **child views** (instantiated into the enclosing view while applied). `applied` is the one reserved control attribute.

```
card: View [ height = 40,

    editing: State [ applied = { mode == "edit" },
        height = 220,                                       // override
        field: TextInput [ text = { classroot.draft } ],   // child, present only while applied
        ok:    Button    [ label = "Save", onClick() { … } ],
    ],
]
```

## 2. `applied` — read surface, one provider

`applied` is **read** everywhere and **written by exactly one provider** — never a raw poke. This is not a special rule for states; it is the same discipline neo applies to every slot (read freely, owned by one constraint *or* driven by one sanctioned imperative driver). `applied` is to a state what `height` is to `WeatherTab`:

| slot | declarative owner | sanctioned imperative driver | read anywhere |
|---|---|---|---|
| `height` | `= { selected ? … }` | an `Animator` (`start()`) | `{ parent.height }` |
| `applied` | `= { editing }` | the state's `apply()`/`remove()` | `{ !classroot.edit.applied }` |

- **Declarative gate:** `applied = { expr }` — a constraint owns it; you flip its *inputs*, not `applied`.
- **Imperative verbs:** `apply()` / `remove()` / `toggle()` — drive it through the sanctioned path (displace/resume), not assignment.
- **Read:** `classroot.edit.applied` — how siblings react (§5, sibling rule).
- A raw `edit.applied = true` is rejected with a pointer to `apply()`, same as raw-writing an animated slot. One imperative path.

Declarative gate **XOR** imperative verbs, per state — enforced by the existing owner rule (calling `apply()` on a constraint-gated `applied` errors "applied is bound by a constraint").

## 3. Mechanism — two effects of one flip

Both effects reuse machinery that already exists.

**Overrides → precedence stack (displace/resume).** Each overridden slot gets a stack `[ base ] + [ override per active state ]`; effective value = top. Apply displaces the slot's current driver with the override (the *sanctioned* displace path, so overriding a `{ }`-owned slot is legal, not a clobber error); remove resumes the driver beneath. This is `Animator`'s displace/resume generalized from one displacer to a stack. An override value may itself be a constraint — **lazily live**: it starts tracking/driving on apply and suspends on remove, so a dormant state costs nothing and an override reading not-yet-available data cannot error while inactive.

**Children → conditional subtree (replicate's lifecycle).** On apply, instantiate the state's declared children into the enclosing view; on remove, tear them down — the same on-demand construct/dispose path `replicate.ts` runs for `:array[]`, gated by a boolean instead of an array length. Children occupy the **state's declaration position** in the parent's child order (inactive = an empty slot there), so a layout reflows around presence/absence and source order = layout/z order.

**Precedence among multiple applied states → static declaration order, later-declared wins.** Diverges from LZX's apply-order deliberately: static order is readable from source *and* lets you encode intent (declare `disabled` last → it always beats `hover`). Not runtime-history-dependent.

**Ephemerality → fresh per apply.** State children are instantiated fresh on each apply and destroyed on remove (releases resources; no stale subtree). Corollary pattern: **durable data lives on the base view; the state's children bind to it** — so toggling off/on never loses it.

## 4. Composition — the total order

Lowest → highest: **base (default / prevailing-follow / `{ }` constraint) < active states (declaration order) < animator (transient)**. Consequences, all from displace/resume:
- A state override *provides* the slot, so a prevailing/inherited slot stops following while overridden and resumes following when the state leaves.
- An animator sits above states: a running tween wins and, on stop, resumes to the current top-of-stack (the active state's value, not the base) — animating toward a state-driven target just works.

## 5. Scope & rules

- **In cut-1:** attribute overrides (incl. function-typed attrs, so overriding an `onClick` is free) + conditional child views.
- **Sibling rule:** a state governs *its own view* (overrides) and *its own added children* — it does **not** reach into existing sibling children. Siblings that must react do so with their own constraints reading the state's `.applied` (see Example 3). This keeps ownership local and analyzable.
- **Deferred:** a state's `applied` cannot be `= { }`-gated *and* verb-driven (XOR); declarative transitions (§7).
- **NO DOM in bodies** is untouched — state children are declared `[ ]` views, not views conjured in a `{ }` TS body.

## 6. Examples

**Attribute overrides + precedence (a button).**
```
class Button extends View [ width = 120, height = 32, cornerRadius = 4,
    fill = #3F4977, textColor = #FFFFFF,
    label: string = "", enabled: boolean = true,
    hovered: boolean = false, pressed: boolean = false,
    onMouseOver() { hovered = true }, onMouseOut() { hovered = false },
    onMouseDown() { pressed = true }, onMouseUp() { pressed = false },

    hover: State [ applied = { hovered },  fill = #4A5590 ],
    press: State [ applied = { pressed },  fill = #2A3157 ],
    off:   State [ applied = { !enabled }, fill = #9AA0B8, textColor = #D5D8E6 ],  // declared last → wins

    caption: Text [ text = { classroot.label }, width = 120, y = 9 ],
]
```

**Structural state — children present only in one UI-state.**
```
class Disclosure extends View [ width = 260, title: string = "", open: boolean = false,
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 260, height = 28, fill = #EEF0F6,
        onClick() { classroot.open = !classroot.open },
        arrow: Text [ text = { classroot.open ? "▾" : "▸" }, x = 8, y = 6 ],
        label: Text [ text = { classroot.title }, x = 24, y = 6 ],
    ],
    opened: State [ applied = { open },            // children lay out right after header
        detail: Text [ x = 8, y = 6, width = 244, text = "Detail, present only while open." ],
        rule:   View [ x = 8, width = 244, height = 1, fill = #C9CEDF ],
    ],
]
```

**Structural state + durable data + verbs + sibling rule — edit-in-place.**
```
class Editable extends View [ width = 240, height = 28,
    label: string = "", value: string = "Portland", draft: string = "",
    name:  Text [ text = { classroot.label }, x = 0, y = 6, width = 80 ],
    shown: Text [ text = { classroot.value }, x = 84, y = 6,
        visible = { !classroot.edit.applied },     // sibling reacts by READING .applied
        onClick() { classroot.draft = classroot.value; classroot.edit.apply() } ],
    edit: State [
        fill = #FFFFF0,
        box: TextInput [ x = 84, y = 4, width = 96, text = { classroot.draft } ],
        ok:  Button    [ x = 186, y = 4, label = "OK",
            onClick() { classroot.value = classroot.draft; classroot.edit.remove() } ],
    ],
]
```

## 7. The transition seam (deferred)

The single point where a slot's effective value changes on a state flip (§3 apply/remove) is exactly where a future `transition` would interpolate old→new instead of snapping. Nailing the mechanism now yields that seam for free; the transition layer is designed later, against real cases — its practical weight is unproven and not on cut-1's critical path.

## 8. Naming (open, minor)

Verbs are `apply()` / `remove()` / `toggle()` (LZX-faithful). `remove()` is mildly overloaded (a state *does* remove its added children, which fits, but could read as "remove the state object"); `apply()`/`clear()` or `activate()`/`deactivate()` are alternatives. Keeping LZX names unless David prefers otherwise.

<!-- nav: Menus, dialogs and overlays -->
<!-- part: Building -->

# Menus, dialogs and overlays

Menus, dialogs, popovers, tooltips — everything that appears *over* an interface rather
than in it. In the stacks you know these are the awkward ones: portals to escape a
clipping ancestor, z-index arithmetic, an outside-click listener you attach and forget to
remove, focus that vanishes when the panel closes.

Declare has no portals and no z-index, and the reason the awkwardness goes away is a
change of shape:

> **A layer is a standing member you open with a verb — not a view you show and hide
> around your content.**

Declare one [`Menu`](declare-docs:Menu), once, and open it from twenty places. That is most of this chapter.

## Declared once, opened by many

Here is the shape. The menu is a member of the app; the thing that opens it says *where*
and *for whom*:

```declare
App [ width = 360, height = 150, theme = { SanFrancisco }, chose: string = "",
    edit: Menu [ items = { [ ({ id: "cut", label: "Cut", key: "⌘X" }),
                            ({ id: "copy", label: "Copy", key: "⌘C" }),
                            ({ divider: true }),
                            ({ id: "paste", label: "Paste", enabled: false }) ] },
        picked(id: string) { app.chose = id }
        ],
    Button [ x = 20, y = 20, label = "Edit", menu = { app.edit } ],
    Text [ x = 20, y = 76, textColor = { provided("theme").text },
        text = { app.chose == "" ? "nothing picked yet" : "picked: " + app.chose } ]
    ]
```

Note what is **not** there. No [`visible`](declare-docs:View.visible) toggling, no z-index, no dismissal handler, no
cleanup. `menu = { app.edit }` on the button is the whole wiring: it gets the disclosure
chevron, the anchored open, the held-open styling, and ArrowDown-to-open together.

The fact that makes one menu serve many places is [`opener`](declare-docs:Menu.opener), the view a menu was opened
for. Because `items` is an ordinary attribute, it can be a **constraint that reads
`opener`**: per-row menus over a table, with no per-row instances and no stale copies,
live while the menu is up.

A menu's items, like a dialog's buttons, are **records, not children** — the contract from
[Controls](declare-docs:guide:controls@contract-two-what-a-component-arranges-it-takes-as-records): what a component arranges, it takes as data. The
record is `{ id, label, key?, icon?, enabled?, checked?, divider?, submenu? }`, and the
choice comes back through `picked(id)`.

## Two ways to open, and they mean different things

| verb | anchors | for |
|---|---|---|
| [`openFor(v)`](declare-docs:Menu.method.openFor) | below the view, flipping above at the screen edge | an attached menu — a button's dropdown, a select |
| [`openAt(v, e)`](declare-docs:Menu.method.openAt) | at the pointer | a context menu |

[`ContextMenu`](declare-docs:ContextMenu) wraps the second as `open(v, e)`, and the wiring is two lines **on the view
being served** — which is what routes the gesture, since a handler is a claim:

```declare-fragment
rowMenu: ContextMenu [ items = { … }, picked(id: string) { … } ],
…
Row [ onContextMenu(e: PointerEvent) { app.rowMenu.open(this, e) },
      onHold(e: PointerEvent)        { app.rowMenu.open(this, e) } ]
```

`onContextMenu` engages the right-click and two-finger path; `onHold` is the touch
long-press. Neither costs anything on a view that does not declare it.

## Dismissal is the part you would get wrong

Two rules, and choosing between them is the real design decision:

- **Light-dismiss** (menus, popovers): a press outside closes the layer **and is
  swallowed** — the Mac rule. The click that dismisses does not also activate whatever
  was underneath. Escape closes; a pick closes.
- **Modal** (dialogs): a full-app scrim swallows *every* press, there is no light
  dismiss, and a focus trap keeps Tab inside the panel.

Both are built in. What is worth internalizing is the ordering rule they share, because it
is invisible until it bites:

> **Dismiss first, deliver second.** The layer leaves the screen — a real painted frame —
> before your handler runs.

That is the native platforms' contract too, and it means a slow action can never freeze
an open menu on screen while it works. You get it for free, and you only notice it if you assume the
opposite and try to read the menu's state inside `picked`.

## Modals and the focus you have to give back

A [`Dialog`](declare-docs:Dialog) is the same shape — a member you open with a verb, not a view you toggle:

```declare
App [ width = 360, height = 150, theme = { SanFrancisco }, said: string = "",
    dlg: Dialog [ ],
    Button [ x = 20, y = 20, label = "Delete…",
        onClick() { app.dlg.ask("Delete this file?", "This cannot be undone.",
                                (id) => { app.said = id }) }
        ],
    Text [ x = 20, y = 84, textColor = { provided("theme").text },
        text = { app.said == "" ? "—" : "you chose: " + app.said } ]
    ]
```

[`ask`](declare-docs:Dialog.method.ask) is Cancel / No / Yes; [`notice`](declare-docs:Dialog.method.notice) is a single OK; `error` tints the title. Return picks
the default button, Escape picks the cancel one. Focus is **saved on open and restored on
close** — and restored one turn late, deliberately, because an in-flight keystroke has to
finish against the old focus first. Skip that and the Return that dismissed the dialog is
delivered to the button that opened it, which reopens it. If you build your own modal,
that is the bug to remember.

## A control that opens a layer

[`Combobox`](declare-docs:Combobox) is the two halves of this chapter meeting: a text field that owns a **query**,
and a dismissable list that owns a **choice**.

```declare
App [ width = 340, height = 160, theme = { SanFrancisco }, picked: string = "",
    people: array = { ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Barbara Liskov"] },
    Combobox [ x = 20, y = 20, width = 260, placeholder = "Assignee",
        items = { app.people },
        input(v: string) { app.picked = v }
        ],
    Text [ x = 20, y = 84, textColor = { provided("theme").text },
        text = { app.picked == "" ? "—" : app.picked } ]
    ]
```

Type to filter, arrow to rove, Enter to pick — or click the chevron to see everything. The
part worth stealing for your own work is how filtering is expressed: **the matches are a
derived collection**, a constraint over `items`, so the live match count comes from the
data and no rendered row is ever counted. That is
the rule from [Large collections](declare-docs:guide:collections) — count the data, not the views —
which is also why handing it a hundred thousand options and virtualizing the list changes
nothing about the code.

Its value is the chosen **member**, not the typed text: hand it records and you get a
record back.

## The ambient layers you never declare

Two arrive on their own, and knowing they exist is the whole lesson:

- **[`Tooltip`](declare-docs:Tooltip)** — set `tip = "…"` on *any* view; the [`Tip`](declare-docs:Tip) service decides when a tip shows. Delay, placement, edge-flipping and
  theming are nobody's problem at the use site.
- **[`FocusRing`](declare-docs:FocusRing)** — the traveling focus indicator, spliced into any app that uses a
  library control.

Both are singletons spliced in when a program earns one, and **declaring your own by that
name replaces it** — the customization path, not an escape hatch.

## Building your own

If you need a layer the library has no equivalent for, the runtime tools the library's own
overlays use are listed in [Custom components](declare-docs:guide:custom-components@the-runtime-tools-the-library-uses):
[`raise()`](declare-docs:View.method.raise), [`rootOrigin()`](declare-docs:View.method.rootOrigin), [`Focus`](declare-docs:Focus), and [`Keys.navClaim`](declare-docs:Keys.method.navClaim). Three habits separate a panel
that works from one that mostly works: claim the keys in pairs, restore focus a turn late,
and dismiss before you deliver.

---

**What you can now say:** you can put a menu, a context menu, a dialog or a filtering
picker into an app without a portal, a z-index, or a dismissal handler — and you know why
they take records rather than children, which of the two dismissals a given layer
wants, and the ordering rule that keeps a slow action from freezing one on screen.

[Next: **URLs, links and history** →](declare-docs:guide:urls)

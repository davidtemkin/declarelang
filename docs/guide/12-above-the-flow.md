<!-- nav: Above the flow -->
<!-- part: Building -->

# A layer is a member you open, not a view you show

Menus, dialogs, popovers, tooltips — everything that appears *over* an interface rather
than in it. In the stacks you know these are the awkward ones: portals to escape a
clipping ancestor, z-index arithmetic, an outside-click listener you attach and forget to
remove, focus that vanishes when the panel closes.

Declare has no portals and no z-index, and the reason the awkwardness goes away is a
change of shape:

> **A layer is a standing member you open with a verb — not a view you show and hide
> around your content.**

Declare one `Menu`, once, and open it from twenty places. That single sentence is most of
this chapter.

## Declared once, opened by many

Here is the shape. The menu is a member of the app; the thing that opens it says *where*
and *for whom*:

```declare
App [ width = 360, height = 150, chose: string = "",
    edit: Menu [ items = { [ ({ id: "cut", label: "Cut", key: "⌘X" }),
                            ({ id: "copy", label: "Copy", key: "⌘C" }),
                            ({ divider: true }),
                            ({ id: "paste", label: "Paste", enabled: false }) ] },
        picked(id: string) { app.chose = id }
        ],
    Button [ x = 20, y = 20, label = "Edit", menu = { app.edit } ],
    Text [ x = 20, y = 76, textColor = { theme.text },
        text = { app.chose == "" ? "nothing picked yet" : "picked: " + app.chose } ]
    ]
```

Note what is **not** there. No `visible` toggling, no z-index, no dismissal handler, no
cleanup. `menu = { app.edit }` on the button is the whole wiring: it gets the disclosure
chevron, the anchored open, the held-open styling, and ArrowDown-to-open together.

Two facts do the work. `opener` is the view a menu was opened for — so one declaration can
serve many callers, and because `items` is an ordinary attribute it can be a **constraint
that reads `opener`**: per-row menus over a table, with no per-row instances and no stale
copies, live while the menu is up.

## Items are records, not children

You cannot nest rows inside a `Menu`. There is nowhere to put them, and that is
deliberate — it is the second contract from [chapter 8](declare-docs:guide:controls),
which the whole overlay family obeys:

> **What a component arranges, it takes as records. What you arrange, you build from
> views.**

A menu arranges its rows; a dialog arranges its buttons; so both take plain record arrays
and hand the choice back through a method. The payoff is that a component owning its
arrangement owns its rendition too, and can change either without a single use site
noticing. Hand it children instead and you have frozen its internals into your source.

> **From React:** this retires `<Menu><MenuItem/><MenuItem/></Menu>` and the whole
> compound-component pattern — `React.Children` walking, cloneElement, context to reach
> the parent. The reason that pattern exists is to let a container configure children it
> did not create. Here the container has the data, so there is nothing to reach for.

## Two ways to open, and they mean different things

| verb | anchors | for |
|---|---|---|
| `openFor(v)` | below the view, flipping above at the screen edge | an attached menu — a button's dropdown, a select |
| `openAt(v, e)` | at the pointer | a context menu |

`ContextMenu` wraps the second as `open(v, e)`, and the wiring is two lines **on the view
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

Two regimes, and choosing between them is the real design decision:

- **Light dismiss** (menus, popovers): a press outside closes the layer **and is
  swallowed** — the Mac rule. The click that dismisses does not also activate whatever
  was underneath. Escape closes; a pick closes.
- **Modal** (dialogs): a full-app scrim swallows *every* press, there is no light
  dismiss, and a focus trap keeps Tab inside the panel.

Both are built in. What is worth internalizing is the ordering rule they share, because it
is invisible until it bites:

> **Dismiss first, deliver second.** The layer leaves the screen — a real painted frame —
> before your handler runs.

That is the native contract (AppKit ends tracking before dispatching; Win32 destroys the
menu window before `WM_COMMAND`), and it means a slow action can never freeze an open menu
on screen while it works. You get it for free, and you only notice it if you assume the
opposite and try to read the menu's state inside `picked`.

## Modals and the focus you have to give back

A `Dialog` is the same shape — a member you open with a verb, not a view you toggle:

```declare
App [ width = 360, height = 150, said: string = "",
    dlg: Dialog [ ],
    Button [ x = 20, y = 20, label = "Delete…",
        onClick() { app.dlg.ask("Delete this file?", "This cannot be undone.",
                                (id) => { app.said = id }) }
        ],
    Text [ x = 20, y = 84, textColor = { theme.text },
        text = { app.said == "" ? "—" : "you chose: " + app.said } ]
    ]
```

`ask` is Cancel / No / Yes; `notice` is a single OK; `error` tints the title. Return picks
the default button, Escape picks the cancel one. Focus is **saved on open and restored on
close** — and restored one turn late, deliberately, because an in-flight keystroke has to
finish against the old focus first. Skip that and the Return that dismissed the dialog is
delivered to the button that opened it, which reopens it. If you build your own modal,
that is the bug to remember.

## A control that opens a layer

`Combobox` is the two halves of this chapter meeting: a text field that owns a **query**,
and a dismissable list that owns a **choice**.

```declare
App [ width = 340, height = 160, picked: string = "",
    people: array = { ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Barbara Liskov"] },
    Combobox [ x = 20, y = 20, width = 260, placeholder = "Assignee",
        items = { app.people },
        input(v: object) { app.picked = "" + v }
        ],
    Text [ x = 20, y = 84, textColor = { theme.text },
        text = { app.picked == "" ? "—" : app.picked } ]
    ]
```

Type to filter, arrow to rove, Enter to pick — or click the chevron to see everything. The
part worth stealing for your own work is how filtering is expressed: **the matches are a
derived collection**, a constraint over `items`, so the live match count comes from the
data and no rendered row is ever counted. That is
[chapter 10](declare-docs:guide:scale)'s law again — *count the data, not the tree* —
which is also why binding a hundred thousand options and virtualizing the list changes
nothing about the code.

Its value is the chosen **member**, not the typed text: hand it records and you get a
record back.

## The ambient layers you never declare

Two arrive on their own, and knowing they exist is the whole lesson:

- **`Tooltip`** — set `tip = "…"` on *any* view. Delay, placement, edge-flipping and
  theming are nobody's problem at the use site.
- **`FocusRing`** — the traveling focus indicator, provided to any app that uses a
  library control. It is what you saw fly in the last chapter.

Both are singletons spliced in when a program earns one, and **declaring your own by that
name replaces it** — the customization path, not an escape hatch.

## Building your own

If you need a layer the library has no equivalent for, [the previous
chapter](declare-docs:guide:make-your-own)'s toolkit is exactly the one its overlays use:
`raise()` to paint above your siblings, `rootOrigin()` to anchor against a view in another
coordinate space, `Focus.getFocus()` / `Focus.focus()` to save and restore, and
`Keys.navClaim(this, true)` to take the arrow keys from the page while your layer roves.

Claim in pairs, restore focus a turn late, and dismiss before you deliver. Those three
habits are the difference between a panel that works and one that mostly works.

---

**What you can now say:** you can put a menu, a context menu, a dialog or a filtering
picker into an app without a portal, a z-index, or a dismissal handler — and you know why
they take records rather than children, which of the two dismissal regimes a given layer
wants, and the ordering rule that keeps a slow action from freezing one on screen.

[Next: **Where the user is** →](declare-docs:guide:location)

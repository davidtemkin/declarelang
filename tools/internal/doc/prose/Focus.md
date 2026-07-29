The focus service, as a member. Like `Keys`, `Focus` names one concept a program can
**ask** (`Focus.focus(this)`, `Focus.byKeyboard()` — calls from any `{ }` body) or
**listen to** (a `Focus [ … ]` member).

Listening is what a focus indicator does: the library's `FocusRing` follows focus with
exactly these two handlers, tracking where focus went and the live silhouette of whatever
holds it. Most apps never need it — focus rings, tab order, and activation are provided —
but replacing the indicator is a supported thing to do, and this is how.

```declare-fragment
watch: Focus [
    onFocusChange(v: View) { classroot.target = v },
    onGeometry(g: FocusGeometry)    { classroot.tx = g.x; classroot.ty = g.y }
    ]
```

## focusChange
`onFocusChange(v)` — focus moved to view `v` (or `null` when nothing is focused).

## geometry
`onGeometry(g)` — the focused control's live root-space silhouette: `g.x`, `g.y`, `g.w`,
`g.h`, `g.rad` (its corner radius), `g.view`, and `g.root` (the app that owns it — an
embedded app's ring ignores a target belonging to another).

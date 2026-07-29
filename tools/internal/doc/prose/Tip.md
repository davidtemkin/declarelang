The tooltip service, as a member: `onTip(e)` fires when a view carrying `tip = "…"` wants
its tooltip shown, and with `null` when it should hide. The service owns the platform
conventions — the show delay, instant retarget while showing, hide on press — so a
listener only renders.

The library's `Tooltip` is the one listener most programs ever need, and it arrives
automatically in any app whose views carry tips. Declare your own `Tip [ … ]` member only
when you are replacing that rendition.

```declare-fragment
tips: Tip [
    onTip(e: TipEvent) {
        if (e == null) { classroot.shown = false; return }
        classroot.label = e.text
        classroot.shown = true
        }
    ]
```

## tip
`onTip(e)` — show the tip described by `e` (`e.text`, plus the target's root-space box
`e.x`/`e.y`/`e.w`/`e.h` and its owning app `e.root`), or hide when `e` is `null`.

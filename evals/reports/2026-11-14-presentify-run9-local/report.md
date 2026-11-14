# Presentify run 9: Opus 5.5, Declare, on the local tree, standard level

The validation round after the 2026-11-13/14 fixes, run beside Ledger 9. **43.0 min, 143 turns,
217k output tokens** (84k thinking): reading 3.8, checking 39.2 min; tool time 10.4 min. Timing
record: `evals/timings/2026-11-14-presentify-run9-local.txt`.

## Hidden checks

| | first clean boot (23 min in) | as delivered |
|---|---|---|
| Score, on today's tree | 17/19 | **19/19** |

The two first-boot failures (a rectangle resized by a side handle and by a corner, never
stored) were the app's: its selection overlay set `pointerEvents = "none"`, which takes presses
away from the view and everything inside it, handles included — the CSS reading, where a child
can opt back in. verify named the covered handle; the agent removed the setting.

## Platform findings

1. **FIXED — a closing overlay took presses on its own content.** Esc closed the color popover
   and the next press, on the inspector beneath, reached a color chip: through the closing
   motion only presses *past* the overlay were let go (`outsidePress`), not presses on it,
   though the library's own contract says closing stops it taking input at once. Reproduced on
   today's tree from the run's snapshot with the agent's own check. `Floating.pointerEvents`
   now follows `shown` (`library/floating.declare`), with its reference entry. The agent had
   worked around it by waiting for motion between steps.
2. **FIXED — `declare-help "full screen"` said there is no full-screen call.** A stale
   negative entry from before `app.fullScreen`; it sent the agent to write a browser script and
   then to `runtime/src/boot.ts` to find the attribute. The concept table now points at
   `App.fullScreen`, and `18-overlays.md` says how a program fills the display.
3. **FIXED — the guide taught `navigator.clipboard`** as its browser-script example, where
   `Clipboard.copy` is built in (`04-structure.md`). Replaced.
4. **FIXED — `--click` on a node that is not a view crashed the checker** ("Cannot read
   properties of null (reading 'y')" in `scrollInto`). It now says what the node is and that it
   has no place on screen (`tools/internal/verify-behave.mjs`).

## Source reads

`runtime/src/boot.ts` (finding 2), a grep across the library for the full-screen name, and
`library/textinput.declare`, after `declare-help TextInput.event.blur` missed.

5. **FIXED — the reference's own spelling missed an inherited member.** `TextInput.onBlur`
   found View's blur event, but `TextInput.event.blur` — the form the reference prints — did
   not walk the class chain, so the agent read the source. Both forms now resolve
   (`tools/declare-help.mjs`).

## Other

- The agent fetched two open-licensed fonts (Inter, Bricolage Grotesque) from Google Fonts with
  curl; the brief names neither. Not contamination (no Declare material); the font files are
  left out of this copy of the app.
- Running beside Ledger 9 cost it time: the Ledger agent had started its dev server on 8200
  (the README's default), and this agent found 8200 answering with the other run's tree before
  moving to its own port.

## Idiom

2,388 lines of Declare and a 326-line script (`geometry.ts`) of pure functions over the slide
data — allowed, but it includes hand-written hit-testing (`hits`, `hitTop`): the slide's shapes
are views that take no presses, and every press is resolved against the data. A line needs a
tolerance a view's box doesn't give; rectangles and ellipses could be views that take presses
(a shape clip hits an ellipse exactly), with `viewAt` for the rest. 53 color literals outside
the theme (mostly the color palette offered to the person). Reviewed against the SKILL's drift list:

- **Hit-testing by hand** (above), new this round. The SKILL's drift check and
  `09-pointer-and-keyboard.md` now say that what a person presses is a view whatever its shape:
  an outline through its `clip` path, a line as a thin rotated view (both verified).
- **28 `as any` in `model.declare`**, from two things: its maps declared `object`
  (`slides: object = { {} }  // id → MirrorSlide`) where `Record<string, MirrorSlide>` types
  them (it compiles; the guide never showed it, and `15-schemas.md` now does), and replies
  from sources with no `schema`.
- **One generic request source**: `req` takes a URL, method and body set just before each
  `fetch()`, an HTTP client in a `DataSource`. It serves a save queue with version conflicts,
  so it is motivated; one instance, noted, not taught against.
- The 4-second `poll` is a `Time` with its own period for changes made in another window,
  which the brief asks for and the service cannot push: fine.

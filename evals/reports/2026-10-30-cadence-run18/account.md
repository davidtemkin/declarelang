# Building Cadence in Declare: an account for the Declare team

First, a correction to my last message. I said the app was running at `http://127.0.0.1:8200/…`. The server did answer 200 when I checked it, but the background `npm start` exited with code 1 shortly afterwards, so it probably isn't running now. You asked me not to change anything, so I haven't restarted it. `npm start` in `declarelang/` will bring it back.

## (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md`'s order exactly: `docs/declare.md`, guide chapters 01, 04 and 05, then `apps/todo/todo.declare` and `todo-parts.declare` in full. After that I read only what I needed for specific parts:
- 10-touch § Pan and zoom
- 14-data § Talking to a server and § Forms
- 21-motion § Springs
- 12-text § Fonts
- 06-layout § Responsiveness
- the overlays chapter's headings
- verify.md's assert section

I also ran `npx declare-help` a few dozen times.

**What taught the most.**
- **The to-do app**, by a wide margin. Its `AddForm` showed the computed-default pattern: `list: string = { app.defaultList }`, which follows its formula until assigned. That became the core of my entry form, where defaults follow the chosen sport until the person nudges them. `Sheet [ … ] + exists = { …present }` and the `Tasks extends DataSource` shape were lifted almost directly.
- **`declare.md` §5's table** of *set* attributes versus *declared attributes with a computed default*. It's the single most important distinction in the language, and it's stated clearly.
- **Two `declare-help` entries** told me exactly what to do. `Spring` explains "it starts where it is going" and `arrive()`. `RichText.textStyles` showed how to set figures large inside one run of text.
- **The "write the value and its target together" example** in 21-motion. It gave me the year surface's whole interaction model in about ten lines.

**What was missing or misleading.**
- **Pan and zoom.** SKILL.md's table points to the calendar for a surface panned and zoomed about the fingers. A grep of `apps/**/*.declare` found no `onPinch` anywhere, and `onWheel` only once, in `lzx-dashboard`. So the only model was the fragment in 10-touch. It was correct, but I wrote pinch-plus-wheel-plus-drag on one view without ever seeing a working program do it. I'm not sure my `pinching` flag, and my handling of a finger lifting mid-pinch, are right.
- **Writing a record inside a handler.** §5 says a written attribute "reads back as written". I couldn't tell whether that holds for a dataset's contents after `removeAt`, so I rewrote `replace()` to set the whole sorted array. That may have been unnecessary.
- **Schema `?` versus JSON `null`.** The schema doc says `km: number | null` is the same as `km?: number`. In practice a body containing `null` failed to typecheck against my `Draft` schema (DECLARE6001: `'number | null' is not assignable to 'number | undefined'`). The service wants `null`, so I retyped `draft` as `object` and lost the checking. Either the doc's equivalence doesn't apply to values you construct yourself, or I misread it.

## (b) Expressing what I wanted

**Where it fit well.** The brief's hardest requirement was "nothing is stale and nothing needs a refresh", and that is exactly the language's grain.
- `week`, `streak`, `inView`, `hardest` and the year's weekly load are all constraints over `sessions.all()`.
- After a POST, the reply goes in through `sessions.take(s)`, and the week total, the streak, the bars, the year drawing and the "Hardest in view" line all followed. I wrote no update code at all.
- **"Numbers travel"** came almost for free: a `Figure` class with `shown` sprung to `value`. Because the whole page `exists = { app.ready }`, every spring is built after the data has arrived, so nothing counts up on open. That's exactly the case the Spring docs describe.
- **The year window** is two springs on `start` and `span`. The hand writes value and target together, the presets write only targets, and `day.onLoad` calls `arrive()`. It was about 30 lines of App methods, and it's interruptible without any code for interruption.
- **Form with a `source` DataSource** declared inside the form class (`post` and `put`), with the source chosen by `editing == null`, was a clean way to share one form between recording and correcting.
- **DECLARE4026** (four Choices that are really one choice) caught a genuine accessibility mistake I would have shipped.

**Where I worked around it.**
- **Mixed-size text that must read as exact copy.** The brief needs "4 sessions · 3h 40m" with the figures huge and the words small. I used `HTMLText` with `<span class='fig'>`. Four things went wrong along the way:
  - (1) A span containing only a space collapsed, so the gap I put between "4h" and "11m" did nothing.
  - (2) There's no way to keep "4h 11m" together, and at one width the line broke inside it. My fix is a heuristic, `figSize = min(heroSize, this.width * 0.2)`, which I don't trust at other widths or digit counts.
  - (3) A `WrappingLayout [align = baseline]` holding Figures failed R4 because the class declares no baseline. The diagnostic was good, but I didn't know how to state a baseline for rich text, so I switched to `align = end`.
  - (4) `--semantics` showed the line as `" sessions · h m"`. I added an `accessibilityLabel` to be safe, but I don't know whether a real screen reader would actually lose the figures.
- **A custom radio-style control.** Satisfying DECLARE4026 while keeping my box-shaped choices meant writing `Choice extends Control` with `(parent as RadioGroup).pick(...)`. I also copied `Radio`'s `onKeyDown` arrow-key logic, including `Focus.getFocus()` and a cast, from `library/radiogroup.declare`. Copying library internals is a smell; a base class like `RadioItem` would have avoided it.
- **Centering a label in a content-sized control.** `TextLabel [ x = center ]` inside a `Pill` made the pill's content width collapse to its padding. That produced the unreadable "2 wee|Season|Year" buttons and a clipped "+ Log session". Nothing in R4 flagged it; I only found it in a screenshot. Spacer–label–Spacer fixed it.
- **Drawing text in `draw()`.** I hard-coded `"700 11px -apple-system, system-ui, sans-serif"`, duplicating the App's font list and the `Label` size. I didn't find a way to reach the provided face from a `DrawContext`, though I didn't look hard.
- **Desk versus phone.** `ResponsiveLayout` handled the two-column arrangement well. But I mirrored `app.wide` decisions in a dozen constraints (`app.tap`, figure sizes, the presets' `State [ applied = { !app.wide }, width = 100% ]`). That's probably fine; it's what the to-do app does too.

## (c) Verifying it

- **`declare-verify`.** R1–R4 ran in a couple of seconds every time. The two real compile problems (the `draft` typing, the baseline) were each named with a usable fix.
- **`declare-look`.** This was the most valuable tool of the build. Screenshots caught every visual bug: the pill collapse, "81h 57m" reading as "81.57", the line breaking inside "4h 11m", faint grey making an easy session look disabled, and phone presets wrapping onto two lines. `--read`, `--js`, `--drag` and `--pinch` let me confirm the surface follows the hand (span 120→40 under a ×3 pinch) without writing a script.
- **Assert scripts.** Driving by label paths (`'app.entrySheet."Effort 8"'`, `'app.dlg."Delete"'`) is excellent; I never needed a selector. `expect.request("POST", …, { body })` checked the exact payload sent to the service.
- **Writes to the live service.** The tool said, every run, which writes it had sent and that earlier runs had left records behind. That was genuinely useful, because my first three runs failed on my own wrong expectations, not on app bugs. I miscounted "two days earlier" from a Wednesday, and I forgot Jul 31 extends the streak. Each failed run left a record that I deleted with curl. `--fixtures` would have avoided all of that, and I should have used it.
- **Where the tools fell short:**
  - `expect.text` doesn't see `HTMLText` content, so I asserted on `accessibilityLabel` and `html` instead.
  - `console.log` from an assert script didn't appear in the output.
  - After a save, a tap on the detail sheet's Edit apparently never registered, even though verify.md says a press on a covered view fails and names the cover. I guessed the toast was in the way, removed the save toast, and the flow passed. **I never confirmed that was the cause.**
- **Not checked at all:** I never ran `declare-profile`, despite a `draw()` that iterates every session on every pan frame. I didn't test dark mode (the app doesn't support it) or a real device's gesture arbitration.

## Surprises
- How much the derivations didn't cost me. I recompute week, streak, weekly load and in-view stats freely, and nothing visibly lagged in headless Chrome. I haven't measured it.
- The type checker knows theme tokens and schema fields inside `{ }` bodies, so misspellings would have died at compile time.
- The drift checklist in SKILL.md. I read it before writing and it changed what I wrote. For example, I kept dates in `script` only as pure functions, and kept state off script.
- The service-write accounting in verify.

## Good and bad
**Good:**
- One update model, with assignment as the only setter.
- Computed defaults.
- Springs as declarations, with `arrive()`.
- Diagnostics that name the fix.
- Label-addressed test driving.
- A small, readable surface: three files, with the App mostly a list of facts.

**Bad:**
- Rich-text figure typography is fragile: wrapping, collapsing spaces, baselines, semantics.
- Layout mistakes are silent; content size collapsing under `x = center` was found only by eye.
- Library controls aren't easily re-skinned without copying internals.
- The canonical pan/zoom pattern exists only as a doc fragment.

## Differences from what I'm used to
There's no render function, no hooks, no dependency arrays, no flexbox, and events don't bubble. Children come from datapaths rather than `.map`, and styles come from provided values rather than a cascade. Event handlers can't be async; a request is a member (`DataSource`) whose lifecycle you read as state. I had to unlearn reaching for `fetch` and `setState`. It did slow me down for the first hour, and after that it felt simpler.

## What it reminded me of
- **QML**, most strongly: property bindings, `State`, a `Spring` that resembles `Behavior on x`, and named child ids.
- **OpenLaszlo/Flex MXML**, which the README cites as its lineage.
- **Svelte's** `$:` reactive declarations.
- A **spreadsheet**, for the derived-value core.

## Where I'd most want improvement
1. A rich-text "keep together" option, plus a baseline and `expect.text` support for `HTMLText`.
2. A layout lint for a content-sized view whose children position themselves relative to it.
3. A worked pan/pinch/wheel surface in one of the shipped apps (perhaps the calendar the table already cites).
4. A documented base class for custom choice controls.
5. Making the schema's null-versus-optional rule match the doc's claim, or correcting the doc.
6. A way to use fonts from inside `draw()`.

## What I'd use it for
Given the choice, I'd use it for data-dense, glanceable apps that need direct manipulation and have to work on both phone and desk: dashboards, trackers, internal tools, interactive charts, and motion-heavy prototypes. For those, constraints plus springs gave me more quality per line than I'd expect from React. I'd hesitate for large content sites, or for anything that leans on an existing component or library ecosystem. I'd also want to see it past 1.0, and profiled on real devices, before betting a production mobile app on it. That hesitation comes from unknowns, not from any problem I actually hit.

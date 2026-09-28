# Building Murmur in Declare: an account for the Declare team

## (a) Getting up to speed

**What I read, in order.** I started with `README.md`, then `skill/SKILL.md`, then all of `docs/declare.md`, then `docs/operational/intake.md` and `docs/guide/01-what-declare-is.md`. After that I read the chapters the build needed: 14 Data, 07 Scrolling, 16 Collections, 13 Media, 06 Layout, 10 Touch, 20 Motion, 12 Text, 11 Paint and themes, 17 Custom components, 08 Controls, 05 Components, 21 Time, 15 Schemas, and 04 Run and check. I read the start of 19 URLs, parts of `verify.md` and `introspection.md`, and all of `apps/calendar/calendar.declare`. I used `npx declare-help` about a dozen times for exact names: `Socket`, `Media`, `Image`, `Animator.repeat`, `providedTextStyle`, `measureText`, `View.onHold`, `Font.family`, `Keys`.

**What taught me the most:**

- **`docs/declare.md`.** It really is the language in one sitting. The "Seven differences" section set my expectations correctly before I wrote a line.
- **The `SKILL.md` drift check.** It worked as a checklist I actually consulted. For example, it's why I derived `ready` from data instead of setting a flag.
- **Two passages that happened to be about my exact problem.** Chapter 21 uses a chat thread (`atEnd`, `markRead`) to teach `trackChanges`/`onChange`. Chapter 07's "Your scroll and theirs" says to ask because something *grew*, not because the offset looks right. Both shaped the design directly. I can't tell whether the docs anticipate chat apps or I got lucky.
- **The calendar source.** It showed house style at app scale: a theme spread over a preset, lerp/mix helpers on the App, springs on scalars. I copied several patterns from it, including `provided("theme")` inside App methods.
- **`declare-help`.** Fast and exact. The promise that "silence is trustworthy" made me trust it.

**What was missing or misleading:**

- **Following a constraint with a Spring.** Chapter 07's overlay example writes `x = { … }` with a bare `Spring [ attribute = x ]`, which reads as "a spring can follow a constraint." I used that shape for list rows (`y = { :rank * 80 }` plus a `Spring`) and for photo opacity. Both failed at runtime inside replicated rows: "ThreadRow.y is bound by a constraint — a direct write would be silently overwritten." Either the example works only outside replication or I misread it. Either way, the docs didn't tell me which. I switched to `Spring [ to = { … } ]`.
- **`padding` on a `Text`.** It accepted `padding = [8, 13, 9, 13]`, but the glyphs weren't inset horizontally; the text ran to the bubble's edge. Vertical padding seemed to apply. I wrapped the text in a padded `View` and moved on without investigating. I'm not sure whether this is a bug or I'm misusing `Text`, but the docs describe `padding` as a `View` attribute that `Text` inherits, so I expected it to work.
- **Sources inside a model class.** Chapter 05 ("Members with no pixels") and the Store/Log examples encourage putting `DataSource`s and friends inside a view-less model class. I put a `Socket` in my `Store`. It never connected: `status` stayed `"closed"`, `active` was true, the url was right, and there was no error or warning. I read `runtime/src/instantiate.ts` and found that `autoStart` runs only for children of views, not in `initNodeTree`. The `DataSource` in the same class looked fine only because I called `fetch()` myself. This cost the most time of anything in the build, and nothing warned me.
- **No chat or feed scrolling guidance beyond principles.** Nothing says "Declare views are absolutely positioned, so the browser's native scroll anchoring won't help you." I inferred it and prototyped to confirm.
- **`provided()` from App methods.** `docs/declare.md` says `provided(…)` "walks up, never to itself." Yet `provided("theme")` inside App methods worked for me, as it does in the calendar. I don't know why, so I relied on precedent, not understanding.

## (b) Expressing what I wanted

**Where the language fit my intent well:**

- **Derived datasets were the backbone.** `inbox: Dataset [ contents = { app.store.inbox(app.clock.now) } ]` and `talk: Dataset [ contents = { app.store.present(…) } ]` meant every event from the socket was one write to the working copy, and the list order, unread badges, run grouping, day stamps, receipts and typing text all followed. I never wrote update code. That is the pitch, and it held up.
- **Replication with inferred identity.** Giving each projected row a stable `id` (the local `key` for optimistic sends) meant the row survived the server swapping in the real message id. I didn't have to think about reconciliation.
- **`location` as the open conversation.** One line (`openId` derived from `app.location`) gave me the phone Back gesture closing a thread, for free. That delighted me.
- **One sprung scalar for navigation.** `depth` sprung 0↔1 drives the phone slide, the list's parallax and the dimming. The photo viewer is one `t` interpolating between the source rectangle (`rootOrigin()`) and the fitted target. Both were short, interruptible, and right on the first try.
- **`draw()` for the voice scrubber, knob glyphs and typing dots.** Canvas-shaped drawing that re-records when its inputs change is exactly the right tool. The write-only draw context caught me reading back `d.strokeStyle`, and the message named the rule.
- **Gesture claims.** `claim = x` on the scrubber, so a vertical swipe still scrolls, took one word. `onHold` plus `onClick` with a guard gave me press-and-hold on photos without also opening the viewer.
- **Schemas.** The typed `.value` caught real mistakes. The array diagnostic ("the array marker rides the NAME: write 'peaks[]: number'") taught me the syntax in one pass.

**Where I worked around the language:**

- **Keeping the reader's place.** This was the central problem, and I built it by hand. My first attempt made each row compensate when its own height changed (`trackChanges = ["height"]` plus `scrollBy`). A prototype suggested it worked. In the real app, rows keep refining their heights after creation (fonts, measurement), and a trace showed dozens of compensations during a single arrival. I replaced it with a pane-level anchor: remember which message is at the top and its offset; whenever `contentHeight` or `height` changes, scroll that message back. It works, but it's about 40 lines of imperative code in a language that otherwise avoids them. It also depends on finding a row's view by key, which leads to the next point.
- **Mapping a record back to its view.** Class names aren't values in bodies, so `instanceof MessageRow` was refused. I ended up with `childViews.slice(0, rows.length) as MessageRow[]`, relying on replicated children coming first. That is fragile, and I suspect there's a better way I didn't find.
- **Per-thread handler state.** An `object` attribute indexed by thread id didn't typecheck comfortably, and `any` isn't allowed in attribute or parameter types, although it is allowed in schema fields. I stored scroll places in a `Dataset` instead, which is arguably idiomatic but felt heavy. For the wire format I declared an `Event` schema with `message?: any`, since a reaction's `message` is an id while a new message's is a whole object.
- **Naming collisions.** I named a method `hold()`, and the compiler told me it was an *event* delivered to `onHold` ("DECLARE2000 … 'hold' is an EVENT here"). A clear message, but a surprising rule: my own method names can collide with event names. Similarly, `clip` couldn't be a child name because it's a `View` attribute, and a script function `initialsOf` was shadowed by an App method of the same name. That last one was a warning that named the problem exactly.
- **The socket moved to the App.** That's the workaround for the `autoStart` issue above. It's defensible ("the App owns the connection"), but it wasn't what I wanted to say.
- **Measuring text for bubble width.** `Math.min(measureText(:text, providedTextStyle({ fontSize: 16 })).width + …, max)` works, and the docs say a view has no `maxWidth` on purpose. For "shrink to fit, wrap at a cap," the most common text layout in a chat app, I'd still have liked a named idiom.

## (c) Verifying it

**What I used:**

- **`npx declare-verify` rungs 1–4 after every edit.** Sub-second. It reports every error at once, and nearly every diagnostic named its fix. Examples: "Dataset needs data — a literal JSON body or contents"; "names declared in a body take no type annotation"; "'bold' … inside { } write it as a string"; "View's SimpleLayout places its children, so this child does not declare its y." I applied each exactly as written and it converged fast. This is the best part of the toolchain.
- **A headless-Chrome harness I wrote myself** (puppeteer-core against the dev server) instead of rung 5. It opened threads by calling `__declare.find("app").open(id)`, read geometry with `rootOrigin()` and `scrollY`, and injected feed events by calling `app.store.receive({...})` directly. That last trick let me test reactions above the viewport without waiting 17 seconds for the scheduled one. The introspection bridge made all of this easy; being able to call model methods on a live app is powerful.

**Where the tools fell short:**

- **Rung 4 was green while the app was broken in the browser** at least four times: the draw-context read-back, the replicated Spring conflict, an out-of-range index in my run-grouping code, and the socket that never started. That's partly structural. The synthetic boot has no loaded data, so code paths that need a thread never ran. `verify` has a `--fixtures` flag I didn't use; it might have caught the index bug. I can't say whether it would have caught the others.
- **Silent failures are the gap.** The socket bug produced no diagnostic anywhere. A runtime warning like "Socket has an active url but was never started (declared under a Node)" would have saved real time.
- **An unexplained warning.** "onChange: 'contentHeight' changed again in the same settle chain — a ring of change handlers" appears whenever a thread settles. I believe it's harmless, since my handler's scroll request re-triggers the change, but I didn't confirm that, and I shipped with it.
- **Tools I didn't use.** I never used `__declare.explain`, the wake trace, or the Inspector, and I didn't write a formal rung-5 assert script. So I can't judge those tools; I only know I didn't reach for them. The trace might have shown the row-height churn sooner than my `console.log`.

## Surprises

- The Back button and `location` working with essentially zero code.
- How much of the app was derivation. Of roughly 1,200 lines, the imperative parts are the store's write methods, the anchor logic and a few handlers.
- That `onHold` doesn't consume the click. It's documented, but I only got it right because I read the doc first.
- The error app replacing my program after a boot failure. Helpful, but a little startling in headless screenshots.
- `afterSettle` inside an `onChange` handler doing exactly what I hoped: landing in the thread after its rows existed and were measured.

## Good and bad

**Good:**

- Compiler diagnostics are written for the reader who has to fix them.
- `declare-help` is exact.
- `docs/declare.md` fits in one head.
- Derived datasets plus replication plus schemas is a strong core.
- Springs on scalars make continuity cheap.
- `location` gives routing for free.
- Gesture claims are declarative.
- The introspection bridge is excellent for agent-driven testing.

**Bad:**

- Silent lifecycle gaps (sources in a `Node`).
- A gap between the synthetic boot and reality that let real errors through.
- `Text` padding behaving unexpectedly.
- No primitive for the scroll-position problems every chat or feed app has.
- Awkward record-to-view lookup.
- Type-position restrictions (`any` allowed in schemas but not attributes; class names not usable as values) that pushed me toward casts and slices.

## Differences from what I'm used to

- There's no render function and no JSX `map`; collections come from data. I adjusted in about an hour, and it felt better than React's model once I had.
- Events don't bubble, and "declared interest" decides hit-testing. My viewer's click-anywhere-to-close relied on a child with no handler letting the press reach the overlay, which worked, though I had to reason about it.
- Absolute positioning plus layouts, instead of flow, is closer to native toolkits than to the web. It's why browser scroll anchoring doesn't apply.
- Assignment really is the only update mechanism. I never missed `useEffect`; I did, once or twice, miss simply keeping a mutable map in a component.

## What it reminded me of

- **QML / Qt Quick**, most strongly: property bindings, `Behavior`-like springs, `anchors`-like `x = center`, and states.
- **OpenLaszlo**, which the README names as its ancestor. I only know it by reputation.
- **SwiftUI**, for the declarative tree and motion ambitions. Declare's bindings are more explicit and less magical.
- **MobX / Knockout**, for computed values that track what they read.
- **Excel**, a little, in how a constraint just stays true.

## Where I'd most want improvement

1. **Start sources inside `Node` subclasses,** or refuse them at compile time. The docs currently encourage the pattern that fails.
2. **A first-class idiom or primitive for anchored scrolling:** stick to the bottom when at the end, hold an anchor otherwise, and a way to look up a record's view. Every messaging, feed or log app needs it. My anchor code is the least declarative part of Murmur, and probably the least correct under a real finger (untested on a device).
3. **More of the build exercised before the browser:** booting with fixture data by default, and runtime lifecycle warnings surfaced at rung 4.
4. **Clarify or fix `padding` on `Text`, and say plainly in the docs whether a bare `Spring` can follow a constrained attribute.**
5. **Guidance on virtualization with variable-height rows plus anchoring.** I avoided `virtualize` entirely, so I don't know whether it would have held a 305-message thread steady. I'd want to know before trusting it with a longer history.

## What I'd use it for

- **Yes, gladly:** interactive, motion-heavy interfaces where continuity matters. Prototypes that need to feel finished. Dashboards, internal tools, and documentation-like sites that should also be crawlable. The strict compiler plus the introspection bridge make it unusually good for an agent writing and checking UI.
- **More cautiously:** production consumer apps with heavy text input on phones, or strict accessibility requirements. The docs say ARIA support is still growing, and I didn't test on a real device, IME, or screen reader, so I can't vouch for those.

My overall judgment is uncertain in one respect: this was one app built in one session, so I can't tell which rough edges were the platform and which were me.
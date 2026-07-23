# Field report — building a real storefront in Declare

**Status:** recorded 2026-07-21 (David + Claude), after building the Aperture `/dresses` UI
in Declare — an occasion landing, a free-text + chip narrowing dialogue backed by a real
intent extractor, a product detail view, animation, and browser history, in ~240 lines of
`.declare` over a small JSON backend-for-frontend. This is one author's first substantial
app, learning from the docs and example apps, so the friction below is roughly a new
author's first day. One of the findings is already addressed; more will be. The verbatim
impression and issues follow, then the action items.

---

Here's my honest take, having actually shipped something non-trivial in it.

## Impression

Declare is a genuinely good fit for this kind of work, and a few times it was a pleasure. The storefront — landing, conversational results, detail, animation, browser history — is **241 lines**. That compression is real, not golfed; the code reads like a description of the UI rather than instructions for building it.

Three things stood out as actually excellent:

**The repeater.** `datapath = { source.value }` on a parent, `datapath = :items[]` on a child, read fields with `:field` — and you get one live node per array element with no map/key/render boilerplate. Building a grid of product cards from JSON was the single easiest part of the whole project. This is the feature I'd lead with when selling the language.

**`location` as the URL is the state.** This is the best design decision in the language, and it's the reason "make browser back work" took *zero* extra code. I encoded the accumulated search constraints into `location`, and back/forward/bookmark/share all just worked because the view is a pure function of the URL. Most frameworks make you build a history stack and reconcile it; here the URL *is* the stack. That's a real idea, well executed.

**Springs and the compile-on-reload loop.** Hover-lift and screen cross-fades were a few lines of `Spring` each and felt right immediately. And editing a `.declare` file, reloading, and seeing the change — with compile errors rendered in-page with line and column — was a tight, honest loop. The error messages were consistently clear and correctly located, which is not a given for a young language.

The constraint model (`width = { parent.width }`, values that stay true rather than get set once) is pleasant, and the two-bracket rule is consistent enough that after an hour I stopped thinking about it. This felt like the language working *with* me for a reactive, data-driven UI.

The honest caveat: I spent more time fighting small gotchas than I expected for something this compact, and one of them cost real architectural rework. Almost all are fixable or documentable.

## Issues, roughly by how much they cost me

**1. Async writes to `location` silently don't stick.** This was the expensive one. Setting `app.location = ...` inside a `fetch().then()` callback did nothing — no error, no navigation, no console message. Synchronous writes in a handler work fine. I only found it by checking server logs and seeing the endpoint *was* hit but the URL never changed. It forced me to redesign the search flow (encode the query into the URL and let the server resolve it, instead of fetch-then-navigate). *Fix ideas: make reactive writes inside promise callbacks participate in the reactive transaction, or — at minimum — warn/throw when a `location` write is dropped so it fails loudly instead of silently.* This is the one I'd prioritize; silent no-ops are the worst failure mode.

**2. `contentWidth` doesn't re-measure reliably for reactive/data-driven text.** I used it to auto-size a pill and price badges (`width = { 22 + label.contentWidth }`). With static text it's fine; with text bound to data that arrives after first paint, the measured width reflected the empty/stale string, so pills clipped ("Night" wrapping, "$6" cut off). I fell back to estimating width from string length, which is obviously a hack. *Fix idea: re-measure `contentWidth` when the text's bound value changes.* Auto-sizing to content is a common need, so this one bites often.

**3. Colors inside `{ }` are a trap.** Named colors (`slategray`, `navy`) and `#RRGGBB` work in bare slots but silently fail or error inside `{ }` expressions, where you must write `0xRRGGBB`. And alpha (`#00000022`) had no clear equivalent inside `{ }`, so I couldn't animate a shadow's color and moved shadows to static bare slots. I hit this three separate times. *Fix ideas: accept `#RRGGBB(AA)` inside `{ }` too, or give a specific diagnostic ("named colors and `#` only work in bare slots; use `0x…` here") instead of a generic parse error.*

**4. `fontStyle` isn't a thing (no italic).** I wrote `fontStyle = italic` for the narrowing question and got a clean `Text has no attribute 'fontStyle'`. Fine as an error, but I couldn't find the intended way to italicize text. *If there's a mechanism, it wasn't discoverable; if there isn't, it's a gap for typographic UIs.*

**5. Reading a scalar array element is unclear.** My BFF first returned `description` as `["line one", "line two"]`. I couldn't find how an item template reads the datum when the datum *is* the string (all the examples read `:field` off an object). I worked around it by reshaping to `[{line: "..."}]` server-side. Similarly I dodged `:images[0]` (indexing a bound array) by adding an explicit `front` field, never confirming whether the index syntax works. *Worth documenting the scalar-datum and indexed-datum cases explicitly.*

**6. `DataSource` is GET-and-JSON only.** No POST (so I routed Aperture's POST `/intent` through my BFF), and it parses JSON, not JSONL or text-then-split. Both were reasonable to work around given I had a backend-for-frontend, but a Declare app talking *directly* to a typical REST API that needs POST would be stuck. *A `method`/`body` on `DataSource` would remove the need for a shim in a lot of cases.*

**7. Derived attributes must be a single expression.** `resultsUrl = { ...multi-statement logic... }` doesn't work — `{ }` in an attribute is an expression, not statements — so I moved parsing logic into a method and called `{ app.buildResultsUrl() }`. That's a fine pattern once you know it, but the failure wasn't obvious at first. *A one-line note in the docs would save the confusion.*

**Minor friction, learnable:** the comma-as-terminator rule (every member line ends with `,`, including a closing `],`) took a few compile errors to internalize; `100%` works bare but `{ 100% }` doesn't; and the overall **discoverability of the attribute surface** is the through-line behind #4 and parts of #3/#5 — I learned what attributes `Text`/`View`/`Image` accept mostly by grepping example apps and hitting errors. A per-component attribute reference (or editor autocomplete) would have prevented most of my small stumbles.

If I could wave a wand at one thing: **#1 (silent async `location` writes)**, because silent no-ops erode trust in the reactive model, and **#2 (`contentWidth`)**, because auto-sizing is everywhere. The rest are mostly documentation and diagnostics — cheap to address and they'd smooth the first-hour experience a lot, which for a language trying to win people over is exactly the hour that matters.

---

## Action items

Derived from the findings above. Grouped by kind, because the split matters: two are runtime
behavior, a few are diagnostics, and the rest are documentation — and the doc ones are cheap
wins that land in the first hour. Check them off as they're addressed.

### Runtime / semantics
- [x] **A1 — Async `location` writes (finding #1).** *Does not reproduce on the current rev*
  (the report predates some fixes; likely resolved as a side effect of the `app`→`this.root`
  rewrite and sharper diagnostics). Verified in a real browser: a `location` write from a
  microtask (`Promise.then`), a macrotask (`setTimeout`, ~fetch latency), and a direct async
  write all take effect and push history — the URL/history mirror is a per-frame rAF loop
  (`host-client.js` locTick), so it catches a change whenever it lands; timing is irrelevant.
  The failure modes that *would* break it now fail LOUDLY at compile, not silently: `fetch`
  is not a body global (a handler calling it errors "nothing in scope is named 'fetch'" —
  DataSource is the network path, see A9), and a non-arrow `.then(function(){…})` callback
  loses `this` so `app` (→`this.root`) breaks ("'this' implicitly has type any"). Nothing to
  fix; the mechanism is sound.
- [x] **A2 — `contentWidth` re-measures on bound-value change (finding #2).** Root cause was
  deeper than "doesn't re-measure": `Text` never overrode `contentExtent`, so `contentWidth`/
  `contentHeight` on a `Text` returned the base 0 — a box sizing to `label.contentWidth` read
  empty for *any* text, static or bound. `Text.contentExtent` now folds in the measured glyph
  extent (the natural single-line width; height by wrapped line count when bounded), read
  under tracking, so it re-derives when `text` or the font changes. Verified real-browser: a
  pill `width = { 20 + t.contentWidth }` fits its text and grows 36→198px when the bound label
  lengthens; unit-tested headless (field report A2).

### Diagnostics
- [x] **A3 — Colors in `{ }` (finding #3).** Targeted diagnostic now, in both forms: a
  `#`-hex color inside `{ }` (digit- *or* letter-first — the latter lexed as a private
  identifier and slipped to typecheck; now caught at structure phase) reports "inside { } a
  color is written 0x334455, not #334455 …", with shorthand expanded so the suggestion is
  exact; a *named* color (`navy`) reports "'navy' is a named color … write it as 0x000080"
  (DECLARE4004) instead of a flat "unresolved". A `#hex` inside a string is untouched.
- [x] **A4 — Expression-vs-statement error (finding #7).** An attribute `{ }` holding
  statements (a `let`/`const`, a `;`, multiple lines) now reports "an attribute value is one
  expression, not statements; move the logic into a method and call it (e.g. { classroot.compute() })"
  instead of a generic parser error. Method/handler bodies (where statements are legal) are
  unaffected.

### Documentation
- [x] **A5 — Text slant/italic (finding #4).** `italic = true` already works on `Text` and
  is documented in the reference; the gap was discoverability. Added a guide mention in
  06-style ("Slant is separate: `italic = true` … it does not prevail") next to the
  prevailing text attributes. `fontStyle` was the author's wrong guess, not a missing feature.
- [x] **A6 — Scalar and indexed data (finding #5).** Confirmed by probe: `:owner.name`
  (nested) and `:images[0]` (indexed) both compile; a *scalar* datum has no `:` accessor.
  Documented all three in 08-data (the `:path` section), with the reshape workaround and the
  bare-scalar cursor recorded as a known gap.
- [x] **A7 — Attribute-value forms note (finding #7).** Corrected the imprecise two-brackets
  line (it said a `{ }` body "takes expressions and statements"): an **attribute value** `{ }`
  is a single expression — statements go in a **method/handler body**, with the move-to-a-method
  fix named.
- [~] **A8 — Attribute-surface reference (minor / through-line).** Doc half **done**: the
  reference is now code-derived per component (attribute tables per built-in and library
  element) and browsable in the desktop Files app — authors no longer grep examples for the
  surface. Editor autocomplete over the checker's data remains open.

### Capability (larger, optional)
- [x] **A9 — `DataSource` POST / body (finding #6).** `method` (default `"GET"`) and `body`
  are now attributes on `DataSource`. A non-GET request sends `body`: an object/array is
  JSON-encoded with a JSON `Content-Type`, a string is sent verbatim, GET sends none. The
  transport seam was widened to carry a `RequestInit`; the headless refuser is unchanged
  (network still honestly absent under extraction). Unit-tested (request shaping + the
  compiler accepting the attrs). The `format = "jsonl"` idea is left as a separate follow-up.

### Deferred niceties
- [ ] **A10 — Comma-terminator and `100%`-in-`{ }` gotchas (minor).** Either a targeted
  diagnostic or a short "common first-compile errors" doc section; low severity, high
  frequency for newcomers.

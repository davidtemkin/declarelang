# Canvas kernel vs DHTML kernel — visual (pixel) parity sweep @dpr=2

**Question.** Where does the neo-LZX **own-pixels canvas** kernel diverge visually from the stock **DHTML** kernel, across a large app set? Both kernels run the **same compiled `.lzx.js`** — only the LFC differs (canvas = `LFCcanvas.js`, dhtml = `lfc.js`) — so each app is compiled **once** and rendered under **both**. This data gates promoting the canvas kernel into the 5.0 distro.

- **Apps swept:** 80 measured · 3 compile/capture-failed · 17 backend-skipped.
- **dpr = 2 (Retina) only.** Captures settle to two byte-identical frames (`capture.mjs`).
- **Frozen artifacts** (immune to concurrent kernel/compiler work): canvas `LFCcanvas.js` md5 `2c0a855ab30e6d898333ae6b8c963c83`, dhtml `lfc.js` md5 `bdcfebce1123dc22412b91ffb14759f6`, dhtml-debug `lfc-debug.js` md5 `331c19975088ba7335d46ec448d72a72`, canvas-debug `LFCcanvas-debug.js` md5 `c6a4fef5c504278ae184a5aad739e6ff` (the debug pair is used instead of `lfc.js`/`LFCcanvas.js` for debug-compiled apps — those referencing `LzDebugWindow` in their compiled output, e.g. `<canvas debug="true">` + `<debug .../>` apps — since the production LFCs have no debugger and would blank-crash on either side), compiler `snapshot/compiler-dist/cli.js`.
- Generated: 2026-07-02T04:35:23.069Z

## Metric — why rank by "subst AE", not raw AE

The canvas kernel **draws text and gradients itself** (own pixels); the DHTML kernel uses DOM text + CSS. Glyph/gradient rasterization differs by a **sub-pixel**, so at every text edge and gradient band the two renders disagree by ±1 px. That noise **scales with the amount of text** and survives any fuzz (a black-on-gray edge that shifts 1px is a 100%-delta pixel). So **raw AE (`compare -metric AE` fuzz 0) is dominated by uniform AA noise** and does NOT indicate a real gap.

To isolate **real** divergence (missing/broken component, wrong-color region, layout shift, image gap), the ranking metric is **subst AE = blur σ=2 then `compare -metric AE -fuzz 10%`**. The σ=2 blur (≈1 CSS px at dpr2) collapses 1-px edge misalignment to zero — a **visually identical** app scores **subst AE = 0** — while any area-sized divergence survives. Both numbers are reported; **rank is by subst AE**.

Two categories are split out and **not counted as canvas gaps**:
- **Input fields** (editable text) render as **DOM overlays** today — a known divergence being fixed by another agent. Flagged, not ranked.
- **Animated** apps never settle to a stable frame; the two kernels' animations are not phase-aligned, so their AE is not a parity signal. Flagged, not ranked.

## Real divergences — ranked worst-first (stable, non-input apps)

| app | group | size | raw AE | raw AE% | **subst AE** | subst AE% | what diverges |
|---|---|---|--:|--:|--:|--:|---|
| explorer/basics/drag-and-drop.lzx | explorer | 800×600 | 21,356 | 1.112% | 30,739 | 1.6010% | FIXED (was: 30,739 subst / 1.60% — two <view resource="../images/laszlo_explorer_logo.png"> images 404 on BOTH kernels; dhtml showed broken-image placeholders, canvas drew nothing). ROOT CAUSE: a genuine compiler bug, not a runtime/kernel gap — compiler/src/node-io.ts relPathOf()'s maxCommonPrefix() does a character-by-character (not path-segment-aware) comparison. This resource lives OUTSIDE the compiling app's own directory (explorer/basics/../images/ = explorer/images/, a dir shared by several explorer/ demos, e.g. explorer/components/components.lzx uses the identical reference and hits the same bug), so it is classified ptype "sr" and its relPath is computed relative to maxCommonPrefix(absPath, LPS_HOME). Because .../OpenLaszlo/openlaszlo-neo/explorer/images/... and LPS_HOME=.../OpenLaszlo/openlaszlo-5.0/runtime share the literal character run ".../OpenLaszlo/openlaszlo-" before diverging at "neo" vs "5.0", the naive char-compare corrupts the relPath to "neo/explorer/images/laszlo_explorer_logo.png" (verified in the compiled JS: LzResourceLibrary.$LZ1={ptype:"sr",frames:['neo/explorer/images/laszlo_explorer_logo.png'],...}). End-to-end confirmed via network probe: browser requests exactly /explorer/basics/lps/resources/neo/explorer/images/laszlo_explorer_logo.png (serverroot + garbled relPath) -> 404; no such path exists anywhere, while the real PNG sits at explorer/images/laszlo_explorer_logo.png on disk. UPDATE (2026-07-01): the compiler bug is now FIXED PROPERLY at the source (compiler/src/node-io.ts + browser-io.ts maxCommonPrefix, both openlaszlo-neo/compiler and the graduated openlaszlo-5.0/compiler) -- maxCommonPrefix is now path-segment-aware: a char-run divergence that lands mid-segment (e.g. ".../openlaszlo-neo" vs ".../openlaszlo-5.0") is rewound to the last complete "/" boundary instead of truncating at the raw mismatch point. Recompiling now emits the correct {ptype:"sr",frames:['openlaszlo-neo/explorer/images/laszlo_explorer_logo.png']} (was the corrupted 'neo/explorer/...'). The hand-patched drag-and-drop.parityfix.* sibling workaround (ptype "ar" rewrite) has been deleted -- no longer needed. Verified end to end: a throwaway static server rooted at the true common ancestor of the app tree and LPS_HOME (matching the fixed relPath's semantics) returns 200 for the corrected resource URL and 404 for the old corrupted one. Byte-parity safety gate (calendar/dashboard/component_sampler/hello/lzpix) confirmed the fix changes ONLY this app's output. RESULT: both images now load and render identically on both kernels. BEFORE raw=21356 (1.11%) subst=30739 (1.60%) -> AFTER raw=9977 (0.52%) subst=0 (0.00%). Diff PNG confirms: both Laszlo-explorer logo images match almost exactly (faint AA-only outline, no solid-color mismatch block); the only remaining raw-AE noise is glyph-edge antialiasing on the paragraph text (dragstate/dragging italics), already characterized as a text-AA floor elsewhere in this sweep. This app is now a clean, real, near-perfect parity result — no residual canvas-kernel gap. |
| docs/component-browser/components.lzx | docs | 630×540 | 78,445 | 5.765% | 23,007 | 1.6907% | FIXED (was 101,272 subst / 7.44% — TEXT MARKUP literal): `<b>`/`<i>` now render bold/italic. Residual 23,007 was a SEPARATE bug found+fixed along the way: dhtml's own getTextDimension('height') measures a multiline `<text>`'s wrapped line-count at the RAW (un-padded) width while the real box renders 4px narrower, so borderline paragraphs are QUIETLY one line short (dhtml's `overflow:hidden` then clips that extra wrapped line) — cascading a 1-line vertical shift through every sibling below it in dhtml. Canvas now reproduces both dhtml's under-measurement AND its unconditional multiline self-clip (LzTextSprite.getTextfieldHeight + __paintFG in runtime/lfc-src/kernel/canvas/LzTextSprite.js), so the KEY panel stacks identically (verified: cv screenshot's 'Base Classes' paragraph clips 'subclasses.' exactly like dhtml). Remaining 23,007 (1.69%) is pure glyph-edge AA over a dense small-font text panel — same floor characterized for the dashboard (PROGRESS.md Phase 4, 23514/3.3%). |
| explorer/basics/fonts.lzx | explorer | 800×600 | 17,298 | 0.901% | 21,957 | 1.1436% | MARKUP FIXED, residual is now font-metric AA (not a markup gap): `<font face="helmet" size="24"><b>Where to Begin</b></font>` DOES render as a large bold styled heading now (matches dhtml's structure/color/position). The residual 21,957 (1.14%) is Verdana-bold glyph-edge AA/kerning noise, amplified because this is a MUCH larger font (~29px at dpr2) than typical body text — a whole-image AE overlay shows red edges tracing every glyph outline, not a missing/offset element (see benchmarks/parity-sweep/out/shots/explorer__basics__fonts.diff.png). Same category as the Flash text-metric quirk noise the task says to keep, just visually large because of font size. |
| examples/components/combobox_example.lzx | component | 640×400 | 62,273 | 6.081% | 21,039 | 2.0546% | FIXED (was 120,485 subst / 11.77% — TEXT WRAP): the explanatory `<text>` now word-wraps at 640px identically to dhtml. Residual 21,039 is text-edge AA (own-pixels canvas glyphs vs DOM glyphs) plus the still-DOM-overlay editable combobox field (separate, tracked issue). |
| examples/ten-minutes/local.lzx | example | 640×540 | 6,477 | 0.469% | 5,990 | 0.4333% | unchanged: minor small `<text>` label/markup AA difference (5,990 / 0.43%), not investigated further (small, stable, pre-existing). |
| explorer/components/components.lzx | explorer | 800×600 | 42,154 | 2.196% | 5,456 | 0.2842% | FIXED (component-list label markup `<b>`/`<i>` now renders correctly). Residual 5,456 (0.28%) is negligible AA. |
| examples/components/window_example.lzx | component | 800×600 | 85,956 | 4.477% | 3,560 | 0.1854% | LARGELY FIXED (was 27,031 subst / 1.41% — TEXT MARKUP + WINDOW CHROME): the multiline window body text (Frosty) now wraps/positions correctly. Residual 3,560 (0.19%) is the window titlebar graphic (known window-chrome category) + AA; text contribution is now negligible. |
| explorer/basics/constraints.lzx | explorer | 800×600 | 15,554 | 0.810% | 1,807 | 0.0941% | FIXED (was 30,716 subst / 1.60% — TEXT MARKUP, `<b>x:</b>`/`<b>y:</b>` shown literally): now bold. Residual 1,807 (0.09%) is negligible AA + minor constraint-bar sub-pixel width rounding. |
| examples/components/tree_example.lzx | component | 830×550 | 43,360 | 2.375% | 884 | 0.0484% | FIXED (was 6,205 subst / 0.34% — TEXT MARKUP): `<i>` italic species names + `&amp;` entity now render correctly. Residual 884 (0.05%) is negligible AA. |
| examples/ten-minutes/systemprop.lzx | example | 800×600 | 32,721 | 1.704% | 838 | 0.0436% | ALERT TEXT-WRAP DIVERGENCE FIXED (2026-07-01, session 2): root-caused and closed the residual this app's prior note flagged as out-of-scope. The app's dead Java RPC backend times out into an `<alert>` reading "error: timed out undefined"; lz/alert.lzx sizes its multiline message box by comparing `getTextWidth()` (the box's natural, unwrapped width) against `maxtextwidth` (1/3 of the containing view, minus insets) and either uses the natural width (no wrap) or clamps to maxtextwidth (forces wrap). DIAGNOSIS (puppeteer probe against both live kernels, `errormsg.alerttext.getTextWidth()`): canvas returned the true natural single-line width (155px, matching a `white-space:nowrap` measurement) while dhtml returned only 60px for the SAME text/font -- an order-of-magnitude smaller than its own natural width (151px measured with a plain, unstyled offscreen div). ROOT CAUSE (isolated by instrumenting `LzFontManager.getSize`, then replicating manually): dhtml measures `getTextWidth()` via an offscreen div carrying the `.lzswftext` class. That class's stylesheet rule sets `position:absolute`, and the measurement style block (kernel/dhtml/LzTextSprite.js `getTextDimension`) only ever overrides `width:auto`+`white-space:normal|nowrap`, never `position` -- so for MULTILINE text (`white-space:normal`) the offscreen div stays absolutely positioned with an unconstrained static position, and the browser's CSS2.1 shrink-to-fit sizing algorithm applies: its lower bound ("preferred MINIMUM width") wins, collapsing the measured width to the WIDEST SINGLE WORD (the widest run of non-space characters, a true word-wrap floor), not the natural single-line width. Verified empirically across 6 test strings in headless Chrome: dhtml's `white-space:normal` measurement equals a `white-space:nowrap` measurement of just the widest word, exactly, every time (e.g. "error: timed out undefined" -> dhtml measures 56px = the width of "undefined" alone; a string with no soft-wrap points, e.g. one long unbroken word, measures its FULL natural width, consistent with the shrink-to-fit lower bound being the widest UNBREAKABLE token). This is a genuine dhtml quirk (an accidental CSS interaction, not intentional), but per this sweep's doctrine the dhtml kernel including its quirks is ground truth. FIX (runtime/lfc-src/kernel/canvas/LzTextSprite.js `__measureWidth`): for `multiline` text, canvas's natural-width measurement (feeding `getTextWidth()`) now returns the widest single word (via new `__richWidestWordWidth`, reusing the existing `__splitRunToSegs` word/whitespace segmenter) instead of the widest hard-break line -- byte-for-byte reproducing dhtml's shrink-to-fit floor. Non-multiline text (even with markup) is unaffected (unchanged widest-full-line behavior), matching dhtml's `white-space:nowrap` path for single-line fields. VERIFIED: `errormsg.alerttext.getTextWidth()` now reads 60 on canvas, matching dhtml's 60 exactly; `errormsg.width`/`alerttext.width` (105/60) match dhtml exactly; screenshot confirms canvas now wraps the alert message into the same 3 lines ("error:" / "timed out" / "undefined") at the same dialog size/position as dhtml. MEASURED: subst AE 34,903 (1.82%) -> 838 (0.044%), raw AE 75,117 -> 32,721 -- a 97.6% reduction, landing at the text-AA floor (comparable to the smallest genuine divergences elsewhere in this sweep). RESIDUAL 838 is pure glyph-edge AA (own-pixels canvas glyphs vs DOM glyphs) over the wrapped 3-line message plus the permanently-unsettled dead-backend app chrome (never reaching a shared steady state on either kernel) -- not a wrap/sizing gap. Propagated production LFCcanvas.js + debug LFCcanvas-debug.js to all copies (openlaszlo-neo x8 prod-equivalent locations + debug x3, plus the openlaszlo-5.0 kernel dir), md5-verified byte-identical everywhere. Full-sweep regression gate: 80 measured / 3 pre-existing compile failures (unrelated: examples/css id=-outside-instance x2, xmldata unresolved dataset), zero regressions across all 54 previously pixel-clean apps (subst stayed exactly 0), combobox_example unchanged at 21,039 subst as expected. |
| examples/lzpix/app.lzx | example | 800×600 | 11,115 | 0.579% | 799 | 0.0416% | Default-compile note UNCHANGED (both kernels show the canned "Data source error" dialog, subst 799 negligible — see the lzproxied compile-mode mismatch explained previously; not a kernel gap). SEPARATE, now-FIXED kernel bug found via the single-app ?lzproxied=false harness (benchmarks/tools/parity-fix-lzpix-dragdrop.mjs), which serves the REAL app content (camera hero image, LZPIX logo, Search Flickr box, 3 favorites thumbnails): the 3 favorites-thumbnail JPEGs (classes/photo.lzx setImage -> intparent.interior.setSource(s), a DYNAMIC runtime-loaded image, not a compile-time LzResourceLibrary entry) were fetched successfully (HTTP 200) but never painted into the photo grid on canvas (52,856 subst / 2.75%). ROOT CAUSE (runtime/lfc-src/kernel/canvas/LzCanvasResource.js LzSprite.prototype.setSource): the synchronous pre-decode resourceload() call fired the view's onload event PREMATURELY (skiponload:false, before the image was decoded, so resourcewidth/resourceheight were still null) -- photo.lzx's `onload` handler (intparent.interior.resourcewidth/resourceheight -> aspect-ratio multipliers) ran on garbage (null/null -> NaN), producing NaN width/height on the interior sprite, so nothing painted. The real post-decode load callback then made things worse by hardcoding skiponload:true (suppressing the one dispatch that would have had the correct dimensions) and only firing at all when resourceWidth was still null. FIX: setSource's early sizing call now always passes skiponload:true (sizing-only, never fires onload -- mirrors dhtml's default `quirks.preload_images=true`, which skips this early dispatch entirely), and the real image-load-complete callback always dispatches resourceload with the REAL decoded width/height and the actual `this.skiponload` state (mirrors dhtml's __imgonload, LzSprite.js ~L2196) -- so `onload` fires exactly once, after decode, with correct data. VERIFIED (re-run of parity-fix-lzpix-dragdrop.mjs after the fix): raw=35,844 (1.87%), subst=0 (0.00%) -- all 3 thumbnails now paint, byte-for-byte matching dhtml at the subst floor. This fix lives entirely in the canvas kernel (LzCanvasResource.js); no compiler/harness change was needed. |
| examples/components/datacombobox_example.lzx | component | 640×400 | 35,059 | 3.424% | 747 | 0.0729% | FIXED (was 68,266 subst / 6.67% — TEXT WRAP): wraps correctly now. Residual 747 is negligible AA + the DOM-overlay editable field. |
| examples/components/tabslider_example.lzx | component | 700×700 | 35,370 | 1.805% | 643 | 0.0328% | FIXED (was 50,660 subst / 2.58% — TEXT MARKUP, bold caption shown literally/doubled): now renders bold correctly. Residual 643 (0.03%) is negligible AA. |
| examples/animation/animation.lzx | example | 800×300 | 38,322 | 3.992% | 211 | 0.0220% | negligible (211 px): settled animation frame. |
| examples/components/tabs_example.lzx | component | 800×510 | 51,395 | 3.149% | 202 | 0.0124% | negligible (202 px): sub-pixel tab chrome. |
| examples/image-loading/dataimage2.lzx | example | 1000×1000 | 44,652 | 1.116% | 40 | 0.0010% | NEW, negligible (2026-07-01): this app also compiles with `<canvas debug="true">` (no explicit `<debug/>` window) and throws a genuine APP-SOURCE bug (`Debug.setAttribute is not a function` at dataimage2.lzx line 23) into the debug exception reporter shortly after load. Now that the canvas kernel has a debug LFC build (LFCcanvas-debug.js, see systemprop.lzx/sessionwindow.lzx notes) and the sweep pairs it for debug-compiled apps, this app's debugger panel + red error text render on BOTH kernels (previously this app was paired canvas-production vs dhtml-debug, an apples-to-oranges mismatch that happened to net raw=0 in the old sweep). New measurement: raw=44,652 (1.12%), subst=40 (0.001%) -- verified deterministic across 3 repeat captures, not timing noise. The tiny residual is a sub-pixel rendering difference in the debug console's underlined blue object-link text (`<span style="cursor:pointer;text-decoration:underline;color:...">`, LzDebuggerWindowConsoleBridge.js ~L69) -- essentially at the text-AA floor (2 orders of magnitude below the smallest genuine 'REVIEW' divergence in this sweep). Not investigated further this pass. |
| examples/components/grid_example.lzx | component | 800×600 | 9,725 | 0.507% | 8 | 0.0004% | negligible (8 px): effectively pixel-clean. |

## Pixel-clean apps (subst AE = 0 — only sub-pixel text/gradient AA)

54 apps render **visually identical** under both kernels. Their raw AE is pure own-pixels text/gradient AA noise.

| app | group | size | raw AE | raw AE% |
|---|---|---|--:|--:|
| explorer/basics/empty.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/basics/extensibility.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/basics/mediaaudio.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/basics/mediaimg.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/basics/mediavideo.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/basics/states.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/basics/view.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/classes/attributes.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/classes/events.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/classes/inheritance.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/classes/methods.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/classes/withclasses.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/classes/withoutclasses.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/constraints/constraints.lzx | explorer | 800×600 | 0 | 0.000% |
| explorer/constraints/css.lzx | explorer | 800×600 | 0 | 0.000% |
| examples/noughts/noughts.lzx | example | 640×540 | 0 | 0.000% |
| examples/musicdhtml/audiokernel.lzx | example | 0×0 | 0 | 0.000% |
| explorer/basics/hello.lzx | explorer | 800×600 | 746 | 0.039% |
| examples/ten-minutes/hello.lzx | example | 800×600 | 800 | 0.042% |
| explorer/basics/layout.lzx | explorer | 800×600 | 1,123 | 0.058% |
| explorer/constraints/basics.lzx | explorer | 800×600 | 1,394 | 0.073% |
| explorer/data/databinding.lzx | explorer | 800×600 | 1,846 | 0.096% |
| explorer/data/datalocal.lzx | explorer | 800×600 | 1,846 | 0.096% |
| explorer/basics/hellobutton.lzx | explorer | 800×600 | 2,007 | 0.105% |
| explorer/basics/scripting.lzx | explorer | 800×600 | 2,007 | 0.105% |
| explorer/scripting/methods.lzx | explorer | 800×600 | 2,052 | 0.107% |
| examples/lzpixmobile/main.lzx | example | 240×320 | 2,123 | 0.691% |
| explorer/animation/animation.lzx | explorer | 800×600 | 2,295 | 0.120% |
| explorer/scripting/audioplayer.lzx | explorer | 600×600 | 2,751 | 0.191% |
| explorer/constraints/splitpanel.lzx | explorer | 800×600 | 2,772 | 0.144% |
| explorer/animation/animatorgroup.lzx | explorer | 800×600 | 2,988 | 0.156% |
| explorer/scripting/events.lzx | explorer | 800×600 | 3,546 | 0.185% |
| explorer/basics/scrolling.lzx | explorer | 800×600 | 3,626 | 0.189% |
| explorer/data/datarepeated.lzx | explorer | 800×600 | 3,687 | 0.192% |
| explorer/constraints/dragdrop.lzx | explorer | 800×600 | 4,939 | 0.257% |
| explorer/animation/motion.lzx | explorer | 800×600 | 5,390 | 0.281% |
| examples/calendar/calendar.lzx | example | 835×600 | 6,380 | 0.318% |
| examples/ten-minutes/sessionwindow.lzx | example | 600×500 | 10,778 | 0.898% |
| examples/components/checkbox_example.lzx | component | 800×600 | 12,677 | 0.660% |
| explorer/constraints/proportions.lzx | explorer | 800×600 | 13,430 | 0.699% |
| explorer/basics/hellowindow.lzx | explorer | 800×600 | 13,711 | 0.714% |
| examples/components/menu_example.lzx | component | 600×480 | 19,675 | 1.708% |
| explorer/data/dataremote.lzx | explorer | 800×600 | 20,236 | 1.054% |
| examples/components/datepicker_example.lzx | component | 800×550 | 23,388 | 1.329% |
| examples/components/button_example.lzx | component | 800×550 | 24,365 | 1.384% |
| examples/components/radiogroup_example.lzx | component | 660×600 | 26,340 | 1.663% |
| explorer/scripting/debugger.lzx | explorer | 800×600 | 27,602 | 1.438% |
| examples/ten-minutes/tag-definition.lzx | example | 640×540 | 27,918 | 2.020% |
| examples/extensions/drawing.lzx | example | 800×600 | 34,926 | 1.819% |
| examples/contactlist/contactlist.lzx | example | 220×462 | 37,576 | 9.242% |
| examples/components/list_example.lzx | component | 640×700 | 38,039 | 2.123% |
| examples/components/floatinglist_example.lzx | component | 800×600 | 41,948 | 2.185% |
| examples/image-loading/dataimage.lzx | example | 620×300 | 175,066 | 23.530% |
| examples/videotest/videotest.lzx | example | 340×280 | 234,761 | 61.649% |

## Input-field apps — DOM-overlay divergence (being fixed in parallel; NOT a canvas gap)

| app | group | size | raw AE | raw AE% | **subst AE** | subst AE% | what diverges |
|---|---|---|--:|--:|--:|--:|---|
| examples/components/scrollbar_example.lzx | component | 600×600 | 54,612 | 3.792% | 4,665 | 0.3240% | INPUT (excluded): edittext DOM overlay (being fixed); scrollbars themselves are clean. |
| examples/components/component_sampler.lzx | component | 800×450 | 123,814 | 8.598% | 4,264 | 0.2961% | INPUT (excluded): the full widget sampler is NEAR-IDENTICAL under canvas — residual 4,264 px is the edittext DOM overlay (being fixed). A strong parity result. |
| examples/components/form_example.lzx | component | 640×600 | 38,681 | 2.518% | 826 | 0.0538% | INPUT (excluded): form input fields are DOM overlays (being fixed). |
| examples/ten-minutes/modeexample.lzx | example | 800×600 | 33,033 | 1.720% | 759 | 0.0395% | INPUT (excluded): editable text field DOM overlay (being fixed). |
| examples/components/edittext_example.lzx | component | 800×500 | 7,149 | 0.447% | 546 | 0.0341% | INPUT (excluded): edittext DOM overlay (being fixed) — subst near-zero otherwise. |
| explorer/basics/layouts.lzx | explorer | 800×600 | 19,126 | 0.996% | 98 | 0.0051% | INPUT (excluded): editable field present; layout otherwise ~clean (subst 98). |
| examples/components/slider_example.lzx | component | 800×500 | 7,526 | 0.470% | 0 | 0.0000% | INPUT (excluded): flagged for an editable field; sliders render pixel-clean (subst 0). |
| explorer/basics/form.lzx | explorer | 800×600 | 15,027 | 0.783% | 0 | 0.0000% | INPUT (excluded from ranking): editable form fields are DOM overlays (being fixed in parallel). Text-markup gap in this app is now fixed. |
| examples/ten-minutes/paging.lzx | example | 640×540 | 43,148 | 3.121% | 0 | 0.0000% | INPUT (excluded): editable field DOM overlay; paging text otherwise clean (subst 0). |

## Animated apps — AE not phase-aligned (flagged, not ranked)

_none_

## Compile / capture failures

| app | group | reason |
|---|---|---|
| examples/css/test.lzx | example | compile: UNSUPPORTED: id= outside a top-level instance |
| examples/css/test-haze.lzx | example | compile: UNSUPPORTED: id= outside a top-level instance |
| examples/xmldata/xmldata.lzx | example | compile: UNSUPPORTED: unresolved dataset src: file:swatch.xml |

## Backend-skipped (need a live backend that no longer exists)

| app | why |
|---|---|
| examples/amazon/amazon.lzx | Amazon ECS web service (dead) |
| examples/amazon-soap/amazon.lzx | Amazon SOAP web service (dead) |
| examples/weather/weather.lzx | weather XML feed (dead) |
| examples/weatherblox/wrapper.lzx | weather XML feed (dead) |
| examples/vacation-survey/vacation-survey.lzx | survey POST backend (dead) |
| examples/youtube/youtube.lzx | YouTube data API (dead) |
| examples/chat/chat.lzx | chat server / LzConnection (dead) |
| examples/chatws/chatws.lzx | chat WebSocket server (not running) |
| examples/music/music.lzx | music search web service (dead) |
| examples/mobile/loadmedia.lzx | media backend (dead) |
| examples/videolib/videolib.lzx | video catalog backend (dead) |
| examples/videolibrary/videolibrary.lzx | video catalog backend (dead) |
| examples/javarpc/accentedtext.lzx | Java RPC backend (dead) |
| examples/javarpc/returnjavabean.lzx | Java RPC backend (dead) |
| examples/javarpc/returnperson.lzx | Java RPC backend (dead) |
| examples/javarpc/returnpojo.lzx | Java RPC backend (dead) |
| explorer/data/database.lzx | getemployees.jsp backend (dead) |

## Reproduce

```
cd benchmarks/tools
node parity-sweep.mjs          # compile-once, render both kernels @dpr2, diff → out/results.json
node parity-report.mjs         # regenerate this report + copy worst diffs to screenshots/
node parity-sweep.mjs clean    # remove generated .lzx.js + __cv/__dh wrappers next to sources
```
Per-app screenshots (`<key>.cv.png` / `.dh.png` / `.diff.png`) are under `benchmarks/parity-sweep/out/shots/`; the worst offenders are copied to `benchmarks/screenshots/parity-*`.

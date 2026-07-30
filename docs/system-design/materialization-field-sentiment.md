# Virtualization in the field — the developer complaint corpus

> **Status: research notes, 2026-07-30.** Companion to
> [materialization.md](materialization.md) (the design) and
> [materialization-antecedents.md](materialization-antecedents.md) (the Apple
> lineage). Commissioned by David: what do working developers say about
> virtualization/windowing/paging across ecosystems, what problems do they
> cite, and how would a transparent zero-overhead layer be received?
> Web-researched from GitHub issues, platform forums, HN, and practitioner
> blogs; URLs inline.

## 1. Manual web virtualization (react-window / react-virtualized / TanStack Virtual)

**Dynamic/unknown row heights is the dominant complaint class — by a wide
margin.** react-window's tracker is a monument to it:
[#73](https://github.com/bvaughn/react-window/issues/73),
[#190](https://github.com/bvaughn/react-window/issues/190),
[#582](https://github.com/bvaughn/react-window/issues/582) ("cannot know the
height in advance" for messages/images),
[#223](https://github.com/bvaughn/react-window/issues/223) (itemSize never
re-runs when rows change). The canonical workaround — ref every row, read
`clientHeight`, feed it back, call `resetAfterIndex()` — is exactly the
manual bookkeeping virtualization was supposed to spare, and it is
self-defeating: [#326 "Scroll
instability"](https://github.com/bvaughn/react-window/issues/326) shows the
scrollbar oscillating as measured heights arrive.

**Scroll jumping is the second face of the same defect.** Late measurement
above the viewport shifts content under the user's finger: react-window
[#741](https://github.com/bvaughn/react-window/issues/741), react-virtualized
[#424](https://github.com/bvaughn/react-virtualized/issues/424), TanStack
Virtual [#659](https://github.com/TanStack/virtual/issues/659). Chat /
reverse-infinite UIs are the worst case — TanStack's [discussion
#1013](https://github.com/TanStack/virtual/discussions/1013) documents the
`shouldAdjustScrollPositionOnItemSizeChange` whack-a-mole, and TanStack
shipped a dedicated chat mode (`anchorTo: 'end'`) because ["Chat UIs Are
Lists Until They Aren't"](https://tanstack.com/blog/tanstack-virtual-chat).

**Broken browser-native behavior is the complaint USERS file, not just
developers.** Ctrl-F fails against unrendered rows ([ngx-virtual-scroller
#182](https://github.com/rintoj/ngx-virtual-scroller/issues/182),
[react-virtualized
#1835](https://github.com/bvaughn/react-virtualized/issues/1835), [TanStack
discussion #481](https://github.com/TanStack/virtual/discussions/481) — the
accepted answer is "build your own search UI"). Screen readers break even
with correct ARIA — ["still not properly read by JAWS or macOS
VoiceOver"](https://github.com/bvaughn/react-virtualized/issues/1296) —
because DOM nodes churn under the assistive tech; Adobe's [React Aria
Virtualizer](https://reactspectrum.blob.core.windows.net/reactspectrum/20c24d349cd084ab79d8d4d484986faa89d34bbf/docs/react-aria/Virtualizer.html)
persists the focused element and injects `aria-rowindex` to compensate.
Scroll restoration on back-navigation is a standing FAQ ([TanStack
#677](https://github.com/TanStack/virtual/discussions/677)). The [HN thread
on Google's infinite-scroller
article](https://news.ycombinator.com/item?id=12069533) captures user-side
rage: *"trying to search with ctrl-f for content that just isn't there yet or
following a link, clicking back and the viewport jumping up to the top."*

**The contrarian genre is healthy.** Even advocates gate it:
[WebDong](https://www.webdong.dev/en/post/list-virtualization-pattern/) asks
whether pagination would do; [Vedansh
Mehra](https://vedanshmehra.hashnode.dev/virtual-scrolling-in-react-implementation-from-scratch-and-using-react-window)
says skip it under ~100 rows; [Swizec's "You don't want to build your own
list
virtualization"](https://swizec.com/blog/you-dont-want-to-build-your-own-list-virtualization/)
frames hand-rolling as a trap. The community treats virtualization as a cost
paid under duress, because it trades user-facing correctness for performance.

## 2. WICG `<virtual-scroller>`: the platform tried and retreated

Real demand (1,556 stars; [WICG
discourse](https://discourse.wicg.io/t/proposal-a-built-in-virtual-scroller/3510/);
[webcomponents #791](https://github.com/WICG/webcomponents/issues/791));
the [motivation
doc](https://github.com/WICG/virtual-scroller/blob/main/Motivation.md)
explicitly named the prize — virtualization where find-in-page,
accessibility, focus, and fragment navigation *keep working*. [Archived
October 2021](https://github.com/WICG/virtual-scroller). Why it matters:

- The items-to-recycled-DOM approach was rejected by the group itself as
  unfixable for a11y/find-in-page — the same defects as userland libraries.
- The display-locking foundation drew vendor opposition (Mozilla's David
  Baron called an early form
  ["harmful"](https://github.com/WICG/display-locking); WebKit opposed).
- The endgame: [standardize only the low-level
  primitive](https://github.com/WICG/virtual-scroller/blob/main/README.md)
  (`content-visibility`) and leave high-level scrollers to libraries. The
  platform concluded a fully general invisible scroller *element* was not
  shippable — but a *rendering-skip primitive that keeps DOM semantics
  intact* was. That distinction is the single most important precedent for
  an invisible layer.

## 3. `content-visibility: auto`: the survivor, with gotchas

Wins loudly reported — [web.dev measured 232ms → 30ms rendering,
"7x"](https://web.dev/articles/content-visibility); [Baseline since Sept
2025](https://web.dev/blog/css-content-visibility-baseline). The gotchas:

- **Scrollbar jumping** when unsized sections collapse: [Bram.us's
  writeup](https://www.bram.us/2020/12/21/content-visiblity-vs-jumpy-scrollbars-a-solution/)
  is canonical; `contain-intrinsic-size` estimation is the tax (too small =
  jumpy, too large = phantom space), partly fixed by
  `contain-intrinsic-size: auto`; CSSWG filed
  [#7807](https://github.com/w3c/csswg-drafts/issues/7807) on the
  remembered-size interaction being "kinda broken."
- **Anchor links land at wrong offsets** before off-screen sections have real
  heights; **sticky descendants stop sticking** under layout containment
  ([DebugBear](https://www.debugbear.com/blog/content-visibility-api),
  [Erwin
  Hofman](https://www.erwinhofman.com/blog/improve-pagespeed-with-content-visibility-css-for-you/)).
- Find-in-page and accessibility exposure were *designed in* (skipped content
  stays searchable) — which is why sentiment is "use it, mind the sizing"
  rather than the rage directed at DOM-removal libraries.

## 4. Android: ceremony resented; Paging 3 the cautionary tale

RecyclerView's Adapter/ViewHolder/DiffUtil stack is tolerated but resented —
an ecosystem of adapter-eliminators exists
([smart-recycler-adapter](https://manneohlund.github.io/smart-recycler-adapter/);
ListAdapter is Google's own boilerplate apology). The classic
recycled-state bug (a CheckBox toggled in one row reappearing on a recycled
row) is the lead anti-pattern in [RecyclerView
Antipatterns](https://aungkyawpaing.dev/recyclerview-anitpattern/): recycling
leaks unless every bind is total.

**Paging 3** is the strongest evidence that a heavyweight-API paging layer
breeds resentment even when well-engineered: updating one item inside
`PagingData` needs a [dedicated workaround
article](https://jermainedilao.medium.com/android-paging-3-library-how-to-update-an-item-in-the-list-52f00d9c99b2);
RemoteMediator is ["the complicated
part"](https://proandroiddev.com/remote-mediator-in-android-21896bbcfb3f)
(an extra table + DAO just to track remote keys; [no simple page/limit
path](https://www.bornfight.com/blog/android-paging-3-library-with-page-and-limit-parameters/));
a dev.to author: ["Every time I tried to integrate it, I had a lot of
trouble. It's always a pain"](https://dev.to/kiolk/day-21-pagination-ohj) —
and rolled their own. Developers accept complexity for *their* domain logic,
not for the plumbing of showing a list.

**Compose LazyColumn**: lazy by declaration, but forgotten/unstable `key`s
cause [duplication and
crashes](https://vanessaonmobile.substack.com/p/jetpack-compose-lazycolumn-re-rendering)
and unstable model classes cause [whole-list recomposition
jank](https://dev.to/theplebdev/the-refactors-i-did-to-stop-my-jetpack-compose-lazycolumn-from-constantly-recomposing-57l0)
— identity and stability remain the developer's problem.

## 5. iOS/SwiftUI: "just handles it" until the cliff

Apple's own forums: [List and LazyVStack jitter past ~2000
items](https://developer.apple.com/forums/thread/718929); [LazyVStack memory
grows without bound until crash while wrapped UITableView stays
flat](https://developer.apple.com/forums/thread/703499); [prepending yanks
the scroll position](https://developer.apple.com/forums/thread/806214);
[inconsistent
onAppear/onDisappear](https://developer.apple.com/forums/thread/716998). The
[HN verdict](https://news.ycombinator.com/item?id=38880939): *"All of this
greatly reduced my trust in SwiftUI… List still has some awful performance
cliffs unless you go out of your way to model your infinite lists in a way it
can handle"* — standing remedy: drop back to UIKit ([kean's "Not
List"](https://github.com/kean/articles/blob/main/2021-03-01-not-list.markdown)).
The `id: UUID()`-in-body identity mistake is a whole tutorial genre
([the ForEach
trap](https://muhammadabidd.medium.com/identifiable-vs-hashable-the-foreach-trap-in-swiftui-d10708054019)).

## 6. The invisible-layer trust question

Hibernate lazy loading is the archetype: N+1 as [leaky-abstraction
anti-pattern](https://dev.to/leelussh/what-is-the-n1-query-problem-and-how-to-detect-it-2g7p)
("makes it extremely simple to access data… also makes it easy to access
that data inefficiently"); harsher voices: ["still too leaky to be
useful"](https://sergiy-yevtushenko.medium.com/1-orm-creates-unnecessary-abstraction-layer-which-is-still-too-leaky-to-be-useful-21b67d06c6d5).
The "magic" discourse ([Is magic
bad?](https://drawson.medium.com/is-magic-bad-f4f75bd19349), [HN "Why I Hate
Frameworks"](https://news.ycombinator.com/item?id=28920095)) converges:
magic is fine while it holds; when it breaks, debuggability collapses.
Complaints about magic *are* complaints about leaky abstractions.

## Taxonomy of complaint classes (ranked)

1. **Unknown-content-size / late measurement** → scroll jump, jitter,
   oscillating scrollbars (every ecosystem; the root defect).
2. **Broken platform-native behaviors**: find-in-page, text selection, screen
   readers, focus, anchor links, SEO, scroll restoration (web-specific; why
   WICG deemed userland virtualization unfixable).
3. **Identity/staleness leaks**: recycled-ViewHolder state bugs, missing
   LazyColumn keys, `UUID()` identity churn — recycling makes item identity
   the developer's problem, and they get it wrong constantly.
4. **Scroll-position instability under mutation** (prepend/chat/reorder).
5. **API ceremony disproportionate to the goal** (Paging 3,
   Adapter/ViewHolder, measurement plumbing).
6. **Invisible cliffs**: SwiftUI's ~2k-item degradation, LazyVStack memory
   growth — degradation with no warning and no gauge.
7. **Sizing-estimation taxes** (`contain-intrinsic-size`,
   `estimatedItemSize`) — mild, persistent.

## What developers praise

- **Flutter `ListView.builder`**: near-invisible builder-based
  virtualization, ["performs smoothly with thousands of items, just as it
  would with a
  dozen"](https://techdynasty.medium.com/listview-vs-listview-builder-in-flutter-e1c2b0ac11b8)
  — the ask is only "use the builder constructor"; sentiment overwhelmingly
  positive.
- **`content-visibility: auto`**: two lines of CSS, native behaviors
  preserved by design — the most-loved recent entry precisely because it
  skips rendering without removing DOM.
- **Library-side automation of the hard parts**: TanStack's chat mode;
  [react-virtuoso recommended for dynamic heights out of the
  box](https://www.pkgpulse.com/guides/tanstack-virtual-vs-react-window-vs-react-virtuoso-2026).
  Praise tracks *how much bookkeeping disappeared*.
- Trust was earned by: correct-by-default semantics (find/a11y intact), no
  identity homework, graceful (not cliff-shaped) degradation.

## Reception forecast for a transparent, zero-overhead layer

Developers don't hate virtualization — they hate that it's *their* bug when
it leaks. A layer with no API surface, activation above a threshold, and
platform behaviors preserved attacks the top three complaint classes
directly; Flutter and `content-visibility` prove reception is enthusiastic
when the abstraction genuinely doesn't leak. Skepticism arrives in order:

1. **"What happens with dynamic heights?"** — the first question from anyone
   scarred by react-window. Proof: scrolling *backwards* fast through
   mixed-height content with zero jump; reverse-chat prepend is the acid
   test.
2. **"Does Ctrl-F / VoiceOver / select-across-rows still work?"** — web
   veterans will assume no, because every userland library failed here and
   the WICG gave up on the element form.
3. **"Where's the cliff, and how do I see it?"** — the Hibernate lesson.
   Invisible layers are trusted only with observability: a way to SEE that
   virtualization engaged, what it estimated, why a frame was slow. Not an
   API — a diagnostic.
4. **"What's my escape hatch?"** — even developers who never use it demand it
   exists.

The winning proof is negative space: a 100k-row demo where the developer
wrote a plain list and everything mundane — find, selection, screen reader,
back-restore, prepend — behaves exactly as an unvirtualized page. Every
ecosystem's scar tissue is a checklist; passing it *without configuration*
is the whole pitch.

## Implications for materialization.md (the editor's note)

- The design's §3.2 extent story and §3.4 threshold/opt-in→automatic
  trajectory line up with what earned trust elsewhere
  (`content-visibility`'s estimate-then-correct; browsers' opt-in-first
  order). Complaint class 1 is answered by design; class 5 by having no
  surface; class 3 by §4's key retirement (identity lives in the data
  layer, never the developer).
- **Class 2 — RESOLVED (David, 2026-07-30)** into materialization.md §2's
  "observer boundary": the contract protects the app's semantics and the
  user's interaction with what exists, deliberately NOT the browser's
  document-level features — with native precedent (no platform greps a
  native table's unrendered rows; search over data belongs to the data), and
  with two requirements extracted rather than dismissed:
  navigate-to-logical-record (§3.5) and windowing-aware accessibility
  (`aria-rowcount`/`rowindex`, materialize on AT traversal). The web rage in
  this class came from document-shaped experiences; Declare's documents are
  `Markdown` flows, which materialization never touches.
- Class 6 (invisible cliffs) maps to Declare's introspection surface:
  `explain()`/inspector showing "this block is windowed, N logical, k
  materialized, extent estimated vs measured" is exactly the diagnostic the
  trust literature demands.

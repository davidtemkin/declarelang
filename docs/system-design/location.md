# Location — addressable app state, history, and the extraction crawl

Status: **RATIFIED, awaiting implementation** (2026-07-15). §11 is the
implementation charter: one agent, one pass, Phases A→B→C with hard test gates
between them, in an untracked working copy. Companion rulings: capabilities.md
§2 (the three shapes), §6 (`navigate`), requests.md (the host URL axes),
seo-and-semantics.md.

## 1. The principle: navigation is already reactive state

In Declare, "where the user is" is attribute values, and "going somewhere" is
setting them. The corpus proves it three times over: the homepage is
`route: string = "home"` with `visible = { app.route == "why" }`; the docs app
is `mode`/`chapter`/`selected`; the viewer is `mode`. There is no missing
control-flow concept — no route tables, no matchers, no nested routers. Those
are framework answers to a problem reactive derivation does not have.

What is missing is exactly one binding: **designated app state ↔ the browser
location**. Today that binding exists only as per-app hand-wiring — the host
hardcodes the homepage's `#why` hash mirroring (browser/host-client.js:73), and
the viewer smuggles its opening tab through the `demoSources.__mode__` seed.
Two hand-built instances plus the docs app needing a third (its back button
currently exits the app) is the rule-of-three signal that this is one real
abstraction.

**Rejected: a `location` declaration modifier.** An earlier sketch marked
attributes into the URL (`route: string = "home" location`) — structured
serialization, compiler-known location schema. Rejected as overdesigned: it
makes the URL a second thing an attribute can be, has no unified story for
text-run anchors, and buys analyzability the extraction crawl (§7) gets by
other means. If per-field serialization proves painful in practice, a modifier
can layer on later as sugar over this design; it earns syntax by evidence.

## 2. The design: one built-in attribute, `app.location`

A string — the app's slice of the URL, the **fragment**. Two-way, host-wired,
with the echo discipline of `TextInput.text` (the platform owns the truth;
writes flow both ways, suppressed on echo):

- **Boot:** the host seeds it from the URL fragment *before first settle* — a
  deep link is just an initial state; every constraint derives from it exactly
  as if the user had clicked there.
- **App writes it to navigate.** Each settle that changed it = one history
  entry (per-settle, not per-write: a handler that sets a whole compound
  location is one back-step — the batching discipline applied to history).
- **Back/forward:** the host writes it back — the ambient-data direction, like
  `dark` flipping. The app handles no popstate event; state re-derives.

The app **owns its location grammar**: `location` is one opaque-to-the-runtime
string the app parses and produces (`why`, `guide/04-tree`,
`37.77,-122.41,12z`). Parsing is ordinary visible code:

```declare-fragment
mode:    string = { (app.location || "guide/01-thinking-in-declare").split("@")[0].split("/")[0] },
chapter: string = { (app.location || "guide/01-thinking-in-declare").split("@")[0].split("/")[1] || "00-shape" },
```

**Single-writer discipline**: derived state like `mode`/`chapter` is never
assigned — navigation writes `location`, and everything else follows.

Nothing enforces this, and that is the point of stating it. Note the spelling
above: `mode`/`chapter` are **computed defaults**, formulas with no cell of their
own, so no owner protects them — a direct assignment simply lands, the formula is
gone, and back/forward silently stop working. (A *set* constraint, `x = { … }`, is
the opposite: it owns its slot and the runtime refuses a direct write outright.
Only the sanctioned displace/resume path — an animator or a state override,
`animation.md` §2 rules 2–4 — may take such a slot over, and it resumes the
constraint afterward. "Displacement" names that mechanism and nothing else; do not
use the word for an author assignment, which is either refused or a silent
overwrite depending on the spelling.)

**A location is a request, not a guarantee.** Arbitrary strings are navigable;
unrecognized state degrades wherever the app's own parsing sends it (per §3,
the default). The location-parsing constraint is the app's 404 handler.

## 3. The default rule

**The declared initial of `location` is the default location; the URL fragment
is omitted whenever the app is at it.**

```declare-fragment
App [ location = "home", … ]
```

Both host directions follow from the one rule: an empty incoming fragment
leaves the initial alone; mirroring outward writes a clean URL when
`location == initial`; back past all in-app navigation restores the initial,
never `""`. No `|| "home"` fallbacks in app code.

## 4. The three-layer URL

Nothing in the existing URL surface moves. A Declare URL gains a third
orthogonal layer that was previously missing or hand-hacked:

| layer | question it answers | owner |
|---|---|---|
| path — `apps/docs/docs.declare` | which program | the file system |
| query — `?viewer=edit`, `?build`, `?render`, `?crawler` | what the host does with it | the host (requests × modifiers, requests.md) |
| fragment — `#guide/04-tree` | where inside the running app | the app (`location`) |

- Fragment, not path or query, for the live form: works identically under the
  Node server and static+SW hosting (no rewrite rules), and fragments are never
  sent to the server — location state stays client-side by construction.
- `?viewer=reader|source|edit` keeps its spelling. As a *request* it selects the
  viewer program; *which tab* is viewer-app state — the host translates the
  query into the viewer's initial location, and the `__mode__` seed dies.
- `navigate()` remains the out-of-app action (capabilities.md §6). Location is
  within-app. Cross-app deep links compose:
  `app.navigate("apps/docs/docs.declare#guide/04-tree")`.
- `declare-docs:` symbolic links never appear in URLs; a resolver maps symbol →
  location write. The fragment is the symbol's runtime shadow.

## 5. Links: a fragment href IS a location link

The unification across "in and out of text runs": one currency, the location
string.

```declare-fragment
onClick() { app.location = "guide/03-relationships" }        // out of a text run
[Constraints](#guide/03-relationships)                        // in one (Markdown)
docs.declare#guide/03-relationships                           // from outside
```

In rendered rich text a fragment href becomes a real `<a href="#…">` and the
**browser performs the navigation** — fragment changes natively (history entry,
hover URL, ⌘-click all free), the host feeds `app.location`, state re-derives.
The D-5 shape again: capability through letting the platform element be real.

## 6. Anchors: `@name` — into a text run

A location may end with `@name`. State before the `@` selects the world; the
anchor selects the **viewpoint within it** — which view is brought into sight.

- **What follows `@`:** one name, nothing else — slug charset, no nesting, no
  second `@`. Resolved against a single namespace: **named views** and
  **heading slugs** inside settled RichText/Markdown (the renderer assigns each
  heading its deterministic slug — the doc system's pinned-slug rule; a heading
  in prose and a named view in the tree are both just names). Authors write no
  anchor syntax: a heading IS its anchor.
- **What mandates the separator:** the state grammar is the app's own and
  opaque to the runtime; the runtime must act on the anchor *without parsing
  app state*. `@` is the one character of shared grammar that partitions the
  string with no coordination. (Inference — "reveal if the whole fragment
  matches a name" — works only while state tokens happen to be view names;
  rejected.)
- **The split lives with the app for state:** `app.location` holds the full
  string (write/read symmetric — no hidden rewriting); the runtime acts on the
  trailing `@name`; state parsing strips it (`.split("@")[0]`, visible in §2's
  example).
- **The pending reveal:** reveal is a *retained intent, not an event*. On a
  location-driven settle the runtime resolves the name; if the target does not
  yet exist (cold deep link while a DataSource is still absent, an island not
  yet mounted), the intent is held and fires once when the name appears in a
  settled tree; a later location change cancels it. Mechanism: DOM — the
  heading run is a real element, native `scrollIntoView()`; canvas — the
  renderer knows each block's y, clamp the scroll ancestor. Both backends, the
  existing primitive.
- Collision rules (stated once, boring on purpose): views before slugs,
  preorder-first, duplicate slugs get deterministic `-2` suffixes.
- Honest v1 limitation: back/forward restores *locations*, not pixel scroll
  offsets — a restored location lands at its top or its anchor.

## 7. Extraction: the crawler model

Locations give invisible-at-default content an address; extraction follows.
The t=0 snapshot (capabilities.md §4–5) generalizes to **t=0 per reachable
location**:

- **Enumeration is a crawl, not source analysis.** The extractor settles the
  default location and reads location links out of the *settled tree*: fragment
  hrefs in rendered content are concrete values; `app.location = <expr>` in an
  activation handler resolves exactly as `navigate()` does today (links.ts) —
  literal, or a read evaluated at t=0 per settled instance. Data-driven links
  (the docs rail's `"guide/" + cid` over 17 replicated tabs) enumerate without
  any literal existing. Follow discovered links to closure. The extractor sees
  what a live crawler pointed at the running site would see — by construction.
- **Each location is a fresh cold boot.** Seed fragment, settle, serialize. No
  event simulation, no crawl-order state. Every document independently
  reproducible → the byte-identical oracle discipline extends to the set.
- **Discoverable = linked.** A location nothing links to is not emitted — and
  is not crawler-discoverable anyway. The escape hatch is not new surface: to
  be discoverable is to be linked (render an index — a sitemap in the app's own
  material). Input-driven locations (map positions, searches) are correctly
  unbounded and correctly invisible; the boundary is the web's own.
- **Addressable ≠ discoverable.** Dynamically created locations are always
  navigable by URL; extraction only affects discovery.
- **One document at the one address** (RATIFIED 2026-07-15, superseding the
  earlier per-location-address sketch): the program URL is the sole address, so
  the crawl mints no addresses — it emits ONE document, the default location's
  content followed by each reachable location's content as a
  `<section id="<location>">`. The emitted `href="#<location>"` links then
  resolve *intra-document* (the rail is a working table of contents in the
  static form) — no rewriting, no synonym addresses, no second URL space. And
  because a section's `id` IS the live `app.location` string, a fragment that
  survives into a click-through (a shared link, a search engine's jump-to)
  opens the live app at exactly that location. The author still writes only
  `#why`. The accepted trade: search engines rank the one URL for all the
  content; a click lands on the program URL — at worst, at the default.
- **Indexable data is build-time data** (RATIFIED 2026-07-15): each cold boot
  runs with no live network (§9). A relative DataSource url is the app's own
  material — the crawl reads it from beside the program (disk in Node, the
  same deployed file same-origin in the browser: same bytes, so the crawls
  stay byte-identical). An absolute url is the network, and the crawl FAILS
  LOUDLY, naming the url and the fix (inline the data, ship it as a file, or
  accept the content unindexed) — never a silently partial document.
- **Deduplication** decomposes into rules this design already fixed:
  1. anchors strip — `#x@a` ≡ `#x` (document key = state part);
  2. defaults canonicalize — `""` ≡ the declared initial;
  3. aliases fall to an output hash — identical serialized bytes → one
     document, deterministic canonical pick (extraction is deterministic:
     fixed env vector, fixed measurer);
  4. shared chrome does NOT dedup — every website repeats its nav/footer;
     boilerplate is the crawler's solved problem;
  plus a visited-set on canonical keys so the crawl terminates.
- **Privacy falls out.** The extracting instance is the anonymous default with
  build-time data; user-created and auth-gated locations are never exhibited.
  "Location = shareable coordinates" (§8) and the extraction boundary are the
  same line.

## 8. What location is for (the opt-in rule)

**Location is what you'd want the recipient to see when you hand them the URL —
the app's shareable coordinates, nothing else.** Nothing reaches the fragment
except what the app explicitly writes into `location`; there is no store
serialization and no way to half-opt-in. Map position: shareable is the point —
in it goes (and copy-the-URL sharing works as the user pans). Draft text,
selection, session state: ordinary attributes, never location.

## 9. No live network in extraction (adjacent ruling, enforced separately)

Extraction indexes the deterministic closure of **(program + compile-time
closure + fixtures)** — no live network. The snapshot could never *contain*
network data (settle is synchronous; serialization precedes any response), but
initiation was unenforced: headless `init` fires, so an `onInit { fetch() }`
issued a real request whose result was discarded. Enforced (LANDED 2026-07-15)
by the injected transport seam (runtime `provideTransport`, data.ts; headless
installs a refusing transport → `failed`/"network unavailable headless" — the
contract's "honestly absent", made true by construction; unit-tested). Data
enters extraction as **fixtures** — build-time
artifacts (the docs app's docs-model.json), the existing env-vector seam. The
no-network rule bounds the crawl frontier too: data-driven location links exist
only over build-time-visible data.

## 10. Open questions (the flagged fork)

1. **Push vs replace.** Discrete navigation (chapter, route) wants a history
   entry; continuous navigation (map pan, scrub) wants the URL to track by
   *replacement* — back must not step through a thousand pan frames (Maps
   precedent: `@37.77,-122.41,12z` replaces). No rule can infer intent from
   write shape, and guessing from frequency or gesture state is exactly the
   magic the language refuses. v1 ships **push-only** (every current app is
   discrete); the replace form needs a designed spelling before the first
   continuous app — candidates: a paired service action, or a per-write form.
   RESOLVED for this implementation: push-only ships; the replace spelling is
   deferred to the first real map-shaped app and is OUT OF SCOPE for §11.
2. **Scroll restoration** beyond top-or-anchor (v1 limitation, §6) — only if
   real usage demands it.

## 11. Implementation charter — one agent, one pass, A→B→C

This document is the spec; this section is the working agreement for the
implementing agent. The full cycle runs in ONE pass — Phase A, then B, then C —
with a **hard test gate between phases**: the next phase does not begin until
the previous phase's full gate is green. No phase is redesigned mid-pass; a
blocker that seems to demand a design change is a STOP-and-report, not an
improvisation.

### 11.1 Working copy — untracked, full, merged later

Work happens in a **fresh full copy of the distro directory, NOT under version
control and never pushed** — the same protocol as the docs-track copy. Nothing
lands in the primary tree until the deliberate merge (§11.5). Reason: a
concurrent eval/diagnostics track is active in the primary tree; both tracks
regenerate the same committed build artifacts, and measurement runs must quote
a pinned toolchain.

### 11.2 The exemplar mandate — homepage and docs app are the teaching code

The homepage and the docs app are not just call sites: they are the REFERENCE
IMPLEMENTATIONS the guide will excerpt, so their location code is written to
instructional standard — canon-formatted, commented in the house voice, each
line defensible in front of a reader. They deliberately cover the two teaching
cases:

- **Homepage — the single-token location.** `location = "home"`, `#why` deep
  link, one pill writing one string, `visible` deriving from it. The smallest
  complete example of the model. Retires the hand-wired hash mirroring
  (browser/host-client.js:73).
- **Docs app — the compound grammar + anchor.** `mode`/`chapter` parsed from
  `guide/04-tree`, the `@`-anchor into a chapter's headings, the
  `declare-docs:` resolver writing location (gaining history for free), and —
  because its content arrives by DataSource — THE living test of the pending
  reveal on a cold deep link. Retires the back-button bug.
- The viewer picks up the `?viewer=` → initial-location translation and
  retires the `demoSources.__mode__` seed.

**Docs are DoD in the same pass** (documentation.md §6): guide ch31
(environment — currently documents route→hash as host-wired, which this arc
makes false), operational/dev-server (the fragment layer in the URL table),
capabilities.md cross-references, and a mistakes entry for the single-writer
discipline (§2). New/renamed targets must keep the `declare-docs:` link gate
green. Every runnable fence added verifies R4 + canon like all corpus fences.

### 11.3 Phases and their gates

Common gate, required green at EVERY phase boundary: `npm run build` + the full
test suite (unit, perceptual, databinding, dep-extract, format, docs incl. the
link gate, verify-examples, scaffold, slim, static-constraint, prewarm,
serve-parity) + bundles rebuilt (build-compiler, build-boot) + extract +
prewarm regenerated. Phase-specific acceptance on top:

- **Phase A — the attribute + host wiring.** `location` on the App schema; host
  seed BEFORE first settle / mirror / back-forward in BOTH serve modes (Node
  server and static+SW — serve-parity covers the shared core; verify both
  hosts); per-settle history, push-only; echo suppression; the default rule
  (§3) including clean-URL-at-default. Retires all three hacks (§1). GATE adds:
  live chromium checks — deep-link cold boot to `#why` and to
  `#guide/04-tree`; back/forward walking docs chapters and returning to the
  homepage default with a clean URL; unit tests pinning seed/echo/default.
- **Phase B — `@` reveal.** Heading slugs in the rich-text renderer (BOTH
  backends, same slugger as the doc system), the anchor namespace
  (views-before-slugs, preorder-first, deterministic `-2` suffixes), the
  pending-reveal retained intent (§6) — held until the name exists, canceled by
  the next location change. GATE adds: live chromium click on a text-run link
  with an `@` target landing on the heading; the cold-deep-link-while-fetching
  case on the docs app (the DataSource race is the point of the test);
  perceptual/unit coverage for both backends.
- **Phase C — extraction-as-crawl.** Enumeration from settled trees (literal +
  t=0-evaluated location links, the links.ts discipline), fresh cold boot per
  location, per-packaging link rewriting (files on static hosting, path/query
  synonym under the server), the four dedup rules + visited-set termination
  (§7), fixtures supplying build-time data (docs-model.json) under the
  no-network seam (§9). GATE adds: the homepage crawl emits the `#why` document
  linked from the front page; the docs crawl emits per-chapter documents;
  browser↔Node extraction stays byte-identical; anchor-strip and
  default-canonicalization dedups exercised in tests.

### 11.4 Scope fence

IN: everything above. OUT — explicitly, even where adjacent: the replace-form
history spelling (§10.1); a `location` declaration modifier (§1, rejected);
scroll restoration beyond top-or-anchor (§10.2); any parser/diagnostics work
(the concurrent track owns parser.ts/check.ts — do not touch them, overlap is
the merge's enemy); any docs-content work beyond §11.2's list.

### 11.5 Merge protocol

- **Generated files are never merged.** `bundles/*` (compiler + boot),
  `bundles/cache/*` (prewarm), `apps/docs/docs-model.json`,
  `apps/docs/demos/seg_*.declare`, `docs/links.json`, and BUILD_ID stamps
  all conflict by construction between concurrent trees. Merge SOURCE only,
  then regenerate everything in order (tsc → build-compiler → build-boot →
  extract → links --emit → prewarm) and re-run the full gate on the merged
  tree. (The BUILD_ID pre-commit conflict is a known trap; regeneration is the
  documented resolution.)
- **Timing:** the merge lands BETWEEN eval measurement cycles, never during
  one — a measurement run quotes the build it measured.
- **The shared-surface watch list** (small by design): the three example apps'
  `.declare` sources (this arc rewrites their navigation; the eval track does
  not touch them), guide ch31 + operational pages (§11.2), and nothing else —
  parser/check/harness belong to the other track.

## 12. Field findings — 2026-08-04 (anchors into rendered prose)

Found while adding a signed closing note to the homepage's `#why` essay and a
link to it from the FAQ. Both findings are OPEN; the homepage ships around them
(§12.3). Recorded here rather than in a findings file because both contradict
statements this document makes.

### 12.1 The `@name` reveal resolves against an unmeasured tree

**§6 says the intent is held "until the name appears in a settled tree." The
view branch checks appearance, never settledness.**

`findAnchor` (`runtime/src/view.ts:937`) builds two kinds of target:

- a **named view** — `fire = () => { if (v.surface === null) return false;
  v.scrollIntoView(); return true; }`
- a **rich-text heading slug** — the component's own `anchorSlugs()` /
  `revealAnchor(slug)` pair

The second is correct by construction: `revealRichAnchor`
(`dom-backend.ts:829`) returns false while the heading is not yet in the flow,
so the retained intent holds and retries. The component that owns the content
performs the reveal and can answer *not yet*.

The view branch has no such veto. `v.surface === null` goes false the instant
the view is attached, whether or not anything around it has been measured, so
`fire()` always claims success and `resolveReveal` clears the intent — once,
against whatever layout existed that frame.

**Measured.** Target: a 1×1 `anchor = "story"` mark riding 80px above the
note's rule in the `#why` column. Arrivals at `#why@story`:

| from | outgoing document | landed at | correct |
|---|---|---|---|
| `#faq` | 9185 | 224 | 2007 |
| home | 4653 | 224 | 2007 |
| `#why` | 2846 (already the essay) | 1946 | 1946 ✓ |
| cold load | — | 2007 ✓ | 2007 |

Per-frame trace after a same-session switch — the essay is attached but its
rich-text heights have not arrived:

| frame | document height | eyebrow page-y |
|---|---|---|
| 0 | 1124 | 711 |
| 1 … 23 | 2846 | 2053 |

Wrong for exactly one frame, then stable forever. The cold deep link works
because the tree genuinely does not exist yet, which is the case the retained
intent already covers.

**Why one frame.** Rich-text height returns through the DOM backend's
`ResizeObserver` (`dom-backend.ts:1097-1103`), delivered after layout and
before paint. `settle()` (`reactive.ts:286`) drains the constraint queue only —
there is no synchronous state that knows a measurement is outstanding, so
nothing the reveal could consult on the arriving frame would report the truth.

**Direction, not a patch.** Deferring the reveal a fixed number of frames is a
timing guess and was rejected. The shape that matches the working branch: give
the view branch the same veto, sourced from the components that know —
`fire()` returns false while any RichText between the target and the scroll
root still carries a provisional rather than a measured height. The retry loop
already exists; nothing counts frames.

**Cost to the contract.** `test/unit.test.mjs:6578` and its three siblings
assert `resolveReveal()` resolves on the *first* call after a settle. Headless
has synthetic metrics and settles synchronously, so a readiness veto leaves
those green — but any fix built on comparing two observations (geometry
stability, scroll-offset stability) cannot, and would require restating the
contract as "resolves within N passes." Prefer the veto for that reason.

**Note on shape.** Had the note been a heading inside one rendered Markdown
document, this would already work — the slug branch is what the docs app
exercises. The failing case is a hand-built column of `Para` (HTMLText) nodes
with a bare `anchor` mark in it, which no existing app produces.

### 12.2 A Markdown link's `onLink` does not reach the app

**§5 says a fragment href is a location link. In an authored `.md` rendered by
`Markdown`, no href of any kind currently reaches the app.**

The homepage's FAQ renders 14 anchors (7 to github.com). A plain left click on
one produces no navigation, no new tab, and — under request interception — **no
outbound request at all**. That last point matters: absence of a native
navigation proves `preventDefault()` ran (`dom-backend.ts:1060`), so the
runtime *is* intercepting the click and then calling an `onLink` that is not
the app's.

Bisect, same page, same URL:

| path | result |
|---|---|
| footer link — a Declare view calling `app.navigate` | navigates ✓ |
| FAQ link — `Markdown` link event → app method → `app.navigate` | no request |

Declaring `onLink(href: string) { app.openLink(href) }` on the `Markdown` node
compiles (both symbols are present in the emitted bundle) and matches the shape
the docs app uses (`apps/docs/docs.declare:346`). The **docs app shows the same
symptom**: 100 anchors, and clicking one does not change `location`.

**Unproven next step.** Determine whether a declared `onLink` handler installs
the `this.onLink` *property* that `markdown.ts:454` reads when it flows content
(`const link = this.onLink ?? (() => {})`), or whether it registers a listener
for RichText's declared `link` event that nothing dispatches. The closure is
captured per run at flow time, so a handler installed after the first flow
would also never be seen — worth checking in the same pass.

### 12.3 What the homepage does meanwhile

The closing note stays at the end of the `#why` essay, with no `anchor` and no
landing mark. The FAQ's "Who was crazy enough to do this?" links to plain
`#why` — a location, which works — and its answer says in words that the note
is at the end of that essay. When §12.1 lands the link becomes `#why@story`;
when §12.2 lands, every other link in the FAQ starts working too.

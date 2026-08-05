# Location — addressable app state, history, and the extraction crawl

## 0. PROPOSAL — one scheme for links, locations, and the crawl (2026-08-05)

**Status: draft under review.** Written after the 2026-08-04 field findings
(§12) and the from/to analysis (§13); **supersedes §13 where they differ**.
Everything from §1 onward is the historical record — the ratified 07-15 design,
its findings, and the superseded first draft — kept for context. Where §0
conflicts with it, §0 is the current intent.

*Terminology note: this section says **location** — never "state" — for what
the URL fragment names. `State` is a language construct; the collision muddled
every explanation below it.*

### 0.1 What broke (the motivating evidence)

- **Link extraction infers from handlers.** `compiler/src/links.ts` walks
  activation bodies (`ACTIVATION = {onClick}`) for `navigate()` calls and
  `app.location =` writes. A control whose activation lives in its class is
  invisible to it; `classroot` reads on descendants are "left unlinked" (its
  own comment) — so the homepage's data-driven nav pills were never seen. The
  controls standardization broke the model, not an edge of it.
- **No href in rendered `.md` reaches the app at all** (§12.2) — the FAQ's 14
  links and the docs app's 100 are dead on a plain click.
- **The `@name` reveal races measurement on warm arrivals** (§12.1) — correct
  from a cold URL, wrong from inside the app.
- **The location↔view tie is invisible to the compiler.** It lives inside
  expression bodies (`visible = { app.location == "why" }`); pattern-matching
  those is a heuristic, and it broke within an hour of real use
  (`app.location.split("@")[0] == …`). The compiler needs ground truth: the
  destination of a link, and how to manifest what it names.

### 0.2 The design, in five sentences

1. **One reference string** — an href: `#name` for an authored destination or
   anchor, `#app/grammar/here` for computed locations, a full URL for
   off-site.
2. **`shows = "name"`** declares that a view manifests a location — visibility
   falls out of the declaration, and the compiler gains ground truth.
3. **`anchor = "name"`** names a place inside a destination; **`link =
   <reference>`** makes any view a link.
4. **`follow(ref)`** is the one runtime operation behind every arrival —
   click, prose link, pasted URL, back/forward.
5. **`App.onFollow(ref) → ref′`** is the one imperative hook — transform,
   veto, side-effect — applied to all of them.

The bias is deliberate: something that **really works, with escape hatches**,
over maximal declarativeness. The declarative core is three attributes; the
imperative floor (`onClick`, raw `app.location =` writes) stays fully open.

### 0.3 References

| form | means | verified? |
|---|---|---|
| `#why` | an authored destination (a `shows` name) | build-checked |
| `#story` | an authored anchor; its location is *derived* from the registry — the author never writes a compound | build-checked |
| `#deck/q3/47` | a computed location — the app's own grammar, opaque to the runtime (§6's rule, kept) | traversed |
| `#faq@licensing` | a content-derived target: a heading slug inside runtime-fetched prose the compiler cannot see | best-effort |
| `https://…`, `mailto:…`, relative paths | out of the app, via the `navigate` service action | scheme-allowlisted |

Authored names — every `shows` and every `anchor` — share **one global
namespace, compiler-enforced unique**. Every *literal* reference in a `link`
or an authored `.md` the build can reach is resolved against the registry:
a typo'd `#stroy` is a **build error**. Link integrity the web never had.
The `@` compound form survives only for the content-derived tier, and is
documented as the weaker promise (a heading rename breaks it).

### 0.4 Declaring destinations, anchors, links

```declare-fragment
App [ location = "home",

    homeView: View [ shows = "home", … ],
    whyView:  View [ shows = "why",
        …
        note: View [ anchor = "story", … ]
        ],

    // any view can be a link — no handler; "" = inert (no cursor, no focus
    // stop, nothing emitted for the crawl)
    pill: Text [ text = "Why Declare", link = "#why" ],
    faq:  Text [ text = "The note",    link = "#story" ],       // location derived
    next: Text [ text = "Continue →",  link = { app.form.valid ? "#review" : "" } ],
    repo: Text [ text = "GitHub",      link = "https://github.com/…" ]
    ]
```

`shows` implies the visibility (`location == name`); `visible` remains free
and ANDs on top (the auth gate in §0.7). On the DOM renderer a linked view is
realized as a **real `<a href>`** — status-bar preview, ⌘/middle-click,
copy-link, keyboard focus, and the crawler's edge, all the native contract.
Prose interoperates because the strings are the same: `[the note](#story)` in
a rendered `.md` follows identically.

### 0.5 `follow` — the one operation

Every arrival reduces to `follow(ref)`:

1. `ref` goes through `App.onFollow` (§0.6); the result proceeds ("" stops).
2. External → the `navigate` channel. Done.
3. `#…` → write `app.location`; if the reference names an anchor, the
   operation is **not finished until the target is rendered, measured, and in
   the viewport**. Cold and warm arrivals are one path; §12.1's race is
   unstateable because "how many frames measurement took" is follow's private
   business.
4. The reveal *seeds* the scroll offset; the user's first scroll or touch
   takes ownership and cancels any still-held intent (the uncontrolled-editor
   rule, made normative). Following a reference equal to the current location
   re-runs step 3 (no dead clicks).

Source requests, runtime delivers, destination decides. A raw
`app.location =` write remains the uninspected floor beneath all of this —
the paved road is `follow`; the trapdoor stays.

### 0.6 `App.onFollow` — the escape hatch

```declare-fragment
onFollow(ref: string) -> string {
    app.log("nav", ref)                                          // effects
    if (ref == "#pricing") return "#plans"                       // legacy URLs
    if (ref.startsWith("#account") && !app.authed) return "#login"   // edge gate
    return ref                                                   // "" = veto
    }
```

Runs for **every** follow — linked views, prose links, cold URL arrivals,
back/forward — and during extraction (§0.8), so the crawl sees the same
redirects users do. This is the SPA middleware slot (`router.beforeEach`) in
its familiar place: one app-scoped interception point, arbitrary TypeScript.

### 0.7 Gating — two tools, honestly ranked

- **Edge redirect** (`onFollow`): redirect semantics, convenient, *bypassable*
  by a raw location write and by nothing else.
- **Destination derivation**: airtight — the URL bar can request any location;
  what a request *produces* is derived:

```declare-fragment
account: View [ shows = "account", visible = { app.authed } ],
login:   View [ shows = "account", visible = { !app.authed } ]
```

An unauthenticated arrival renders login **with the location preserved** —
finishing auth re-derives and lands where the user aimed. (Two views sharing a
`shows` name is permitted exactly for this split; the name stays unique as a
*destination*.)

### 0.8 The crawl, specified

**Mechanism, in one paragraph:** extraction runs the real program headless —
same compiler, same renderer — over **fixture material only** (§9's
no-network rule: a `DataSource` unmet by fixtures fails the build loudly,
never a partial page). For each location it visits, it writes `app.location`,
lets the program settle, serializes the rendered tree to HTML, and collects
the outgoing links that rendering realized. What a visitor sees and what the
crawler emits cannot drift, because they are the same render.

The procedure:

1. **Registry** (compile time): all `shows` and `anchor` names — uniqueness
   enforced; every literal reference dead-link-checked. This is the compiler's
   ground truth: for `#story` it knows the manifesting location without
   executing anything.
2. **Seeds**: the declared initial location plus every registry destination.
   The authored surface of the app requires no discovery at all.
3. **Traversal** (for computed families like `#deck/q3/…`): worklist — pop a
   location; apply `onFollow`; settle over fixtures; serialize; **key the
   document** by the canonicalized location (anchors stripped, the declared
   default folded, §7's output-hash aliasing — all unchanged); collect every
   realized `<a href>` (declared links and rich-text links are the same
   artifact by §0.4); enqueue unseen internal references; repeat.
4. **Termination is declared, never inferred.** A crawl **budget**, with
   overflow a build *warning that names the abandoned frontier* — silent
   truncation forbidden. An app with an unbounded family (a calendar's
   next-month, forever) declares the canonical set for it (a dataset the
   crawler reads); only the app knows 100 slides exist but infinite months do.
5. **Evaluation condition**: derivations from declared initials. A
   conditional link yielding `""` emits nothing — the same gate governs users
   and crawlers, so gated content is uncrawled by construction.

Output: one document per canonical location (§7's identity rules), with its
`<a href="#…">` edges preserved verbatim — so the emitted static HTML is
itself traversable by real search crawlers. The extraction is a crawl that
produces a crawlable thing.

### 0.9 Known costs and open items (from the adversarial pass)

- **`shows`/`visible` overlap** — two ways to gate one thing; ruled above
  (`shows` gates by location, `visible` ANDs) but it is a genuine second way.
- **Links containing interactive content.** A linked card holding a Button is
  invalid HTML if realized as a wrapping `<a>`. Ruling needed: nearest-wins
  for nested links; linked *containers* realize as an overlay anchor, not a
  wrapper.
- **Reveal inset.** "In the viewport" must respect fixed chrome — the 56px
  header cost two hand-built marks in one week. Needs the `scroll-margin`
  equivalent: a per-app (or per-anchor) reveal inset.
- **History granularity.** Fine-grained locations (slide arrows) need a
  replace-form write or Back becomes a 40-press escape (§10.1, promoted from
  open to required).
- **Inert vs unavailable.** `link = ""` removes the view from focus and crawl —
  right for "not a link," wrong for "unavailable right now" (it vanishes for
  keyboard and screen-reader users). Needs an explicit second affordance.
- **Scheme allowlist.** `link = { :url }` over remote data must never realize
  `javascript:` — enforced at follow, the single entry point.
- **Arrival effects, per-view.** `onFollow` covers app-scoped arrival logic.
  A per-destination hook for always-mounted views (whose `onInit` fires at
  boot, not on arrival) remains open — a `State` apply-edge is the candidate.
- **Bare names for content headings** stay unresolved: heading slugs live in
  runtime-fetched prose, so they cannot join the build-checked registry; they
  remain `@`-tier.

---

Status of the record below: **RATIFIED, awaiting implementation**
(2026-07-15). §11 is the implementation charter: one agent, one pass, Phases
A→B→C with hard test gates between them, in an untracked working copy.
Companion rulings: capabilities.md §2 (the three shapes), §6 (`navigate`),
requests.md (the host URL axes), seo-and-semantics.md.

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

## 13. Proposal — one reference, declared links (draft, 2026-08-05)

**Status: discussion draft.** Motivated by §12's findings and by the controls
standardization, which broke the handler-inference model §13.3 replaces. Not
chartered; the fork in §13.7 is unsettled. This section records the shape so
the refinement happens against a text instead of a memory.

The scheme in four sentences:

1. **One reference string** names anything linkable: `#location` for a state,
   `#location@name` for a place inside it.
2. **One declaration** makes a view a link: `link = <reference>` — authored,
   not inferred from its handler.
3. **One operation** follows a reference: make the target observable —
   rendered *and* in the viewport — owned end to end by the runtime.
4. **The crawler reads declarations**, never handler bodies.

### 13.1 The from/to matrix

Sources: a Declare view with a handler · a library control · a link in
authored prose · an off-site URL · the URL bar and back/forward · the crawler
following extracted HTML. Destinations: the front door · a location · a named
view inside a location · a stretch of prose inside rich text · off-site.

Measured against today (§12), the failures cluster on exactly two axes:

- **The prose row is dead entirely** — no href in a rendered `.md` reaches the
  app at all (§12.2). Five destination kinds, one defect.
- **The fine-grained columns split by temperature** — off-site and URL-bar
  arrivals at `#L@N` land correctly; same-session arrivals land against the
  outgoing view's layout (§12.1). Cold and warm are different code paths, and
  only one is correct.

Everything else already works. The scheme is four gap-closings, not a rewrite.

### 13.2 One reference, six encoders

`location` keeps its meaning and its opaque state grammar; `@` stays the one
shared character (§6). What changes is that every source encodes the same
string:

| source | spelling | produces |
|---|---|---|
| handler | `app.location = "why@story"` | `#why@story` |
| library control | the same write, wherever it lives | `#why@story` |
| authored prose | `[the note](#why@story)` | `#why@story` |
| off-site | `https://…/#why@story` | `#why@story` |
| URL bar / history | replayed fragment | `#why@story` |
| crawler | `<a href="#why@story">` in extracted HTML | `#why@story` |

Nothing downstream knows which source produced the reference — which is what
makes the from-axis disappear from the problem.

### 13.3 Declared links — the step up from onClick inference

Today the navigation relation is INFERRED: `compiler/src/links.ts` walks
activation-handler bodies (`ACTIVATION = {onClick}`) for `app.location =`
writes and `navigate(to)` calls, attributes `el.link` to the carrying element,
the runtime stamps `_navLink`, and static-html.ts wraps the subtree in
`<a href>`. Three structural limits, all now bitten:

- **Only `onClick` counts.** A control whose activation lives in its class — a
  library Button, a keyboard activation, a gesture — carries the navigate in a
  place the walker never attributes to the use site. The controls
  standardization moved exactly this way.
- **`classroot` reads resolve only at a class root** (links.ts's own comment:
  descendants are "left unlinked"). The homepage's data-driven pills —
  `app.location = classroot.to` — are invisible to it.
- **The inference and the behavior are two artifacts.** The author writes the
  handler; the extractor guesses the link. When they drift, the crawler lies.

The proposal inverts it: `link` becomes an AUTHORED attribute — the reference
string of §13.2, constraint-capable, `""` meaning no link (the existing
value-carries-the-conditionality rule, kept). One declaration, three
consumers:

- **The runtime** makes the view activatable and follows the reference on
  activation — the author writes no handler for the common case. A pill is
  `link = "#why"`; the homepage's `to`/`at`/`url` triple collapses to one slot.
- **The extractor** reads the attribute. No handler walking, no ACTIVATION
  set, no classroot blindness — a data-driven link is a constraint like any
  other, and the crawler evaluates it over the program's material exactly as
  it already evaluates `visible`.
- **Prose interoperates for free**: the markdown href and the `link` attribute
  carry the same string, so §12.2's fix routes rich-text clicks into the same
  follow operation.

The carrier half-exists — `el.link` / `_navLink` is already the extractor's
channel. The change is who writes it: the author, not a guesser. links.ts then
demotes to a MIGRATION LINT (a handler that writes `location` on a view with
no `link` is flagged), or retires.

### 13.4 Following is one operation

Today the app writes `location` and the runtime separately polls for the
anchor — two half-operations with no owner, which is the §12.1 race stated
structurally. Under the proposal, following `#L@N` is one runtime-owned
operation: set `location = L`; make `N` observable. Not finished until the
target is rendered AND in the viewport — so "how many frames the measurement
took" stops being anyone's business, and cold and warm arrivals are the same
path. The reveal offset behaves like the site's uncontrolled editors: the
reference SEEDS the scroll position; the user's first touch takes ownership.

### 13.5 Destinations enumerate from the graph

A destination is a value of `location` something derives from —
`visible = { app.location == "why" }` is the declaration, already extracted as
a dependency. Enumerating the literal comparisons yields the static
destination set with no handler evidence at all; `link` attributes yield the
edges. Non-equality families (`location.startsWith("guide/")`) and compound
grammars remain the existing seam: the graph gives the static set, data-driven
members still come from running the program over its material (§7 unchanged).

### 13.6 The stability ruling (open)

A reference is only as good as its target's name. Three target kinds are
authored and stable: a location (the `visible` comparison), a named view
(`anchor = "story"`), and — new — an AUTHORED MARKER in prose (the assembler
markers the `.md` files already carry are the precedent: invisible in render,
stable under rewording). The fourth, auto-slugged headings, is derived and
breaks on rename — today it shares one namespace with the authored kinds under
a silently weaker guarantee. RULING NEEDED: authored names are the contract;
slugs are a convenience tier, documented as such — or slugs are dropped from
the addressable set entirely.

### 13.7 The flagged fork: is all location state a place?

`location` today means "app state you can link to," and some of that is not a
place — a filter, a sort, a mode. A path addresses places well and modes
badly. The candidate ruling: a reference always targets a PLACE (you can only
link to something a reader ends up looking at); non-place state rides along in
the location string under the app's own grammar, unaddressed. The deeper
version — visibility derives from a declared address tree instead of being
tested against `location` — would delete the `visible = { location == … }`
boilerplate and make enumeration a tree walk, but it is a second construct and
this proposal deliberately adds none. Deferred with the bare-`#name` tier
(resolve the name, derive the location from its gating ancestors), which needs
the runtime to reason backwards and is not v1.

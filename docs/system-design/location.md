# Location — addressable app state, history, and the extraction crawl

## 0. PROPOSAL — one scheme for links, locations, and the crawl (v2, 2026-08-05)

**Status: draft, revised after adversarial review.** v1 was reviewed by an
independent agent against the language doc, links.ts, the runtime's reveal
machinery, and the homepage's real nav; every hole it confirmed is resolved
below or listed in §0.11. **Supersedes §13.** Everything from §1 onward is the
historical record; where §0 conflicts with §1–§6, §0 is the current intent.
Emission (§7) is deliberately NOT touched by this proposal — see §0.8.

*Terminology: this section says **location** — never "state" — for what the
URL fragment names. `State` is a language construct; the collision muddled
every earlier explanation.*

### 0.1 What broke (the motivating evidence)

- **Link extraction infers from handlers.** `compiler/src/links.ts` walks
  activation bodies (`ACTIVATION = {onClick}`, links.ts:28) for `navigate()`
  calls and `app.location =` writes. A control whose activation lives in its
  class is invisible; `classroot` reads on descendants are "left unlinked"
  (links.ts:42–44) — the homepage's data-driven pills were never seen. The
  controls standardization broke the model, not an edge of it.
- **No href in rendered `.md` reaches the app** (§12.2) — 114 dead links
  across two apps on a plain click.
- **The `@name` reveal races measurement on warm arrivals** (§12.1) — right
  from a cold URL, wrong from inside the app, because attachment is checked
  and settledness is not (view.ts:952).
- **The location↔view tie is invisible to the compiler** — it lives inside
  `visible = { app.location == "why" }` expression bodies, and pattern-
  matching those broke within an hour of real use.

### 0.2 The design, in five sentences

1. **One reference string** — an href: `#name` for an authored destination or
   anchor, `#app/grammar/here` for computed locations, a full URL for
   off-site.
2. **`shows = "name"`** declares that a view manifests a location —
   visibility falls out, and the compiler gains ground truth.
3. **`anchor = "name"`** names a place inside a destination; **`link =
   <reference>`** makes any view a link.
4. **`follow(ref)`** is the one runtime operation behind every arrival —
   click, prose link, pasted URL, back/forward.
5. **`App.onFollow(ref) → ref′`** is the one imperative hook — transform,
   veto, side-effect — applied once to each of them.

Bias, stated: something that **really works, with escape hatches**, over
maximal declarativeness. The imperative floor (`onClick`, raw
`app.location =` writes) stays fully open and uninspected.

### 0.3 References, and what checks them

| form | means | checked by |
|---|---|---|
| `#why` | an authored destination (a `shows` name) | **build** — registry |
| `#story` | an authored anchor; its location derived from the registry — the author never writes a compound | **build** — registry |
| `#deck/q3/47` | a computed location — the app's own grammar, opaque to the runtime (§6's rule, kept) | **crawl** — traversal |
| `#faq@licensing` | a content-derived target: a heading slug inside runtime-fetched prose | best-effort |
| `https://…`, `mailto:…`, relative | out of the app via `navigate` | scheme allowlist |

Three tiers, honestly: **build-checked** covers literal references — bare
slots AND string literals inside `link` constraints
(`{ ok ? "#review" : "" }` registers `#review`). **Crawl-checked** covers the
data tier: every link value *evaluated during extraction* must resolve
against the registry or the build fails — so `link = { :to }` over nav data
is checked, one stage later. **Best-effort** covers content slugs only.

The registry: every `shows` name and every App-tree-authored `anchor`, one
namespace per program, duplicates a build error (except §0.4's sanctioned
split). Writing the compound form for a registered anchor (`#why@story` when
`story` is registered) is a **compile error** naming the rewrite (`#story`) —
the negative rule made mechanical, because style guidance is what an LLM
drops.

### 0.4 Declaring destinations, anchors, links

```declare-fragment
App [ location = "home",
    homeView: View [ shows = "home", … ],
    whyView:  View [ shows = "why",
        note: View [ anchor = "story", … ]
        ],
    pill: Text [ text = "Why Declare", link = "#why" ],
    faq:  Text [ text = "The note",    link = "#story" ],      // location derived
    next: Text [ text = "Continue →",  link = { app.form.valid ? "#review" : "" } ],
    repo: Text [ text = "GitHub",      link = "https://github.com/…" ]
    ]
```

**`shows` semantics, ruled.** Visible when the location's **destination
part** equals the name — the runtime strips its own trailing `@name` before
comparing; the app never writes the split (`location == name` naive equality
is exactly the drift §0.1 indicts, and it is wrong the moment an anchor
arrives). `shows` takes a **literal** name and is legal **only on a view
declared in the App's own tree** — not in a class body, not on a replicated
node. A destination is an app-level, singular fact; data-driven detail pages
are computed locations, the tier built for them. Several App-tree views may
share one `shows` name — that is the §0.7 gate split — and the name registers
once. `visible` remains free and ANDs on top; `shows` alone implies the
visibility. Views stay mounted (visibility, not existence — today's model).

**Anchor registration, ruled.** A name joins the registry only when authored
in the App tree — including `anchor = "story"` set at a component's **use
site**. An `anchor` inside a class body is per-instance and unregistered (a
library card's internal name cannot poison the namespace); unregistered names
remain reachable under the `@` form via the runtime's existing
duplicate-suffix resolution (§6) — best-effort, like content slugs. The
registry replaces suffixing for registered names: a duplicate is an error at
both sites, never a silent `-2`.

**`link` realization, ruled.** On the DOM renderer a linked view in the
**top-level app** realizes as a real `<a href>` — status-bar preview,
⌘/middle-click, copy-link, focus, the crawler's edge (embedded apps: §0.9).
The scheme allowlist (`#…`, `http(s)`, `mailto:`, relative — never
`javascript:`/`data:`) is enforced **where the href is emitted**, not only at
follow — copy-link and middle-click are native paths that never enter follow.
Nested links: nearest wins. A linked **container** realizes as an overlay
anchor (a sibling, not a wrapper), so interactive children stay valid HTML —
the card pattern, ruled once here instead of hacked per site. A linked view
with no text descendant requires an accessible label (compile-checked). On
canvas, linked views are focus stops, Enter activates, and an AT link node is
synthesized — parity is a requirement, not an aspiration.

**`link` + `onClick` coexist, ruled.** The handler runs first, then the
follow; the handler cannot cancel (veto belongs to `onFollow`, or to the
value: `link = ""` is inert — no cursor, no focus stop, nothing for the
crawl). `""` means *not a link*; there is no disabled-link affordance in v1 —
an unavailable action is a disabled control, not a dead link.

### 0.5 `follow` — the one operation

1. `ref` passes through `App.onFollow` **once** (§0.6); `""` stops; the
   result proceeds.
2. External → the `navigate` channel, allowlisted. Done.
3. `#…` → write `app.location`. **No anchor:** the destination's scroll seeds
   to the top. **Anchor:** a retained intent, resolved only when the target
   can answer with a **measured** position — a target's fire is refused (held,
   retried) while any rich-text flow between it and the scroll root still
   carries a provisional height. This is §12.1's component-sourced veto made
   normative; view attachment alone never claims success (the view.ts:952
   bug, closed by specification). **Virtualized targets:** a replicator
   answers a reveal by materializing the indexed row — it knows its logical
   records — so a reveal into a `virtualize = true` region materializes, then
   aims; it cannot deadlock waiting for a row the viewport never approaches.
4. The reveal honors **`App.revealInset`** — the `scroll-margin` analogue for
   fixed chrome (default 0). Measured need: the 56px header cost two
   hand-built marker views in one week without it.
5. The intent is cancelled by the user's first scroll or touch (the
   uncontrolled-editor rule: the reference *seeds*, the user owns) and by any
   later location change. Following a reference equal to the current location
   re-runs step 3 — no dead clicks.
6. **History, ruled** (settles §10.1): a user-initiated follow pushes one
   entry (§2's per-settle rule unchanged). `replace = true` beside `link`
   replaces instead — required practice for fine-grained locations (a slide
   deck's arrows must not make Back a 40-press escape). A follow initiated by
   **history traversal never pushes**; if `onFollow` redirects it, the
   redirect **replaces** the current entry — so Back can never loop through a
   redirect rule. A **cold-arrival** redirect replaces the URL bar; no entry
   is minted.

Source requests, runtime delivers, destination decides. A raw
`app.location =` write remains the uninspected floor beneath all of this.

### 0.6 `App.onFollow` — the escape hatch, bounded

```declare-fragment
onFollow(ref: string) -> string {
    app.log("nav", ref)                                            // effects
    if (ref == "#pricing") return "#plans"                         // legacy URLs
    if (ref.startsWith("#admin") && !app.staff) return "#home"     // edge gate
    return ref                                                     // "" = veto
    }
```

Runs for **every** follow — linked views, prose links, cold URLs,
back/forward — and during extraction. Bounds, ruled:

- **Applied once, never to fixpoint.** A redirect whose result itself needs
  redirecting is two bugs, not a loop.
- **Cold arrivals run it at t=0** — declared initials, before any data loads.
  An edge rule may therefore depend only on values correct at t=0; an
  auth-shaped gate written here silently misfires on the deep link (the user's
  session hasn't loaded), which is why gating's airtight tool is §0.7, not
  this. The doc says so; the guide must say so louder.
- **At crawl time** it runs under the extraction env vector, clock included
  (§0.8) — a `#today` redirect is deterministic because the crawl's clock is
  pinned.

### 0.7 Gating — two tools, honestly ranked

Edge redirect (`onFollow`): redirect *semantics*, convenient, bypassable by a
raw write, blind at t=0. Destination derivation: airtight — anyone can
*request* any location; what a request *produces* is derived:

```declare-fragment
account: View [ shows = "account", visible = { app.authed } ],
login:   View [ shows = "account", visible = { !app.authed } ]
```

The unauthenticated deep link renders login **with the location preserved**;
finishing auth re-derives and lands where the user aimed. The shared `shows`
name is the sanctioned duplicate.

### 0.8 The crawl, specified

**Mechanism, one paragraph.** Extraction runs the real program headless —
same compiler, same renderer — over **fixture material only** (§9: a
`DataSource` unmet by fixtures fails the build loudly, never a partial page),
under a **fixed env vector that includes the clock**. For each location
visited it writes `app.location`, settles, serializes the rendered tree, and
collects the outgoing links that rendering realized. Visitor and crawler
cannot drift: they are the same render.

1. **Registry** (compile time): names unique; every literal reference
   resolved; the compound-for-registered-anchor error (§0.3).
2. **Seeds**: the declared initial location, every registry destination, plus
   **`crawlSeeds`** — an ordinary App attribute (an array of references, read
   at t=0) for wanted-but-unreachable locations. No new syntax; the extractor
   reads an attribute.
3. **Traversal** (computed families): worklist — pop; apply `onFollow`;
   settle over fixtures; serialize; collect every realized `<a href>`
   (declared links and rich-text links are the same artifact); **crawl-check**
   each internal reference against the registry — an evaluated `link` naming
   an unknown authored name fails the build; enqueue unseen; repeat.
4. **Termination is the app's obligation, enforced.** The reachable set over
   fixtures must be finite; an arithmetic family (a calendar's next-month,
   forever) violates it. Budget overflow is a build **error** naming the
   abandoned frontier — not a warning, which a team learns to ignore in a
   week. The app fixes it by bounding what its links emit over fixture data,
   or by declaring the family via `crawlSeeds` and capping the emission.
5. **Authored-`.md` checking, scoped**: build-time dead-link checks apply to
   files reached by a *literal* `DataSource.url` flowing literally into a
   rendered content slot; `#`-scheme references only; a file's references to
   its **own** heading slugs are exempt; a file consumed by several apps
   validates per consuming app. Non-literal chains fall to crawl-checking.

**Emission is out of scope.** Documents, identity, dedup, and addressing
remain §7's ratified rules, unchanged — §0 governs *discovery and integrity*
only. (v1 of this proposal specified emission cardinality and thereby
contradicted §7; that was error, not intent.)

### 0.9 Embedded apps, ruled

Registries are **per program**. Only the **top-level** app realizes native
fragment hrefs — a real `<a href="#why">` inside an embedded app would target
the *host page's* fragment, and copy-link would copy a lie. An embedded app's
linked views realize `<a>` with **its own program URL + fragment** (copy-link
and ⌘-click are then true), while a plain same-frame click is intercepted
into the embedded app's own `follow`. The same interception rule holds at
top level: plain left-clicks on realized anchors route through `follow`
(veto-capable, §12.2's rich-text model); modified clicks belong to the
browser.

### 0.10 Diagnostics that ship with this

Per the language's contract (each error states the rule and names the
rewrite): unknown reference (build; names the nearest registered name);
duplicate registered name (both sites); compound reference to a registered
anchor (rewrite: the bare form); linked view without an accessible name;
`javascript:` in a link value; **migration lint** — `onClick` writing
`app.location` on a view with no `link` (the pre-migration idiom saturates
this repo's corpus, which is the corpus LLMs imitate); **double-gate lint** —
`visible` testing location equality alongside `shows` (after the `@`-strip
ruling the two silently disagree on anchor arrivals).

### 0.11 Open items and pending rulings

- **Pending DT ruling — replace-form history** (§0.5.6): settles flagged
  §10.1; spelled `replace = true` beside `link`.
- **Pending DT ruling — `shows` narrowness** (§0.4): literal + App-tree only
  forecloses `shows = { :slug }` detail routing; computed locations are the
  offered answer.
- **Pending DT ruling — no disabled links in v1** (§0.4).
- **Open — per-destination arrival hook.** `onFollow` is app-scoped;
  `onInit` fires at boot for always-mounted views, so it is NOT route-enter.
  A `State` apply-edge is the candidate construct; undesigned.
- **Open — the pinned reveal contract.** `test/unit.test.mjs:6578` asserts
  first-call resolution; restate as veto-based (headless settles
  synchronously with synthetic metrics, so headless remains first-call) when
  §0.5.3 lands.

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

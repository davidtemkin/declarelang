# Declarative links — `linksTo`, and the retirement of onClick inference

Status: **PROPOSED** (2026-08-04). Direction ruled; shape and open questions
below. Companion rulings: location.md §5 (links are fragment hrefs), §7 (the
crawler model), capabilities.md §6 (`navigate`), input.md Layer 2 (focus).

The one-sentence version: a link is a **relation between an element and a
location**, and the author should state it, because the alternative — recovering
it from the text of a handler body — cannot be made to work and is silently
failing today.

---

## 1. What is there now

`compiler/src/links.ts` attributes a link to an element by pattern-matching its
handler source:

```ts
const ACTIVATION = new Set(["onClick"]);

function linkOf(el: Element, isClassRoot: boolean): LinkTarget | undefined {
  for (const m of el.methods) {                    // methods on THIS element only
    if (!ACTIVATION.has(m.name)) continue;         // named exactly "onClick"
    const t = targetInBody(m.body ?? "", isClassRoot);   // this body's own text
    if (t) return t;
  }
  return undefined;
}
```

`targetInBody` parses the body with the TypeScript AST and looks for the first
`app.location = <expr>` write or `navigate(<arg>)` call. The right-hand side is
kept as SOURCE TEXT and re-compiled at extraction time, then evaluated against
each settled instance at t=0 (`static-html.ts:navHref` → `compileExpr`), which is
what lets `"reference/" + classroot.cname` yield 58 distinct hrefs from one
declaration.

That machinery is ingenious and it is a workaround. It exists because `el.link`
lives on the shared AST node and therefore cannot hold a per-instance value —
so the value has to be recovered and recomputed rather than simply read.

---

## 2. Three ways it fails, measured

A probe with three elements that all navigate (`onClick` inline, a sibling
method, an inherited handler):

```declare
class Nav extends Button [ press() { app.location = "gamma" } ]

App [ a: View [ onClick() { app.location = "alpha" }, t: Text [ text = "Alpha" ] ],
      b: View [ go() { app.location = "beta" }, onClick() { this.go() },
                t: Text [ text = "Beta" ] ],
      c: Nav [ ] ]
```

    links payload: [{"i":1,"href":"#alpha"}]

One of three.

**Gap 1 — no call following.** `b`'s handler calls `this.go()`. `go` is in the
same `el.methods` array; the scanner simply never recurses.

**Gap 2 — no inheritance.** `Nav` declares only `press()`; its `onClick` comes
from `Control`, so `el.methods` holds no `onClick` at all and `linkOf` returns on
its first line. This is the worse one, because `Control` documents `press()` as
*"the activation seam — concrete controls override; pointer and keyboard both
land here."* **The documented place to put activation behaviour is precisely the
place extraction cannot see.**

**Gap 3 — value callbacks, and this one is unfixable by analysis.** A `Segmented`
navigates from `input(v)`. Adding `input` to `ACTIVATION` would not help: the
destination is a function of `v`, the handler's argument, which does not exist at
t=0. Following the call lands on an expression that still cannot be evaluated.
Resolving it means EXECUTING the handler with `v` bound and rolling back —
speculative execution in a reactive graph, not static analysis.

### What the gaps cost, in the corpus

Every `app.location` write, by the handler containing it:

| where | sites | extracted |
|---|---|---|
| `onClick()` | 6 | yes |
| `input()` | 2 — the docs and viewer mode switches | no |
| `showPage()`, a plain method | 2 | no |

Four of ten invisible, and the two shapes that hide them — a value callback, and
a method called from a handler — are entirely ordinary.

The consequence, measured 2026-08-04: the **docs** app emitted **0 reference
documents** where the pristine tree emitted 58, and the **viewer** emitted **1
document instead of 3**, with Source and Edit unreachable. In both cases the
mode switch had become a `Segmented`, and in both cases it was the single edge
into a subgraph — the docs class rail is `visible = { mode == "reference" }`, so
at the default location its 58 links are not in the settled tree at all. One
unseen edge deleted 58 pages, and nothing said so.

---

## 3. Why not just analyse harder

`extractLinks` receives the whole `Program`, so same-class call following and
cross-class resolution through a named cast are both genuinely available, and
Gap 1 and Gap 2 could be closed. They should be, on their own merits. But:

- **Gap 3 does not yield to analysis at all** (above), and it is the gap that
  actually bit.
- **Precision inverts.** Today's rule misses links and never invents them.
  Following calls into arbitrary bodies finds writes guarded by conditions that
  do not hold — phantom locations, static documents for pages no user can reach.
  A crawler that misses pages is a measurable bug; one that emits pages which do
  not exist pollutes an index and is harder to notice.
- **Analysis cannot produce intent.** The best possible dataflow says "this code
  path can write `app.location`". It never says "this element is a link" in the
  sense HTML means — which is also what a screen reader must announce. A
  redirect-after-save writes `app.location` and is not a link; only the author
  can say which is which. `<a>` exists because navigability is a declaration.

---

## 4. The proposal

```declare
linksTo: string = ""        // a View attribute: the location activating this goes to
```

**The declaration IS the behaviour, not an annotation about it.** A `linksTo`
that merely claims what a handler does can drift from what the handler actually
does, leaving two sources of truth and no way to tell which is lying. Setting it
performs the navigation, so drift is impossible. This is what `<a href>` has
always been.

Setting it does five things at once, which is the point:

1. navigates on activation — pointer **and** keyboard;
2. makes the element focusable, because a link is a tab stop;
3. announces as a link to assistive technology;
4. is visible to extraction with no inference whatsoever;
5. emits `<a href="#…">` in the static build.

Today only (1) happens, and only via a hand-written handler.

### The corpus already wrote it by hand

`apps/homepage/homepage.declare` declares the destination and then hand-rolls the
bridge:

```declare
to:  string = "",      // an internal location …
url: string = "",      // … or an external URL. "One or the other, never both."
onClick() { if (classroot.to != "") { app.location = classroot.to; app.toTop() }
            else if (classroot.url != "") app.navigate(classroot.url) },
```

That is this feature, written in an app, because the platform lacked it.

---

## 5. Interactivity — no `onClick` anywhere

The obvious objection is that something must handle the click, and putting an
`onClick` on `View` would make every view an input sink, defeating pay-per-use
(`view.ts:inputSink` — *"a view with none is never wired… stays transparent to
input"*).

It does not need one. **An attribute already confers interactivity**, and there
is a precedent in the same function:

```ts
const handled = POINTER_TYPES.some((t) => typeof self[handlerName(t)] === "function");
// A tip-carrying view is hover-interactive by that fact alone (pay-per-use
// extends to the tip attribute)
if (!handled && this.tip === "") return null;
```

`linksTo` grows that test by one clause and performs the navigation in the sink
itself, exactly as the sink already calls `Tip.over` / `Tip.hide`:

```ts
if (!handled && this.tip === "" && this.linksTo === "") return null;
…
if (type === "click" && this.linksTo !== "") app.location = this.linksTo;
if (handled) fireEvent(this, type, …);
```

Pay-per-use is preserved: a view with no handlers, no tip and no `linksTo` stays
unwired. `scrolls = y` (an attribute that makes a view a scroller) is the second
precedent — this codebase has already ruled that attributes may install
behaviour.

---

## 6. Conditionality — the value carries it

There is no `preventDefault`. A link that should not be followed right now is
simply not a link right now:

```declare
linksTo = { app.dirty ? "" : "next" }        // empty = not a link
```

This is not a new convention. `static-html.ts:160` already ratifies it:

> *"An empty value → null (the value carries the conditionality — `navigate(this.link)`
> with `link = ""` links nothing)."*

Conditionality as data rather than as intercepted control flow, which keeps
`linksTo` a pure relation.

---

## 7. Extraction gets simpler, not harder

The natural worry about a `{ }`-constrained `linksTo` is that the extractor must
now resolve constraints. It is the reverse. Today:

```ts
function navHref(v: View): string | null {
  const link = v._navLink;                 // {href} or {read: "<source text>"}
  if ("href" in link) return link.href || null;
  const c = compileExpr(link.read);        // COMPILE a recovered expression string
  …                                        // then evaluate against the settled instance
```

With `linksTo` the reactive graph has already done all of it, per instance,
before the extractor looks:

```ts
function navHref(v: View): string | null {
  return v.linksTo ? "#" + v.linksTo : null;
}
```

**The settle IS the resolution.** Today's extractor is reimplementing a worse
version of the constraint system because it never had a value to read.

A link that exists only in a non-default state is unchanged: the crawl cold-boots
at each discovered location and re-settles (location.md §7), so such a link is
found once its state is reached — transitively, exactly as now.

---

## 8. Composition

**With `onClick`.** They coexist; the declaration is the navigation, the handler
is whatever else. Declared navigation applies first, then the handler runs — the
handler is an addendum to the relation, not the reverse.

```declare
// today
onClick() { app.refAt = classroot.cname
            app.location = "reference/" + classroot.cname
            app.showPage() },

// declared
linksTo = { "reference/" + classroot.cname },
onClick() { app.refAt = classroot.cname; app.showPage() },
```

**Buttons** get it for free, `Button` being a View — and become real links, which
the `onClick` form never is:

```declare
Button [ label = "Reference", linksTo = "reference/View" ]
```

**Control subclasses** stop being a trap; Gap 2 dissolves rather than being
patched:

```declare
class Nav extends Button [ press() { app.location = "gamma" } ]   // invisible today
class Nav extends Button [ linksTo = "gamma" ]                    // nothing to miss
```

**Data-driven controls** bind it from the record — one line each, which is
exactly the shape of the 2026-08-04 patch to `SegmentedItem`, but as a
first-class attribute rather than a hand-rolled `app.location` write:

```declare
SegmentedItem [ linksTo = { :linksTo } ]
```

**External URLs fold in.** `links.ts` already folds them ("the fragment when the
location is non-empty, else the URL"), so one attribute can carry either and
homepage's `to`/`url` pair collapses into it.

---

## 9. Focus — and a prerequisite bug

`linksTo` must confer focusability: a link that cannot be reached by keyboard is
not a link, and this is most of the accessibility win. That is in-model —
`focusable` is a **View** attribute (`view.ts:218`, default false); `Control`
merely sets it (`focusable = { !disabled }`).

The tab order is computed live rather than registered — `sequence()` walks the
tree per move, emitting `focusable && visible` views — so a view that becomes
focusable joins the order immediately, with no stale index. Adding tab stops is
mechanically cheap. **The surprise is a design one**: six declared links means
six new tab stops, silently. Ruled acceptable, because the alternative (a link
that is not a tab stop) is a worse thing to ship.

### The prerequisite

Focus handles *entering* focusability and handles a focused subtree being
DESTROYED (`noteDiscarded`). It does not handle a live view whose `focusable`
simply flips to false. Measured:

```
focused          : B
after disabling B, focus is still on: B  (b.focusable = false)
Tab lands on     : A    ← expected C
```

Nothing watches `focusable`, so focus dangles on a non-focusable view; then in
`move()`, `seq.indexOf(this.current)` returns −1 and Tab restarts at the first
stop in the group instead of advancing from here. `atEdge` is gated on
`idx !== -1`, so a `focusTrap` does not fire `escapeFocus` in that state either.

**This is a bug today, not a consequence of `linksTo`.** `Control.focusable =
{ !disabled }` means any app that disables a focused control hits it —
save-becomes-disabled-after-saving is the everyday case, and the user's focus is
silently stranded.

The fix belongs in the focus service on its own merits: watch the current focus's
`focusable && visible` and, when it goes false, advance to the neighbouring live
stop — the policy `noteDiscarded` already implements for destruction. The pattern
exists too: `retargetFollower()` already installs a Constraint over the focused
view, so this extends it rather than introducing anything.

It is listed as a PREREQUISITE because `linksTo = { … }` is exactly the
in-and-out-of-focusability shape, and would turn an occasional bug into a common
one.

---

## 10. Retiring inference

With `linksTo`, onClick inference should go rather than being kept alongside.
Two mechanisms for one relation is how the drift starts, and inference is the
one that cannot be made correct.

**Migration surface: 23 elements**, 15 of them in homepage — bounded and
mechanical.

Retiring it is also more CORRECT, not merely tidier. Inference cannot distinguish
a link from a redirect: a Save that navigates on success writes `app.location` in
an `onClick` and is extracted as a destination today, so the static build can
carry a page reachable only by mutating data. A declaration tells them apart
because the author says which is which.

**Whatever else happens, make the failure loud.** What cost 58 documents was not
narrowness but silence — a handler chain wrote `app.location`, the extractor
attributed no link, and nothing was reported. A diagnostic — *this element
navigates but declares no link* — is a scan of method bodies for `app.location =`
cross-referenced against the elements that got a link, and it would have caught
docs, viewer and `showPage()` on the first build. Cheap, and independent of
everything above.

---

## 11. Open questions

- **Naming.** `linksTo` is the current pick. Not `link` — already RichText's href
  event (`schema.ts:957`). Not `location` — on a View that reads as position,
  which is fatal in a layout language. `goesTo` was considered and rejected as
  naming the motion rather than the relation.
- **Ordering.** Declared navigation before the handler is proposed, not ruled.
  Is there a case that needs the reverse?
- **`disabled`.** A disabled Control must not navigate. A bare View has no such
  concept — does `linksTo` want its own inert state, or is `linksTo = ""` enough?
- **RichText.** Its `link` carries an external href for a text run. Should it
  accept an internal location too, so prose links and chrome links are one
  vocabulary?
- **Scope of the fold.** One attribute for internal locations and external URLs
  distinguishes them by the value's shape. `links.ts` already does exactly this;
  is inheriting that ambiguity right, or should they stay two slots?

---

## 12. Evidence

Everything asserted here was measured on 2026-08-04 against the working tree:

- the three-shape probe (§2) — `links payload: [{"i":1,"href":"#alpha"}]`;
- the corpus inventory of `app.location` writes by enclosing handler (§2);
- docs 0/58 and viewer 1/3 documents before the `SegmentedItem` patch, 70 and 3
  after (`crawlLocations` over each app);
- the focus probe (§9) — Tab landing on A rather than C after the focused control
  was disabled;
- the migration count of 23 navigating `onClick` handlers (§10), by brace-matched
  scan of `apps/*/*.declare` and `library/*.declare`.

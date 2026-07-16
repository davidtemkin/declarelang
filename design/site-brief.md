# Declare homepage / Explorer — design brief

The project's front door and the seed of a Laszlo-Explorer-equivalent showcase. It is
**built in Declare** and its flourishes are live demonstrations of the language — the page
*is* the proof. Strategically it's the next flagship: greenfield and design-forward, so it
*demands* the modern conventions (states, responsive layout, transitions, tokens) that the
parity-driven calendar-sample never exercised. The page is the forcing function; **the
deliverable is the component library + the conventions + the guide.**

The framework-neutral build contract — copy, layout, interaction, motion, responsive
behavior — lives in **`site-spec.md`** (implemented in parallel in Declare *and* in a
conventional framework, as an instructive comparison). This doc is the *why and the Declare
strategy*.

---

## 1. Messaging

**Headline (hero):**
> # The UI language for the AI era.

**Subhead:**
> A declarative language for dynamic web apps — reactive by construction, compiled live in
> the browser, small enough to hold in your head. **This whole page is written in it.**

**The justification (first section below the hero — earns the headline):**
> ## Read it. Generate it. Run it.
> The relationships that matter — structure, data, reactivity — are **explicit in the
> language**, not hidden in imperative steps or a runtime graph. So a Declare program is
> **analyzable** (the compiler reads its data-flow statically — so can a model),
> **generable** (no ceremony, no magic; no dependency arrays or keys to get subtly wrong),
> and **runnable on the spot** (it compiles in the browser). *Everything that makes it
> legible to a model makes it legible to you.*

**TypeScript trust line** (under the justification): *The declarative parts are Declare. The
logic is ordinary, typed TypeScript — nothing to relearn, and everything an editor or a
model already understands.*

**Performance pillar** (its own section — three-part flex):
1. **Small** — a self-measured page-weight **stat** (this page reports its own bytes; not a
   hardcoded number). Real gzipped upper bounds today: runtime **136 KB** (both backends —
   a page ships one), compiler **17 KB** (only for the editable page), a compiled app
   (weather, complete) **4 KB**. A live, editable Declare page ≈ **~155 KB** vs the **2.3 MB**
   median web page — less than most sites' hero image, *including a compiler*.
2. **Fast reactivity** — dependencies compiled *statically*, not tracked at runtime → no
   reactive-graph tax.
3. **Own-pixel rendering** — the canvas runtime, same program, for the ceiling.

*(Note: the page-weight number is a static stat — it does not change after load, so it is
presented as a number, never dressed up as a "live counter." The genuinely reactive metric
is the Playground's **CompileReadout** — gzipped size + compile time, updating on every edit.)*

**Manifesto band (E) — a full-width statement that pivots into the vision:**
> The last framework was built for browsers. This one's built for what's next.

**Voice:** confident, understated, show-don't-hype — panache *earned* by a page you can read
and edit, not by adjectives. "For the AI era" is the flag; "and therefore for you" is why a
skeptical developer stays.

## 2. The core idea — the site is the proof

The effects a design studio needs libraries for are, in Declare, a line each — and they're
exactly the conventions we must establish:

| effect | in Declare it's… | exercises |
|---|---|---|
| slow-following cursor | a **spring constraint** on the pointer | constraints |
| header appears on scroll | a **state** keyed on scroll | **states** *(calendar: 0)* |
| scroll-down reveals | **enter transitions** on viewport entry | transitions *(M4)* |
| menu → hamburger | a **width-keyed** state | **responsive layout** *(never done)* |

## 3. See / edit / run — staged

- **Now (pre-M5):** every example has a **source peek** — the running thing and its `.declare`
  side by side (read-only, but real). The reveal is itself a Declare transition.
- **At M5 (in-browser compile):** source becomes **editable → recompiles in the browser →
  runs live**, with the **CompileReadout**. The site both showcases and *drives* M5.
- **Integration:** the code panel is first-class page type (same panels, type, motion), not
  a bolted-on editor widget. Code is the content.

## 4. Design direction

- **Feel:** fresh, design-forward, developer-serious. Motion with restraint — every animation
  *demonstrates reactivity*; nothing moves just to move.
- **Aesthetic (parked, swappable):** a **blueprint / graph-paper** direction is under
  consideration — it rhymes with the pitch (structure made visible; a coordinate grid *is*
  layout). It's a **skin** living entirely in tokens, so it changes nothing about *what* we
  build; decide late.
- **Structure device:** numbered progression — `01 — Read/Generate/Run · 02 — Performance ·
  03 — Reactivity · …` — modular, doubles as the ToC.
- **Header on scroll; fully responsive** — the two admired d109 attributes that are *also* Declare
  states, demoed by being used.
- **Palette/type:** TBD (2–3 palettes to mock). Mono treated as first-class type.

## 5. Mobile & desktop

**Mobile has to be awesome** — the reading + demo layer is fully responsive (d109-grade:
menu→hamburger, reflow, demos that run on a phone), and editing **works** there (leaner
affordance). The rich side-by-side **workshop** (editor + preview + CompileReadout) is the
**desktop reward** — no apology, no broken page. "The workshop is on desktop," not "we forgot
mobile."

## 6. Page flow

1. **Hero** — headline + subhead + editable-page hook + spring-cursor + `Scroll ↓`.
2. **01 — Read it. Generate it. Run it.** — the justification (+ TS trust line).
3. **02 — Performance** — the three-part pillar with the self-measured weight stat.
4. **03 — Describe it. It runs. It stays true.** — the reactivity idea, shown as a live
   (editable at M5) example.
5. **Manifesto band (E)** — pivots into the vision / what's coming.
6. **Playground → what's coming** — the Explorer seed (editor + preview + CompileReadout),
   then gallery/components/docs.

## 7. Component inventory (derived from the flow → seeds `library/`)

**Layout & structure** *(highest value, all new):* Section/Band · Stack (axis,gap,align) ·
Grid (responsive cols) · **Responsive container** (width→state) · Scroll source (scrollY) ·
Spacer/Divider.
**Nav & chrome:** Header (appear-on-scroll) · NavBar ⇄ Hamburger+Drawer · Button
(primary/ghost/link/arrow-CTA; hover·active·focus) · AnchorNav + numbered markers · Logo ·
Footer.
**Content & type:** Display/Heading · Prose · Numbered marker · Badge/Chip · Callout (TS
trust bar).
**Code experience (Explorer core):** CodePanel (highlighted, read-only) · Editor · LivePreview/
Runner (DOM/Canvas toggle) · **Playground** (composite: editor+preview+run+diagnostics+
**CompileReadout**) · SourcePeek · Diagnostics view · CopyButton.
**Motion:** SpringCursor · Reveal (scroll-enter).
**Data & feedback:** **Stat** (page-weight, self-measured, static) · Card · Tabs · List/Repeater
(`:arr[]`) · Toast · Tooltip.

## 8. Build order (tranches)

- **Tranche 0 — the spine:** Section, Stack, Button, Heading/Prose, CodePanel + LivePreview +
  a minimal Playground, SpringCursor → a hero + one editable, running demo (proves the loop).
- **Tranche 1 — the full pitch page:** Header (scroll), NavBar⇄Hamburger+Drawer, Grid,
  Responsive container, Reveal, Badge/Callout, Stat, Card, numbered markers, Footer, AnchorNav.
- **Tranche 2 — Explorer growth:** Tabs, List/Repeater, richer Editor, Diagnostics, SourcePeek
  everywhere, Toast/Tooltip, gallery.

## 9. What this establishes (the M3 cargo)

Design **tokens** (color/spacing/type/radii/motion — where constants finally live; the
blueprint skin plugs in here) · **state patterns** (hover/active/focus, open/closed,
editing/running/error, compact/expanded) · **responsive vocabulary** (Responsive container +
Grid + width-keyed states) · **transition idiom** (Reveal/Drawer/SourcePeek → drives the M4
enter/exit rulings) · **composition idiom** (children, slots, style overrides). Pulls M3/M6
forward, interleaves M4, drives M5.

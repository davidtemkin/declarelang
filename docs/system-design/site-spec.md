# Site build spec — framework-neutral

The precise, implementation-agnostic contract for the Declare homepage/Explorer: **copy,
layout, dimensions, design tokens, interactions, motion, responsive behavior.** No framework,
no library, no technology is named or assumed. Two independent implementations built to this
spec should look and behave the same.

> A single source of truth for an apples-to-apples comparison. If something here is
> ambiguous, make it look intentional and note the choice.

---

## 0. Design tokens (both builds use exactly these)

**Aesthetic:** a **dark "blueprint"** look — deep ink background with a faint technical grid,
crisp monospace labels, one bright accent. (Swappable later; commit to it now so both builds
match.)

**Color**
| token | value | use |
|---|---|---|
| `bg` | `#0B141B` | page background |
| `surface` | `#101E28` | cards, panels, code |
| `surface-2` | `#162A36` | raised / hover |
| `grid` | `#172A38` | the faint blueprint grid lines |
| `line` | `#263D4C` | borders, rules |
| `text` | `#E7EEF2` | primary text |
| `muted` | `#8A9BA6` | secondary text, labels |
| `accent` | `#4C8DFF` | links, primary actions, highlights |
| `accent-2` | `#37E0C8` | code accents, the cursor dot |
| `danger` | `#FF6B6B` | errors |

**Type** — system stacks only (no web fonts, keeps both builds self-contained):
- sans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- mono: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
- scale: hero `clamp(40px, 8vw, 88px)` / h2 `clamp(28px, 4vw, 40px)` / lead `19px` /
  body `17px` / small `14px` / code `13.5px`. Line-height: headings `1.05`, body `1.6`.
  Headings tight letter-spacing (`-0.02em`); mono labels wide (`0.12em`, uppercase).

**Spacing** (px): `4 8 12 16 24 32 48 64 96 128`. **Radii:** `6 / 10 / 16`.
**Motion:** fast `150ms`, base `300ms`, slow `500ms`; easing `cubic-bezier(.22,.61,.36,1)`;
the cursor uses a spring (trailing follow).
**Layout:** max content width `1120px`; section vertical padding `clamp(64px,10vw,128px)`;
gutter `24px`. A faint grid background (`grid` lines every `32px`, ~`0.5px`) spans the page.

## 1. Structure & copy (sections in order)

### Hero (full viewport height)
- Small mono eyebrow, top-left of content: `DECLARE`
- H1: **The UI language for the AI era.**
- Subhead (lead): *A declarative language for dynamic web apps — reactive by construction,
  compiled live in the browser, small enough to hold in your head. **This whole page is
  written in it.***
- Two actions: primary **Get started →**, secondary **See it run**.
- Bottom-center scroll cue: `Scroll ↓` (gentle 6px bob loop; fades out after first scroll).
- The spring cursor is active over the hero (and the whole page on pointer devices).

### 01 — Read it. Generate it. Run it.
- Mono section marker `01`.
- H2: **Read it. Generate it. Run it.**
- Lead: *The relationships that matter — structure, data, reactivity — are explicit in the
  language, not hidden in imperative steps or a runtime graph.*
- Three cards in a row (stack on mobile):
  - **Analyzable** — *The compiler reads a program's data-flow statically. So can a model.*
  - **Generable** — *No ceremony, no magic. No dependency arrays or keys to get subtly wrong.*
  - **Runnable on the spot** — *It compiles in the browser. Generated code runs the instant
    it exists.*
- Pull-quote, centered, larger: *Everything that makes it legible to a model makes it
  legible to you.*
- Trust line (muted, mono-tinged): *The declarative parts are Declare. The logic is ordinary,
  typed TypeScript — nothing to relearn, and everything an editor or a model already
  understands.*

### 02 — Performance
- Marker `02`. H2: **Small. Fast. Own-pixel when you want it.**
- **The stat** — a large number, the page's *own* measured transfer weight (sum of loaded
  resource sizes, read at load; not hardcoded). Format: big `≈ NNN KB` with sub-label
  *this page, measured live — vs the 2.3 MB median web page.*
- Three points beneath (row → stack):
  - **Small** — *the whole thing — runtime, your app, and a compiler — is smaller than most
    sites' hero image.*
  - **Fast reactivity** — *dependencies are compiled statically, not tracked at runtime — no
    reactive-graph tax.*
  - **Own-pixel rendering** — *a canvas engine renders the same program when you want the
    ceiling.*

### 03 — Describe it. It runs. It stays true.
- Marker `03`. H2: **Describe it. It runs. It stays true.**
- Lead: *A binding isn't a function you remember to re-run. It's a standing relationship the
  runtime keeps true.*
- **Live example** (side-by-side desktop, stacked mobile): an editable code panel on the
  left, a running preview on the right. Default example: a **control → reactive output** — a
  slider (0–100) whose value drives a bar's width, a number, and a color simultaneously.
  Editing the code updates the preview. A **readout** under the panel shows *compiled size
  (gzip)* and *compile time (ms)*, updating on each edit (debounced ~300ms).
- A **View source ⌄** affordance toggles the panel open/closed with a slide.

### Manifesto band
- Full-width, centered, large: **The last framework was built for browsers. This one's built
  for what's next.** (Thin accent rule above and below.)

### Playground / What's coming
- Marker `04`. H2: **The workshop.**
- A larger playground (same editor+preview+readout unit as §03, more room).
- **What's coming** — three muted cards: *Explorer gallery · Component library · Docs* — each
  a short honest line ("early — being built in the open").

### Header (appears on scroll)
- Absent/transparent at the top. After scrolling past `80px`, a slim sticky bar fades+slides
  down: wordmark left (`Declare`), links right (**Docs · Examples · Playground · GitHub**).
  Height `56px`, `surface` bg with bottom `line`, slight backdrop blur.
- Below `720px`: links collapse to a **hamburger**; tapping opens a **drawer** (slides from
  the right, covers ~80% width, dim scrim behind, close on scrim tap / esc).

### Footer
- Muted, single row → wrap on mobile: `built in Declare` · the measured weight · links
  (GitHub, Docs). Thin top `line`.

## 2. Interactions & motion (precise)

- **Spring cursor:** a `10px` `accent-2` dot (soft glow) trails the pointer with spring
  follow (noticeable lag, settles smoothly — think stiffness≈120, damping≈14 feel). Grows to
  `18px` and lowers opacity over interactive elements. **Off on touch / no-pointer devices.**
- **Header reveal:** threshold `80px`; fade+`-8px`→`0` slide over `300ms`. Stays once shown;
  hides again only back at the very top.
- **Scroll reveals:** elements enter with opacity `0→1` + `16px`→`0` rise over `500ms` as
  they cross ~85% viewport height, **once**. Children stagger `60ms`.
- **Buttons:** hover = `surface-2` bg (or accent for primary) + `150ms`; the arrow in
  `→`-CTAs nudges `4px` right on hover. Active = `98%` scale. Focus = `2px accent` ring.
- **Source peek / drawer / panels:** slide+fade `300ms` with the shared easing.
- **Scroll cue:** 6px vertical bob, `1.4s` loop; fades on first scroll.
- **Playground:** edit → debounce → recompile → preview updates + readout updates; a compile
  error shows inline in the readout area (in `danger`), preview holds last-good.
- **Reduced motion:** honor `prefers-reduced-motion` — no cursor trail, reveals become
  instant, cue static.

## 3. Responsive behavior

- Breakpoints: **mobile < 720**, **tablet 720–1080**, **desktop > 1080**.
- **Mobile (must be excellent):** single column; hamburger + drawer nav; hero type scales
  down gracefully; §01 cards and §02 points stack; playground stacks (editor above preview),
  editing still works (a simple editable code area); spring cursor off; reveals on (subtle);
  generous tap targets (≥44px); the grid background lightens.
- **Tablet:** 2-up where §01/§02 allow; playground may stay stacked.
- **Desktop:** full multi-column; side-by-side playground; spring cursor on. The rich
  side-by-side workshop is the desktop reward.
- Nothing may cause horizontal scroll at any width. Content column always `≤1120px`, centered,
  with the gutter.

## 4. Acceptance

A build satisfies the spec when: all sections and copy are present and correctly ordered; the
tokens are applied; the header appears on scroll and collapses to a working hamburger/drawer
under 720px; scroll reveals, the spring cursor (pointer only), and button states all work; the
playground edits→previews→reports size/time; the page reports its own measured weight; there
is no horizontal scroll at 375px, 768px, or 1440px; and `prefers-reduced-motion` is honored.

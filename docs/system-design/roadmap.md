# Roadmap — to "Foundation Complete"

The forward-looking companion to the `design/` rulings and `docs/system-design/history/build-journey.md`
(the *how we got here*). This is the *how we finish* — the path from "it works for us" to a
frozen language, a robust framework, and a foundation someone else can pick up and build on.
Annotate freely; this is a working chart, not a contract.

**Two gates govern every step** (the prime directive):
1. **Perceptual + behavioral "or better"** — output matches the reference pixel-for-pixel
   (AA tolerance) and behavior-for-behavior, or improves on it deliberately; never regresses
   by accident.
2. **Elegance + performance are non-negotiable** — concise, readable, fast. Cruft and dead
   abstraction rank with wrong behavior; the elegant/performant path is taken even when hard,
   and a genuine wall is *surfaced for a decision*, never quietly cut around.

---

## Where it stands (2026-07-08)

**Done and solid**
- **Language** — 21 design rulings written; the core is ruled *and* implemented: `[ ]`/`{ }`,
  constraints (static dep-extraction), `:path` data + replication, states (cut-1), events,
  fonts, styling, text-input (v1 native overlay), diagnostics catalog (partial migration).
- **Framework** — runtime (39 modules) + thin compiler (5) built; **dual backend DOM + Canvas
  at perceptual delta-0**; typecheck pass; **312 tests green**; dynamic compile server works.
- **Flagship #1 — weather** — complete (301 lines; drove the R0→R8 ladder).
- **Flagship #2 — calendar-sample** — through **Stage 3** (frame, data-binding, modes + 500ms
  motion); ~1066 lines. *← current front.*
- **Distro** — self-contained, hostable; `tools/` (benchmarks + gallery), `deploy-build`.

**Open** — component library is empty; docs are a stub; in-browser compile isn't wired;
flagship #3 isn't begun; ~11 language questions still open; not yet in git.

---

## Milestones

The shape is the same one that built everything so far: **the apps drive the ladder.** The
flagships *surface* which components and which language constructs are actually needed, so the
library (M3) and the language freeze (M4) are pulled to closure *by* M1–M2, not designed in a
vacuum. M5–M7 are the infrastructure finish.

### M0 — git *(do first)*
Initialize the repo and push; everything below is currently untracked. Private to start.

### M1 — Finish calendar-sample *(in progress)*
- **Streamline + UX pass** *(current task)* — tighten the ~1066 lines; fix UX rough edges.
- **Stage 4 — events interactive**: selection chromes, open-cell hour timeline, drag
  (time + cross-day). Gates vs `oracle/07,08,12`.
- **Stage 5 — info panel + Add Event**: panel slide, TextInput fields, spinners, accordion,
  apply/delete/cancel. Gates vs `oracle/05–07,20`.
- **Stage 6 — chrome polish**: CalButton, scrollbar, selected-day bevel, startup animation.
  **← component-library harvest begins here.**
- **Gate**: all SPEC §12 deviations honored; oracle shots pass; the app reads clean.

### M2 — Flagship #3: neodashboard
The app that stresses what the calendar doesn't — **windows, charts, lists, forms, tabs,
drag** — the real driver of library breadth and the hardest language questions. Spec-first
(same anti-transliteration method as calendar).

### M3 — Component library *(`library/` empty → a real set)*
Harvested from the two apps, then **formalized**:
- Extract the reusable widgets the flagships prove (Button, ScrollBar, TextInput, Spinner,
  Accordion, List, Tabs, Window, chart primitives…).
- Each gets **schema + implementation + tests + gallery entry + `@api` doc surface**.
- Consolidate into `library/` as a coherent, documented set. (Harvest starts in M1§6,
  dominates in M2, formalizes here.)

### M4 — Close the open language questions *(the v1 freeze)*
Surfaced *by* the apps, so they resolve alongside M1–M3 — then freeze v1. By reach:
- **Structural enter/exit animation** — deferred-teardown "leaving" limbo (hit-test + layout
  while animating out). *The piece the cut criterion hinges on* (`animation.md`). Dashboard
  window-close, calendar info-panel.
- **Heterogeneous replication** — one-component-per-element by discriminant (feeds/CMS/chat).
  *The open question with the deepest reach* (`declare-language.md`).
- **Lazy / deferred instantiation** — `initstage`-style; ties to list virtualization + perf.
- **State collision lattice** + **declarative transitions** on state change (seams left).
- **Module resolution** (with the dev-env rung).
- **Smaller deferred grammar** — two-way binding `<->`, reactive aggregations, create-by-string,
  `rgba(c,a)`, style `!important`/box-model: decide **in-or-out** for v1, don't leave ambiguous.
- **Gate**: every item implemented *or* explicitly out-of-v1 with a written reason. Frozen.

### M5 — In-browser compilation (the second hosting mode)
Today static = precompile; the live story needs (per `hosting.md`): a **fetch-based
IncludeHost**, **lazy `node:` imports** (they block browser load today), and a **service
worker**. Gate: host the tree statically, edit-and-compile in the browser.

### M6 — Docs + get-started
- Build the **doc-system** (ratified, unbuilt; `docs/system-design/doc-system.md`): generated reference
  (schema ⨝ runtime ⨝ tsc + Declare-parser; `@api` coverage gate) + hand-authored **guide**.
- The **"get started" experience** — a minimal `hello` sample, a scaffold path, the on-ramp.

### M7 — Packaging + distribution
Package: downloadable, `npm start` (dynamic) **or** host static (in-browser); versioning.

---

## Critical path

```
M0 git ─┬─► M1 calendar-sample ─┬─► M2 neodashboard ─┬─► M3 library (formalize) ─► M6 docs ─► M7 package
        │      (harvest ▸▸▸▸▸▸▸▸▸ harvest ▸▸▸▸▸▸▸▸▸ consolidate)                          │
        └─────────────────► M4 language-close (resolves alongside M1–M3, freeze before M6)
                            M5 in-browser-compile (independent; any time after M1)
```

## Definition of "Foundation Complete"

- **Language frozen** (M4) — every construct an author needs is ruled + implemented; the
  "still to design" list is resolved or explicitly out-of-v1.
- **Framework robust** (M5) — runtime + compiler solid; both hosting modes (dynamic +
  in-browser static) work; diagnostics solid.
- **Real documented component library** (M3 / M6).
- **Three flagships prove it** (M1 / M2) — weather, calendar, dashboard.
- **Packaged, get-started, in git** (M7 / M0).

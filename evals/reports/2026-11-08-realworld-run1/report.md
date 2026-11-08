# RealWorld (Conduit) run 1: Opus 5.5, Declare and React, at 69d44878

**Declare: 19.3 min, 107 turns, 863 code-only lines in 3 files, with the whole Conduit look
written in it. React: 8.8 min, 70 turns, 1,456 code-only lines in 28 files, plus the spec's
1,291-line stylesheet copied in. Hidden checks — the official RealWorld end-to-end suite,
ported to accessible roles and names, the same drive for both: Declare 42 of 47 scenarios
(118 of 130 tests), React 44 of 47 (125 of 130).**

The first run built to a published specification rather than our own brief: RealWorld's
frontend spec (features, routing, the page templates, `styles.css`, the default avatar) and
a local backend implementing its API, seeded and checked against the spec's own 13 Hurl
files (544 checks). The official e2e suite and its selectors contract were withheld from
both stacks: that suite finds everything by CSS class, which a Declare program does not have.

## Figures

| | **Declare 1** | React 1 |
|---|---|---|
| time | **19.3 min, 107 turns** | 8.8 min, 70 turns |
| phases | **reading 9.0 (of which ~2.5 reading, ~6.5 planning), writing 1.8, checking 8.5 min** | wrote first, then drove it in a browser |
| model · tools | **15.6 · 3.7 min** | 7.5 · 1.3 min |
| output tokens (thinking) | **101.6k (44.1k)** | 53.2k (13.7k) |
| code (code-only) | **863 lines, 3 files** | 1,456 lines TS/TSX in 28 files + `styles.css` (1,291) copied |
| the look | **written in Declare from `styles.css` and the templates** | the spec's HTML and CSS used directly |
| its own checks | **74-step flow, 48 assertions** | 11 Vitest tests |
| hidden checks | **42 / 47** (118 / 130) | 44 / 47 (125 / 130) |
| account | **collected (`account-declare.md`)** | **not collected**: refused three times by the API's safeguards (`[reasoning_extraction]`, request `req_011Cgr44aGTesoEo2TuYkDQK`) |

**Against the October Conduit** (`evals/reports/2026-10-25-conduit-realworld/`, built outside
the harness, about 12 min): that agent was warm — the second app in a session that had just
built another — so it had no reading to do. Today's 19.3 minutes is about 9 of reading and
planning plus about 10 of building, the same as October's. Size: 745 code-only lines then,
863 now (page links, a phone layout, pages rebuilt per address).

**Against eight maintained human implementations** (same counting, from October's report):
Declare 750–863; SvelteKit 1,112; SolidJS 1,248; Vue 3 1,832–1,858; Angular 2,054; React +
Redux 2,057; React FSD 2,693; Elm 3,726 — every one of those taking the 1,205-line theme free.

## The hidden checks, and their audit

`evals/apps/realworld/drive.mjs` ports 130 of the official suite's 131 tests into 47
scenarios (the one left out navigates to `?page=N`, a URL the spec doesn't define), by
accessible role and name, judged against the backend's state. Developed on React; its first
pass on Declare was 0 of 47 — **the drive's**: it built hash URLs as `conduit.declare/#/login`
instead of `conduit.declare#/login`, and took tabs only as links or buttons where Declare's
are listbox options. Fixed fairly to both (see the drive's comments); no service outcome or
fixed label loosened. As a cross-check, the official Playwright suite run on React's build
passes little (it finds fields by `name` and classes the agent was never given) — information
about the selectors contract, not about the app.

**Failures, all the apps', each confirmed in source, tree or screenshot:**
- Both: a refused comment deletion (403) shows no error; on a 400/403/404 from `/api/user`
  Declare keeps the signed-in header, React shows signed-out but keeps the token.
- Declare: signed out at `/editor` or `/settings` it shows the sign-in form without moving to
  `/login` (and the same after a 401); an avatar URL that fails to load leaves a blank (the
  default avatar is used only for an empty URL). Titles are plain text, not headings — a note.
- React: malformed JSON from the API crashes to React Router's error page.

No accessibility-only failures in the Declare build: everything a mouse user can do was
reachable by role and name.

## Findings for the platform, and what was done

From the Declare account (word for word in `account-declare.md`), checked against the runtime:
1. **A `WrappingLayout` in a view with no width stacked one child per row** (the pager; a
   wrapped sentence). Fixed in v0.6.5: such a flow lays one row.
2. **Literal links with a `/` are not checked at build** — by design (a location the program
   parses), but `link`'s reference said every literal is. Docs corrected in v0.6.5.
3. **Overriding a child's method at a use site** gave the attribute rule and a parse error;
   now its own message with the two fixes (v0.6.5).
4. **Checker:** `expect.text` doubled a row's words; a path written with class names got no
   hint; the motion hint asserted a cause it only suspected — all fixed (v0.6.5).
5. **`exists` keeps its instance while its condition holds** — the agent's costliest late fix
   (the editor kept old tags across addresses). Documented behaviour; a candidate sentence where
   `exists` is introduced.
6. Smaller, not acted on: reference entries for `FormProblem` and the `accessibility…` family;
   computed arrays needing a Dataset to replicate.

## A process note

Resumed sessions for React accounts have now been refused three times across two runs, as
`[reasoning_extraction]`; Declare sessions, asked the same and more pointed questions, have
not been. Options: a fresh session answering from the run's visible record (a reconstruction,
labelled as such), or doing without.

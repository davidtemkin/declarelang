# Venue Codex React run 1: GPT-6 Astra (medium) in Codex, React, recorded

**Run:** 2026-10-31, in the ChatGPT app's Codex (GPT-6 Astra, reasoning medium; sandbox workspace-write, approval on
request), in an empty folder holding only `task/brief.md` and `task/api/API.md` (port 8351). The prompt is
`prompt.txt`, the same one Claude's React run 2 got.

**Files beside this report:**
- the app (`app/`: `src/main.jsx`, `src/styles.css`, `src/validation.js` with its test, `tests/browser.mjs`);
- `declare-port/hero.declare`: its header and hero ported to Declare by hand afterwards (see below);
- the questions it is to be asked (`impressions.txt`, from `account-stack.txt`).

## Figures

| | **Codex React 1** | Codex Declare 1 | Claude React 2 |
|---|---|---|---|
| time | **6.9 min** | 12.5 min | 30.9 min |
| output tokens | **20.1k** (1.6k reasoning) | ~27k | 135.5k |
| first app written · first boot | **2.2 · 3.8 min** | — · 5.2 min | — |
| permission pauses | **none** | several (sandbox: npm cache, ports, network) | — |
| hidden acceptance, first boot | **4 of 11** (9 of 11 with "1 seats" accepted) | 5 of 11 (10) | — |
| hidden acceptance, delivered | **5 of 11** (10 of 11 with "1 seats" accepted) | 5 of 11 (10) | 11 of 11 |

The first snapshot (21:32:54) imported `styles.css` before the file existed and could not boot; the next one, 98
seconds later, is the first boot scored here.

**"1 seats".** The brief says the summary "reads exactly: **3 seats · $240.00**" and never shows one seat. Both Codex
runs wrote `{n} seats` literally, and the drive expects "1 seat". The brief is at fault as much as the agents; it
should show the singular too.

**The real failure:** after a wrong security code, focus goes to the page body, not to the field
(`security_code_wrong`). At first boot, one more: the phone flow's summary was not visible on a phone.

## What it built

One file of React: `main.jsx` with 3 components, 23 `useState`s and 7 `useEffect`s, plus 1,516 lines of CSS. It
wrote the app as about 38 very long lines and ran Prettier at the end, so its line counts are after formatting (bytes
are the fairer size). It is not structured for a team to maintain: almost everything is one component. Its own checks
are a Node test of the validation helpers and a headless-Chrome script that buys two seats.

| | Codex React | Codex Declare | Venue 19 (Opus, Declare) |
|---|---|---|---|
| code | 1,516 lines CSS, 1,258 lines JS | 405 lines Declare, 26 lines TS | 1,221 lines Declare |
| bytes | 68 KB | 31 KB | 65 KB |
| lines over 150 characters | 2 | 28 | 3 |
| colour literals outside theme declarations | 66 | 34 | 2 |
| theme reads | 0 | 5 | 84 |
| States | 0 | 1 | 3 |
| visible switches (visible = { x == '…' }) | 0 | 16 | 2 |
| branches on width or phone | 0 | 10 | 21 |
| flexes | 0 | 3 | 20 |
| browser scripts (host = browser) | 0 | 1 | 0 |
| page lookups (document.querySelector…) | 3 | 1 | 0 |

## The look

It looks much better than either Declare build: Playfair Display and DM Sans from Google Fonts, an italic accent word,
a quiet ruled table of performances, and a poster drawn entirely in CSS (curtain gradient, stacked arches, floor
planks, weave). Of its code, 1,516 lines are CSS.

**The port.** The header and hero were ported to Declare by hand afterwards (`declare-port/hero.declare`, 70 lines):
`Font`/`FontFace` for the web fonts, an `HTMLText` with a `style` for the italic accent, `gradient` fills for the
curtain, rotated views with offset faces for the stacked shadows, and two short `draw()`s for the planks and the
weave. The result matches the React hero; the one difference is the arch tops (CSS elliptical, Declare's
`cornerRadius` circular). So the gap between the builds is what the agent knows to reach for, not what Declare can
draw. The port also found a runtime bug, fixed the same day: a rich text whose `fontSize` settled after its first
layout kept the first size.

## Its account, word for word

*Pending: the questions in `impressions.txt` are to be pasted into its finished session.*

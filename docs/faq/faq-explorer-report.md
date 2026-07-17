# Explorer-agent report — browsing declarelang site as a curious developer, then reading the FAQ draft

(Verbatim report from the exploration agent. It browsed the live site — homepage, "Why a new language, now?" essay, calendar demo incl. `?render=canvas`, a live edit (dodgerblue→crimson, ~1s recompile with the app running), the docs app — forming 38 numbered questions BEFORE reading the FAQ, then compared.)

## Verdict (its own words)

"The site is a genuinely persuasive demo-forward pitch — the live-editable samples, the calendar's continuity, and `?render=canvas` all deliver on claims that would otherwise read as vapor, and the FAQ matches it with an unusually honest voice. Together they answer roughly two-thirds of the questions I actually formed, and nearly all of the conceptual ones; what they systematically miss are the *adoption-mechanics* questions a working developer asks next: routing/deep links, using Declare inside my own repo, editor tooling, sharing an edited program, accessibility stated plainly, and where the community lives. The single most improving change: add a 'Using it for real' cluster to the FAQ — because the current document wins the argument and then leaves the convinced reader with no door to walk through. Secondarily, reconcile the four different kilobyte figures into one explained number; in a pitch built on precision, the drift is the kind of detail a skeptic pockets."

## Gaps it found in the FAQ (all addressed in rev 2 except where marked)

1. Routing / deep-linking app state — "where's the router?"; noticed docs deep-links (#guide/27-data) while calendar view-switches never touch the URL.
2. What a shared program URL does for a first-time visitor — cold navigation to calendar.declare in a fresh profile DOWNLOADS the file (application/octet-stream); only runs after the SW installs. [PRODUCT FINDING too]
3. Using Declare in MY repo — npm package? upgrades? apps living inside the language checkout?
4. Accessibility, asked directly — canvas renderer exposes zero text (innerText length 0 in ?render=canvas); canvas code panes invisible to find-in-page/screen readers.
5. Editor tooling — VS Code / LSP / highlighting: day-one question, absent.
6. Sharing edits — "can I send this to someone?" No permalink story.
7. What "0 lines by hand" actually involved — the workflow, not just the number.
8. Large-data performance — 10k-row replication, virtualization?
9. Testing my app — verify gets a sentence; no developer-facing testing entry.
10. (Left to docs, fine): state-conflict semantics, lazy materialization, literate-comment convention.

## Wording it flagged (fixed in rev 2)

- "packaged agent skill" — jargon, no anchor → now named + linked (skill/).
- "zero false positives on the whole corpus" — which corpus? → named.
- "come talk to us" — no door → GitHub issues link.
- "120 fps paths" — spec-sheet claim → concrete beat added.
- Origin entry avoided naming the person the footer names → now names David Temkin.
- "Live numbers are on the homepage" — homepage doesn't say they're live-measured. [SITE SUGGESTION]
- Styling entry: "stylesheets as named override bundles" vocabulary collision → reworded.
- FAQ said ?view=source; the site's affordance is "View and edit source" → ?view=edit with tabs → fixed.

## Site-vs-FAQ mismatches / product-level findings (for David, not FAQ fixes)

- COLD SHARED LINK: fresh-profile navigation to apps/calendar/calendar.declare downloads the source file instead of running the app (static host serves octet-stream; only the SW upgrades program URLs). The site's sharing story has a hole for first-time recipients.
- FOUR KB NUMBERS in one afternoon: 51 KB / 52 KB (homepage, live), "about 50 KB" (FAQ v1), "~45 KB" (docs Ship-it chapter). FAQ now explains (live-measured vs production build), but consider reconciling on-site.
- Homepage nav pills at scroll-0 are present but no-op (sticky header materializes on scroll) — cost the agent 20 minutes; possibly headless-only, worth a look.
- The React twin (site-react) is mentioned nowhere on the site — FAQ softened to "in the repository."
- ?render=canvas "checks out spectacularly" — pixel-identical calendar — but confirms the a11y silence.
- The two arXiv links in the essay resolve to real papers (it clicked one).

## Its strongest positives

- Live edit: "genuinely instant and the app keeps running."
- The intermix-React answer: "exactly the answer I wanted."
- The eval-methodology entry: "the most credibility-building answer in the document."
- The maturity + styling entries: "refreshingly honest" / "best-written entry in the doc."

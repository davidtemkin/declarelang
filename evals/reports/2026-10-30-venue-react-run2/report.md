# React Venue run 2: Opus 5.5, recorded

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh --stack React venue-checkout ~/Code/eval-venue-react-2 claude-opus-5-5 585c768d 8351`.
Murmur run 12 was building on the same machine at the time.
The prompt: "Build the app described in `task/brief.md` as a React application. The data service is described in
`task/api/API.md` and is already running on port 8351; do not modify it." The run was recorded with
`evals/craft/record.sh` (66 snapshots). The side-by-side page with Declare Venue 17 is the Artifact
https://claude.ai/artifact/EjUbFsLNTsBq3pXhzRLFJ1.

**Files beside this report:**
- the app's source (`src/` and its config);
- the agent's own Playwright scripts (`agent-qa/`);
- the hidden acceptance results, as delivered and at first boot (`drive/`).

## Figures

| | React Venue 1 | **React Venue 2** |
|---|---|---|
| time | 31.4 min | **30.9 min** |
| turns | 101 | **108** |
| model · tool time | | **20.3 · 10.6 min** |
| thinking | | **9.7 min** |
| output tokens · cached input re-read | | **135.5k · 9.8M** |
| hidden acceptance at first boot | | **6 of 11** |
| hidden acceptance as delivered | 11 of 11 | **11 of 11** |
| code, excluding blank and comment lines | | **2,666** |

## Process

1. **Setup (0–3.9 min).** It probed the service with `curl`, the event stream included, and scaffolded Vite, React
   Router, TanStack Query and react-hook-form. It read no documentation.
2. **Writing (3.9–15.7 min).** The whole app, with no build in between.
3. **First build (15.7 min).** Six type errors: two unused names and four mismatched props on one field component.
   All were fixed in one round.
4. **First boot (16.1 min).** Its own Playwright screenshot script.
5. **Checking (16–30.9 min).** About 20 runs of three Playwright scripts of its own (181 lines), 8.2 min in total.
   Nine builds took 1.9 min, plus ESLint. It looked at 10 screenshots.

**At first boot** it passed 6 of 11 flows. One bug failed the other five: the route guarding the confirmation sent the
person away once paying emptied the chosen seats. Its Playwright scripts found the bug, and it was fixed at 22.9 min.

## The hidden drive

`wrong_password` first failed with "Node is detached from document", intermittently. React replaces the header's
"Sign in" button when the account request returns, and the drive pressed the element it had found before the
replacement. The drive now finds a replaced control again before pressing it, as a person's eye would. With that
change all 11 flows pass.

## What the agent said

Its account answers the comparison set (`impressions.txt`, from `account-stack.txt`).
- **Hardest, its most expensive bug:** the redirect after payment that failed five flows at first boot. The cause: the service sends a sold event for the buyer's own seats over the live feed before the payment request answers, so the app removed them from the choice as taken by someone else, and checkout redirected on an empty choice. It found this by instrumenting `history.pushState`.
- **`tsc` caught a seat with no accessible name** before anything ran: the seat label was written but never passed as `aria-label`.
- **Confidence:** high for most of the brief; low to moderate for autofill, the phone keyboard and the screen reader, which it built to the standard rules but never observed.

## The agent's account, verbatim

# How the Venue build went

## (a) Choices

**Stack.** I used Vite, React 19 and TypeScript, with these libraries:
- **TanStack Query** for the production, seat map and account. The live feed writes into the cached seat map with `setQueryData`, so every component reads the same up-to-date map.
- **React Router**, so the back button and URLs work: `/`, `/performances/:id`, `/performances/:id/checkout`, `/tickets`. The hall and checkout share a parent route, `PerformanceRoute.tsx`, which owns the seat map, the live feed, and the logic that removes seats someone else has bought from the person's choice.
- **React Hook Form** for checkout. Its `mode: "onTouched"` fits "not marked wrong while first typing". `setError` and `shouldFocus` cover the service's field errors.
- **card-validator** for brand detection, the Luhn check, the gaps that group a number and the security-code length. I chose it over writing my own regexes.
- **qrcode.react** for the scannable codes on the tickets.
- **@fontsource-variable** for Fraunces and Inter, bundled with the app rather than loaded from a CDN.

**State.** The chosen seats, the notices and the finished order live in a small `useReducer` context (`selection.tsx`), not a store library. Seat geometry is hand-written in `hall/layout.ts`: rows are arcs around a stage point and each seat is turned to face it. Seats are absolutely positioned HTML buttons, not SVG, so they are real buttons for keyboards and screen readers.

**What I looked up.** No web searches. I:
- read the brief and API;
- curled `/api/production` and `/api/performances/p01/seats`, and summarised row lengths per section;
- watched the event stream for 15 seconds to see how often seats sell;
- checked the CORS preflight headers;
- grepped `node_modules`, because npm installed versions I don't know well (React Router 8.5, TypeScript 7, Vite 8). I checked that `createBrowserRouter` still exists and what types card-validator exports.

Doing the arithmetic on the brief showed it doesn't add up. "Pay $261.00" is only possible with three Orchestra seats ($87 × 3, price plus fee). That contradicts "three seats across two sections". "3 seats · $240.00" only works if the running summary counts prices without fees. I built it that way: the hall summary shows prices, checkout adds fees. That is my interpretation.

## (b) The first time it ran

The first screenshots, desk and phone, showed three problems. I found each by looking at the image.
1. **The Orchestra floor fanned out far too wide.** The section's angle came from its front row, which has the smallest radius and so the widest angle. I rewrote the floor shape to follow each row's ends.
2. **The desk hall was taller than the window.** I added a height-based limit on seat size. On a 900px-tall screen it still scrolls a little.
3. **The phone view opened mostly on the stage.** I changed the starting scroll to the front row. My first edit used the row's *end* seat. I caught that before re-running: end seats sit higher on the arc than the centre seat.

Before anything ran, `tsc` caught a serious bug. In `SeatMap.tsx` the type checker flagged `'label' is declared but its value is never read`. I had written the seat label but never passed it as `aria-label`, so **every seat button had no accessible name**. Without the unused-variable rule, a large part of the brief would have failed.

## (c) Every error and surprise

**Tooling**
- zsh treated the `?` in an unquoted curl URL as a wildcard ("no matches found"). Fixed by quoting it.
- macOS has no `timeout` command. I used `curl --max-time` instead.
- Something else was listening on port 5173 (on all addresses). I moved Vite to 5178 to avoid confusing the two.

**My code, caught by reading it back before running**
- `layout.ts` had a meaningless line, `radius = back + SECTION_GAP + ROW_DEPTH - 1.2 + 1.2`. I replaced it with `back + SECTION_GAP` and adjusted the gaps.
- `SignInDialog` and `SignInProvider` imported each other. I moved `focusAfterSignIn` into its own file.
- I declared `NewCardFields` as a component *inside* `CheckoutPage`. That would have remounted its inputs on every render and thrown away focus while typing. I turned it into a plain function call.
- `checkPostalCode` built its message with chained `.replace()` calls. I rewrote it with a name per country.
- I had made the postal label change by country ("ZIP code" or "Postcode"). That would break a test looking for the label "Postal code", so I removed it.
- I left `eslint-disable` comments although there is no ESLint in the project. I removed them.

**Type errors from `tsc -b`**
- `setFocus` was unused.
- `maxLength` was rejected on my text fields. I had excluded every key of React Hook Form's `UseFormRegisterReturn` from the input props, and that type includes `maxLength`, `min` and so on. My misunderstanding of the library's types. I narrowed the exclusion to `name | onChange | onBlur | ref`.
- The seat `label` was unused: the missing accessible name described in (b).

**Runtime results that weren't what I wrote it to do**
1. **After a decline, the cleared security code showed "Enter your card's security code." at once.**
   - I had written `setValue(field, "")`. Adding `clearErrors` didn't help. `resetField(field, { defaultValue: "" })` did.
   - Cause: **unsure.** I believe React Hook Form re-validates or restores errors once `handleSubmit` finishes, interacting with my "only complain about empty fields after a submit" flag. I didn't confirm it in the library's source.
2. **A successful payment ended up back in the hall instead of on the tickets.** This was the most expensive bug.
   - My first guess was that checkout's `<Navigate>` (when no seats are chosen) ran after `completeOrder` emptied the choice. I added guards on a `paid` ref and on `order`. Nothing changed.
   - I then wrapped `history.pushState` and `replaceState` to log stack traces, and put a `console.warn` at the redirect. That showed the redirect rendered *before* the push to `/tickets`, with `paid` false and `order` null.
   - The real cause: the service sends a sold event for the buyer's **own** seats over the live feed before the payment request answers. My code removed them from the choice as "taken by someone else", the choice became empty, and checkout redirected.
   - Fix: a `paying` flag in the selection state, which pauses that removal while a payment is in flight.
   - Cause: my design together with how the service behaves. The API does say `seatchanged` means a seat is "no longer available to anyone", which includes the buyer, so I should have expected it. The earlier guards are still in place. They are partly redundant now.
3. **On the phone checkout, the pay bar didn't span the screen.** The flex column inherited `align-items: start` from the desk grid rule. My CSS.
4. **The seat list and the billing fieldset were indented.** I had no CSS reset for `ul`/`ol` padding or `fieldset` padding. My CSS.
5. **A favicon 404 and a 401 from `/api/me` showed in the console.** I added a favicon. The 401 is how the service says "signed out", so it stays.

**Surprises from my own test scripts, not the app**
- A real seat sale (409) happened mid-run on Friday's busy performance.
- Playwright refuses to click a button with `aria-disabled="true"`, so my second click on Pay timed out. I switched to `dblclick()`.
- I pressed Tab twice expecting to land in the seat map. One Tab gets there; the second left the page.
- My earlier runs bought out row C (and the right of row E), so later runs couldn't find free seats there.
- When I simulated a rival buyer, the live feed caught their purchase before payment (correct behaviour). To force the 409 I had to block the feed in Playwright with `page.route`.

## (d) Verifying it

**Checks I ran and what they caught**
- `tsc -b`: the three type errors above, including the missing seat names.
- `npm run build`: passes.
- Two Playwright scripts against the system's Chrome (`playwright-core`):
  - `flow.mjs` (phone, touch): seat choice, wrong password, signing in mid-checkout, the expired card, the decline, number grouping, month 13, a bad UK postcode on blur, the service's postcode error and focus, and payment. It caught bugs 1 and 2.
  - `desk.mjs` (keyboard only, no account): arrow-key navigation, submitting an empty form, Amex grouping, and the forced 409. It confirmed the service's sentence, the return to the hall with the remaining seat, and focus on the heading.
- Screenshots: they caught the floor shape, the stage-heavy phone view, the pay bar, and the list and fieldset indents.

**Left unchecked**
- Any real screen reader. I also never checked whether React warns about the non-standard `aria-description` attribute.
- Browser autofill, password-manager save and fill, and the iOS keyboard. `useKeepFocusedFieldInView` was never exercised.
- Dragging the minimap, swiping between tickets, and reduced-motion styles.
- Whether typed details really survive the 409 round trip. I never reopened checkout after it.
- Sign-out, the service's signed-out error at payment, network failure, and the feed's reconnect-and-refetch path.
- Card `…0127` (security code error), insufficient funds, and Canadian postcodes.
- Tablet widths (620–959px), and the 595–619px gap where my CSS breakpoint and the hall's own switch to panning disagree.
- Tickets at desk size, the performance list on a phone (I took that screenshot but never looked at it), and the sold-out row.
- I didn't re-screenshot after the last fieldset fix.
- In the final phone screenshot the postal field still had a red border after I'd corrected it. I didn't investigate why.

## (e) What was hard

1. **The live feed against the person's own choice.** A pattern, not a one-off: three paths (the feed, a refetch, a 409) all need to agree, and the service echoing the buyer's own purchase broke the design. It cost the longest debugging session of the build. To get it right first time I needed to treat "sold" events as possibly my own, or test what the service sends during a payment before designing.
2. **The hall's geometry and the phone problem.** A single, front-loaded design problem. Two rounds of screenshot fixes. I'd have needed to draw the room on paper first and work out the arc bounds per row, not per section.
3. **Form behaviour around React Hook Form.** A pattern: the rule that empty fields only complain after a submit, server errors, clearing the code, and keeping inputs alive between renders each fought the library a little. I'd have needed to read how `handleSubmit` and `resetField` behave internally first.
4. **Guessing what an automated tester will look for by role and name.** A pattern, and one I'm unsure I got right:
   - I avoided a second button containing "Sign in" by calling the checkout one "Use your account".
   - I hid the page from assistive technology while the dialog is open.
   - I gave labels like "Expiry date" and "Street address" that contain the likely shorter words.

   All of that is reasoning, not knowledge of the test.

## (f) Confidence

- **Performance list:** high.
- **Hall:**
  - Seat names, the three states and the summary text: high.
  - "Reads as a room": fairly high.
  - The phone thumb target (38px seats in the pan view): moderate. Real thumbs are untested.
- **Live updates and the "taken" notice:** moderate-high after the fix. The notice text is my own wording. For a 409 it is the service's sentence.
- **Sign-in:** high for the flow and errors. Unverified for password managers.
- **Checkout validation and service errors:** high for the paths I drove. Moderate for the paths I didn't.
- **No double payment:** high. One caveat: `aria-disabled` makes Playwright time out on a second `click()`, so a test that clicks Pay twice may hang instead of passing.
- **Tickets:** fairly high.
- **Autofill, phone keyboard, screen-reader experience:** low to moderate. Built to the standard rules, never observed.

**Where I'd expect a tester to find problems:**
- The 9 announcements that fire at once when an empty form is submitted.
- An always-present but empty alert paragraph in the sign-in dialog.
- The password "Show" button, whose visible text never changes to "Hide".
- The fee-free reading of the running summary.
- Tablet widths.
- Whether checkout fields come back after a 409.

# Venue SwiftUI run 1: a native macOS app, Opus 5.5, recorded

**Run:** 2026-10-31, launched with
`evals/craft/launch.sh --stack "native macOS SwiftUI" venue-checkout ~/Code/eval-venue-swiftui-1 claude-opus-5-5 0727e630 8352`,
alongside Venue run 18. The prompt:

> Build the app described in `task/brief.md` as a native macOS SwiftUI application. The data service is described
> in `task/api/API.md` and is already running on port 8352; do not modify it.

The brief is the web brief, unchanged: phones, browser autofill, "check your work in the browser". Swift 6.4.2,
Xcode 27.2.

**Files beside this report:**
- the app (`Package.swift`, `Sources/`, `Tests/`, `scripts/build-app.sh`, `Support/Info.plist`);
- the accessibility and screenshot helpers the agent wrote for itself (`agent-tools/`);
- the questions it was asked (`impressions.txt`, from `account-stack.txt`).

Its account is at the end, word for word.

## Figures

| | Venue 18 (Declare) | **SwiftUI 1** | React 2 |
|---|---|---|---|
| time | 33.8 min | **24.2 min** | 30.9 min |
| turns · output tokens | 113 · 131.6k | **141 · 122.2k** | 108 · 135.5k |
| cached input re-read | 21.9M | **15.2M** | 9.8M |
| first file written | 7.1 min | **1.5 min** | 3.9 min |
| code, excluding blanks and comments | 1,298 (Declare) | **3,031 (Swift)** | 2,666 (TS/CSS) |
| first build | — | **clean** | 6 type errors |
| its own tests | 4 assert scripts | **16 unit tests; end-to-end runs through the macOS accessibility API** | 3 Playwright scripts |
| hidden acceptance | 11 of 11 | **not runnable** (the drive is browser-only) | 11 of 11 |

## How it worked

- **Structure:** a Swift package, plus a script that wraps the build into `build/Venue.app` with an `Info.plist`. It
  read no documentation.
- **Writing:** it wrote the app in about 10 minutes. The first `swift build` was clean.
- **Checking:** it wrote its own small tools: `ax` to press, set and read elements by accessible name, `click` to post
  real mouse clicks, `winid` and `shot.sh` for window-only screenshots. With them it drove the running app against
  the live service:
  - seats;
  - live releases (it bought a seat with `curl` to test them);
  - sign-in and a wrong password;
  - a decline;
  - a 422 postcode;
  - a raced 409;
  - the keyboard;
  - a narrow window.
- **The accessibility tree found its worst first-run problem:** every text field had an empty accessible name. "Screenshots would never have shown this." It names this as its most repeated cost: SwiftUI on macOS does not map visible titles to accessible names as predictably as it assumed.
- **It hit the same live-feed bug as React Venue 2:** the service announces the buyer's own seats as sold before
  the payment returns.

## Two incidents on this machine

- **Its first screenshot was the whole screen** (`screencapture -x`), and it took in the user's other windows. It
  noticed, said so in its account, and switched to window-only captures. That file has been deleted.
- **Its first test of sign-in typed through System Events keystrokes,** which go to whatever app is in front. The
  user's terminal was, and received "ada@example.com" and "wrong" as a message. The agent noticed ("keystrokes may
  have reached another app") and moved to the accessibility API.

A native-app run drives the real desktop. Before another, give it a machine or a session of its own.

## Scoring

The hidden drive runs in a browser and cannot drive a Mac app. A look by hand confirmed:
- the release build builds and opens;
- the performance list (dates, seats left, fullness bars, the nearly-sold-out flag) in a proper split view with
  a sidebar.

The hall was not reached by hand: a list row does not answer an accessibility press, and clicking it would have
meant moving the user's mouse. The rest of the judgement rests on the agent's own end-to-end runs and its account,
which is candid about what went unchecked:
- VoiceOver announcements;
- focus after the sign-in sheet;
- several service outcomes (insufficient funds, Amex, signed out);
- autofill;
- the release build.

Scoring a native app properly needs the planned "tier 2" driver: macOS accessibility automation that presses and
reads by role and name without taking the desktop.

## The agent's account, verbatim

Asked with `account-stack.txt`, Platform = native macOS SwiftUI (`impressions.txt`).

# How the Venue build went

## (a) Choices

**Packaging.** I used a Swift package (`Package.swift`, swift-tools-version 6.0, macOS 14), not an Xcode project. The machine had no `xcodegen` or `tuist`, and writing a `.pbxproj` by hand is error-prone. The cost was that I needed my own bundling step: `scripts/build-app.sh` builds the binary, copies `Support/Info.plist` into `build/Venue.app` and ad-hoc signs it. I wanted a real bundle for three reasons: a bundle identifier for the Keychain, `NSAllowsLocalNetworking` for plain HTTP, and normal window activation. A maintainer expecting an `.xcodeproj` might find this unusual. Xcode can open `Package.swift`, but they'd lose the Info.plist unless they use the script.

**Libraries.** I used only Apple frameworks: SwiftUI, Observation (`@Observable`), Foundation `URLSession`, Security (Keychain) and CoreImage (`CIFilter.qrCodeGenerator` for the ticket codes). Tests use swift-testing. I added no third-party packages. I considered the ecosystem's options for the event stream and card validation and judged them too small to justify a dependency. Someone could fairly argue the hand-written server-sent-events parser in `Services/SeatEvents.swift` should have been a library.

**Structure:**
- `Model/` holds pure, tested types and rules: `Card.swift`, `Money.swift`, `HallLayout.swift`, and the JSON types.
- `Services/` holds `VenueAPI`, `SeatEvents` and `SessionCookieVault`.
- `State/` holds the `@MainActor @Observable` models: `AppModel`, `AccountModel`, `BookingModel`, `CheckoutModel`.
- `Views/` is split by screen.

The main structural decision was to keep all typed checkout state in `CheckoutModel`, owned by `AppModel` rather than by the checkout view. That way signing in, going back to the hall, or a failed payment can't lose input, which the brief singles out.

**Navigation.** I used `NavigationSplitView`, with performances in the sidebar and a `NavigationStack` (hall → checkout → tickets) in the detail. At a desk that is idiomatic macOS. It made the narrow-window case harder, as described later.

**What I looked up.** Very little:
- I probed the live service with `curl`: the production list, a seat map, the `/api/events` stream for 12 seconds, a sign-in to see the `Set-Cookie` header, and an empty order to see the 400 sentence. That showed me `vn_session` has no expiry, so it is a browser-session cookie. That one fact is why `SessionCookieVault` exists.
- I grepped the macOS 27.2 SDK's `NSTextContent.h` to confirm which `textContentType` values exist on macOS 14 (credit card, address, postal code and so on).

I did no web searches. Everything else came from memory of SwiftUI's APIs, which is a risk in itself. Several runtime surprises (below) came from SwiftUI behaving differently from what I remembered.

## (b) The first time it ran

The first `swift build` succeeded with no errors, which surprised me. I then launched the bundle and took a screenshot. That first screenshot used `screencapture -x` on the whole screen, so it captured your other windows, including a document and a chat. I should not have done that. After that I captured only the app's window, using a small helper (`/tmp/venue-tools/winid`) that finds it by process ID.

The performance list looked right on that first screen. The first hall screenshot showed one visible defect: the section names ("ORCHESTRA $80") overlapped the front rows. I found it by eye. My layout left 0.9 seat-units in front of each section's first row and placed the label at `innerRadius + 0.75`, which was too close. I changed these to 1.5 and 1.0.

The serious first-run problem only appeared once I drove the checkout through the accessibility tree: every text field had an empty accessible name (`AXTextField «»`). Screenshots would never have shown this. I found it because I had built a small accessibility driver (`/tmp/venue-tools/ax`) to work the way the brief's automated test would. My first attempt to fill in fields printed `NOT FOUND Email`, and dumping the tree showed the fields were unnamed.

## (c) Every error and surprise

**Build and type errors**

There were none in the app code, from the first build to the last. I'm unsure why Swift 6 strict concurrency raised nothing, given `Task` closures that capture `self` in `BookingModel`. Making everything `@MainActor` probably covered it. Some of my own shell commands did fail:
1. `swift build 2>&1 | grep -E "error|warning: (?!...)"` failed with "repetition-operator operand invalid": macOS `grep -E` doesn't support lookahead. **Cause: my command.** The build itself was fine, and a plain rebuild showed only one warning (item 2).
2. A package warning: "Source files for target VenueTests should be located under 'Tests/VenueTests'". I had declared the test target before writing any tests, so the directory was empty. It went away once the tests existed. **Cause: my ordering.**
3. I wrote one file to the path `Venue/Services/../Sources/Venue/Services/SeatEvents.swift`, a slip in the path. It resolved to the right place, which I confirmed with `find`. **Cause: my typo; no harm done.**

**Runtime and behaviour surprises, in the order they happened**

4. **Section labels overlapping rows.** I wrote the layout constants in `HallLayout.swift`; the labels landed on row A; I changed the spacing as described in (b). **Cause: my code.**

5. **Text fields had no accessible name.** I wrote `TextField("Email", text:, prompt: Text("you@example.com"))` and assumed the title becomes the accessible label. On macOS, once a `prompt` is given, the title wasn't exposed at all. I added `.accessibilityLabel(label)` to the field inside `LabeledField` (`Views/Common/FormParts.swift`). **Cause: a SwiftUI behaviour I didn't know about; my assumption.** If I hadn't driven the app by accessibility, this would have failed the brief's §8 test outright.

6. **The country picker was named "Country, Country".** My new label from item 5 was added on top of the picker's own title. I changed it to `Picker(selection:) { … } label: { EmptyView() }`. **Cause: my code.**

7. **Keystrokes went to the wrong window.** I typed into the sign-in sheet with `osascript … keystroke` and saw "wrong" land in the Email field, with the password empty. On the retry the screenshot showed Venue's window was inactive (grey traffic lights). That means some of those keystrokes (a select-all, an email address, a tab, "wrong", Return) may have gone to whatever app was in front. **I don't know where they landed.** You may want to check that nothing of yours received stray text. After that I only drove the app through the accessibility API, which targets the Venue process. Later keystroke tests were guarded with `if frontmost`. **Cause: my tooling choice.**

8. **After a successful payment the app went back to the hall instead of showing the tickets.** I had written `AppModel.pay()` to clear the selection, then set `path = [.tickets]`, and `CheckoutScreen` returned to the hall whenever the selection became empty. Two things combined:
   - The `.onChange(of: booking.selection.isEmpty)` handler popped the navigation after I cleared the selection.
   - The live stream announced the person's own purchase as `seatchanged`. `API.md` describes that stream as "other people buying", so without a guard it could release the seats as "taken by someone else" while the payment was still in flight.

   Evidence for the second point: after the purchase, the dashed "just taken" ring appeared on the seats I had just bought. I'm fairly sure the service broadcasts the buyer's own seats, but I didn't capture the event directly to prove it, and **I'm unsure which of the two mechanisms fired first** in that run. My fixes:
   - `BookingModel.isHoldingSelection`, set around the payment.
   - Navigate before clearing the selection.
   - Pop only when `app.path.last == .checkout`.
   - Reload the map after a failed payment, to drop anything genuinely sold meanwhile.

   **Cause: my code, plus a service behaviour the brief's wording didn't prepare me for.**

9. **The window's content overflowed when the lost-seat notice appeared.** The window was 820pt tall, but the content was laid out taller and pushed off both the top and the bottom. I found it by eye. I took a second screenshot to rule out a mid-animation frame, then reproduced it step by step: choosing a seat was fine; triggering the notice broke it. I removed `.fixedSize(horizontal: false, vertical: true)` from the notice's `Text` and capped it at three lines, and the problem went away. **I did not establish the mechanism.** I believe that fixed-size text inside a `safeAreaInset` reported an unbounded height, but that is a guess. In the message describing the fix I also said I'd give the hall plan a layout priority. **I never added that.** The only change made was to the notice. **Cause: my code; exactly how, unsure.**

10. **Several problems in a narrow window**, all found from one 420pt screenshot:
    - The sidebar didn't collapse: `RootView` only reacted to a change of performance, not to the window width.
    - The legend lost its words: the `HStack` compressed the labels to nothing. I added `.fixedSize()`.
    - The plan floated mid-screen, because of the default centre alignment of the `minHeight` frame. I changed it to `.top`.
    - Seats were about 10pt, too small for a thumb.

    **Cause: my code.** For the seats I added tap-to-zoom. In a narrow window, a tap on the overview zooms in until seats are about 30pt and scrolls to the tap point, and a "Whole hall" button zooms back out.

11. **Zoom doesn't fully centre on the tapped spot.** I scroll after a 30ms sleep with `proxy.scrollTo(nearest.id, anchor: .center)`. The result was horizontally centred, but scrolled toward the top. I didn't fix this. **Cause: my code or `ScrollViewReader` timing; unsure.**

12. **The keyboard cursor ring showed after a mouse click.** `hallFocused` becomes true on a click, so the cursor ring was drawn. I added `usingKeyboard`, set by the arrow keys and cleared by clicks. **Cause: my code.**

13. **Empty fields were flagged just for passing through.** "Enter the card number." appeared because choosing "A new card" put focus in the empty number field, and moving on counted as leaving it. I changed `left(_:)` to mark a field visited only if it isn't empty. **Cause: my design.** This is a judgement call against the brief's literal "once they have left it". I think it's what the brief means, but a strict tester might disagree.

14. **The performance list went stale.** The list said 289 seats left while the hall said 286. I now reload the production list whenever a performance is picked. **Cause: my code.**

15. **Driving-script mistakes:**
    - zsh doesn't word-split `IFS='|'` the way I wanted, so every seat name came back `NOT FOUND`.
    - `osascript` asked for `window 1` before the relaunched app had a window, giving "Invalid index (-1719)" at least three times.
    - My `ax dump` filter matched on names, not values, so it missed the summary text.

    **Cause: my tooling.**

16. **Not resolved:**
    - The Pay button's accessibility value printed `0` mid-payment, not "Payment under way". **Unsure why.**
    - The account menu's accessible name is "account", not "Account, Ada Lovelace". My `.accessibilityLabel` on the `Menu` isn't taking effect.
    - The sidebar's selection highlight and the focus rings appear in the system accent colour (orange on this Mac), not my ink blue. `.tint` doesn't reach them, which weakens "one accent colour". **Cause: SwiftUI/AppKit; I didn't try to override it.**

## (d) Verifying it

**Unit tests.** 16 swift-testing tests in `Tests/VenueTests/RulesTests.swift` cover:
- money formatting and the exact summary string
- date and time formats
- card brand detection, grouping, the Luhn check, security-code length, expiry, and postcodes for all three countries
- the event-stream parser
- the hall's geometry (seat 1 on the plan's right, rows front to back, arrow-key neighbours)
- the accessible-name format

They all passed on the first run, so they caught nothing during this build. They guard against regressions; they didn't find bugs.

**End-to-end runs.** I drove the running app against the live service through the accessibility API (role and name, as §8 describes) and took window screenshots:
- **Choosing seats:** confirmed the seat names, the values ("Available, $80.00", "Sold") and that sold seats are disabled.
- **Live updates:** I bought my chosen seat from `curl`; the app released it with a notice. This caught the overflow in item 9.
- **Sign-in:** wrong password showed the service's sentence; the correct one kept typed input and filled the name. The expired card is disabled.
- **Decline:** security code `000` gave the decline message, the code was cleared and focused, and a double press was ignored. **I'm inferring** that no second order was sent: I saw one result and no error. I did not check the service's side.
- **Postcode:** a 422 on `postalCode` showed the message on the field with focus moved there; after fixing it, the order succeeded. This run caught item 8.
- **409:** I raced a `curl` order for the same seat against the Pay press. The service's sentence was shown, the other seat was kept, and I was back in the hall.
- **Keyboard:** arrow keys and Space chose a seat.
- **Narrow window:** caught item 10.
- **Session:** relaunched still signed in; sign-out gave a 401 from `/api/me` and an empty Keychain.

**Left unchecked:**
- Real VoiceOver: whether the announcements are spoken, the reading order, the per-section grouping.
- Whether focus lands sensibly after the sign-in sheet closes and after the 409 return to the hall.
- Dark mode.
- Password and card autofill. I saw the "Passwords…" offer appear but never tested saving a password or filling a card or address.
- The release build: every bundle I ran was `CONFIGURATION=debug`, although the script defaults to release.
- These service outcomes: insufficient funds (`…9995`), the `cvc` 422 for a new card (`…0127`), an Amex card with a four-digit code, the 401 `signed_out` path, and the 400.
- These typed errors in the running app: an expired date and month 13 (covered only by unit tests).
- The pinch gesture and the ⌘= / ⌘− zoom shortcuts.
- A double Return in a field (only double button presses).
- Rapid typing in the middle of the card number. Reformatting probably moves the cursor to the end, and I didn't test that.

**One claim in my summary went beyond what I checked.** I said the app "builds without warnings". I last checked for warnings early on. Later builds were filtered only for `error|Built`, so that statement holds for the early build, not for the final one.

## (e) What was hard

1. **Accessibility names (a pattern).** Items 5, 6 and 16 share a cause: SwiftUI on macOS doesn't map visible titles to accessible names as predictably as I assumed. This cost about a dozen tool calls, and it would have been invisible without the accessibility driver. To get it right first time, I'd have needed to know that `prompt:` hides the title from accessibility, or to have built the driver before writing the forms.

2. **Live seats while paying (one obstacle, but deep).** Item 8 took one long fix. I'd been treating the stream as purely "other people's" purchases, and only one end-to-end run exposed it. To get it right first time: either API.md saying that the buyer's own purchase is broadcast, or watching the stream during a purchase of my own before designing `BookingModel`.

3. **Layout under dynamic content (a pattern).** Items 9 and 10: `safeAreaInset`, `GeometryReader`, `ViewThatFits` and `NavigationSplitView` interacting at different widths. This was the costliest area, around 15–20 tool calls, and item 9's root cause is still unproven. To get it right first time, I'd need a deeper working model of SwiftUI's sizing (how fixed-size views behave inside safe-area insets), or an early habit of screenshotting at two window widths.

4. **The phone requirements on a Mac (a pattern of interpretation, not code).** §7 talks about thumbs and on-screen keyboards, and §3 and §8 talk about browser password managers and reloading. Every one of these needed a judgement about what it means for a native Mac app: tap-to-zoom in narrow windows, `textContentType` for autofill, the Keychain for "reloading". These cost thought rather than tool calls, and I'm least sure they match what an assessor expects. To get them right first time, I'd have needed to ask how the brief's web-oriented checks map to a native app before starting.

5. **Driving the app without a test harness (tooling).** I built `ax`, `click`, `winid` and the screenshot script by hand, and lost calls to timing, zsh splitting, and the stray keystrokes in item 7. Perhaps 15 tool calls. To avoid it: XCUITest with a proper UI-test target, which the Swift-package choice made harder to set up.

## (f) Confidence

- **§1 Performances:** high. One weakness: the counts in the list only refresh when a performance is picked or after a purchase, not live.
- **§2 Choosing seats:**
  - Seat names, the three seat states, and the exact summary string: high.
  - Live releases and the 409 path: fairly high, since both ran end to end.
  - "Reads as a room": I think so from the screenshots, but that's a judgement.
  - Seat numbering: I put seat 1 on the plan's right, reading "as seen from the stage" literally. A tester expecting seat 1 at screen-left would call that a bug.
- **§3 Sign-in:**
  - The wrong-password sentence, keeping typed input, expired cards shown and unselectable, and staying signed in across relaunch: high.
  - Password-manager saving: low; built correctly as far as I know, but untested.
  - Saved billing address: filled only if street, city and postcode are all empty. So someone who typed only a postcode before signing in gets no saved address.
- **§4 Paying:**
  - Medium-high for what I exercised.
  - Untested outcomes where I'd expect problems: insufficient funds, the new-card `cvc` 422, Amex, signed-out, and rapid edits to the card number.
  - On the saved-card path, tickets go to the account email, which can't be edited. The brief doesn't forbid this, but a tester might want to change it.
- **§5 Tickets:** high on content and "Sent to …". Medium on scannability: I never scanned a QR code.
- **§6 Look:** medium. The orange system accent in the sidebar selection and focus rings breaks "one accent colour".
- **Keyboard and screen reader:** medium-low. The names are right, but the announcements and the movement of focus after actions are unverified, and the account menu's name is wrong.
- **§7 Narrow window:** medium. Zoom works but doesn't centre on the tap. In a narrow window with a mouse, the overview costs an extra click.
- **§8 Automated test:** fairly high that seats, fields and buttons are found by role and name, since I tested exactly that.

**Where I'd expect a tester to find problems:**
- VoiceOver announcements and focus after the sign-in sheet or the 409
- the untested service outcomes
- the orange accent
- seat-1 orientation
- the account menu's name
- the cursor jumping during card-number reformatting
- the unproven root cause of the layout overflow in item 9

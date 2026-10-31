# The Venue

A native macOS SwiftUI app for booking *The Marriage of Figaro* in the Grand Hall: pick a performance, choose seats in a live seating plan, pay, and get scannable tickets.

It talks only to the Venue service at `http://127.0.0.1:8352` (see `../task/api/API.md`). It doesn't have a server of its own.

## Running

```sh
scripts/build-app.sh          # builds build/Venue.app (release, ad-hoc signed)
open build/Venue.app
```

You can also run `swift run Venue`, or open `Package.swift` in Xcode. Run the tests with `swift test`.

Requires macOS 14+, Swift 6.

## Layout

```
Sources/Venue/
  App/          VenueApp — scene, window, app delegate
  Model/        Plain value types and pure rules (unit-tested)
    Production, SeatMap, Account, Order   — the service's JSON
    Card          brand detection, grouping, Luhn, expiry/CVC/postcode checks
    Money         cents → "$240.00"; the "3 seats · $240.00" summary
    HallLayout    where every seat sits on the plan; arrow-key neighbours
  Services/
    VenueAPI            URLSession client; no caching; the service's sentences surface as errors
    SeatEvents          server-sent event stream of other people's purchases, reconnecting
    SessionCookieVault  keeps the session cookie in the Keychain across launches
  State/        @Observable models owned by the app, so nothing is lost moving between screens
    AppModel      the visit: season, chosen performance, navigation, paying
    AccountModel  signed in or not
    BookingModel  one performance's live seat map and the person's choice
    CheckoutModel what's typed, when to judge it, one payment at a time
  Views/        Performances (sidebar), Hall, Checkout, Account (sign-in), Tickets, Common
Tests/VenueTests  swift-testing suites for the rules above
```

## Decisions worth knowing

- **Live seats.** While the hall or checkout is open, `BookingModel` listens to `/api/events`. A chosen seat that someone else buys leaves the choice, and a notice names it (this is also announced to VoiceOver). When the stream reconnects, the app re-fetches the whole map so it never shows a seat as free when it isn't. The service also announces *your own* purchase on this stream, so while a payment is in flight the choice is held. A real conflict comes back from the order itself as a 409.
- **One payment.** `CheckoutModel.pay` checks and sets `isPaying` synchronously on the main actor before its first suspension. A second click, Return, or ⌘Return while a payment is under way does nothing.
- **When fields are judged.** A field with something in it is checked when the person leaves it. Empty required fields are only flagged when they try to pay. The service's field errors (`cvc`, `postalCode`, …) attach to that field and move focus to it. After a decline, only the security code is cleared.
- **Session across launches.** The service's `vn_session` cookie is a browser-session cookie, which the cookie store drops when the app quits. `SessionCookieVault` keeps it in the Keychain so relaunching behaves like reloading a page. Signing out ends the session on the service and forgets it locally.
- **Narrow windows.** Below 720pt the sidebar and the hall take turns. In the hall, if seats would be smaller than 30pt, the plan first shows the whole room; a tap zooms in on that spot so a seat can be picked precisely. Checkout pins the total and the Pay button to the bottom and keeps the focused field in view.
- **Keyboard and VoiceOver.** The hall is one focus stop: the arrow keys move a seat cursor and Space or Return chooses. Each seat is still an accessibility button named like "Orchestra, row C, seat 14", with its state and price as its value. Every field's accessible name is its visible label. ⌘Return continues from the hall and pays at checkout.
- **Look.** New York (serif) and SF are the only two type families. There is one accent, ink blue, and it always means "yours": your seats, the card you're paying with, the button that commits. Free, yours and sold seats differ by shape (open ring, filled disc with a tick, small dot), not only by colour.
- **Seat numbering.** The API lists seats left to right *as seen from the stage*. The plan is drawn with the stage at the top, so seat 1 appears on the plan's right.

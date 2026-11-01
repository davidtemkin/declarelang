# The Venue

Data: typed DataSources for production, hall, account, session and orders; EventStream writes sold seats into the hall. A derived seat dataset wraps the source records with section, row and geometric coordinates. No persistence or service changes.

State: performance, selected seat IDs, current step, enlarged row, ticket index, and sign-in visibility belong on App. Checkout fields keep their own computed defaults from the account until edited.

Classes: performance choice, hall section / row / seat controls, booking summary, checkout Form, sign-in Form and ticket. Library Field, TextInput, Form, Sheet, layouts and focus handle input, validation and overlays. QRCode is the only external drawing library.

Layout: cream paper, ink typography (Georgia and system sans), vermilion selection. Large theatrical title and abstract proscenium on entry. The hall's seats form curved rows facing the stage, with tier spacing. Desktop selects directly; phone has a room overview and row buttons opening 48-point exact seat choices. Checkout uses a scrollable form with a fixed summary and payment action.

Motion: selected seats spring into a filled checked state; totals announce changes. No decorative animation. Sheet manages focus and reduced motion is respected for seat springs.

Verification: compiler/boot on desktop and phone; browser assertions for guest and saved-card purchases, refusal recovery, validation, live seat losses, semantics and ticket navigation. Inspect screenshots of all primary screens.

# The Venue

Data: typed production, hall and account DataSources; selected seats derived from the hall and app selection. Order DataSource sends once through Form. EventStream updates sold seats in the hall dataset.
State: current performance, step, selected IDs, phone section/row, sign-in visibility and checkout draft attributes on App. No service data persisted locally.
Classes: performance choice, hall section/row/seat, order summary, checkout, sign-in and ticket. SimpleLayout and WrappingLayout arrange ordinary content. Room geometry alone uses coordinates.
Transitions: seat selection springs its mark; persistent summary follows selection. Screens switch with focus moved to the new heading. Sheet handles authentication and restores focus. Phone shows room overview plus row drill-in with 44px exact-seat targets.
Platform check: Form/Field own validation, error timing, refusal mapping, focus and pending guard. DataSource owns requests and credentials; EventStream owns live connection. Native TextInput purposes provide keyboard/autofill. Controls own keyboard and focus.

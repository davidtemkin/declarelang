# For this program: the reference

What `npx declare-help` answers for the names your needs point at.

---

`declare-help Form`

```
Form — library class (library/form.declare) · extends View
  The place a set of fields is submitted from.
  members (own):
    source: class(DataSource)
    failedMessage: string
    members: object
    problems: object
    enterMoves: boolean
    valid: boolean
    error: string
    submitted: boolean
    pending: boolean
    next(from) — method
    validate() — method
    submit() — method
    send() — method
    showProblems() — method
    refusedWith(body) — method
    refuse(list) — method
    refusal(body) — method
  inherits the rest from View — ask for any member: declare-help Form.<name>
  guide: docs/guide/14-data.md (Data) · docs/guide/08-controls.md (Controls)
  full prose: declare-help Form --all
```

---

`declare-help Field`

```
Field — library class (library/field.declare) · extends View
  A labeled form row: the label, then whatever control the use site nests, and under the control **what is wrong with it** — its `error`, once it has been judged: Field [ label = "Name", TextInput [ width = 220, height = 30, required = "Enter your name." ] ] The label sits in a column beside the control (`labelWidth` is the shared-column knob), or above it with `stacked = true`.
  members (own):
    baseline: number
    label: string
    labelWidth: number
    stacked: boolean
    fieldLabel: string
    control: object
    message: string
  inherits the rest from View — ask for any member: declare-help Field.<name>
  theme tokens it reads: textMuted, error — every token: declare-help "theme tokens"
  guide: docs/guide/14-data.md (Data) · docs/guide/08-controls.md (Controls) · docs/guide/15-schemas.md (Typed data: schemas)
  full prose: declare-help Field --all
```

---

`declare-help TextInput.required`

```
TextInput.required — attribute · type object
  `true`, or **the message to say**, when the field may not be left empty (or only spaces):
  `required = "Enter your email address."`. With `true` the message is "Required"; say your own
  wherever a person will read it. A screen reader hears the field as required either way.
  source: runtime/src/schema.ts
```

---

`declare-help validate`

```
'validate' is not a Declare name — the Declare concept is TextInput.method.validate:
TextInput.method.validate — method
  validate(v): string | boolean
  Declare it on the field to judge its text: return `""` (or `true`) when it is fine, and
  otherwise the sentence that says what is wrong — it becomes `problem` (and so `error`, once
  judged), and `valid` is false. It runs when `required` is met.
  `validate(v: string) -> string { return /^[0-9]{5}$/.test(v) ? "" : "Enter a 5-digit ZIP code." }`.
  It is reactive: a rule that reads another value judges again when that value changes. A draft
  that fails it never reaches the dataset.
  source: compiler/src/scaffold.ts
```

---

`declare-help Form.source`

```
Form.source — attribute · type DataSource? · default null
  The `DataSource` the form sends — a write: `method = "POST"`, its `body` built from the
  program's values. `pending` follows the request the form sent; when the service refuses,
  its `errorBody` goes through `refusal` onto the members. Leave it null to send another way
  (`send()`).
  source: library/form.declare
```

---

`declare-help Form.method.refusedWith`

```
Form.method.refusedWith — method
  refusedWith(body)
  `refusedWith(body)` is the program's own reaction when the service refuses, given the body:
  undo a reservation the refusal names, empty a field the service will not take again. The
  order is fixed: the refusal is laid on the members first (each named field's `refused`, the
  rest in `error`), then `refusedWith` runs, then `showProblems()` — so what it changes is
  what the person is then shown.
  source: library/form.declare
```

---

`declare-help ValueControl`

```
ValueControl — library class (library/valuecontrol.declare) · extends Control
  The base of a control that **holds a value a person sets** — a checkbox, a switch, a choice of one, a date, a number — and so can be checked, required, refused by a service, and gathered into a `Form`.
  members (own):
    name: string
    required: object
    judgeOn: enum(edit|leave)
    judged: boolean
    fieldValue: object
    empty: boolean
    refused: string
    problem: string
    valid: boolean
    error: string
    form: object
    blank(v) — method
    validate(v) — method
    refuse(message) — method
    judge() — method
    focusField() — method
  from Control: disabled, focusVisible, iconLeft, iconRight, menu, menuOpen, rightIcon, flash, flashMs, openMenu(), press(), focusShape(), flashPress()
  inherits the rest from Control → View — ask for any member: declare-help ValueControl.<name>
  extended by: Checkbox, Switch, Slider, RadioGroup, Combobox, DatePicker, Stepper
  guide: docs/guide/08-controls.md (Controls) · docs/guide/14-data.md (Data)
  full prose: declare-help ValueControl --all
```

---

`declare-help RadioGroup`

```
RadioGroup — library class (library/radiogroup.declare) · extends ValueControl
  One-of-N.
  members (own):
    value: string
    focusField() — method
    input(v) — method
    pick(v) — method
    focusEntry() — method
    radios() — method
  from ValueControl: name, required, judgeOn, judged, fieldValue, empty, refused, problem, valid, error, form, blank(), validate(), refuse(), judge(), focusField()
  from Control: disabled, focusVisible, iconLeft, iconRight, menu, menuOpen, rightIcon, flash, flashMs, openMenu(), press(), focusShape(), flashPress()
  inherits the rest from ValueControl → Control → View — ask for any member: declare-help RadioGroup.<name>
  theme tokens it reads: accent, line, surface, text, textMuted, disabledOpacity, radioSize — every token: declare-help "theme tokens"
  guide: docs/guide/08-controls.md (Controls) · docs/guide/14-data.md (Data)
  full prose: declare-help RadioGroup --all
```

---

`declare-help Combobox`

```
Combobox — library class (library/combobox.declare) · extends ValueControl
  Filter-as-you-type over a collection: a text field owning a **query** plus a dismissable option list owning a **choice** — a derived selection over data.
  members (own):
    items: array
    value: object
    placeholder: string
    purpose: enum(text|name|email|username|password|newPassword|oneTimeCode|tel|url|digits|decimal|cardNumber|cardName|cardExpiry|cardCode|addressLine1|addressLine2|city|region|postalCode|country)
    query: string
    filtering: boolean
    matches: array
    matchCount: number
    list: view
    labelOf(m) — method
    input(v) — method
    focusField() — method
    pickIndex(i) — method
    ensureList() — method
    syncList() — method
    closeList() — method
    listShown() — method
    listRoved() — method
    open() — method
    toggle() — method
  from ValueControl: name, required, judgeOn, judged, fieldValue, empty, refused, problem, valid, error, form, blank(), validate(), refuse(), judge(), focusField()
  from Control: disabled, focusVisible, iconLeft, iconRight, menu, menuOpen, rightIcon, flash, flashMs, openMenu(), press(), focusShape(), flashPress()
  inherits the rest from ValueControl → Control → View — ask for any member: declare-help Combobox.<name>
  theme tokens it reads: accent, line, textMuted, comboboxHeight, error — every token: declare-help "theme tokens"
  guide: docs/guide/08-controls.md (Controls) · docs/guide/18-overlays.md (Menus, dialogs and overlays) · docs/guide/14-data.md (Data)
  full prose: declare-help Combobox --all
```

---

`declare-help globals`

```
No host globals beyond a fixed set: what code may name depends on where it is written.
  Everywhere, `{ }` bodies and handlers included: the ECMAScript built-ins (`Math`, `JSON`, `Date`, `Intl`, `Number`, `String`, `Array`, `Object`, `Map`, `Set`, `RegExp`, `Promise`, …), and `URL`, `URLSearchParams`, `console`, `structuredClone`, `encodeURIComponent`, `decodeURIComponent`.
  Refused in a `{ }` body or handler, with the Declare way named: `fetch` (a `DataSource`), the timers `setTimeout`, `setInterval`, `queueMicrotask`, `requestAnimationFrame` (`afterDelay(ms, fn)`, a `Time`), `performance` (a `Time`), `globalThis`.
  In a `script { }` block: all of the above, `fetch`, the timers and `performance` included.
  In a `script [ host = browser ] { }` block: `window`, `document` and the rest of the browser as well. An unmarked script runs on every host, so the compiler refuses them there.
What a page reads from `window` is an App attribute here: the size is `app.width` / `app.height`, and a view is reached by its name (`app.sidebar.list`), not by a query. docs/declare.md § 5.
```

---

`declare-help Intl`

```
No formatting functions of Declare's own: numbers, money and dates are formatted by the host's `Intl`, called from a `{ }` or a script function like any other global — `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(1234.5)` is "$1,234.50", `(1234.5).toLocaleString("en-US")` is "1,234.5", and `Intl.DateTimeFormat` writes weekdays and months in the language it is given. Name the locale, and a `timeZone` for a date. Guide: docs/guide/12-text.md § Text. `Intl` is one of the globals every `{ }` body and handler may name; which globals code may name, by where it is written: declare-help globals.
```

---

`declare-help DataSource`

```
DataSource — class · extends Dataset
  A `Dataset` whose value arrives over HTTP — a reactive remote resource.
  members (own):
    url: string
    format: union("json" | "text" | "bytes")
    method: union("GET" | "POST" | "PUT" | "PATCH" | "DELETE")
    body: object
    autoFetch: boolean
    credentials: enum(omit|sameOrigin|include)
    headers: object
    loaded: boolean
    loading: boolean
    failed: boolean
    error: string
    statusCode: number
    errorBody: object
    errorSchema: dataschema
    responseHeaders: object
    onLoad() — event
    fetch(): Promise<void> — method
    clear(): void — method
  inherits the rest from Dataset — ask for any member: declare-help DataSource.<name>
  guide: docs/guide/14-data.md (Data) · docs/guide/04-structure.md (Program structure) · docs/guide/30-glossary.md (Glossary)
  full prose: declare-help DataSource --all
```

---

`declare-help schema`

```
schema Task [ id: string, done: boolean, status: "open" | "closed", note?: string ]
  d: DataSource [ url = "tasks.json", schema = [ tasks[]: Task ] ]
  sel: Task? = null                           // the name in any type position
A named data shape, declared at the top level like a class, and a **type** in the one type system: use the name in any type position — a declared attribute, a parameter, a return, a field of another schema — and declare a dataset's document with it. The dataset's `.value` is then typed, so a misspelled field dies at compile time; the runtime enforces the same declaration at every boundary — arrival, the literal body, and the mutation verbs — so malformed data yields `.failed` rather than `undefined` three steps downstream.
3 rules the compiler enforces · docs: language/schema · declare.md §7 Data

schema — also an attribute on: Dataset (dataschema)
  scoped entry: declare-help <Class>.schema
```

---

`declare-help claim`

```
View.claim — attribute · type both | x | y · default "both"
  The axis a declared drag claims (`claim = x | y | both`, default `both`): `x` keeps
  vertical pan with the enclosing scroll regime while the drag owns horizontal — a grid
  column's header drag or edge-resize on touch. Scopes an existing drag declaration
  (`onPointerMove`); it never creates one. The guide's Gestures chapter has the arbitration.
  source: runtime/src/view.ts:2237
```

---

`declare-help onHold`

```
onHold(e: PointerEvent) — an event on: View
  A press held in place for half a second — the tap-hold, equally available to a mouse.
  a handler is a method answering it: onHold(e: PointerEvent) { … }
  scoped entry: declare-help View.onHold
```

---

`declare-help accessibilityLabel`

```
View.accessibilityLabel — attribute · type string
  The **accessible name** — what a screen reader calls the view. Not the visible `label` a
  control shows: an icon button shows nothing and is still named "Close". A button, link, tab,
  checkbox or menu item with no accessible name takes one from the text inside it, so
  `Button [ label = "Send" ]` needs nothing; set this where nothing visible says what the view
  is — a switch, a slider, a drawn control, an icon.
  source: runtime/src/schema.ts
```

---

`declare-help accessibilityRole`

```
AccessibilityRole — tokens: none · button · toggle · checkbox · switch · radio · slider · progress · textField · link · image · heading · list · listItem · grid · row · cell · columnHeader · tabList · tab · tabPanel · menu · menuBar · menuItem · dialog · alertDialog · group · toolbar · region · status · listbox · option · tree · treeItem · radioGroup · combobox · separator · searchBox · spinButton · navigation · main · search · banner · complementary
  carried by View.accessibilityRole — full entry: declare-help View.accessibilityRole
What a view is to assistive technology — the closed vocabulary every platform's accessibility API shares, so a program is written for none of them in particular. Each word is a contract: it names the facts the role reads and the methods its actions call, and the compiler holds a class that declares it to them. `none` is transparent — the view is read as part of its parent.
  47 uses in the reference · docs: type/AccessibilityRole
```

---

`declare-help Accessibility`

```
Accessibility — a shared namespace:
  Accessibility.announce(text: string, politeness?: "polite" | "assertive"): void
  Accessibility.announced(): readonly { text: string
  Accessibility.politeness: "polite" | "assertive" }[]
What a program says to assistive technology with no view to say it from — "Message sent", "3 results": `announce` speaks it without moving the focus, `polite` (the default) at the next pause, `assertive` at once. A view whose own changes should be heard sets `accessibilityLive` instead.
```

---

`declare-help TextInput.purpose`

```
TextInput.purpose — attribute · type text | name | email | username | password | newPassword | oneTimeCode | tel | url | digits | decimal | cardNumber | cardName | cardExpiry | cardCode | addressLine1 | addressLine2 | city | region | postalCode | country
  **What the field holds**, said once, so the platform can help with it: the browser's
  autofill and a password manager recognise the field and offer to fill it, a phone brings
  up the keyboard that suits it, and capitalization and autocorrection are left alone where
  they would get in the way. The tokens:
  
  | purpose | for | a phone's keyboard |
  |---|---|---|
  | `text` | anything else (the default) | text |
  | `name` | a person's full name | text, capitalized words |
  | `email` | an email address | email |
  | `username` | a sign-in name | text |
  | `password` | a password being entered | text, hidden |
  | `newPassword` | a password being chosen | text, hidden |
  | `oneTimeCode` | a code sent by text or email | digits |
  | `tel`, `url` | a phone number, a web address | phone, URL |
  | `digits`, `decimal` | a whole number, a number with a point | digits, decimal |
  | `cardNumber`, `cardName`, `cardExpiry`, `cardCode` | a payment card's number, name, expiry and security code | digits (text for the name) |
  | `addressLine1`, `addressLine2`, `city`, `region`, `postalCode`, `country` | a postal address; `region` is a state or province | text |
  
  ```declare-fragment
  TextInput [ purpose = email, placeholder = "you@example.com" ],
  TextInput [ purpose = password, accessibilityLabel = "Password" ],
  TextInput [ purpose = cardNumber, accessibilityLabel = "Card number" ]
  ```
  
  The purpose says what the field is for, not what may be typed: a `cardNumber` field still
  takes whatever the person types, and checking it is the field's `validate` or your own
  rule. A screen reader is told the field's name by its label as ever.
  
  On a web page the field carries the standard autofill name for its purpose, as both its
  `autocomplete` and its `name` (`cc-number` for `cardNumber`, `postal-code` for `postalCode`),
  and the keyboard hint as its `inputmode`. That is all a browser or a password manager
  matches on: fields need no form around them, and a page of them fills as one. A browser
  offers saved payment cards only to a page served over HTTPS.
  source: runtime/src/schema.ts
```

---

`declare-help SimpleLayout`

```
SimpleLayout — library class (library/simplelayout.declare) · extends Layout
  The stacking idiom: siblings placed one after another along `axis`, in child order, `spacing` apart (negative overlaps).
  members (own):
    axis: enum(x|y)
    spacing: number
    align: enum(none|start|center|end|baseline)
    place() — method
  inherits the rest from Layout — ask for any member: declare-help SimpleLayout.<name>
  guide: docs/guide/14-data.md (Data) · docs/guide/31-coming-from.md (Coming from other frameworks) · docs/guide/04-structure.md (Program structure)
  full prose: declare-help SimpleLayout --all
```

---

`declare-help ResponsiveLayout`

```
ResponsiveLayout — library class (library/responsive.declare) · extends Layout
  A view's children often want one arrangement when there is room and another when there isn't: three panels side by side on a wide screen, the same panels stacked on a phone; an optional control that appears only when space allows.
  members (own):
    plan: array
    gap: number
    align: enum(none|start|center|end|baseline)
    place() — method
  inherits the rest from Layout — ask for any member: declare-help ResponsiveLayout.<name>
  guide: docs/guide/31-coming-from.md (Coming from other frameworks) · docs/guide/06-layout.md (Size, position and layout) · docs/guide/17-your-own-views.md (Your own views and drawing)
  full prose: declare-help ResponsiveLayout --all
```

---

`declare-help Card`

```
Card — library class (library/card.declare) · extends View
  The box everything else sits on: the theme's `surface` fill, its corner radius, a hairline edge in its `line` token, and — the part that saves the wrapper view — a **default layout that stacks and pads**, so a Card's children are written as a plain list and arrive inset from every edge.
  members (own):
  inherits the rest from View — ask for any member: declare-help Card.<name>
  theme tokens it reads: controlCornerRadius, line, surface — every token: declare-help "theme tokens"
  guide: docs/guide/06-layout.md (Size, position and layout) · docs/guide/31-coming-from.md (Coming from other frameworks) · docs/guide/08-controls.md (Controls)
  full prose: declare-help Card --all
```

---

`declare-help padding`

```
padding — an attribute on: TextInput (inset), View (inset)
  scoped entry: declare-help <Class>.padding
the CSS instinct: padding is the view's, not the layout's — 'View [ padding = 16, layout: SimpleLayout [ axis = y, spacing = 8 ] ]': it gives the view a content box that every child's x/y starts from (laid, self-placing or ignoreLayout alike) and that '100%' resolves against, while 'fill', 'stroke' and 'cornerRadius' stay on the full box; a Card brings one already
```

---

`declare-help State`

```
State — class · extends Node
  A named bundle of overrides that snaps on and off **together**.
  members (own):
    applied: boolean
    onApply() — event
    onRemove() — event
    apply(): void — method
    remove(): void — method
    toggle(): void — method
  guide: docs/guide/31-coming-from.md (Coming from other frameworks) · docs/guide/03-constraints.md (Constraints) · docs/guide/04-structure.md (Program structure)
  full prose: declare-help State --all
```

---

`declare-help Spring`

```
Spring — class · extends Animator
  The **follow** half of the animation family: drives its `attribute` toward a **live, reactive `to`** with spring physics — re-settling whenever `to` changes, and **sleeping at rest** (zero cost while idle).
  members (own):
    stiffness: number
    damping: number
    mass: number
    epsilon: number
    arrive(): void — method
  inherits the rest from Animator — ask for any member: declare-help Spring.<name>
  guide: docs/guide/31-coming-from.md (Coming from other frameworks) · docs/guide/21-motion.md (Motion and states) · docs/guide/22-time.md (Time and change events)
  full prose: declare-help Spring --all
```

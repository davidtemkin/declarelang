# The language forms

Every form the grammar accepts — a keyword, a delimiter, an operator, a member shape —
one page each. This file is the registry: a `## slug` section per form, in a fixed anatomy
the extractor parses and the docs app renders, and the help tool answers from.

Fields, in order: `name` (how the form is displayed), `group` (its index section),
`short` (a rail label, when the name is long), `family`, `spec` (the declare.md section), `terms` (what a reader might ask the help tool),
`syntax` (the grammar lines, indented), `usage` (demo ids under apps/docs/demos/, comma
separated). Then the lead — one or two paragraphs. `### rules` lists what the compiler
enforces: each `- ` rule carries `> says:` the checker's own sentence, quoted verbatim, and
`> probe:` a one-line program that provokes it (the gate compiles the probe and checks the
sentence, so a page can never quote a diagnostic the compiler no longer says). `### related`
lists forms (by slug), classes, and guide chapters (`NN-slug · Title`).

Not forms, and not here: `afterSettle` (a shared function — Types and functions),
`onReady` (App's `ready` event — the App page), `draw()` (a method with a reserved name a
view may define — the View page). The settle itself is a concept the guide teaches. And
`<-` is no longer a form: the subscription arrow was removed when runtime services became
ordinary component members (`Keys [ onKeyUp(e) { … } ]` in place of `onKeyUp(e) <- Keys`);
the parser still recognizes it, only to name that rewrite.

## app

name: App [ … ]
group: Structure
family: root
spec: §4 Composition
terms: App, root instance, the root, program root, one root
syntax:
    App [ members ]
usage: form-app

A program is one tree, and `App [ … ]` is its root — one per program. With `width` and
`height` unset it fills its host, which is the common case: the page, the window, the
island it is mounted in. Everything else nests inside its brackets, and `app` (lower case)
names the running instance from any depth, so application-wide state belongs here.

Any instance may declare its own members, the App included — attributes, methods,
handlers, children — with no class at all; the compiler synthesizes an anonymous subclass.
The top-level forms (`class`, `include`, `use`, `script`, `font`, `style`, `theme`,
`schema`) may come before or after it, in any order.

### rules

- One root, one program. A second `App [ … ]` is not a second window; it is a syntax error at the point the first program ended.
  > says: expected end of input, got 'App'
  > probe: App [ ]\nApp [ ]
- A program without a root is not a program — a file of classes alone has nothing to run.
  > says: expected a component name, got 'eof'
  > probe: class A extends View [ ]
- `classroot` has no meaning on the App: it names the root of a *class* you define. From the App, reach values by a bare name, `this`, or `app`.
  > says: 'classroot' is the root of a component you define — valid only inside a class body. This code is in the App, not a class. Reach values here by a bare name, 'this', or 'app'.
  > probe: App [ w: number = { classroot.width } ]

### related

forms: instance, class, scope
classes: App
guide: 02-two-brackets · Two brackets, 04-tree · The tree

## instance

name: Type [ … ]
short: instance
group: Structure
family: delimiter
spec: §2 Two delimiters
terms: [ ], brackets, square brackets, instance, instantiate, component instance, members
syntax:
    Type [ members ]
    name: Type [ members ]
usage: form-instance

Square brackets hold a component's members — attributes, declarations, methods, handlers,
children — and the nesting of brackets *is* the tree. Naming a type with a bracketed body
instantiates it: `Text [ text = "OK" ]` is a Text, `bg: View [ … ]` a View reachable as `bg`.
Every member inside is one of the five shapes (set, declare, child, method, handler),
separated by commas.

An instance is a full component in its own right: it may declare new attributes and methods
without a class, because the compiler synthesizes an anonymous subclass for it. Promote a
one-off to a named `class` when you instantiate it twice, or need to name its type.

### rules

- A type must exist: a built-in, a library component, or a class this program declares or includes.
  > says: unknown component 'Widget'
  > probe: App [ Widget [ ] ]
- Members are separated by commas; the compiler names the spot when one is missing. A trailing comma before `]` is legal, and the formatter removes it.
  > says: members are separated by commas — add ',' before 'height'
  > probe: App [ width = 10 height = 10 ]
- Members share one namespace: a child cannot take an attribute's name, and two children cannot share one.
  > says: App.width is an attribute — a child may not take an attribute's name
  > probe: App [ width: View [ ] ]
- A second child with the same name is refused, and the message says where the first is.
  > says: App.a: 'a' is already a child (first at line 1, col 7) — members share one namespace
  > probe: App [ a: View [ ], a: View [ ] ]

### related

forms: constraint, child, class, app
classes: View, Node
guide: 02-two-brackets · Two brackets, 04-tree · The tree

## class

name: class
group: Structure
family: declaration
spec: §4 Composition
terms: class, declare a class, define a component, component definition
syntax:
    class Name extends Base [ members ]
    class Name [ members ]                    // extends View
usage: form-class, form-classroot

A component is a class, and this is the one way to define one. Everything inside the
brackets is a **member**: `name = value` sets an attribute the base already has,
`name: Type = value` declares a new one, `name: Type [ … ]` is a named child, `name() { … }`
a method, `onThing() { … }` a handler for an event the node fires. Instantiate the class by
naming it with a `[ ]` body, as many times as you like; each instance may set any attribute
and add members of its own.

A class is not a file and not a module. It is a top-level declaration, and a program is one
tree of them — `include` merges another file's classes into the same program, and there is
nothing to export. Any instance may declare members with no class at all, because the
compiler synthesizes an anonymous subclass; promote a one-off to a named class when you
instantiate it twice, or when you need to name its type.

### rules

- A class extends a built-in component or a class declared in this program — declared anywhere in it, later in the file included. Omit `extends` and the base is `View`.
  > says: unknown base 'Widget' — a class extends a built-in component or a class declared in this program
  > probe: class Chip extends Widget [ ]\nApp [ Chip [ ] ]
- A class may not contain itself, directly or through another class: the tree it describes would never finish.
  > says: class Chip contains itself — a class may not appear inside its own body (directly or through another class)
  > probe: class Chip extends View [ Chip [ ] ]\nApp [ Chip [ ] ]
- One name, one class. A second declaration of the same name is refused, and so is a class named like a built-in.
  > says: there is already a component named 'Chip'
  > probe: class Chip extends View [ ]\nclass Chip extends View [ ]\nApp [ Chip [ ] ]
- `root` and `children` are structural members of every View and cannot be a class's own member. `root` is the sharp one: shadowing it makes every `{ app.… }` in the class resolve against the shadow.
  > says: 'root' is the node reference `app` compiles to (`app` is `this.root`) — a child cannot take its name; choose another
  > probe: class Chip extends View [ root: View [ ] ]\nApp [ Chip [ ] ]
- A bare `name = value` sets an attribute the base has; an attribute the base does not have must be **declared**, with a type — `name: Type = value`.
  > says: Chip has no attribute 'labl'
  > probe: class Chip extends View [ labl = "x" ]\nApp [ Chip [ ] ]
- A class is instantiated where its base fits: a `layout:` slot takes a Layout, a View slot a View.
  > says: App.layout expects a Layout — 'Model' is not one
  > probe: class Model extends Node [ ]\nApp [ layout: Model [ ] ]

### related

forms: extends, scope, instance, include, use
classes: View, Node, App
guide: 04-tree · The tree, 11-make-your-own · Make your own

## extends

name: extends
group: Structure
family: keyword
spec: §4 Composition
terms: extends, subclass, inherit, base class, inheritance
syntax:
    class Name extends Base [ … ]
usage: form-extends

Single inheritance from another component — a library class or one of your own. The
subclass sees every attribute, child, method, and event of the base. Re-stating an
attribute with `name = value` **overrides** its default; re-stating a method replaces it;
and a base's named child is reached by name, not redeclared. Omit `extends` altogether and
the base is `View`.

`extends` is not a top-level form in its own right: it is part of a `class` declaration.
The base may be declared later in the file, or in an included one. What a subclass may
extend is what the runtime can wire: `View`, `Node`, `Layout` (and `TweenLayout`), and any
class descending from them.

### rules

- The base must be a component: a built-in or a declared class.
  > says: unknown base 'Widget' — a class extends a built-in component or a class declared in this program
  > probe: class Chip extends Widget [ ]\nApp [ Chip [ ] ]
- Any built-in component is a base — View, Layout, Node, Dataset, Spring, Keys, State alike; only an abstract base (Stream, Media, Editor), which no runtime class implements, is refused.
  > says: 'Stream' is an abstract base — it names no component to construct; extend one of its concrete members (EventStream, Socket)
  > probe: class S extends Stream [ ]\nApp [ ]
- A subclass may not take a built-in's name.
  > says: there is already a component named 'View'
  > probe: class View extends View [ ]\nApp [ ]

### related

forms: class, set, method
classes: View, Node, Layout, Control
guide: 11-make-your-own · Make your own

## inlineview

name: <Class/>
short: inline view
group: Structure
family: content
spec: §9 Style
terms: inline view, inline views, view in text, view in a sentence, view in prose, chip in text, widget in text, component in markdown, inline-block, tag in content
syntax:
    HTMLText [ html = "Filed under <Chip label='docs'/> today." ]
    Markdown [ text = "Fixed by <Issue id='142'/>." ]
    <Chip key='a' label='docs'/>                 // key: this view's identity across a content change
usage: form-inlineview

Inside rich-text content, a **self-closing tag whose name is a view class the program
declares** is one real view of that class, placed in the flowing line as an atomic box the
words wrap around. There is no whitelist to extend and no attribute to set: the class
existing is what makes the tag mean it, matched by the name exactly as written, in both
formats (`HTMLText`'s `html` and `Markdown`'s `text`). A tag naming no class of yours keeps
the meaning it already had — the HTML whitelist, an autolink, a literal `<` — and a
`<span class>` stays a style, never a view.

The tag's attributes are the class's, each converted from its string by the slot's
**declared** type, exactly as a source literal is: `id='142'` is the number in a `number`
slot, `tint='#DDF4E4'` a `Color`, `align='center'` an enum member, `width='50%'` a percent of
the width the text flows in, a bare `hot` is `true`. The tag **is the use site**, so an
attribute takes use-site precedence over what the class body sets for that slot — a literal
or a `{ }` constraint — and only the winner installs; a slot the tag does not mention keeps
the class's own behaviour. `x`/`y` are refused — the flow places the view, as a layout places
its children — and an unknown attribute, a value that will not convert, a read-only slot, or
a percent on a slot with no axis goes to the component's `unsupported` policy. The view owns
its `width`/`height` while the flow owns its `x`/`y`, it never splits
across a line, a taller one grows its line, a size change re-flows the text, and it reads the
surrounding run's text face as provided values. Content is reactive: a tag still present keeps
its view and its state, with only changed attributes rewritten (a tag that gains or loses an
attribute is built again, since what it claims is settled at build), and `key='…'` fixes that
identity when the order moves. Markup carries no expressions, so a live value is either
concatenated into the content (with `escapeHtml` around every interpolated value) or derived
inside the class from an identity the content names.

### rules

- Placement belongs to the flow, so a tag may not set `x` or `y`.
  > says: the text flow places an inline view — 'x' is not yours to set here
  > probe: class Chip extends View [ width = 10, height = 10 ]\nApp [ HTMLText [ unsupported = error, html = "a <Chip x='4'/> b" ] ]
- A tag names attributes the class actually has; anything else goes to `unsupported`.
  > says: Chip has no attribute 'nope'
  > probe: class Chip extends View [ width = 10, height = 10 ]\nApp [ HTMLText [ unsupported = error, html = "a <Chip nope='1'/> b" ] ]
- An inline view is self-closing: a tag with content between it and a closing tag is not one.
  > says: is an inline view, and an inline view must be self-closing
  > probe: class Chip extends View [ width = 10, height = 10 ]\nApp [ HTMLText [ unsupported = error, html = "a <Chip>hi</Chip> b" ] ]
- A percent needs an axis to resolve against, so it belongs on a width or a height.
  > says: no axis to resolve a percent against
  > probe: class Chip extends View [ pad: Length = 4, width = 10, height = 10 ]\nApp [ HTMLText [ unsupported = error, html = "a <Chip pad='50%'/> b" ] ]
- A read-only slot is computed from its declaration, so no tag may set it.
  > says: is read-only
  > probe: class Chip extends View [ width = 10, height = 10 ]\nApp [ HTMLText [ unsupported = error, html = "a <Chip hovered='true'/> b" ] ]

### related

forms: instance, class, style
classes: RichText, HTMLText, Markdown
guide: 06-style · Style

## set

name: name = value
group: Members
family: member
spec: §3 Members and scope
terms: set an attribute, assignment, attribute value, equals, bare value
syntax:
    name = literal
    name = { expression }
    name = :path
usage: form-set

Sets an attribute the component already has. The right-hand side is one of three things,
and the spelling says which: a **bare literal** (a number, a percent, a color, a string, a
keyword — set once), a **`{ }` constraint** (TypeScript that stays true), or a **`:path`**
read from bound data. A bare `[ … ]` list fills an array-typed slot.

One family of names may be set on a component that does not declare them: the built-in
**provided values** — the text face (`fontSize`, `fontFamily`, `fontWeight`, `textColor`,
`letterSpacing`), `theme`, `iconSize`, and the rich-text slots. Setting one on a container
*provides* it to every descendant that reads it (see `provided`).

A set attribute with a `{ }` **owns a cell**: the runtime keeps it current, and a direct
write to it is refused with a message naming the fix — derived state is never assigned;
change its inputs. In a handler, `name = value` is the setter: the write lands when the
handler returns, together with every other write it made, in one settle.

### rules

- The attribute must exist on the component — to introduce a new one, declare it with a type.
  > says: App has no attribute 'widht' — did you mean 'width'?
  > probe: App [ widht = 10 ]
- A bare value must be of the slot's kind; the message names the vocabulary the slot takes.
  > says: App.width expects a Length (a number of pixels, a percent like 50%, or the position literals center | end on x/y), got the string "ten"
  > probe: App [ width = "ten" ]
- A `script { }` constant is not a bare literal — reach it through braces.
  > says: got 'W' — write { W } to bind the attribute
  > probe: script { const W = 10 }\nApp [ width = W ]
- A list belongs to an array-typed slot; a scalar slot refuses one.
  > says: got the list […, …]
  > probe: App [ width = [1, 2] ]

### related

forms: declare, constraint, datapath, literals
classes: View
guide: 02-two-brackets · Two brackets, 03-relationships · Relationships

## declare

name: name: Type = value
group: Members
family: member
spec: §3 Members and scope
terms: declare an attribute, new attribute, reactive attribute, colon type, typed attribute
syntax:
    name: Type = value
    name: Type                                 // no default: undefined until written
    rows: Row[] = []
    panel: Menu = null                         // a component class — the slot holds an instance
usage: form-declare

Declares a new reactive attribute — the way state enters a program. The type comes from the
same vocabulary a signature uses: a primitive (`number`, `string`, `boolean`), `Color`,
`Length`, `Radius`, a component class, a declared schema, a literal union
(`"open" | "closed"`), an array of any of these, or a function type. The default is a bare
literal or a `{ }` expression.

A declaration's `{ }` default is a **formula with no cell**: reading it inlines the
expression, and an assignment simply replaces it — the right tool for a value you may take
over later, which is how `TextInput.initial` differs from its read-only `text = { … }` twin.
Compare `set`: a set attribute's `{ }` owns a cell and refuses assignment.

### rules

- A declaration carries a type; the colon is not optional.
  > says: expected a type or component name, got '='
  > probe: App [ other: = 1 ]
- The type must be one the language knows; the message lists them.
  > says: unknown type 'Widget' — a declared attribute's type is one of number, string, boolean, Color, Length, Radius, Shape, array, object, View, Theme
  > probe: App [ x2: Widget = null ]
- An attribute the component already has is set, not declared again.
  > says: App already has an attribute 'width' — a declaration introduces a new one; write 'width = …' to set the existing one
  > probe: App [ width: number = 10 ]
- A built-in read-only intrinsic (`hovered`, `pressed`, `dark`, …) is computed for you and cannot be shadowed by a declaration.
  > says: 'hovered' is a built-in read-only intrinsic of App — it is computed for you; choose another name for your derived value
  > probe: App [ hovered: boolean = false ]

### related

forms: set, constraint, schema, method
classes: View, TextInput
guide: 03-relationships · Relationships, 04-tree · The tree

## child

name: name: Type [ … ]
group: Members
family: member
spec: §3 Members and scope
terms: child, named child, anonymous child, nested view, subview
syntax:
    name: Type [ members ]
    Type [ members ]                           // anonymous
usage: form-child

A child is a member that is itself an instance. Named, it is reachable from its siblings and
its class as `name`; anonymous, it is placed and painted but never addressed. Children paint
in declaration order — later siblings on top; there is no z-index — and a parent with a
`layout:` member arranges them, while one without positions them by their own `x`/`y`.

A child is also how anything that is not a view joins the tree: a `Dataset`, a `Spring`, a
`Keys` or `Focus` service, a stream. A source of events is a child, so it lives and dies with
the node that declares it; there is nothing to subscribe to and nothing to unregister.

### rules

- A child may not take an attribute's name — members share one namespace.
  > says: App.width is an attribute — a child may not take an attribute's name
  > probe: App [ width: View [ ] ]
- Two children cannot share a name.
  > says: App.a: 'a' is already a child (first at line 1, col 7) — members share one namespace
  > probe: App [ a: View [ ], a: View [ ] ]
- A child cannot be named after a scope noun.
  > says: 'this' is a scope noun (language §11) — a child cannot take its name
  > probe: App [ this: View [ ] ]

### related

forms: instance, scope, declare
classes: View, SimpleLayout, Dataset
guide: 04-tree · The tree, 05-space · Space

## method

name: name(a: T) -> R { … }
group: Members
family: member
spec: §3 Members and scope
terms: method, function member, call, define a method, method signature
syntax:
    name() { statements }
    name(v: number, c: Menu?) -> string { statements }
usage: form-method

A method is a typed signature, name first, and a statement body. Every parameter carries a
written type — a primitive, a component class, an event payload, a function type
(`f: (id: string) -> void`), or an array of one; a `?` after the type says the value may be
absent, and the body must check. Omit `-> R` for a method that returns nothing.

A method runs when called; an attribute stays true. A computed *value* is therefore not a
method but a declaration with a `{ }` default. A constraint that calls a method stays live
through it: every read inside the method is a wired dependency, rebased onto what you passed
— which is the difference between a method and a `script { }` function, whose body the
compiler never reads.

### rules

- Parameters are typed; a bare name has no type.
  > says: parameter 'a' has no type — a signature is typed name-first: 'f(a: number)'
  > probe: App [ f(a) { } ]
- Type annotations do not live in bodies: a local takes no annotation (contextual typing covers it); narrow with a cast (`x as T`), and put declared types on attributes.
  > says: annotates a binding ('x') — bindings in a body take no type annotation (contextual typing covers them); a cast narrows an expression (x as T), and declared types live on the attribute (name: type = …)
  > probe: App [ f() { const x: number = 1 } ]
- A value slot takes one expression; statements live in methods.
  > says: an attribute value is one expression, not statements; move the logic into a method and call it (e.g. { classroot.compute() })
  > probe: App [ width = { const w = 10; w } ]

### related

forms: handler, arrow, constraint, script
classes: View, Control
guide: 03-relationships · Relationships, 07-interaction · Interaction

## handler

name: onEvent(e: Payload) { … }
short: onEvent(e) { … }
group: Members
family: member
spec: §3 Members and scope
terms: handler, event handler, onClick, on event, events
syntax:
    onClick() { statements }
    onPointerMove(e: PointerEvent) { statements }
usage: form-handler

A handler is a method named `on` + an event this node fires — `onClick`, `onPointerMove`,
`onInit`, `onKeyDown` — and it is a method in every respect: a subclass's `onInit` replaces
its base's, and reaches it with `super.onInit()` when it wants the base's to run. The payload, when there is one, is typed by the event, and the
compiler names the type when you write the wrong one. Handlers only assign attributes; every
constraint that reads those attributes follows, which is the whole update model.

Nothing bubbles. A handler runs on the node that declares it, for events that node fires;
a parent that wants a child's click declares the handler on the child (or the child calls
up through `parent` or `classroot`). Events from outside the tree arrive as children — a
`Keys [ onKeyUp(e: KeyEvent) { … } ]` gives a node app-wide keyboard handling.

### rules

- The event must be one this node fires; the message lists its handlers.
  > says: App has no 'onFrobnicate' event — its handlers: onInit
  > probe: App [ onFrobnicate() { } ]
- The payload's type is the event's.
  > says: 'onClick' receives a PointerEvent — write 'onClick(e: PointerEvent)', not 'string'
  > probe: App [ onClick(e: string) { } ]

### related

forms: method, super, set, child
classes: View, Keys, Control
guide: 07-interaction · Interaction

## super

name: super.name(…)
group: Members
family: member
spec: §3 Members and scope
terms: super, base method, call the base, override, overriding a method, parent class method, inherited method
syntax:
    name(v: T) { super.name(v) }
    fetch() { log = log + "fetching"; super.fetch() }
usage: form-super

A method a subclass declares replaces the base's method of the same name, handlers included.
`super.name(args)` calls the one it replaced: the nearest method of that name beneath the
body in the `extends` chain. It is an ordinary call, so the body decides where it goes —
before its own work, after it, in the middle, conditionally, or not at all — and passes
whatever arguments it likes. Inside the base's method, `this` is still the instance, so the
base's own calls reach the subclass's overrides, as in any class language. A built-in's own
runtime methods are replaced and reached the same way: `class Fetcher extends DataSource [
fetch() { …; super.fetch() } ]` wraps the DataSource's fetch rather than rewriting it, and the
runtime's own calls to `fetch()` land on the override.

A use site that overrides a class's method (`Stepper [ input(v: number) { … } ]`) reaches the
class's with `super` the same way. A constraint that calls a method stays live through
`super` too: the base body's reads are wired like the override's.

### rules

- `super` reaches a method up the chain: one written in this program or the library, or the built-in's own runtime method.
  > says: super.go(): no class beneath B extends A declares go()
  > probe: class A extends View [ ]\nclass B extends A [ go() { super.go() } ]\nApp [ B [ ] ]
- A built-in fires its events; a handler has no base body to call.
  > says: no class beneath App declares onInit()
  > probe: App [ onInit() { super.onInit() } ]
- `super` is a call, not a value.
  > says: super is a call up the class chain — write super.name(…)
  > probe: class A extends View [ f() { } ]\nclass B extends A [ f() { const g = super.f } ]\nApp [ B [ ] ]
- A `{ }` value has no base method to reach.
  > says: super is for a method body
  > probe: class A extends View [ f() -> number { return 1 } ]\nclass B extends A [ w: number = { super.f() } ]\nApp [ B [ ] ]

### related

forms: method, handler, extends, class
classes: View, Control
guide: 11-make-your-own · Make your own

## arrow

name: ->
group: Members
family: operator
spec: §3 Members and scope
terms: ->, return type, method return, arrow in a signature, function type
syntax:
    name(a: T) -> R { … }
    f: (id: string) -> void                   // a function type, in a parameter or a declaration
usage: form-arrow

The return-type marker in a signature, and the arrow of a function type. `quant(v: number)
-> number { … }` returns a number; omit it for a method that returns nothing. In a type
position, `(a: T) -> R` is a function type — a parameter that takes a callback, or a
declared attribute holding one.

It is not a lambda arrow and not a binding operator: inside a `{ }` body or a `script`
block, `=>` is ordinary TypeScript. The language's other arrows, `<-` and `<->`, are
binding operators on attributes.

### rules

- Parameters in a function type are typed like a method's.
  > says: parameter 'a' has no type — a signature is typed name-first: 'f(a: number)'
  > probe: App [ f(a) { } ]

### related

forms: method, twoway
classes: View
guide: 03-relationships · Relationships

## constraint

name: { … }
group: Values
family: delimiter
spec: §5 Constraints
terms: { }, braces, curly braces, constraint, expression, binding, live value, TypeScript in brackets
syntax:
    name = { expression }
    name: Type = { expression }
usage: form-constraint, form-constraint-deps

Braces hold TypeScript, and in a value slot the expression is a **constraint** —
re-evaluated when, and only when, something it reads changes, and kept true from then on. `width = {
parent.width - 40 }` stays true through every resize; nothing subscribes, diffs, or
re-renders. Dependencies are extracted statically by the compiler, which reads *through* the
methods you call — a script function is the one opaque call.

Inside the braces you are in plain TypeScript at full expression strength: ternaries,
template literals, array chains, closures, casts. The bare-slot vocabulary stops at the
brace — a color is `0x4169E1`, not `navy`; a size is computed from the parent, not written
as a percent. A `:path` may appear inside a body, which is how anything conditional over
replicated data is written.

### rules

- No percentages in braces: read the parent and scale.
  > says: there are no percentages: read the parent and scale, so 100% is { parent.width * 1 }
  > probe: App [ width = { 100% } ]
- No `#hex` in braces: a color in TypeScript is a number.
  > says: inside { } a color is written 0x336699, not #336699 (the #… and named-color forms work only in bare slots)
  > probe: App [ fill = { #336699 } ]
- No named colors in braces either; the message gives the number.
  > says: 'navy' is a named color — the name form works only in a bare slot; inside { } write it as 0x000080.
  > probe: App [ fill = { navy } ]
- A body is one expression; statements belong in a method.
  > says: an attribute value is one expression, not statements; move the logic into a method and call it (e.g. { classroot.compute() })
  > probe: App [ width = { const w = 10; w } ]
- A slot may not derive from itself — that is a cycle by construction; derive from a base.
  > says: 'width' reads itself — a { } cannot depend on the slot it defines; name the base it derives from instead
  > probe: App [ width = { width + 1 } ]
- A bare name must resolve: a member up the enclosing brackets, a parameter, or one of the few globals a body may use.
  > says: cannot resolve 'nothingHere' — not a member of t: Text → App, a parameter, or one of the globals a body may use (fetch, URL, setTimeout, console, Math, JSON, …)
  > probe: App [ t: Text [ text = { nothingHere } ] ]
- A script `let` has no cell, so a constraint cannot notice it change; hold changing state in an attribute.
  > says: 'n' is mutable state in a script { } block — a module variable has no cell, so nothing can notice it change; hold the value in a reactive attribute (declare it on the app) and read that instead
  > probe: script { let n = 1 }\nApp [ w: number = { n } ]
- A script call is opaque: pass values, never a node.
  > says: a script call is opaque: this constraint depends on the VALUES it passes, and a node reference never changes
  > probe: script { function f(v: any) { return 1 } }\nApp [ w: number = { f(this) } ]

### related

forms: set, declare, datapath, script, literals
classes: View, Spring
guide: 03-relationships · Relationships, 02-two-brackets · Two brackets

## datapath

name: :path
group: Values
family: operator
spec: §7 Data
terms: :path, datapath, colon path, data read, replication, [] suffix, bound data
syntax:
    text = :title                              // a read, relative to the nearest datapath
    View [ datapath = :rows[], … ]             // [] replicates: one instance per record
    text = { :on ? :title : "—" }              // a read inside a body
usage: form-datapath, form-datapath-select

A colon-prefixed path reads from bound data, relative to the nearest enclosing `datapath`.
`datapath` selects a place in a dataset; descendants read fields relative to it; and a path
ending in `[]` **replicates** its node — one instance per record, reconciled by the record's
`id`. This is what replaces `items.map(…)`: a collection of children comes from data, never
from code in the tree.

Between the root and the `[]`, a path may select in the JSONPath subset — `[0]`, `[-1]`,
`[1:4]`, `[*]`, `['quoted key']`. Reads are one-way; the only arrow that writes back is
`<->`, on a leaf editor. Without a schema a path is dynamic: an unresolved read yields
`null` and the bound attribute falls back to its default; with one, every path is checked at
compile time.

### rules

- `[]` replicates and may appear only at the end of a path.
  > says: expected a member name, got '.'
  > probe: App [ d: Dataset { { "rows": [] } }, datapath = { d.value }, View [ datapath = :rows[].x ] ]
- A dataset's literal body is strict JSON — quoted keys, no trailing commas.
  > says: the Dataset body is not valid JSON
  > probe: App [ d: Dataset { { "rows": [1,], } } ]
- A dataset needs data: a literal body, or a derived `contents`.
  > says: a Dataset needs data — a literal JSON body ('d: Dataset { … }') or a derived 'contents = { … }'
  > probe: App [ d: Dataset [ ] ]
- A computed object is not a place: a cursor points into declared data. Wrap a computed list in a Dataset and read its `.value`.
  > says: this value belongs to no Dataset/DataSource — a cursor can only point into declared data
  > probe: App [ v: View [ datapath = { { a: 1 } }, Text [ text = :a ] ] ]

### related

forms: twoway, constraint, schema, set
classes: Dataset, DataSource, View
guide: 09-data · Data, 10-scale · Scale

## key

name: key
group: Values
family: attribute
spec: §7 Data
terms: key, key =, record identity, identity, reconcile, reconciliation
syntax:
    View [ datapath = :people[], key = :email ]
usage: form-key

Replication reuses an instance across sorts, filters and edits when it can tell which
record is which. By convention that is the record's `id` field, with nothing declared.
When a collection's identity lives under another name, `key = :field` on the replicated
node names it — a single `:path`, read per record. It is replication metadata, so it is
legal only beside a many-path `datapath`.

### rules

- Only a node that replicates can carry a `key`.
  > says: 'key' is replication metadata — it belongs on a node whose datapath matches many
  > probe: App [ d: Dataset { { "rows": [ { "id": "a" } ] } }, v: View [ datapath = { d.value }, key = :id ] ]
- A key is one `:path` to the identity field, never a literal or a many-path.
  > says: key = :field names each record's identity field
  > probe: App [ d: Dataset { { "rows": [ { "id": "a" } ] } }, datapath = { d.value }, View [ datapath = :rows[], key = "id" ] ]

### related

forms: datapath, schema
classes: Dataset, View
guide: 09-data · Data, 10-scale · Scale

## twoway

name: <->
group: Values
family: operator
spec: §7 Data
terms: <->, two way, two-way binding, bidirectional, double arrow, live commit
syntax:
    TextInput [ text <-> :title ]
    TextInput [ text <-> { fieldName } ]       // a { } yielding a field name
usage: form-twoway

Two-way binding, opt-in and for leaf editors only. The left side is an editor's value slot;
the right names a **place in data** — a `:path`, or a `{ }` yielding a field name — resolved
against the nearest enclosing `datapath`. Edits in the field write back through the cursor,
and a change in the data shows in the field. It is the only arrow in the language that
writes.

Deliberately narrow: to drive an ordinary attribute from a control, use the value pattern —
derive down with `text = { app.note }`, deliver up with `input(v: string) { app.note = v }` —
so data flow stays traceable. One-way `:path` everywhere else.

### rules

- The left side is an editor's value slot; a Text is not an editor.
  > says: the two-way arrow edits a dataset value through an editor's value slot (e.g. 'TextInput.text') — Text is not an editor
  > probe: App [ d: Dataset { { "title": "x" } }, datapath = { d.value }, t: Text [ text <-> :title ] ]
- There must be data to edit: a `datapath` above the editor.
  > says: has no data to edit — a two-way binding writes into a dataset through the nearest enclosing 'datapath', and nothing above this declares one
  > probe: App [ TextInput [ text <-> :title ] ]
- The right side is a place, not a value: a `:path`, or a `{ }` yielding a field name.
  > says: binds a DATAPATH — write a :path (text <-> :field), or a { } expression yielding a field NAME. To wire an attribute to another attribute, derive down with a { } constraint and deliver up in an onInput() handler
  > probe: App [ d: Dataset { { "title": "x" } }, datapath = { d.value }, TextInput [ text <-> 3 ] ]

### related

forms: datapath, set
classes: TextInput, Editor, Dataset
guide: 09-data · Data, 08-controls · Controls

## constructors

name: gradient(…) · stroke(…) · shadow(…) · frost(…)
short: constructors
group: Values
family: value
spec: §9 Style
terms: gradient, stroke, shadow, stop, frost, value constructor, value constructors, constructor call
syntax:
    fill = gradient(#F8F8F8, #D8D8D8)          // bare: colors in the bare vocabulary
    fill = { gradient("180deg", 0xF8F8F8, 0xD8D8D8) }
    stroke = stroke(1, #B0B0B0)                // drawn inside the box
    shadow = shadow(0, 4, 12, #00000033)       // dx, dy, blur, color
    backdrop = frost(26, 1.5)                  // blur, saturate
usage: form-constructors

The value constructors build the composite values decoration slots take: a gradient, a
stroke, a shadow, a frosted backdrop, a gradient `stop`. They are the only call forms a bare
slot admits, and each has one shape — the message names it when the call is wrong. Inside
a `{ }` the same names are ordinary functions, with colors written as numbers.

Their names are reserved: no member may be called `gradient`, `stroke`, `shadow`, `stop`,
or `frost`. A stroke is drawn **inside** the box, so it never enlarges the layout; a shadow
is cast outside it, escaping any clip, as a CSS box-shadow does.

### rules

- A fill slot takes a color, a gradient, or null; an unknown call is not a fill.
  > says: got 'plaid(…)' (not a fill constructor)
  > probe: App [ fill = plaid(1) ]
- Each constructor has one arity; a short call is refused with the shape.
  > says: App.stroke expects a Stroke (stroke(width, color) — drawn inside the box — or null), got 'stroke(…)'
  > probe: App [ stroke = stroke(1) ]

### related

forms: literals, set, constraint
classes: View
guide: 06-style · Style

## literals

name: 12 · 50% · center · navy · #336699 · "text" · true
short: literals
group: Values
family: value
spec: §2 Two delimiters
terms: literal, literals, bare value, percent, named color, hex color, string literal, keyword literal, enum token
syntax:
    width = 240                                // a number
    width = 100%                               // a percent, of the parent
    x = center                                 // a position literal, on x/y
    fill = navy                                // a named color
    fill = #336699                             // a hex color; #RRGGBBAA carries alpha
    text = "one line"                          // a string ends at its line
    text = """
        several lines
        """                                    // a block string
    axis = y                                   // an enum token
usage: form-literals

The bare-slot vocabulary the compiler owns: numbers, percents, the position literals
`center` and `end`, colors by name or hex, strings, booleans, `null`, and the enum tokens
each slot names. A bare literal is the value itself, set once. Inside `{ }` none of this
exists — there you are in TypeScript, where a color is `0x336699` and a size is arithmetic
on the parent.

A `"…"` string ends at its line; long text is a `"""` block. An 8-digit `0x` literal is an
alpha color, never a number — which is why `#RRGGBBAA` and `0xRRGGBBAA` mean the same thing
and a Length refuses it.

### rules

- An enum slot takes one of its tokens; the message lists them.
  > says: SimpleLayout.axis expects an Axis (one of x | y), got 'z'
  > probe: App [ v: View [ layout: SimpleLayout [ axis = z ] ] ]
- An 8-digit 0x is an alpha color, not a number.
  > says: an 8-digit 0x is an alpha color, not a number — write a number in decimal
  > probe: App [ width = 0x11223344 ]
- A quoted string ends at its line.
  > says: a quoted string ends at its line — for multi-line text use a """…""" block, or \n for a literal newline
  > probe: App [ t: Text [ text = "a\nb" ] ]

### related

forms: set, constraint, constructors
classes: View, Text
guide: 02-two-brackets · Two brackets, 06-style · Style

## scope

name: this · parent · classroot · app
short: scope nouns
group: Scope
family: noun
spec: §3 Members and scope
terms: this, parent, classroot, app, scope noun, scope nouns, nouns, root, children, reserved names
syntax:
    this.width                                 // the node the code is written on
    parent.width                               // its parent
    classroot.label                            // the instance of the class being defined
    app.theme                                  // the running application
usage: form-scope

A bare name resolves outward through the enclosing brackets, innermost first — the brackets
are the scope exactly as they are the tree — and the compiler rewrites the read to an
explicit path at compile time. Four reserved words say it explicitly: **`this`**, the node
the code is written on; **`parent`**; **`classroot`**, the instance of the class being
defined, from any depth inside it; and **`app`**, the running application, from anywhere.

Built-ins never resolve outward: every view carries `width`, so a bare `width` is always
*this* node's. `classroot` is legal only inside a `class` body. Two structural members every
View carries, `root` (what `app` compiles to) and `children`, are reserved as well — a child
or attribute named `root` would shadow every `app.…` in the same class.

### rules

- `classroot` names the root of a class you define; it has no meaning on the App.
  > says: 'classroot' is the root of a component you define — valid only inside a class body. This code is in the App, not a class. Reach values here by a bare name, 'this', or 'app'.
  > probe: App [ t: Text [ text = { classroot.name } ] ]
- A scope noun cannot name a child.
  > says: 'app' is a scope noun (language §11) — a child cannot take its name
  > probe: App [ app: View [ ] ]
- A scope noun cannot be declared.
  > says: 'parent' is a scope noun (language §11) — it cannot be declared
  > probe: App [ parent: number = 1 ]
- `root` is the node reference `app` compiles to; nothing may take its name.
  > says: 'root' is the node reference `app` compiles to (`app` is `this.root`) — a child cannot take its name; choose another
  > probe: class Chip extends View [ root: View [ ] ]\nApp [ Chip [ ] ]
- A bare name must resolve up the enclosing brackets.
  > says: cannot resolve 'nothingHere' — not a member of t: Text → App
  > probe: App [ t: Text [ text = { nothingHere } ] ]

### related

forms: class, constraint, child
classes: App, View, Node
guide: 04-tree · The tree

## include

name: include
group: Top level
family: declaration
spec: §4 Composition
terms: include, include another file, split a program, multiple files, import a file
syntax:
    include [ "path.declare" ]
    include [ "a.declare", "b.declare" ]
usage: form-include

Merges another file's **top-level declarations** — its classes, scripts, fonts, styles,
themes, schemas — into this program, once, however many times it is named. It is not a
module system: there are no exports, no namespacing, and no root instance comes across.
Everything merges into one program, and a class in an included file may extend one declared
here.

The path resolves relative to the including file. The standard library needs no include —
its components are auto-included by name — but a library file may be included explicitly,
as the library's own files include each other.

### rules

- The file must exist, relative to the including one.
  > says: cannot find include "nope.declare"
  > probe: include [ "nope.declare" ]\nApp [ ]
- A path is a quoted string.
  > says: an include path is a quoted string
  > probe: include [ nope ]\nApp [ ]

### related

forms: class, use, script
classes: App
guide: 04-tree · The tree, 19-run-check-ship · Run, check, ship

## use

name: use
group: Top level
family: declaration
spec: §4 Composition
terms: use, use directive, keep a component, tree shaking, constructed by name, createView
syntax:
    use [ Name, Other ]
usage: form-use

Keeps components the production build would otherwise drop. The build tree-shakes anything
no tag instantiates; a component your code constructs **by name** at runtime —
`app.createView("Badge")`, an icon named by a string in a control's `iconLeft` — is mentioned
nowhere in the tree, so it would be removed. `use` says it is still needed.

The symptom without it is a component that works in dev, where everything is present, and
is missing from the built app. A menu's `kind` or `icon` record field, an `IconHost`'s
`kind`, and every `createView` call are the places to look.

### rules

- An entry names a built-in or a declared or included class.
  > says: use [ Nope ]: unknown component 'Nope' — a use entry names a built-in or a declared/included class
  > probe: use [ Nope ]\nApp [ ]

### related

forms: class, include
classes: IconHost, Menu, View
guide: 19-run-check-ship · Run, check, ship

## script

name: script
group: Top level
family: declaration
spec: §4 Composition
terms: script, script block, typescript block, helper function, plain typescript, import
syntax:
    script { … }                               // inline TypeScript
    script [ "file.ts" ]                       // the same, from a file
usage: form-script

A top-level block of plain TypeScript, wholly outside the reactive system: constants,
functions, stateful helpers, whole libraries. A program may hold any number of blocks,
inline and files mixed; they share one scope in source order. A file is written
module-style (`export` allowed); an inline block refuses `export`, since its top-level names
are already visible to every `{ }`. A block may `import` ES modules — a relative file, or an
npm package by bare specifier — bundled at compile by a Node host (the dev server, `declarec`,
`verify`); the in-browser compile refuses imports by name.

A constraint may call into script, **opaquely**: it depends on the values it passes, never on
what the function does inside. So pass values, not nodes, and hold state that changes in an
attribute — a script `let` has no cell. This is where arithmetic, formatting, and imported
JavaScript live, so the tree stays about the tree.

### rules

- `export` has no meaning in an inline block.
  > says: 'export' has no meaning in a script { } block — drop the keyword; a top-level name here is already visible to every { } in the program
  > probe: script { export const x = 1 }\nApp [ ]
- A script `let` is not reactive state; a constraint reading it is refused.
  > says: 'n' is mutable state in a script { } block — a module variable has no cell, so nothing can notice it change
  > probe: script { let n = 1 }\nApp [ w: number = { n } ]
- A body may not write a script variable — each body holds a copy, so the write lands nowhere.
  > says: 'n' is a script { } variable — a { } body holds a copy of it, so a write lands nowhere (and throws at runtime). State that changes is an attribute
  > probe: script { let n = 1 }\nApp [ onClick() { n = 2 } ]
- A script constant is not a bare literal; reach it through braces.
  > says: got 'W' — write { W } to bind the attribute
  > probe: script { const W = 10 }\nApp [ width = W ]

### related

forms: constraint, method, include
classes: App
guide: 03-relationships · Relationships, 04-tree · The tree

## font

name: font
group: Top level
family: declaration
spec: §9 Style
terms: font, declare a font, web font, font family, typeface, font face
syntax:
    brand: Font [ Face [ src = "brand-400.woff2" ], Face [ src = "brand-700.woff2", weight = bold ] ]
    ui: Font [ family = "Helvetica Neue" ]
    fontFamily = { [app.brand, "sans-serif"] }
usage: form-font

A typeface is an **object in the tree**, not a top-level declaration: a `Font` with `Face`
children, usually on the App, or a `Font [ family = "…" ]` with no faces for a system font.
A family slot holds it — `fontFamily = { app.brand }`, or a list in a `{ }`,
`{ [app.brand, "sans-serif"] }` — so switching fonts is an assignment. `loaded` and
`failed` are the font's facts; `wait` and `late` say what loading is worth. A Face's
`weight` is a keyword, a number 1–1000, or `range(lo, hi)` for a variable font file. See
the `Font` and `Face` classes.

### rules

- `font Name [ … ]` at the top level is retired — a font is an object in the tree.
  > says: 'font Body [ … ]' is no longer a top-level declaration — a font is an object in the tree
  > probe: font Body [ family = "Helvetica" ]\nApp [ ]
- A font name where a family goes is not a family — name the object in a `{ }`.
  > says: 'Nope' is not a family — a font is an object in the tree
  > probe: App [ fontFamily = [Nope, "system-ui"] ]
- A Face weight is a keyword, a whole number 1–1000, or range(lo, hi) with lo < hi.
  > says: a numeric weight is a whole number 1–1000, not 1200
  > probe: App [ f: Font [ Face [ src = "f.woff2", weight = 1200 ] ] ]
- A Face lives inside a Font, and a Font holds Face children only.
  > says: a Face belongs inside a Font
  > probe: App [ Face [ src = "x.woff2" ] ]

### related

forms: style, theme
classes: Font, Face, Text
guide: 06-style · Style

## style

name: style
group: Top level
family: declaration
spec: §9 Style
terms: style, style block, named style, reusable style, style bundle, span class, styled run
syntax:
    style Keyword [ textColor = #C678DD, fontWeight = bold ]
    HTMLText [ html = "<span class='Keyword'>class</span>" ]     // a run wears the bundle by name
    d.fillText("class", 0, 20, Keyword)                          // so does a drawn run
usage: form-style

A named **record of text attributes** — the style of a run of text that has no view of its
own. `<span class='Keyword'>` inside `HTMLText` or `Markdown` wears it, and a drawing's
`d.fillText` / `d.strokeText` and `measureText` take it. Its name is a value in any `{ }`,
typed by the fields it sets (`Keyword.textColor`).

Like a theme record, a bundle holds **literal values only**: it has no place in the tree, so
nothing in it can depend on where it is used. A look that should follow something — the
theme, dark mode — is written where it is used: a `textStyles = { … }` map on the rich text,
or a spread in a drawing, `{ ...Keyword, textColor: provided("theme").accent }`. Top-level
declared names are capitalized by convention.

For whole views there is no bundle: reuse a look by **subclassing** (`class Card extends
View [ … ]`), and provide values downward with `theme` and the face attributes.

### rules

- A bundle sets text attributes; a name `Text` does not declare is refused.
  > says: style Keyword sets 'frob', which Text does not declare
  > probe: style Keyword [ frob = 1 ]\nApp [ ]
- A bundle holds attribute sets only — no children, methods, or declarations.
  > says: style Keyword: a bundle has no children — attribute sets only
  > probe: style Keyword [ View [ ] ]\nApp [ ]
- A bundle's fields are literal values — a `{ }` field is written where it is used instead.
  > says: style Keyword.textColor: a style holds literal values only
  > probe: style Keyword [ textColor = { provided("theme").accent } ]\nApp [ ]
- Its name shares one namespace with classes, themes, and fonts.
  > says: there is already a component, theme, style, or font named 'Keyword'
  > probe: style Keyword [ textColor = #336699 ]\nclass Keyword extends View [ ]\nApp [ ]

### related

forms: theme, provided, font
classes: HTMLText, Markdown
guide: 06-style · Style

## theme

name: theme
group: Top level
family: declaration
spec: §9 Style
terms: theme, tokens, design tokens, theming, skin, reskin, dark mode, preset, token record
syntax:
    theme Brand [ accent = #CC3333, surface = #FFF7F5 ]     // a named token record
    App [ theme = Brand ]                                    // PROVIDE it — a plain set, no keyword
    fill = { provided("theme").surface }                     // READ a token anywhere below
    theme = { { ...provided("theme"), accent: 0xCC3333 } }   // a descendant provides a modified one
usage: form-theme

A theme is a **named record of tokens** — colours, sizes, decorations — declared at the top
level like a class or a font. Token names are free; values are plain literals or value
constructors. The library ships presets in scope by name (`SanFrancisco`, `Cupertino`,
`MountainView`, `Redmond`, each with a `…Dark` companion), and `theme Brand [ … ]` declares
your own.

Providing and reading are the two halves of **provided values**. `theme = Brand` on the App
provides the record to the whole tree — a plain set, no keyword. `provided("theme").accent`
reads a token from the nearest provider; the standard library reads it *for* you (a `Button`
styles off `provided("theme")` inside `Control`), so an app that only sets `theme` never
writes the read. Because `theme` is an ordinary reactive value, dark mode is one expression
— `theme = { app.dark ? BrandDark : Brand }` — and a subtree re-skins partially by providing
a spread copy lower down. The library reads specific token names, so build a theme from a
preset rather than an empty record.

### rules

- A theme named at a use site must be a preset or one the program declares.
  > says: no theme named 'Nope' — declared themes:
  > probe: App [ theme = Nope ]
- A token record holds tokens only — no children, methods, or declarations.
  > says: theme T: a token record has no children
  > probe: theme T [ View [ ] ]\nApp [ ]
- A token is a plain value or a value constructor, never a datapath.
  > says: theme T.accent: a token is a number, string, boolean, color, or a value constructor (gradient/stroke/shadow/frost) — got the datapath :x
  > probe: theme T [ accent = :x ]\nApp [ ]
- Its name shares one namespace with classes, styles, and fonts.
  > says: there is already a component, theme, style, or font named 'T'
  > probe: theme T [ accent = #336699 ]\nclass T extends View [ ]\nApp [ ]

### related

forms: provided, style, set
classes: Control, App
guide: 06-style · Style

## provided

name: provided("name")
short: provided()
group: Values
family: read
spec: §9 Style
terms: provided, provided value, provided values, provide, provision, context, inherited value, ancestor value, cascade
syntax:
    provided("name")                           // the nearest ancestor's value under name
    provided("name", default)                  // … or the default when no ancestor provides one
    density: number = 2                        // PROVIDE: declare a typed value on an ancestor
    fontSize = 13                              // a built-in provided name is set bare on any container
usage: form-provided

The one explicit **up-the-tree read**: `provided("name")` is the value the nearest ancestor
makes available under that name — bare in `[ ]` like `gradient(…)`, or a call in `{ }`.
*Providing* is just holding a value: declare a typed attribute on an ancestor
(`density: number = 2`) and every descendant may read it; the built-in provided names —
the text face, `theme`, `iconSize`, the rich-text slots — need no declaration at all, so
`fontSize = 13` on a container provides it to every `Text` beneath. A value set locally
always outranks a provided one.

It is explicit on purpose: the read reaches past this node, and a non-local dependency is
worth showing. You rarely write it — `Text` and the library widgets read the face and theme
values for you; you write it where your own code wants a value from above. A read that
finds no provider falls to its default, else fails at boot naming the value.

### rules

- A read with no provider and no default fails at boot, naming the value.
  > says: provided("nothing"): no ancestor provides 'nothing', and this read declares no default
  > probe: App [ Text [ text = { "" + provided("nothing") } ] ]
- A provision is a value or a { }, never a datapath.
  > says: App.fontSize = :x: a provided value is a plain value or a { }, not a datapath
  > probe: App [ fontSize = :x ]
- A provided value of your own is introduced with a type; a bare unknown name is a typo, not a provision.
  > says: App has no attribute 'accent'
  > probe: App [ accent = #CC3333 ]

### related

forms: theme, declare, set, scope
classes: Text, Control, Icon
guide: 06-style · Style, 04-tree · The tree

## schema

name: schema
group: Top level
family: declaration
spec: §7 Data
terms: schema, declare a schema, data shape, typed data, record type, schema declaration
syntax:
    schema Task [ id: string, done: boolean, status: "open" | "closed", note?: string ]
    d: DataSource [ url = "tasks.json", schema = [ tasks[]: Task ] ]
    sel: Task = null                           // the name in any type position
usage: form-schema

A named data shape, declared at the top level like a class, and a **type** in the one type
system: use the name in any type position — a declared attribute, a parameter, a return, a
field of another schema — and declare a dataset's document with it. The dataset's `.value`
is then typed, so a misspelled field dies at compile time; the runtime enforces the same
declaration at every boundary — arrival, the literal body, and the mutation verbs — so
malformed data yields `.failed` rather than `undefined` three bindings deep.

Field markers: `[]` for an array, `?` for optional. Field types are `string`, `number`,
`boolean`, `any`, a literal union of strings or numbers, another schema's name, or a nested
`[ … ]`. Extra keys always pass — a schema declares what the program relies on, not
everything the document carries.

### rules

- A field's type is one of the shape vocabulary; an unknown name is refused with the list.
  > says: 'a: Widget' names no schema — declared schemas: T (a field's type is string | number | boolean | any, a schema name, a literal union, or a nested [ … ])
  > probe: schema T [ a: Widget ]\nApp [ ]
- One schema per name.
  > says: schema 'T' is declared twice
  > probe: schema T [ a: string ]\nschema T [ b: string ]\nApp [ ]
- A field carries a type after its markers.
  > says: expected a shape field's type — string | number | boolean | any, a schema name, a literal union, or a nested [ … ], got ']'
  > probe: schema T [ a?: ]\nApp [ ]

### related

forms: datapath, declare, twoway
classes: Dataset, DataSource
guide: 09-data · Data

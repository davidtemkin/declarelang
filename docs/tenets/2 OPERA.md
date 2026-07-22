# How you write it

The shape of the language and how programs compose — the promises about the
authoring surface.

### OPERA-1 — Two delimiters carry the whole model
`[ … ]` is the view tree — a component's attributes, children, and declarations,
its bracket nesting *being* the tree. `{ … }` is TypeScript — a value, a handler
body, a script. Those two are the entire mental model.
*Held in:* declare.md §2; getstarted ("Two delimiters carry the whole model").

### OPERA-2 — All real logic is ordinary TypeScript
Everything inside `{ }` is ordinary TypeScript — no new expression language to
learn — type-checked with full knowledge of every component's attributes. What
you (or a model) already know about TypeScript carries over unchanged.
*Held in:* declare.md §1 ("all real logic is ordinary TypeScript"); FAQ ("There is no new expression language to learn").

### OPERA-3 — No CSS, by design
Styling is part of the language: paint attributes on views, theme records that
reskin a whole subtree from one place, named style bundles switched at runtime.
No cascade, no specificity, no selectors. CSS *knowledge* transfers — colors,
font stacks, shadows read the same — but there is no stylesheet, which is also
what makes a non-DOM renderer possible.
*Held in:* FAQ ("Can I use CSS to style a Declare app? No — and that's a feature").

### OPERA-4 — Values derive down, information travels up, internals stay private
A component is a class; its attributes are its public interface, and values
*derive down* through constraints. Information travels back *up* through events a
component declares and fires — delivered to the handler that declared interest,
never bubbled through the tree. Inside, code reaches other parts only through
explicit scopes (`this`, `parent`, `classroot`, `app`), so a component's
internals stay its own.
*Held in:* FAQ ("How do encapsulation and composition work"); declare.md.

### OPERA-5 — The library is written in Declare, with no privileged API
The entire standard library is written in Declare itself, in readable source you
can open and live-edit. There is no privileged component API underneath: library
components are the same kind of thing your components are, used identically —
including replication over data.
*Held in:* FAQ ("How are Declare's UI components created?").

### OPERA-6 — Data binds declaratively
Data enters the way everything else does: a `Dataset` or fetched `DataSource`, a
`datapath` cursor whose descendants read relative to it, replication per element
of a bound array, and two-way binding for editable fields. Large collections bind
a *computed* window over the source rather than replicating everything.
*Held in:* FAQ ("How do I get data into an app?").

# What Declare is

The nature of the thing — the promises about what kind of language it is.

### ROTAS-1 — A language, not a framework
Declare is a domain-specific language for user interfaces — the way SQL is a DSL
for queries — not a library inside JavaScript. There is no framework runtime to
orchestrate, no lifecycle to manage.
*Held in:* homepage hero; FAQ ("It's a language, not a framework inside JavaScript").

### ROTAS-2 — The UI is a standing structure, not a re-run function
An interface is a standing tree that values flow through when things change —
never a function the platform re-runs and diffs. There is no re-render, no
virtual-DOM pass, no reconciliation.
*Held in:* declare.md §1 ("A binding is a relationship, not a callback … standing expressions the runtime keeps true"); FAQ ("the UI is a *standing structure* … nothing re-renders because nothing was ever a render").

### ROTAS-3 — One program, any renderer
One source tree renders to managed DOM or directly to pixels on a canvas — and to
a screenless headless renderer — with the same layout and input handling. The
language owns its semantics; no DOM assumptions leak into a program. The DOM and
canvas renderers are held equal, verified pixel-for-pixel.
*Held in:* FAQ ("renderer-independence"); declare.md §12 ("the same file runs unchanged in a native Mac host, held to the browser renderers by a conformance suite").

### ROTAS-4 — One tree, one language
Structure, style, and behavior are one tree in one language — not the HTML/CSS/JS
trinity. There is no separate stylesheet, template, and script to keep in sync.
*Held in:* FAQ ("There is also no HTML/CSS/JS trinity — structure, style, and behavior are one tree in one language").

### ROTAS-5 — Compiled, everywhere
Declare is a compiled language, and the compiler runs anywhere the program does —
in Node and in the browser, the same compiler with byte-identical output.
*Held in:* FAQ ("The compiler itself runs anywhere — in Node, or in the browser"); declare.md §1.

### ROTAS-6 — A successor that kept the convictions
Declare is a from-the-ground-up successor to OpenLaszlo (2002): it keeps the
declarative tree, constraint-based reactivity, and a real compiler, and rebuilds
everything else — keyword-free syntax, TypeScript for logic, DOM and canvas
renderers, in-browser compilation — for the modern, LLM era.
*Held in:* FAQ ("Where does Declare come from?").

# Declare: Frequently Asked Questions

## The basics

### What is Declare?

Declare is a programming language for user interfaces — a domain-specific language, the way SQL is a domain-specific language for querying data. You describe an interface as a tree of components with attributes; any attribute can be a live expression, and when the things it reads change, everything that depends on it updates. All real logic is ordinary TypeScript. Programs compile in the browser or ahead of time, and one program renders either to the DOM or directly to pixels on a canvas.

### Why should I use it?

Because most of what makes UI code hard isn't your application — it's the plumbing. In Declare there is no render lifecycle to manage, no state synchronization to orchestrate, no CSS cascade to fight, no build pipeline to configure. An application is a readable tree of declarations: the flagship calendar — four views, continuous zoom, drag-to-reschedule — is a few hundred lines you can read end to end, and it ships smaller than the *runtime alone* of most frameworks. And Declare is built for the era when much code is written by machines: the language is small enough to hand a model in its entirety, and strict enough to verify what comes back.

### What kinds of applications is it designed to build?

Continuous, dynamic interfaces — the app-like web rather than the page-like web: calendars, dashboards, editors, data tools, product sites. Text and documents are first-class too (Markdown rendering is built in), so content-heavy apps work well. Everything on this site is a Declare program: the homepage you're reading, the documentation app, the calendar.

### What specific features make it well-suited to continuous, dynamic user experiences?

Time and change live in the language instead of being bolted on:

- **Constraints** — any attribute can be a `{ }` expression; the compiler works out what it depends on, and it stays current. No re-render ceremony, no manual subscriptions.
- **Animation as declaration** — springs and animators are attributes; states are named bundles of overrides you can be *in* or *not in*.
- **Layout as an attribute** — how a view arranges its children is a value you set, not a system you fight.
- **Data binding** — UI replicates over data with a cursor (`datapath`), and two-way binding connects editable fields to the data they edit.
- **One input model** — pointer and keyboard events are routed identically on every renderer, with a built-in keyboard focus system.

### How is Declare different from current languages and frameworks?

It's a language, not a framework inside JavaScript. In React and its relatives, the UI is a function you re-run — the framework diffs the output and patches the page, and you manage the machinery (hooks, memoization, effects) that keeps re-running affordable. In Declare, the UI is a *standing structure*: values flow through it when things change, and nothing re-renders because nothing was ever a render. There is also no HTML/CSS/JS trinity — structure, style, and behavior are one tree in one language. Its nearest relatives are declarative-tree systems like SwiftUI and QML, but Declare is web-native, compiled, renderer-independent, and uses TypeScript — not a new scripting dialect — for logic.

## How it works

### What does the compiler do, and what are the benefits of Declare being a compiled language?

The compiler parses the declarations, statically extracts every constraint's dependencies, type-checks every `{ }` body as real TypeScript against the components' typed APIs, resolves the components you use (the standard library auto-includes by name), and emits a self-contained program. The benefits: errors surface before the program runs, with messages that name the fix; reactivity is *derived by the compiler*, not guessed at runtime, so behavior is predictable and analyzable by tools; production output is small; and programs are data — the same compiler powers the documentation system, static extraction for crawlers, and live editing. The compiler itself runs anywhere — in Node, or in the browser.

### What is the relationship of Declare's declarative elements to TypeScript?

The `[ ]` structure is Declare; everything inside `{ }` — expressions, event handlers, methods — is ordinary TypeScript, type-checked with full knowledge of every component's attributes. There is no new expression language to learn. The declarative layer contributes structure and reactivity; TypeScript contributes logic — and everything you (or your model) already know about it carries over.

### How do encapsulation and composition work in Declare?

A component is a class: `class Card extends View [ … ]`. Its attributes are its public interface — parents set them, and values *derive down* through constraints. Information travels back *up* through events a component declares and fires; events are delivered to the handler that declared interest, never bubbled through the tree. Inside a component, code reaches other parts through explicit scopes — `this`, `parent`, `classroot` (the component instance the code belongs to), and `app` — so a component's internals stay its own. Composition is just nesting: your classes are used exactly like built-ins, including replication over data.

### How are Declare's UI components created?

By writing classes in Declare. The entire standard library — Button, Slider, Checkbox, Switch, RadioGroup, ProgressBar, and the rest — is written in Declare itself, in readable source you can open (and live-edit) on this site. There is no privileged component API underneath: the library components are the same kind of thing your components are.

### Can I use CSS to style a Declare app?

No — and that's a feature. Styling is part of the language: paint attributes on views (`fill`, `cornerRadius`, `stroke`, `shadow`, text styles), theme records that reskin an entire subtree from one place, and named style bundles a subtree can switch between at runtime. Your CSS *knowledge* transfers — colors (named or hex), font stacks, shadows all read the same — but there is no cascade, no specificity, no selector debugging. This is also what makes renderer independence possible: the canvas renderer couldn't consult a stylesheet the browser owns.

### Can I intermix React and Declare code?

Side by side, yes; interleaved, no. A Declare app embeds in any page — including a React page (the repository carries a React re-implementation of this site's homepage, hosting live Declare demos, built for exactly this comparison). And inside a Declare program, the `HTML` island hosts foreign content — a video player, a code editor, a React widget — in a box the Declare tree sizes and positions. What you can't do is put a React component *inside* the Declare tree as if it were a Declare view, or vice versa. The boundary is always an island, which is what keeps both sides comprehensible.

### How do I deep-link into an app? Is there a router?

There's no router object — location is an attribute, like everything else. An app declares `location` on its root and the host wires it to the URL fragment: writing it navigates (one history entry per change), the back button writes it back, and a deep link is just an initial value — state *derives* from location the same way everything else derives. The documentation app on this site works this way: `#guide/27-data` opens that chapter directly, and a trailing anchor can scroll a specific heading into view. Apps opt in — a demo that declares no location simply has none — and static extraction follows an app's locations, so deep-linkable content is also crawlable content.

### How do Declare-written sites handle crawlers and SEO without server-side rendering?

Through static extraction, which is built into the compiler. The compiler runs the program headlessly to its settled state and serializes its actual content as semantic HTML — real headings, real paragraphs, real links — which is baked into the page at build time. A crawler (or an AI reading the web, which typically runs no JavaScript at all) reads that document; a person gets the live app, which replaces it at boot. Content reachable through in-app navigation is included, and links inside the app become real links in the document. It works on a plain static host — this site runs on GitHub Pages with no server at all.

### What benefits does in-browser compilation bring? Can I ship a Declare site without the compiler?

Because the compiler runs in the page, the page can edit and re-run itself: every sample on this site is live-editable — change the source and the app re-renders as you type. It restores view-source culture: "View and edit source" on any app here opens the viewer — a highlighted reader, the verbatim source, and a live-edit tab (`?view=edit` on the program's URL). And it means development needs no build step — the dev server and the browser use the *same* compiler with byte-identical output. For production you don't ship the compiler: the `declarec` build precompiles everything into a small artifact, no compiler aboard.

### What does Declare's renderer-independence bring to the table?

One program renders through managed DOM elements or directly to a single canvas — same tree, same layout, same input handling, verified pixel-for-pixel against each other in the test suite (append `?render=canvas` to any app URL to see it). What this buys: the language owns its semantics — no DOM assumptions leak into your program; the canvas path suits environments where a DOM isn't available or isn't fast enough; and future renderers can be added without rewriting applications. A third, headless renderer runs programs with no screen at all — it's what powers static extraction and testing.

## Performance

### What should I expect in terms of performance — download size and interactive responsiveness?

Concretely, from the flagship comparison (a full-featured calendar built twice, once in Declare and once in React, measured side by side):

- **Size**: the entire Declare calendar — application *and* runtime — ships at about 50 KB gzipped as served on this site (the homepage's number is measured live from the deployed artifacts, which is why it varies by a kilobyte); the `declarec` production build is smaller still, around 45 KB. The React equivalent is roughly twice the wire weight, with more than twice the source code.
- **Responsiveness**: measured input latency was several times lower in the Declare version. When you drag an event, the constraint graph updates exactly what changed and paints — there is no virtual-DOM pass between your gesture and the pixels. Animations ride compositor-native paths (CSS transforms and painted properties on the DOM renderer; direct paint on canvas), so they run at the display's full rate — 120 fps on a ProMotion screen.
- **Startup**: precompiled production builds start immediately. The live-compile pages (the editable samples) pay a one-time compiler download on a cold visit; warm visits start in around a tenth of a second. The one honest trade: a framework with no in-browser compiler wins the very first cold load — Declare's production path closes that gap by precompiling.

Live numbers are on the homepage, measured from the deployed artifacts themselves.

## Declare and LLMs

### What benefits does Declare bring for LLM coding, where a human may never read or write the code?

When machines write the code, the properties that matter change. Familiarity matters less; *verifiability* matters more. Declare's bet: give the model a small, closed, regular language, and give the toolchain the strictness to catch what the model gets wrong. Every compile type-checks every expression — a hallucinated attribute or misused API is an error with a message that names the fix, so the model's write-check-revise loop converges fast. And because an entire application is a few hundred lines of declarations, what the model produced can actually be audited — by a person or by another model. The calendar on this site reports its own number: zero lines written by hand.

### The calendar says "0 lines written by hand." What did that actually involve?

A person directed; a model wrote. The calendar was built by describing what was wanted and letting an LLM write the Declare — every line — with the compiler in the loop: each attempt was compiled and type-checked, the diagnostics steered the next revision, and the running app was the judge. The person's work was product work — deciding what the calendar should be, reviewing behavior, and pushing back — not typing code. That's the workflow the language is designed around: the human owns intent, the model owns the text, and the toolchain keeps the text honest.

### How can Declare, with no training data to speak of, be useful to an LLM — or compete with billions of lines of training corpus?

Two ways. First, the language is small enough that its *entire definition* fits in a model's context window — one file, [docs/declare.md](https://github.com/davidtemkin/declarelang/blob/main/docs/declare.md), about ten thousand tokens: a small fraction of a modern context window. A model doesn't need to have trained on a language it can hold the complete spec of while writing; recent research (cited in the essay on this site) shows models write never-before-seen languages competently from a spec in context. Second, most of what an LLM writes in a Declare program *is* covered by billions of lines of training data — the logic is ordinary TypeScript. Only the small declarative shell is new, and it's regular enough to learn from the spec. For agent workflows, the repository ships the same knowledge as an installable agent skill ([skill/](https://github.com/davidtemkin/declarelang/tree/main/skill) — auto-discovered by Claude Code, usable as plain instructions by any coding agent).

### What does Declare do to optimize for reliability and correctness of LLM-generated code?

- **Mandatory type-checking** — every `{ }` body, every compile, no opt-out; the checker is held to zero false positives across the repository's own corpus (every app, library component, and documentation example it ships), so an error always means something is actually wrong.
- **Diagnostics that name the fix** — messages are written to steer the *next* attempt, including "did you mean" guidance for common instincts from other frameworks (e.g., reaching for a CSS property).
- **No magic** — Declare consistently chooses predictability over cleverness: dependencies are extracted statically, events don't bubble, there's one way to say most things. Code that looks right *is* right more often, and code that's wrong fails loudly.
- **Verification tooling** — a `verify` command compiles, type-checks, and actually boots a program headlessly, so an agent can prove its output runs before handing it back.

### What has been done during Declare's development to optimize for LLM usage? What methodology ensures it works?

It's tested, not assumed. Declare's development runs an evaluation harness: a ladder of application-building tasks given to models cold, in one-shot and iterated configurations, across model tiers. Failures feed back into the language, the diagnostics, and the documentation — several language changes exist specifically because evals showed models tripping. The documentation is written to double as training material: plain declarative prose, and every code fence in the guide is compiled and booted by the test suite, so nothing a model reads is stale or wrong. The result is a feedback loop — spec, diagnostics, evals — rather than a hope.

## Background and practicalities

### Where does Declare come from?

Declare is a from-the-ground-up modern successor to OpenLaszlo, the open-source rich-internet-application platform first released in 2002. OpenLaszlo had the core ideas remarkably early: interfaces declared as trees, attributes connected by live constraints, declarative data binding, compiled applications running in the browser — a decade before today's declarative frameworks. Declare  keeps those convictions — the declarative tree, constraint-based reactivity, a real compiler — while rebuilding everything else for the modern era: a clean keyword-free syntax, TypeScript for logic, DOM and canvas renderers, in-browser compilation, and a design shaped from day one for the LLM era.

### Can I try it without installing anything?

Yes. Every sample on this site is live-editable in your browser — open one, change the source, and watch it re-render. The whole-page editor will even let you edit the homepage you're standing on. Nothing to install; the compiler is already in the page.

### What do I need to do to get set up for development? What are the prerequisites?

Node.js and git. Then:

```
git clone https://github.com/davidtemkin/declarelang.git && cd declarelang
npm install
npm start
```

That starts the dev server; write a program to `my-apps/hello.declare` and browse to its URL — on the dev server, the program's URL is the app's address. The repository ships prebuilt, so there's no build step before first run. (On a plain static host, the entry point is a page — `index.html`, or a production build's — rather than the bare `.declare` file; the site's service worker upgrades program URLs after a first visit.)

### Can I use Declare inside my own project? Is there an npm package?

Today, the repository is the distribution: you clone it, and your apps live in a directory inside it (`my-apps/`), served by its dev server and built by its `declarec` tool. What you *ship* is fully standalone — a production build is a small set of static files you can host anywhere, with no trace of the toolchain. There's no npm package yet; treating the checkout as your toolchain (and `git pull` as your upgrade path) is the current model.

### Is there editor support — syntax highlighting, autocomplete, a VS Code extension?

Not yet as a standalone extension. The first-class editing surface today is the toolchain's own: every program URL opens a highlighted reader and a live editor in the browser, and the compiler — with its mandatory type-checking and fix-naming diagnostics — is the authority an editor plugin would defer to anyway. The language's surface is small enough that most editors' TypeScript support already helps inside `{ }` bodies. A dedicated editor extension is an obvious gap, honestly labeled.

### Can I save or share something I've edited in the browser?

Your live edits belong to the session — copy the source out to keep it (it's one file). There's no playground permalink service yet: this site runs on a static host with no server to store shared snippets. The durable path is the ordinary one — save the `.declare` file, serve it from the dev server or any static host, and the program's URL is shareable from there.

### How do I test a Declare app?

Three layers. The `verify` command is the cheapest and catches the most: it compiles, type-checks, and actually boots a program headlessly — proof it runs, no browser needed, ideal in CI or an agent loop. Because programs settle deterministically, you can drive one headlessly and assert on the resulting tree — that's how Declare's own test suite works. And a Declare app is a web page, so standard end-to-end tooling (Playwright, Puppeteer) applies unchanged. The platform itself is held to a stricter bar: the DOM and canvas renderers are compared pixel-for-pixel on every change.

### Is Declare accessible?

On the DOM renderer — the default — an app is real elements: real text (selectable, findable), native form fields with native caret, selection and IME behavior, and a built-in keyboard focus system with tab navigation. That's a substantially better baseline than a typical canvas-drawn or div-soup UI. The canvas renderer draws pixels and does not currently expose text to assistive technology — choose the DOM renderer where accessibility matters, which costs nothing since the same program runs on both. Static extraction is for crawlers, not a screen-reader substitute, and it's fair to say accessibility depth — ARIA roles, announcements — is an area where the platform is still young.

### What do I need to learn in order to use it, with or without an LLM?

The shape of the language: `[ ]` declares structure, `{ }` holds TypeScript, attributes can be constraints, events get handlers. Then about twenty built-in classes and a standard library of controls. If you know TypeScript, the guide's tutorial has you productive in an afternoon; the entire language reference is one readable file. Working with an LLM, you hand it that file (or install the packaged agent skill) and describe what you want — the compiler's diagnostics keep the loop honest either way.

### How do I get data into an app?

Declaratively, like everything else. A `Dataset` holds inline or computed data; a `DataSource` fetches JSON. UI binds to data with a cursor — set `datapath` on a view and its descendants read relative to it; bind it to an array and the view replicates per element. Two-way binding connects a text field to the data it edits. When data changes, everything bound to it updates — the same reactivity as the rest of the language. For large collections, bind a *computed* dataset — a derived window over the source — rather than replicating everything; replication builds what you bind.

### How mature is Declare? Should I build on it today?

Declare is young and moving quickly. The language surface is deliberately small and increasingly settled; the toolchain — compiler, type-checker, dev server, production builds, docs, evals — is real and tested (this entire site ships on it). Expect evolution, and expect the repository to be the source of truth. If you're evaluating it for production, the honest advice is: try it on something real but bounded — and [open an issue on GitHub](https://github.com/davidtemkin/declarelang/issues) with what you find; at this stage, that conversation shapes the language.

### What browsers and devices does it support?

Modern evergreen browsers. Input is a unified pointer model, so touch works alongside mouse and keyboard; layouts are constraint-driven, so apps adapt to the window they're given. The DOM renderer produces real elements — native text selection, native form fields, built-in keyboard focus and tab navigation.

### What license is Declare offered under?

MIT. The complete source — compiler, runtime, standard library, documentation, and this site — is at [github.com/davidtemkin/declarelang](https://github.com/davidtemkin/declarelang).

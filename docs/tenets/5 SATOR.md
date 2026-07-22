# How it ships

Delivery, hosting, and the honest posture — the promises about running and
shipping a Declare program.

### SATOR-1 — Programs are data
A compiled program is data the toolchain can read, so one compiler powers the
documentation system, static extraction for crawlers, and live editing alike —
not three separate pipelines.
*Held in:* FAQ ("programs are data — the same compiler powers the documentation system, static extraction for crawlers, and live editing").

### SATOR-2 — What a visitor sees and what a crawler sees can never drift
Static extraction is built into the compiler: it runs the program headlessly to
its settled state and serializes the actual content as semantic HTML — real
headings, paragraphs, links — baked into the page at build time. A crawler (or an
AI reading the web) reads that; a person gets the live app that replaces it at
boot. No server-side rendering, no hydration — it works on a plain static host.
*Held in:* FAQ ("How do Declare-written sites handle crawlers and SEO"); the "why" essay ("what a visitor sees and what a crawler sees can never drift").

### SATOR-3 — In-browser compilation, and no build step to develop
Because the compiler runs in the page, a page can edit and re-run itself: every
sample is live-editable, and view-source culture is restored. Development needs no
build step — the dev server and the browser use the *same* compiler with
byte-identical output.
*Held in:* FAQ ("What benefits does in-browser compilation bring"); getstarted ("no build step").

### SATOR-4 — You don't ship the compiler
For production, `declarec` precompiles everything into a small, self-contained
artifact — a set of static files you can host anywhere, with no trace of the
toolchain and no compiler aboard.
*Held in:* FAQ ("For production you don't ship the compiler").

### SATOR-5 — The program's URL is the app's address
A program is addressed by its own URL: on the dev server, browse to a `.declare`
file's URL and get the running app. The address is the program, not a route
registered elsewhere.
*Held in:* getstarted ("the program URL is the app's address"); FAQ.

### SATOR-6 — Small, and fast where it counts
A full application ships small — the flagship calendar, application *and* runtime,
at roughly 54 KB gzipped, smaller than the runtime alone of most frameworks.
Input latency is several times lower than the equivalent framework build, with no
virtual-DOM pass between gesture and pixels, and animation runs at the display's
full rate. The homepage reports the live figures, measured from the deployed
artifacts on every commit.
*Held in:* FAQ ("What should I expect in terms of performance").

### SATOR-7 — Honest about the trades and the gaps
The promises come with their limits stated plainly: a framework with no in-browser
compiler wins the very first cold load (the production path closes the gap by
precompiling); Declare is young and the repository *is* the distribution and the
source of truth; and accessibility depth, an npm package, and a dedicated editor
extension are named, unhidden gaps.
*Held in:* FAQ ("Startup" trade; "How mature is Declare?"; "Is Declare accessible?"; "Is there editor support?").

### SATOR-8 — Open, MIT, entirely public
The complete source — compiler, runtime, standard library, documentation, and the
site itself — is public under the MIT license.
*Held in:* FAQ ("What license is Declare offered under?").

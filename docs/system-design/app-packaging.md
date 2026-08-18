# App packaging — what travels with a built program

**Status: DESIGNED, NOT YET BUILT, 2026-08-18** (David's ruling: "it's a file, unless
there's an http[s] in front of the source, and the files just are considered packaged;
http sources — regardless of type, media, datasource, font — are not, ever"). This is
the design record for `declarec`'s asset collection. The operational page for building an
app is [`operational/verify.md`](../operational/verify.md) and the CLI itself is
`tools/declarec.mjs`.

This is the *second* pass at this design; the first was worked out in a conversation and
never written down, so it was lost. Hence this file.

## 1. Intention

`declarec` emits a directory that is meant to be **detachable**: copy it anywhere, serve
it as dumb files, and the program runs. Today that promise is only half kept. The
compiled program travels; the app's own *resources* — images, fonts, audio, video, the
JSON a `DataSource` reads — travel only by accident, because the emitter copies the
program's directory wholesale rather than collecting what the program actually names.

A detachable app must contain everything it is entitled to load from itself, and nothing
that belongs to the development tree or to the platform.

## 2. The rule

> **A reference with a host is remote and never travels. Everything else is a file, and
> it is packaged.**

That is the whole classification, and it needs no new syntax: the URL grammar already
carries it. `https://api.example.com/rates` names another machine; `data/events.json`
names something beside the program. It applies uniformly to every kind of resource —
`Image.src`, a `Face`'s `src`, a `DataSource.url`, audio, video — because the question
"does this belong to the app?" is a property of the reference, not of the medium.

**This is OpenLaszlo's rule**, arrived at independently and then confirmed against the
source (`openlaszlo-4.9.0-src`, `CompilationEnvironment.adjustRelativeURL`):

```java
if (!url.getHost().equals("")) return string;      // different host → leave it alone
if (url.getPath().startsWith("/")) return string;  // server-absolute → leave it alone
… otherwise rewrite the path relative to destDir   // relative → it travels
```

Note the second clause: a **server-absolute** path (`/assets/logo.png`) is also left
alone. It names a location on whatever host serves the app, which the package cannot
provide, so it is remote in every sense that matters here.

A `file:` scheme was considered as an explicit marker for "packaged" and rejected. It
states what relative-vs-absolute already states, and it could not be the runtime form
anyway — a page served over http cannot fetch `file:` — so it would have to be a
compile-time marker that gets rewritten, which is a second spelling of the same fact.

## 3. What a program can be asked, and what it cannot

Classification is easy. **Enumeration** is the real problem: a reference may be a literal
the compiler can read, or a `{ }` constraint holding an expression it cannot evaluate.
Sorting the corpus by *why* a reference is computed shows the boundary precisely.

| | shape | example | recoverable? |
|---|---|---|---|
| **A** | plain literal | `src = "resources/fonts/vera.ttf"` | yes, directly |
| **B** | literal inside an expression | `url = { app.searchQ != "" ? "search-index.json" : "" }` | yes — the filename is a string literal in the body |
| **C** | indirection | `src = { classroot.shot }`, assigned `src = "shots/calendar.webp"` at the use site | yes — the literal is elsewhere in the same program |
| **D** | data-driven | `url = { "chapters/" + classroot.cid + ".json" }` where `cid: string = { :id }` | **no** — the set lives in data |

A, B and C all fall to **one** mechanism: scan every string literal in the program,
including inside `{ }` bodies. No dataflow analysis is required — C looks opaque but the
literal is sitting at the use site one level up.

**D is the boundary — but not an absolute one, and an earlier draft overstated it.** It
claimed enumerating `apps/docs`'s 22 chapters was impossible because the ids live in data.
That is wrong: the data is *local*, and the chain to it is *declarative*.

```declare
docs: DataSource [ url = "../../docs/declare-model.json" ]   // local; the build packages
                                                             // it anyway (§5)
ChapterDetail [ datapath = :guide[], cid = :id ]             // declarative binding
url = { "chapters/" + classroot.cid + ".json" }              // template over cid
```

Resolved by hand, `model.guide`'s 22 ids substituted into that template are an EXACT set
match for `apps/docs/chapters/*.json`. A build could compute it: read the dataset, follow
the datapath, substitute.

So the real line is not local-vs-remote data. It is **declarative chain vs JS chain**. The
desktop's model is equally local (desktop:2563), but its paths come out of
`columnData(selPath, model, rootPath)` — arbitrary JS walking the model — and following
that means *executing* user code, for every reachable `selPath`, which is a search rather
than an enumeration.

⚠ **Dataset resolution is nonetheless NOT part of this design, because it currently buys
nothing.** In-directory data-bound references are already covered by the sweep (§4);
the corpus's only out-of-directory one is the desktop's, which is the JS case this cannot
follow. It is recorded here as the answer-in-waiting: when a declarative binding over a
local dataset first names files OUTSIDE the program's directory, resolve the dataset —
do not reach for a glob or invent a `resource` declaration. The program already said
enough, in data the build already has.

⚠ **AND D DOES NOT ALWAYS LEAVE FRAGMENTS.** An earlier draft of this design proposed
reading the literals that bracket the computed part as a shape — `"chapters/" + cid +
".json"` ⇒ `chapters/*.json`. The desktop refutes it twice:

```declare
src: DataSource [ url = { classroot.path } ]     // desktop:1307 — no literal at all
app.openViewer("../../" + p, …)                  // desktop:1071 — computed AND outside
```

The first has nothing to glob; `path` arrives from `:path` in a dataset. So the glob is a
mechanism that works until it silently does not, which is the worst property a packaging
step can have. It is not part of this design.

This is exactly the boundary OpenLaszlo drew. Their `<resource>` was a **declaration**,
optionally of a set:

```xml
<resource name="icon" src="icon.png"/>
<resource name="spinner"><frame src="s0.png"/><frame src="s1.png"/> …</resource>
```

Runtime code selected by name and frame index; it never composed a path. `setSource(url)`
was the escape hatch and was explicitly a runtime fetch. Computation could *select*, never
*name*.

### 3a. Why we need less machinery than they did

OpenLaszlo compiled resources **into the .swf**. An unlisted file did not exist at
runtime, so the compiler had to know each one exactly. **A Declare package is a
directory**, so a superset costs disk, not correctness.

That inverts the design pressure. Where they needed an exact declared manifest, we can be
conservative — which is why this design adds no `resource` construct to the language.

## 4. Collection — placement is the declaration

The collected set is the union of:

1. **The program's own directory**, swept, minus a skip-list. Being *there* is what
   declares a file part of the app.
2. **Literal references that resolve outside it**, extracted statically from the resolved
   program, copied in and rewritten (§5). [`declarative-links.md`](declarative-links.md) /
   `compiler/src/links.ts` is the precedent: it already walks the resolved program and
   rides the compile result as a side-list exactly as `deps` do. An `assets` side-list is
   the same shape.

⚠ **THE SWEEP IS THE PART THAT CANNOT BE REPLACED BY ANALYSIS**, and an earlier draft of
this design got that backwards. It reasoned from the corpus's *literal* references, found
that scanning literals covers A/B/C, and proposed dropping the sweep. But case D is real
and irreducible — `apps/docs` selects among 22 chapter files by datapath — and the sweep
covers it for free, exactly, and with no heuristic, because the files are simply in the
folder.

That is also what §3a's principle says when applied honestly: if a package is a directory
and a superset costs disk rather than correctness, then when in doubt, **include**. A
precise collector is the wrong instinct here; it buys tidiness and pays in silent misses.

What analysis is still needed for is REACH — a literal above the program's own directory,
which no sweep can see. That is the whole job of (2).

### 4a. The skip-list, and why junk is not an architecture

The sweep's real defect is over-inclusion: measured on `apps/docs`, it ships `baselines/`
(perceptual-test fixtures) and `docs.states.mjs` (a test harness). Neither is the app.

That is a two-entry skip-list, not a reason to redesign collection. The existing list
(`dist`, `prebuilt`, `node_modules`, `index.html`, dotfiles, `*.declare`) grows by the
fixture conventions this repo uses. A repository that keeps its test fixtures beside its
apps pays a small, declared price for it.

### 4b. Silence must be trustworthy

A packaging step that under-collects silently is the worst possible outcome: it fails
later, on someone else's machine, as a 404. So the build **reports what it collected and
names what it could not resolve**, with file and line. A computed reference that resolves
to nothing the sweep covers is a warning that names itself, never a quiet omission.

This is the same discipline `declare-help` applies to a miss, and `build-mac-app` to a
stale input: report what happened, so that quiet means clean.

## 5. Assets outside the program directory

A literal may resolve above the program's own directory (`../../docs/declare-model.json`).
The package is one directory, so such a file is **copied in and its reference rewritten**
in the compiled program — OpenLaszlo's `adjustRelativeURL`, which rewrites a relative URL
to the same address relative to `destDir`.

⚠ This is the one place the build edits compiled output, so the shipped program's strings
differ from the source's. That is the cost of the choice; the alternative considered was
refusing the build and making the author move the file, which keeps the compiled program
pristine but makes a legitimate layout unbuildable.

## 6. Not the crawler

The crawl and prewarm tiers boot a program headlessly, so they look like a way to *observe*
what an app fetches. They are not, and should not become one.

Crawl produces a **t=0 snapshot** — one state. It would see whichever chapter happened to
load first and never the other 21, so it under-collects exactly where enumeration is
already hardest (case D). It would also make the contents of a package depend on
successfully *running* the app, which is nondeterministic in the ways a build must not be.

The two ask different questions: crawl asks *what does this look like at t=0*, packaging
asks *what could this ever need*.

There is one honest use in the reverse direction: a crawl or prewarm boot can **verify** a
package — did anything get fetched that was not collected? That is a check on the
collector, not a substitute for it, and it is the natural home for a regression test on
this whole mechanism.

## 7. Deliberately not solved

- **Apps that are views onto a tree cannot be packaged, and the build must say so.**
  `apps/desktop` composes `"../../" + p` from data (desktop:1071) to browse the
  repository's own documentation, and reaches sibling programs by literal
  (`"../calendar/calendar.declare"`). No collector can package that: its content IS the
  serving tree. The honest outcome is a build that names the reference it cannot resolve
  and refuses to claim the result is detachable — not a directory that 404s on first
  click. Deciding what that refusal looks like is the first open question, not a
  mechanism to invent now.
- **Trimming what is collected but unused at run time.** A superset is correct; shrinking
  it is an optimization, and the directory model means it costs only disk.
- **Content-addressed asset names.** The web build already hashes the program bundle;
  hashing assets is a caching decision, orthogonal to what travels.
- **The Mac app packager.** "Make me a Mac app with this program as THE app" pins one
  program and drops the compiler and library. It needs this mechanism, but it is a
  separate construct — see [`operational/mac-host.md`](../operational/mac-host.md) on why
  `declarec --render mac` currently refuses.

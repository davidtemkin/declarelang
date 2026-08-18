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

**D is the hard boundary.** In `apps/docs`, `cid` is bound to `:id`, a datapath into the
docs model; there are 22 chapter files and the set of ids is *data*. Enumerating it would
mean reading an app's data file and understanding its schema, which no build tool can do.

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

## 4. Collection

The collected set is the union of:

1. **Literal references**, extracted statically from the resolved program. This is the new
   mechanism, and [`declarative-links.md`](declarative-links.md) /
   `compiler/src/links.ts` is the precedent: it already walks the resolved program and
   rides the compile result as a side-list exactly as `deps` do. An `assets` side-list is
   the same shape.
2. **Globs derived from fragments**, for case D. The literals bracketing the computed part
   are a statement about shape: `"chapters/" + cid + ".json"` collects `chapters/*.json`.

The second is deliberately **program-derived, not folder-derived**. It is scoped by
something the program said, which is what distinguishes it from the directory sweep it
replaces.

### 4a. The directory sweep is removed

`copyAssets` (`tools/declarec.mjs`) copies every sibling of the `.declare` source minus a
skip-list. It fails in both directions at once, measured on `apps/docs`:

- **It ships what is not the app.** `baselines/` is perceptual-test fixtures;
  `docs.states.mjs` is a test harness. Both landed in the build.
- **It misses what is.** `apps/docs` names `url = "../../docs/declare-model.json"`, which
  is not a sibling — so a built docs app 404s on its primary data file.

Literal extraction is strictly better in both directions: it reaches outside the directory
and it collects only what is named.

### 4b. Silence must be trustworthy

A packaging step that under-collects silently is the worst possible outcome: it fails
later, on someone else's machine, as a 404. So the build **reports what it collected and
names what it could not resolve**, with file and line. A reference that is neither a
literal nor a fragment pattern is a warning that names itself, never a quiet omission.

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

- **A reference that is both computed and outside the program directory.** Neither literal
  extraction nor a fragment glob reaches it. Nothing in the corpus does this, and a
  declaration invented for a case with no instance would be a guess.
- **Trimming what is collected but unused at run time.** A superset is correct; shrinking
  it is an optimization, and the directory model means it costs only disk.
- **Content-addressed asset names.** The web build already hashes the program bundle;
  hashing assets is a caching decision, orthogonal to what travels.
- **The Mac app packager.** "Make me a Mac app with this program as THE app" pins one
  program and drops the compiler and library. It needs this mechanism, but it is a
  separate construct — see [`operational/mac-host.md`](../operational/mac-host.md) on why
  `declarec --render mac` currently refuses.

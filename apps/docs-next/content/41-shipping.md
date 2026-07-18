# Ship it

A `.declare` file is source; something turns it into a running app. Declare does that three
ways, all sharing one compiler, and the choice is about *where the compile happens*, not about
different builds.

## Three ways to run

- **The dev server** compiles on request. `npm start`, navigate to a program's URL, and it is
  compiled and rendered — no build step while you work. This is also how you *host* the distro:
  a clone runs as-is, compiling each app on demand.
- **A static build** moves the compile ahead of time. `?build` on a program URL — or `declarec`
  on the command line — precompiles the app and emits a self-contained artifact: an
  `index.html`, a content-hashed `app.<hash>.js`, and your data assets, deployable to any
  static host with no compiler on the critical path. On the flagship calendar that lands around
  45 KB gzipped.
- **In the browser**, with the service worker installed, the compiler runs in the page: a
  static host serves the source, and a generated wrapper compiles and runs it — the program URL
  is the app's address, no Node anywhere. Compiles are cache-aware, so a revisit renders without
  the compiler even loading.

## Hosting the distro vs. shipping a build

Two honest deployment shapes. **Host the distro** when you want the whole environment live —
every app compiles on request (server) or in the browser (static + service worker); this is
what runs the docs and homepage. **Ship a build** when you want one app as a minimal,
compiler-free artifact — `declarec`, deploy the `dist/`, done. Same source, same output; the
difference is whether a compiler is present at run time.

## Two things worth knowing

The **`crawler` flag** bakes the program's extracted static document — headings, prose, links, the
content a crawler reads — into the built `index.html`; the client clears it at boot and
replaces it with the live app. It is one flag (`declarec --crawler`, or `?crawler`), not a separate
build.

**Prewarm** is a validated cache for curated apps: a set of programs precompiled and *checked*
against a closure hash so a warm start skips compilation without trusting a stale artifact. It
is distinct from a `declarec` build — prewarm keeps the compile-on-request model fast; a build
removes the compiler entirely. Keeping those two "precompiled" senses separate is worth the
sentence.

Command sequences — every `declarec` switch, the build directory layout, hosting specifics —
are in [operational/building](declare-docs:operational:building). This chapter is the map.

---

**Next:** the whole book, cashed against one real program you can run, read, and edit —
[Anatomy of the calendar](declare-docs:guide:calendar).

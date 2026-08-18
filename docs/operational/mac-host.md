# The Mac host

A native macOS application that runs Declare programs — the same language, the same
standard library, the same compiler. It is a third *renderer* (AppKit layers instead of
DOM nodes or a canvas), not a different platform: nothing in a program knows which one it
is running on, and `npm run test:conform` holds all three to the same answers.

**It is not bundled with this repo.** There is no `.app` in the tree and none is
committed — the Swift sources are tracked, the built application is a per-machine
artifact, the same split as `mac-host/winb`. You build it.

## Build it

```bash
npm run build:mac
```

Needs a Swift toolchain (Xcode or the Command Line Tools). One command, and it is the
only one — it walks the whole chain and then proves the result.

### What it builds, and from what

The app bakes a copy of the platform, and every piece of that is derived from the tree by
a different tool. The build walks the chain in order:

```
runtime/src, compiler/src  ──tsc──▶  */dist
*/dist                     ──build-boot, build-compiler──▶  bundles/declare-*.js
bundles/declare-compiler.js
  + runtime/dist, browser  ──build-mac──▶  bundles/declare-*-mac.js
mac-host/Sources           ──swift build, codesign──▶  .build/release/DeclareMac
all of the above           ──build-mac-app──▶  Declare Mac.app
```

Then it **verifies** rather than assumes, because a build script that rebuilds some of its
inputs and copies the rest is how an app ships a runtime older than `runtime/src`:

1. no baked artifact may be older than an input it is built from, and
2. every baked file must hash-match the tree file it was copied from.

Neither alone is enough. `cp` stamps the copy with the current time, so a copy is always
newer than everything and mtime can only be trusted about the *tree*; and a faithful copy
of a stale artifact is still stale. A build that fails either check exits non-zero having
changed nothing — it assembles beside the destination and only swaps at the end, so a
failed build never leaves you without an app.

The artifact→inputs table lives in `tools/internal/build-mac-app.mjs`, and the bundle half
of it is *imported* from `tools/internal/bundle-freshness.mjs` rather than restated. That
matters: there used to be a second copy of the pairing in Swift, under a comment asserting
the two could not drift apart. They had.

`bash mac-host/bundle.sh` still works — it is a wrapper on the same build.

### Where it lands

The first writable of:

| | |
|---|---|
| `/Applications` | the real install — where LaunchServices can claim the `.declare` extension |
| `~/Applications` | when `/Applications` needs an admin this shell does not have |
| `mac-host/` | last resort, beside its sources; always writable |

Pass a directory to override: `npm run build:mac -- ~/somewhere`.

An Applications directory matters for one specific reason: macOS only offers an app as a
document handler when it is installed in one, so **double-clicking a `.declare` reaches
nothing until the app lives there**. The in-tree fallback runs fine — it simply cannot be
the handler.

**There is one app on the machine, and every harness drives it.** There is deliberately no
second "dev build": `mac-host/.build/release/DeclareMac` is a SwiftPM intermediate, never
run directly. The gates, the conformance suite and `test/mac-shell.test.mjs` all launch
the installed app (`mac-host/app.mjs` is the one place that answers "where is it?"), so
what they measure is what ships. It did not used to be — half the rigs spawned the bare
binary with `DECLARE_ROOT` set, measuring a configuration nobody runs.

### The app is independent of the tree

Once built, **the app reads nothing from any Declare tree.** The compiler, the library and
the two chrome programs (the Inspector and the Viewer) all live in `Contents/Resources`,
laid out in the same relative shape as the tree, so the same URL joins resolve there
(`Bridge.platformBase` → `browser/mac-boot.js`). Hand the `.app` to someone with no
checkout and it compiles and runs programs.

The only thing it reads from outside itself is **the program** — which is the document,
not the platform.

`Info.plist` carries one stamp, `DeclareToolchain`: the `BUILD_ID` of the platform baked
inside, reported by `ctl platform`. It is an identity, not a comparison — there is nothing
to compare it against.

> **`DECLARE_ROOT` is gone.** It used to point a built app at a tree, which meant "which
> runtime is this app running?" had three possible answers resolved at launch. Both
> recorded misdiagnoses on this host are that ambiguity: a fix written, built, and then
> debugged for a full cycle against an app still running the previous runtime. The
> platform is chosen when the app is built, and the build will not bake a stale one — so
> rebuild, which is one command and mostly incremental.

## What it opens

```bash
open ~/anywhere/notes.declare              # or double-click it in the Finder
open -a "Declare Mac" http://…             # or point it at a URL
```

Three sources, and the app picks by what it is given:

- **A `.declare` file, anywhere on disk.** Its own `include`s and assets resolve beside
  it; its library components and the compiler come from *inside the app*. No dev server
  and no checkout needed — copy a program's folder to the Desktop and it runs.
- **A URL.** The program is fetched from wherever it is served and compiled on device,
  against the app's own library. This is the path `npm start` gives you.
- **A built artifact.** A directory containing `program.json` — already compiled, so the
  compiler is not involved at all.

In every case the *platform* comes from the app and only the *program* comes from
elsewhere. The compiler is loaded from `Contents/Resources` on the first on-device compile
and is resident for the rest of the session; a program that never compiles — a built
artifact — never pays for it.

## The window

```
‹ ›            Declare Calendar            View Source · Inspector
```

Three zones, each answering a different question — where you have been, what this window
is showing, and how you are looking at it.

**Back and forward** walk the programs this window has visited. A program navigates with
`app.navigate(url)` (or `app.openWindow(url)` for a window of its own); relative URLs
resolve against the program, the same rule its includes and assets follow.

The trail holds *programs*, so two things deliberately stay off it: Source mode, which is
a way of looking at the program you are on rather than a place you went, and a reload.
Both would make Back mean "undo the last thing I clicked" instead of "the program I was
on before" — a distinction that only matters when you are lost, which is exactly when you
reach for Back. `⌘[` and `⌘]`, matching Safari and the Finder (not `⌘←`, which is
line-start in every text field the Viewer's edit tab puts on screen).

**The title** is the program's `appName`, or its file name when it declares none.

**View Source** (`⌘U`) swaps the window to the Declare Viewer reading the program it was
running — reader, source, and an Edit tab with the program live inside. A state of this
window, not a second window: a viewer beside its subject leaves you managing two windows
to read one program. **Inspector** (`⌥⌘I`) mounts over the running program instead of
replacing it. They are mutually exclusive, and each shows a grey chip behind its name
while it is live — the one state that is still true after you look away, and so the one
that earns a mark of its own.

Both also live in the View menu, which is where the keyboard shortcut lives, where Help
search finds them, and what VoiceOver navigates. A harness reaches them with
`node mac-host/ctl.mjs chrome [source|inspector|back|forward]`, since the title bar is not
in the program's model coordinates.

## What it is not

**It is not a way to ship a desktop application.** The Mac host runs Declare programs with
full language and library support, but it is a *runtime environment*, not an app-packaging
story in the Electron sense: there is no way to wrap a program as a standalone, signed,
distributable `.app` with its own identity, no system integration surface (menus beyond the
host's own, dock behaviour, notifications, file associations of your own), and no
per-program installer. `declarec --render mac` refuses for exactly this reason — packaging
a program as an application is a separate construct, and it does not exist yet.

What you get is: your program, running natively, at native speed, with real AppKit text and
scrolling.

## Checking it

```bash
npm run test:mac
```

Rebuilds the Mac bundles, then runs the three-renderer conformance suite and the native
gate (every program in a corpus rendered natively and in Chrome, compared against a
recorded per-program baseline). Both need a running host and a dev server on `:8260`:

```bash
npm start &
DECLARE_CONTROL=1 "/Applications/Declare Mac.app/Contents/MacOS/Declare Mac" &
```

`DECLARE_CONTROL=1` opens the control channel the harnesses drive (`mac-host/ctl.mjs`).

## When something is wrong

- **The app behaves like an older version of the platform** — it is one. Run
  `npm run build:mac`; it rebuilds every stale link in the chain and refuses to assemble
  an app from anything stale. `tsc` alone has never been enough — the host runs
  `bundles/declare-mac.js`, not `runtime/dist` — and that is exactly why there is now one
  command instead of four.
- **`ctl platform`** answers where the compiler and library are being read from, and which
  toolchain is baked in. It is a `file://` URL inside the `.app`; anything else means the
  bundle was not assembled by the build.
- **A double-click does nothing** — the app is not in an Applications directory, or
  LaunchServices has not indexed it: `lsregister -f "/Applications/Declare Mac.app"`.
- **Anything asynchronous started from the control channel never completes** — once the
  host goes idle its display link pauses and JavaScriptCore stops draining microtasks.
  Timers re-enter JS and still run; promises do not. Probe during boot, not after.
- **The design rationale** lives in `docs/system-design/native-host.md` — history and
  argument, not instructions.

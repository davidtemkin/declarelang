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
bash mac-host/bundle.sh
```

Needs a Swift toolchain (Xcode or the Command Line Tools). It compiles
`mac-host/Sources/` and assembles the app around two JavaScript files —
`browser/mac-env.js` (the environment shim) and `bundles/declare-mac.js` (the runtime,
the Mac backend, and the boot ladder). Nothing else is copied in.

### Where it lands

The first writable of:

| | |
|---|---|
| `/Applications` | the real install — where LaunchServices can claim the `.declare` extension |
| `~/Applications` | when `/Applications` needs an admin this shell does not have |
| `mac-host/` | last resort, beside its sources; always writable |

Pass a directory to override: `bash mac-host/bundle.sh ~/somewhere`.

An Applications directory matters for one specific reason: macOS only offers an app as a
document handler when it is installed in one, so **double-clicking a `.declare` reaches
nothing until the app lives there**. The in-tree fallback runs fine — it simply cannot be
the handler.

### What gets stamped into it

Two values, written into `Info.plist` at bundle time:

- **`DeclareDistroRoot`** — the tree it was built from. A program opened from disk gets
  its library and the compiler from here.
- **`DeclareToolchain`** — the tree's `BUILD_ID` at bundle time. The app carries its own
  runtime but reads the compiler from the tree, so the two drift apart the moment the
  tree moves; on a mismatch the app logs which platform it was built from and which the
  tree now reads. Advisory — a dev tree moves constantly.

`DECLARE_ROOT` overrides the stamp when set, which is how you point a built app at the
tree you are editing. It only works from a terminal: a Finder launch inherits launchd's
environment, not a shell's, which is why the stamp exists at all.

## What it opens

```bash
open ~/anywhere/notes.declare              # or double-click it in the Finder
open -a "Declare Mac" http://…             # or point it at a URL
```

Three sources, and the app picks by what it is given:

- **A `.declare` file, anywhere on disk.** Its own `include`s resolve beside it; its
  library components and the compiler come from the stamped tree. No dev server needed,
  and the file does not have to live in the distro — copy a program's folder to the
  Desktop and it runs. Assets and `DataSource` files load from beside the program, as
  they do anywhere else.
- **A URL served by the dev server.** The server compiles (`?program`) and the app renders
  the result; no compiler is downloaded at all. This is the path `npm start` gives you.
- **A built artifact.** A directory containing `program.json` — already compiled, so
  neither a server nor the compiler is involved.

The first time a program compiles on-device the app fetches the compiler from the stamped
tree (~1.3 MB); after that it is resident for the session. A program that never compiles —
one reached through the server, or a built artifact — never pays for it.

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

- **"cannot find include" for a program that compiles in the browser** — the app is
  reading a stale compiler. `tsc` and `build-mac.mjs` are *not* sufficient: the Mac
  compiler bundle is built from `bundles/declare-compiler.js`, so the honest rebuild is
  `npm run derive` followed by `bash mac-host/bundle.sh`.
- **A double-click does nothing** — the app is not in an Applications directory, or
  LaunchServices has not indexed it: `lsregister -f "/Applications/Declare Mac.app"`.
- **Anything asynchronous started from the control channel never completes** — once the
  host goes idle its display link pauses and JavaScriptCore stops draining microtasks.
  Timers re-enter JS and still run; promises do not. Probe during boot, not after.
- **The design rationale** lives in `docs/system-design/native-host.md` — history and
  argument, not instructions.

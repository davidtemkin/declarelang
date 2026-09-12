# Running Cadence

Everything below lives under `/Users/temkin/Code/eval-checkpoint/declare/`.
**All three servers are already running as I leave this** — if you just want to look at the
app, skip to *"Open it"*.

```
declare/
  declarelang/                   the Declare distribution (cloned from GitHub)
    my-apps/cadence.declare      ← the program (1348 lines, one file)
    my-apps/fonts/               ← the two self-hosted webfonts
  dist/                          ← the production build (90.9 KB gzipped, incl. runtime)
  task/api/server.mjs            the given service (not mine, not modified)
  cadence-checks.mjs             the behaviour assertions for `verify` rung 5
  shots.mjs drive.mjs sizes.mjs touch.mjs travel.mjs    the browser checks I ran
  shots/                         what they photographed
```

---

## Open it

**<http://localhost:8210/my-apps/cadence.declare>**

That is the whole address — in Declare a program's URL *is* the app. Any modern browser.
Narrow the window below 880px (or use the device toolbar at 390×844) to get the phone
arrangement.

The production build is at **<http://localhost:8215/>**.

---

## Start it from cold

### 1. The service (port 8320)

```bash
cd /Users/temkin/Code/eval-checkpoint/declare
node task/api/server.mjs
```

Prints `cadence fixture api — http://127.0.0.1:8320`. It is deterministic and its clock is
frozen at 2026-08-05. It was already running when I started and I did not modify it.

### 2. The dev server (port 8210)

```bash
cd /Users/temkin/Code/eval-checkpoint/declare/declarelang
npm install          # once — TypeScript, esbuild, puppeteer-core
node server/dev.mjs 8210
```

> **Why 8210 and not 8200.** The brief and Declare's own docs use 8200, but on this machine
> ports 8200 and 8201 were already held by unrelated processes (8200 by a Declare dev server
> rooted in a different checkout). The dev server refuses to share a port and says so, which
> is the right behaviour; I moved mine to 8210. Any free port works —
> `node server/dev.mjs 8200` if you free it first.

Then open <http://localhost:8210/my-apps/cadence.declare>. There is no build step: the
server compiles the `.declare` on request. **Edit the file and reload the page** — that is
the whole loop.

### 3. The production build (port 8215, optional)

Already built into `dist/`. To rebuild and serve:

```bash
cd /Users/temkin/Code/eval-checkpoint/declare/declarelang
node tools/declarec.mjs my-apps/cadence.declare -o ../dist

cd /Users/temkin/Code/eval-checkpoint/declare/dist
python3 -m http.server 8215 --bind 127.0.0.1
```

Then open <http://localhost:8215/>. `dist/` is a static directory — `index.html`, one
content-hashed `app.<hash>.js`, and the fonts. 90.9 KB over the wire gzipped, runtime
included, with no compiler shipped. It talks to the same service on 8320 (the service
permits cross-origin requests), and it is visually identical to the dev-server build; the
only difference is that the introspection bridge is a stub, which is what the build is for.

---

## Using it

**Today** is the top of the page: this week's sessions and total, the week's seven days,
the streak, and whatever is happening now (there is a live session in this fixture — its
clock ticks and its heart rate refreshes every three seconds).

**The year** is the strip at the bottom. It is one continuous surface over all fourteen
months:

| | phone | desk |
|---|---|---|
| push through the months | drag sideways | drag sideways, or `←` `→`, or trackpad two-finger swipe |
| pull it open / squeeze it shut | pinch | scroll over the strip, or `+` `−` |
| back to today | tap **TODAY** | tap **TODAY**, or `0` |
| open a session | tap a bar | click a bar |

A vertical swipe over the strip still scrolls the page — the strip claims only the
horizontal axis.

**Adding one:** tap the round **+** (phone) or **ADD A SESSION** (desk), or press `n`.
Everything is pre-filled; the usual case is one tap on the confirm bar. `Esc` closes any
panel. From a session's panel, **EDIT** re-opens the same sheet pre-filled and **DELETE**
removes it — both hit the real service, and every derived number moves to take it in.

---

## Verify

The platform's own ladder — parse → resolve → typecheck → headless boot → **real input in
headless Chromium**:

```bash
cd /Users/temkin/Code/eval-checkpoint/declare/declarelang
node tools/verify.mjs my-apps/cadence.declare --assert ../cadence-checks.mjs
```

Expected:

```
  R1 ✓ structure
  R2 ✓ resolution
  R3 ✓ analysis (typecheck on)
  R4 ✓ boot (178 nodes, settled in 53 ms, synthetic metrics)
  R5 ✓ behavior (8 steps, real input)
  verify: my-apps/cadence.declare — clean through R5 (504 of 557 constraints statically wired)
```

Rung 5 drives the live service: it checks the exact copy of the week line, the 6× type
ratio, the seven-day shape, that the live clock moves, that a drag pushes the year back and
the period label follows, that pulling it open resolves the bars into blocks, that picking a
session opens its panel, and that **adding a session moves this week's count, this week's
total, the streak and the week's shape in the same settle** — then corrects it, deletes it,
and confirms everything falls back. It leaves the fixture with exactly the 248 sessions it
found.

Four more checks, run from `/Users/temkin/Code/eval-checkpoint/declare` with the servers up:

```bash
node touch.mjs     # phone: thumb pan, pinch, page-scroll survival, 44pt tap targets; desk: keyboard
node travel.mjs    # "numbers travel" — records the intermediate readings
node sizes.mjs     # 360 / 768 / 1000 / 1600 and both colour schemes; nothing overflows
node drive.mjs desktop && node drive.mjs phone     # photographs the panels into shots/
```

All of them exit 0 today and print `all good` / `no page errors`.

---

## Stopping and restarting

The dev server and the static server are ordinary foreground processes started with
`nohup … &`; `pkill -f "server/dev.mjs 8210"` and `pkill -f "http.server 8215"` stop them.
Nothing else is installed and nothing outside this directory was touched.

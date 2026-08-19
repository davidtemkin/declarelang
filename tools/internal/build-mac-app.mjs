// build-mac-app — "Declare Mac.app", assembled and PROVEN.
//
//   node tools/internal/build-mac-app.mjs [dest]      (npm run build:mac)
//
// THE PROBLEM THIS SCRIPT EXISTS TO END. The app bakes a copy of the platform —
// the runtime, the compiler, the library, the two chrome programs — and every
// one of those is DERIVED from the tree by a different tool at a different time.
// The old assembly (`bundle.sh`) rebuilt exactly one of its inputs, the Swift
// binary, and `cp`'d the rest in whatever state it happened to find them. So the
// documented invocation could, and did, produce an app whose baked runtime
// predated `runtime/src`: measured 2026-08-18, a freshly "built" app launched
// announcing its own platform was older than the tree it came from.
//
// That is not a warning to print, it is a build that should not exist.
//
// WHERE THIS SITS IN THE LARGER BUILD. `derive` (tools/internal/derive.mjs) is
// the tree's build: a rule graph that owns every COMMITTED derived artifact.
// This is not a second one. It NEEDS derive's first two rules — `tsc` and
// `bundles`, which produce what the app bakes — and it gets them by RUNNING
// DERIVE (`--only tsc,bundles`), not by calling the rule bodies itself. The
// distinction is the ledger: derive records every rule it runs in
// .derive/manifest.json, and an earlier version of this script ran the same
// two tools directly — same artifacts, no record — so after any mac session
// the ledger trailed the tree, and the next `git push` was refused as "stale"
// over work this build had already done (`npm run derive` then "fixed" it by
// regenerating nothing). One builder per artifact, one ledger per builder.
// Then this does the thing derive does not: package.
//
//       runtime/src, compiler/src  ──tsc──▶ */dist         ┐ derive --only
//       */dist                     ──build-*──▶ bundles/   ┘ tsc,bundles
//       mac-host/Sources           ──swift build, codesign──▶ DeclareMac
//       all of the above           ──here──▶ Declare Mac.app  + its own BUILD_ID
//
// ⚠ THE DEPENDENCY RUNS ONE WAY, AND NOTHING HERE WRITES A COMMITTED FILE.
// The app is a per-machine artifact, never a committed one, so derive neither
// builds it nor knows about it — a commit must not require a Swift toolchain.
// This reads the tree and writes only the .app. (The derive call does touch
// tree artifacts — that is derive's own rules producing derive's own outputs,
// deterministically, and staging what it rebuilds, exactly as `npm run derive`
// would; nothing here AUTHORS anything derive would not.)
//
// That boundary is easy to lose: the version after the first briefly called
// `stamp-version.mjs` to keep the baked BUILD_ID honest, which also stamped
// service-worker.js, index.html and every apps/*/index.html — 21 committed
// web-facing files written by a mac build. The id is hashed from the baked
// bytes instead.
//
// Every link is walked here, in order, and then the result is VERIFIED rather
// than assumed — the rule build.sh already applied to the Swift binary, applied
// to all of it:
//
//   1. no baked artifact may be older than an input it is built from, and
//   2. every baked file must hash-match the tree file it was copied from.
//
// (1) alone is not enough, because `cp` stamps the copy with the current time —
// a copy is ALWAYS newer than everything, so mtime can only be trusted about the
// tree. (2) alone is not enough either: it proves the copy is faithful, not that
// what it faithfully copied was current. Together they close the chain.
//
// ONE TABLE, and the bundle inputs are IMPORTED rather than restated. There used
// to be a second copy of this pairing in Swift (Bridge.checkPlatformFreshness),
// under a comment claiming the two "cannot drift apart"; they had — it named
// compiler/dist as an input to declare-compiler-mac.js, which is built from
// bundles/declare-compiler.js. A list that is asserted to agree with another
// list does not.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync, constants, existsSync, mkdirSync, rmSync, cpSync, copyFileSync,
  readFileSync, writeFileSync, readdirSync, renameSync, statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLES, newestMtime } from "./bundle-freshness.mjs";
import { SEARCH } from "../../mac-host/app.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAC = path.join(ROOT, "mac-host");
const BIN = path.join(MAC, ".build/release/DeclareMac");

const say = (m) => process.stdout.write(m + "\n");
const die = (m) => { process.stderr.write("\n✗  " + m + "\n"); process.exit(1); };

// ── WHAT GOES IN, AND WHAT IT IS BUILT FROM ─────────────────────────────────
//
// `from` is a path in the tree; `to` is a path inside the .app. `inputs` is what
// `from` is derived from — omitted means "it is its own input" (a source file,
// so being newer than itself is trivially true and the hash check is the whole
// test). For anything bundle-freshness already owns, the inputs come from THERE.
const bundleInputs = (out) => BUNDLES.find((b) => b.out === out)?.inputs;

const BAKE = [
  { from: "mac-host/.build/release/DeclareMac", to: "Contents/MacOS/Declare Mac",
    inputs: ["mac-host/Sources", "mac-host/Package.swift"] },
  { from: "browser/mac-env.js", to: "Contents/Resources/mac-env.js" },
  { from: "bundles/declare-mac.js", to: "Contents/Resources/declare-mac.js",
    inputs: bundleInputs("bundles/declare-mac.js") },
  { from: "bundles/declare-compiler-mac.js", to: "Contents/Resources/bundles/declare-compiler-mac.js",
    inputs: bundleInputs("bundles/declare-compiler-mac.js") },
  // NOT bundles/version.json — that one is WRITTEN, not copied. See `toolchain`.
  // Components, icons and themes — all .declare source, compiled on device.
  { from: "library", to: "Contents/Resources/library", dir: true },
  // THE CHROME PROGRAMS are platform too: the Inspector mounts OVER a running
  // program, the Viewer IS this window's other way of looking at one. Neither is
  // an application. Same relative path as the tree, so one URL resolves in both
  // homes (browser/mac-boot.js platformBase).
  { from: "apps/inspector", to: "Contents/Resources/apps/inspector", dir: true, only: /\.declare$/ },
  { from: "apps/viewer", to: "Contents/Resources/apps/viewer", dir: true, only: /\.declare$/ },
  // GENERATED from the desktop's own Declare Viewer glyph (mac-host/make-icon.mjs
  // instantiates the real AppGlyph and screenshots it, so the app icon cannot
  // drift from the one the program draws). Committed, so a build never needs a
  // running server; regenerate with `node mac-host/make-icon.mjs`.
  { from: "mac-host/Declare.icns", to: "Contents/Resources/Declare.icns" },
];

// ── the chain, walked ───────────────────────────────────────────────────────

// 1. TypeScript — inside the derive call below; the `tsc` rule is `always`,
//    never conditional: `tsc -b` is incremental and a no-op costs ~1s, far less
//    than one debugging session spent on a dist that was one edit behind its src.
// ⚠ SHOW THE OUTPUT ON FAILURE. Piping a step's output to keep the build tidy and
// then discarding it in the catch is how build.sh once reported success three
// times in a row while shipping pre-edit code — the error existed and nobody
// could see it. Captured, and printed if and only if the step fails.
function step(label, cmd, argv, cwd, whenItFails) {
  say("  " + label);
  try {
    execFileSync(cmd, argv, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    process.stderr.write((e.stdout ?? "") + (e.stderr ?? ""));
    die(whenItFails);
  }
}

say("build:mac");

// 2. The bundles, which are what this app bakes — via derive, ONE call with
//    tsc, so the ledger records both (see the header). When the manifest
//    proves the inputs unchanged the bundle step skips entirely, a stronger
//    test than the mtime scan this script once ran itself.
//
// ⚠ ONLY tsc and the bundles. This briefly ran `stamp-version.mjs` too, to be
// sure the baked BUILD_ID described the baked platform — and that was the right
// worry with the wrong cure. stamp-version is a derive rule that, besides
// writing bundles/version.json, stamps service-worker.js, index.html and every
// apps/*/index.html — the WEB's cache-busters, no business of a mac build.
// Running it here made a per-machine app build write 21 committed web-facing
// files, and inverted the one-way dependency stated above.
//
// The id is computed from what was BAKED instead (see `toolchain` below), which
// is both narrower and more correct.
say("  derive --only tsc,bundles");
try {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, "tools/internal/derive.mjs"), "--only", "tsc,bundles"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  for (const line of out.trim().split("\n")) say("    " + line);
} catch (e) {
  process.stderr.write((e.stdout ?? "") + (e.stderr ?? ""));
  die("tsc or the bundle rebuild failed — the tree does not build, so there is nothing to bake.");
}

// 3. The Swift binary. build.sh owns the JIT entitlement and its own
//    "did the binary actually move?" check — this does not reimplement either.
step("swift build -c release", "bash", [path.join(MAC, "build.sh")], MAC,
     "the Swift host did not build — see the error above.");
if (!existsSync(BIN)) die(`${BIN} is missing after a successful build.`);

// ── where it lands ──────────────────────────────────────────────────────────
//
// /Applications is the install: LaunchServices only claims the .declare
// extension for an app in an Applications directory, so a double-click reaches
// nothing until it lives in one. ~/Applications when /Applications needs an
// admin this shell does not have. An explicit argument overrides both.
//
// ONE APP ON THE MACHINE, always the newest build — the harnesses launch this
// same path, so what the gates measure is what ships. There is deliberately no
// second, tree-reading "dev build" to diverge from it.
function destination() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  // SEARCH is shared with the rigs (mac-host/app.mjs) so that where a build
  // writes and where a harness looks cannot drift apart.
  //
  // ⚠ TEST FOR WRITABILITY, not existence. `mkdirSync(d, {recursive:true})`
  // SUCCEEDS on a directory that already exists but is not writable, so using it
  // as the probe picks /Applications on a locked-down machine and then fails
  // half way through the copy, with the previous app already gone.
  for (const d of SEARCH) {
    try { mkdirSync(d, { recursive: true }); accessSync(d, constants.W_OK); return d; } catch { /* next */ }
  }
  return MAC;
}
const DEST = path.join(destination(), "Declare Mac.app");

// ASSEMBLE BESIDE IT, SWAP AT THE END. The verification below is allowed to
// fail the build, and a build that fails must not also destroy the app you had
// installed — assembling in place means a typo in the tree leaves the machine
// with no Declare Mac at all. Staged next to the destination rather than in
// /tmp so the final move is a rename within one filesystem.
const OUT = DEST + ".staging";

// ── assemble ────────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
for (const item of BAKE) {
  const src = path.join(ROOT, item.from);
  const dst = path.join(OUT, item.to);
  if (!existsSync(src)) die(`${item.from} does not exist — cannot bake it into the app.`);
  mkdirSync(path.dirname(dst), { recursive: true });
  if (item.dir) {
    cpSync(src, dst, {
      recursive: true,
      // Finder litter has no business inside a signed bundle.
      filter: (s) => path.basename(s) !== ".DS_Store" &&
                     (!item.only || statSync(s).isDirectory() || item.only.test(s)),
    });
  } else {
    copyFileSync(src, dst);
  }
}

// Content hashing, shared by the toolchain id and the copy check below.
const hashOf = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
function filesUnder(dir, rel = "") {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    if (e.name === ".DS_Store") continue;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...filesUnder(dir, r));
    else out.push(r);
  }
  return out;
}

// ── the toolchain id ────────────────────────────────────────────────────────
//
// A content hash of WHAT THIS APP BAKED, computed here and written only into the
// app. It is not decoration: `Resources/bundles/version.json` is the first of the
// three things the compile cache validates against (CompileService, "WHAT MAKES
// A CACHED COMPILE STILL VALID"), so it answers "does this cached compile come
// from the platform I am running?".
//
// ⚠ THAT IS A QUESTION ABOUT THE APP, NOT ABOUT A TREE — which is why this is no
// longer the tree's `bundles/version.json`, copied. That file is derive's, and it
// only describes the app when derive happens to have run since the last edit;
// copy it on an underived tree and the app reuses programs compiled by a
// different platform, silently. Hashing the baked bytes makes that impossible by
// construction rather than by remembering to derive.
//
// Stable when the content is: a rebuild that changes nothing keeps the id, and
// so keeps the compile cache. `ctl platform` reports it.
const bakedHashes = BAKE.map((item) => {
  const src = path.join(ROOT, item.from);
  const one = (f) => `${path.relative(ROOT, f)}:${hashOf(f)}`;
  return item.dir
    ? filesUnder(src).filter((f) => !item.only || item.only.test(f))
                     .map((f) => one(path.join(src, f))).join("\n")
    : one(src);
}).join("\n");
const toolchain = createHash("sha256").update(bakedHashes).digest("hex").slice(0, 12);
mkdirSync(path.join(OUT, "Contents/Resources/bundles"), { recursive: true });
writeFileSync(path.join(OUT, "Contents/Resources/bundles/version.json"),
              JSON.stringify({ build: toolchain }, null, 2) + "\n");
writeFileSync(path.join(OUT, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Declare Mac</string>
  <key>CFBundleDisplayName</key><string>Declare Mac</string>
  <key>CFBundleExecutable</key><string>Declare Mac</string>
  <key>CFBundleIdentifier</key><string>com.davidtemkin.declare.host</string>
  <key>CFBundleIconFile</key><string>Declare</string>
  <key>CFBundleIconName</key><string>Declare</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSAllowsArbitraryLoads</key><true/>
  </dict>
  <!-- A .declare is a document this app opens: the Finder claim, and the type
       itself, since no one else declares it. -->
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeName</key><string>Declare program</string>
      <key>CFBundleTypeRole</key><string>Viewer</string>
      <key>LSHandlerRank</key><string>Owner</string>
      <key>LSItemContentTypes</key><array><string>com.davidtemkin.declare.source</string></array>
    </dict>
  </array>
  <key>UTExportedTypeDeclarations</key>
  <array>
    <dict>
      <key>UTTypeIdentifier</key><string>com.davidtemkin.declare.source</string>
      <key>UTTypeDescription</key><string>Declare program</string>
      <key>UTTypeConformsTo</key><array><string>public.source-code</string></array>
      <key>UTTypeTagSpecification</key>
      <dict><key>public.filename-extension</key><array><string>declare</string></array></dict>
    </dict>
  </array>
  <!-- WHICH PLATFORM this app carries: the distro's BUILD_ID at build time (a
       content hash of runtime + compiler bundle + web client + library). An
       identity, not a comparison — the app reads nothing from any tree. -->
  <key>DeclareToolchain</key><string>${toolchain || "unstamped"}</string>
</dict>
</plist>
`);

// ── verify, before signing ──────────────────────────────────────────────────
//
// Both halves of the rule. See the header for why neither alone is sufficient.

const stale = [], mismatched = [];
const manifest = {};
for (const item of BAKE) {
  const src = path.join(ROOT, item.from);
  const dst = path.join(OUT, item.to);

  // (1) is what we copied FROM current with respect to what builds it?
  const built = newestMtime(ROOT, item.from);
  for (const input of item.inputs ?? []) {
    if (newestMtime(ROOT, input) > built) stale.push(`${item.from}  ←  ${input}`);
  }

  // (2) did the copy land, faithfully?
  if (item.dir) {
    const a = filesUnder(src), b = filesUnder(dst);
    const want = item.only ? a.filter((f) => item.only.test(f)) : a;
    for (const f of want) {
      if (!existsSync(path.join(dst, f))) { mismatched.push(`${item.to}/${f} (missing)`); continue; }
      if (hashOf(path.join(src, f)) !== hashOf(path.join(dst, f))) mismatched.push(`${item.to}/${f}`);
    }
    for (const f of b) if (!want.includes(f)) mismatched.push(`${item.to}/${f} (unexpected)`);
    manifest[item.to] = `${want.length} files`;
  } else {
    if (!existsSync(dst)) mismatched.push(`${item.to} (missing)`);
    else {
      const h = hashOf(src);
      if (h !== hashOf(dst)) mismatched.push(item.to);
      manifest[item.to] = h.slice(0, 16);
    }
  }
}

// Nothing below leaves the staging copy behind: a failed build should not
// litter an Applications directory with a half-app either.
const dieStaged = (m) => { rmSync(OUT, { recursive: true, force: true }); die(m); };

if (stale.length) {
  dieStaged("this app would be built from STALE inputs:\n" +
      stale.map((s) => "     " + s + "  is newer\n").join("") +
      "\n   The rebuild above should have prevented this, so something is\n" +
      "   producing an artifact without updating its mtime, or an input list\n" +
      "   in tools/internal/bundle-freshness.mjs is wrong.");
}
if (mismatched.length) {
  dieStaged("the assembled app does not match the tree it was built from:\n" +
            mismatched.map((s) => "     " + s + "\n").join(""));
}

// What is in here, and what it was built from — so `ctl platform` and anyone
// holding the .app can answer that without the tree.
writeFileSync(path.join(OUT, "Contents/Resources/platform.json"),
              JSON.stringify({ toolchain: toolchain || "unstamped", baked: manifest }, null, 2) + "\n");

// ── sign ────────────────────────────────────────────────────────────────────
//
// The JIT entitlement is NOT cosmetic: without com.apple.security.cs.allow-jit
// (plus the hardened runtime) JavaScriptCore silently runs its interpreter and
// the whole runtime is ~84x slower on every JS path. An mmap(MAP_JIT) probe
// reports success either way, so the only honest checks are the signature below
// and Bridge.assertJIT's benchmark at startup.
//
// ⚠ The entitlements path is resolved from MAC explicitly. Both historic bugs
// here were relative-path bugs that FAILED SOFT — a codesign that errored for
// its own reasons while the build reported success, shipping an
// interpreter-only app from the documented invocation.
execFileSync("codesign", ["--force", "--sign", "-", "--options", "runtime",
                          "--entitlements", path.join(MAC, "jit.entitlements"), OUT],
             { stdio: ["ignore", "pipe", "inherit"] });

// Verify what was signed, not what was asked for.
const ents = execFileSync("codesign", ["-d", "--entitlements", "-", OUT],
                          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
if (!ents.includes("com.apple.security.cs.allow-jit")) {
  dieStaged("the app is signed WITHOUT com.apple.security.cs.allow-jit.\n" +
            "   JavaScriptCore would run its interpreter (~84x slower on every JS path).");
}

// ── swap it in ──────────────────────────────────────────────────────────────
// Only now, with everything proven, does the installed app change. A running
// host keeps the bundle it launched from open, so replace rather than mutate.
rmSync(DEST, { recursive: true, force: true });
renameSync(OUT, DEST);

say(`  ${DEST}`);
say(`  toolchain ${toolchain || "unstamped"} · ${BAKE.length} baked artifacts verified · JIT entitlement verified`);

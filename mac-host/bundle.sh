#!/bin/bash
# bundle.sh — assemble "Declare Mac.app".
#
# TWO WORDS, deliberately: the product is Declare, and this is its Mac host —
# `DeclareMac` is the SwiftPM target's identifier, never a name shown to anyone.
#
# The app is the Swift shell plus the two JS scripts it evaluates (the env shim
# and the runtime+backend+boot bundle). Those live in Resources, which is where
# Bridge.resource() looks first — so a bundled app needs no DECLARE_ROOT and no
# checkout beside it. The compiler bundle is fetched from the server on demand
# (the client-compile tier), exactly as on the web.
set -e
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
# WHERE IT LANDS. An installed app is the point — LaunchServices only claims the
# .declare extension for an app in an Applications directory, so a double-click
# reaches nothing until it lives in one. Best writable wins:
#
#   /Applications    the real install, visible to every user
#   ~/Applications   when /Applications needs an admin this shell does not have
#   mac-host/        last resort, in the tree beside its sources — always writable,
#                    and at that depth it SELF-LOCATES (Bridge.distroRoot walks up
#                    from the executable and finds the tree five levels above)
#
# Not bundles/: that is a BUILD_ID input, so an app there would bump every deploy's
# cache-buster on each mac build. An explicit argument overrides the cascade.
if [ -n "$1" ]; then
  DEST="$1"
elif [ -w /Applications ]; then
  DEST="/Applications"
elif mkdir -p "$HOME/Applications" 2>/dev/null && [ -w "$HOME/Applications" ]; then
  DEST="$HOME/Applications"
else
  DEST="$ROOT/mac-host"
fi
OUT="$DEST/Declare Mac.app"

# build.sh, not a bare `swift build`: the dev binary needs the JIT entitlement
# too, and nothing else signs it (see the note there).
bash ./build.sh >/dev/null
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"

cp .build/release/DeclareMac "$OUT/Contents/MacOS/Declare Mac"
cp "$ROOT/browser/mac-env.js" "$OUT/Contents/Resources/"
cp "$ROOT/bundles/declare-mac.js" "$OUT/Contents/Resources/"

# THE PLATFORM, BAKED. The app used to carry only its runtime and read the
# COMPILER and the LIBRARY from a Declare tree at run time — so a copy handed to
# anyone else could not compile anything ("no distro: cannot load the compiler"),
# and a copy kept beside a moving tree ran a frozen runtime against a live
# compiler, which is the mixture Bridge.checkToolchain exists to warn about.
# Both go away if the app carries the whole platform.
#
# ⚠ THE RELATIVE SHAPE IS THE INTERFACE. Every consumer already addresses these
# as `bundles/…` and `library/…` against a base — CompileService.resolve is a
# plain URL join, the compiler's library origin is a fetch host, and the host's
# fetch already reads file: URLs. Reproduce the tree's layout under Resources
# and Bridge.platformBase() can simply name Resources as the base: no loader, no
# special case, the same joins resolving somewhere else.
mkdir -p "$OUT/Contents/Resources/bundles"
cp "$ROOT/bundles/declare-compiler-mac.js" "$OUT/Contents/Resources/bundles/"
cp "$ROOT/bundles/version.json" "$OUT/Contents/Resources/bundles/"   # the toolchain id, readable with no tree
cp -R "$ROOT/library" "$OUT/Contents/Resources/"                     # components, icons and themes — all .declare source
find "$OUT/Contents/Resources/library" -name '.DS_Store' -delete     # Finder litter has no business inside a signed bundle
# The icon is GENERATED from the desktop's own Declare Viewer glyph — see
# make-icon.mjs, which instantiates the real AppGlyph and screenshots it, so the
# app icon cannot drift from the one the program draws. Regenerate with
# `node make-icon.mjs` (needs a dev server); the .icns is committed so a build
# never depends on a running server.
# `./Declare.icns`, not `$(dirname "$0")/…`: the script already cd'd into its own
# directory above, so the second dirname resolved relative to there — correct only
# when invoked as `./bundle.sh` from inside mac-host, and silently icon-less when
# invoked as `mac-host/bundle.sh` from the repo root (it looked for
# mac-host/mac-host/Declare.icns, found nothing, and the `|| echo` made that read
# as "the icon was never generated" rather than "this script cannot find it").
cp ./Declare.icns "$OUT/Contents/Resources/" 2>/dev/null || echo "  (no Declare.icns — run: node make-icon.mjs)"

cat > "$OUT/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
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
  <!-- WHICH PLATFORM this app was assembled from: the distro's BUILD_ID at bundle
       time (a content hash of runtime + compiler bundle + web client + library).
       The app carries its own declare-mac.js but reads the COMPILER from the tree,
       so the two can drift apart the moment the tree moves under it — an old
       runtime paired with a new compiler is exactly the staleness that cost a
       whole misdiagnosis on 2026-08-01. Stamped so the mismatch can be seen. -->
  <key>DeclareToolchain</key><string>__TOOLCHAIN__</string>
  <!-- WHERE THE DISTRO IS. A program opened from disk gets its library and the
       compiler from a Declare tree; this names the one this app was built from.
       Stamped rather than read from the environment because a Finder launch
       inherits launchd's environment, not a shell's — DECLARE_ROOT works from a
       terminal and would be silently absent on a double-click. DECLARE_ROOT
       still wins when it IS set (Bridge.distroBase). -->
  <key>DeclareDistroRoot</key><string>__DISTRO_ROOT__</string>
</dict>
</plist>
PLIST
# the stamp is the tree this app was built from
/usr/bin/sed -i '' "s|__DISTRO_ROOT__|$ROOT|" "$OUT/Contents/Info.plist"
TOOLCHAIN="$(/usr/bin/sed -n 's/.*"build" *: *"\([^"]*\)".*/\1/p' "$ROOT/bundles/version.json" 2>/dev/null)"
/usr/bin/sed -i '' "s|__TOOLCHAIN__|${TOOLCHAIN:-unstamped}|" "$OUT/Contents/Info.plist"

# Sign with the JIT entitlement. This is NOT cosmetic: without
# com.apple.security.cs.allow-jit (plus the hardened runtime) JavaScriptCore
# silently runs its interpreter, and the whole runtime is ~16x slower —
# measured 437ms vs 27ms on the shared engine bench. An mmap(MAP_JIT) probe
# reports success either way, so the only honest check is a benchmark.
# ⚠ `jit.entitlements`, NOT "$(dirname "$0")/jit.entitlements" — line 13 already
# cd'd into this directory, so the $0-relative form resolved to
# mac-host/mac-host/jit.entitlements and codesign failed. With the error
# suppressed and a fallback that signs WITHOUT the entitlement, every app built
# by the documented invocation (`bash mac-host/bundle.sh`, run from the repo
# root) silently shipped an interpreter-only JavaScriptCore. Measured on the
# 20M-iteration engine bench: 837ms against node's 19ms.
#
# So the failure is LOUD now. A silent fallback here costs 40x and looks like a
# slow app, not a broken build step.
if ! codesign --force --deep --sign - --options runtime \
       --entitlements jit.entitlements "$OUT"; then
  echo "⚠︎  could not apply the JIT entitlement — JavaScriptCore will run its" >&2
  echo "    INTERPRETER and everything JS will be ~40x slower." >&2
  codesign --force --deep --sign - "$OUT" || true
fi

# VERIFY WHAT WAS ACTUALLY SIGNED, not what was asked for. The regression above
# was a codesign invocation that failed for its own reasons — a bad path — so
# checking the exit status of the call we hoped would work is not the same as
# checking the app. Ask the bundle. A build that cannot produce a JIT-capable
# app is a FAILED build: shipping a 40x-slower one silently is what cost weeks.
if ! codesign -d --entitlements - "$OUT" 2>&1 | grep -q "com.apple.security.cs.allow-jit"; then
  echo "✗  $OUT is signed WITHOUT com.apple.security.cs.allow-jit." >&2
  echo "   JavaScriptCore would run its interpreter (~40x slower on every path)." >&2
  echo "   Inspect with: codesign -d --entitlements - \"$OUT\"" >&2
  exit 1
fi
echo "built $OUT  (JIT entitlement verified)"

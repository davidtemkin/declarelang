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
# Default: BESIDE ITS SOURCES, in the tree. Same split as mac-host/winb — the
# .swift is tracked, the built thing is per-machine and gitignored. Two reasons
# for here rather than anywhere else: `bundles/` is a BUILD_ID input, so an app
# there would bump every deploy's cache-buster on each mac build; and an app at
# this depth SELF-LOCATES — Bridge.distroRoot() walks up from the executable
# looking for bundles/declare-mac.js and finds the tree five levels up, so a
# dev build needs no stamp at all. Pass a directory to put it elsewhere
# (`bundle.sh ~/Applications`), which is when the Info.plist stamp earns its keep.
OUT="${1:-$ROOT/mac-host}/Declare Mac.app"

swift build -c release >/dev/null
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"

cp .build/release/DeclareMac "$OUT/Contents/MacOS/Declare Mac"
cp "$ROOT/browser/mac-env.js" "$OUT/Contents/Resources/"
cp "$ROOT/bundles/declare-mac.js" "$OUT/Contents/Resources/"
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

# Sign with the JIT entitlement. This is NOT cosmetic: without
# com.apple.security.cs.allow-jit (plus the hardened runtime) JavaScriptCore
# silently runs its interpreter, and the whole runtime is ~16x slower —
# measured 437ms vs 27ms on the shared engine bench. An mmap(MAP_JIT) probe
# reports success either way, so the only honest check is a benchmark.
codesign --force --deep --sign - --options runtime --entitlements "$(dirname "$0")/jit.entitlements" "$OUT" 2>/dev/null ||   codesign --force --deep --sign - "$OUT" 2>/dev/null || true
echo "built $OUT"

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
OUT="${1:-$HOME/Desktop}/Declare Mac.app"

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
</dict>
</plist>
PLIST

# Sign with the JIT entitlement. This is NOT cosmetic: without
# com.apple.security.cs.allow-jit (plus the hardened runtime) JavaScriptCore
# silently runs its interpreter, and the whole runtime is ~16x slower —
# measured 437ms vs 27ms on the shared engine bench. An mmap(MAP_JIT) probe
# reports success either way, so the only honest check is a benchmark.
codesign --force --deep --sign - --options runtime --entitlements "$(dirname "$0")/jit.entitlements" "$OUT" 2>/dev/null ||   codesign --force --deep --sign - "$OUT" 2>/dev/null || true
echo "built $OUT"

#!/bin/bash
# bundle.sh — assemble Declare.app.
#
# The app is the Swift shell plus the two JS scripts it evaluates (the env shim
# and the runtime+backend+boot bundle). Those live in Resources, which is where
# Bridge.resource() looks first — so a bundled app needs no DECLARE_ROOT and no
# checkout beside it. The compiler bundle is fetched from the server on demand
# (the client-compile tier), exactly as on the web.
set -e
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
OUT="${1:-$HOME/Desktop}/Declare.app"

swift build -c release >/dev/null
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"

cp .build/release/DeclareMac "$OUT/Contents/MacOS/Declare"
cp "$ROOT/browser/mac-env.js" "$OUT/Contents/Resources/"
cp "$ROOT/bundles/declare-mac.js" "$OUT/Contents/Resources/"
# The icon is GENERATED from the desktop's own Declare Viewer glyph — see
# make-icon.mjs, which instantiates the real AppGlyph and screenshots it, so the
# app icon cannot drift from the one the program draws. Regenerate with
# `node make-icon.mjs` (needs a dev server); the .icns is committed so a build
# never depends on a running server.
cp "$(dirname "$0")/Declare.icns" "$OUT/Contents/Resources/" 2>/dev/null || echo "  (no Declare.icns — run: node make-icon.mjs)"

cat > "$OUT/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Declare</string>
  <key>CFBundleDisplayName</key><string>Declare</string>
  <key>CFBundleExecutable</key><string>Declare</string>
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

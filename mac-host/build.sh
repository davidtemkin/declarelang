#!/bin/bash
# build.sh — the Swift host binary, signed so it can actually compile JavaScript.
#
# WHY THIS EXISTS AS A STEP AT ALL. `swift build` alone produces a binary that
# JavaScriptCore will NOT let JIT: on Apple Silicon everything is signed, and an
# ad-hoc SwiftPM signature carries no `com.apple.security.cs.allow-jit`, so JSC
# quietly runs its interpreter. Measured on the same 3M-iteration Math.imul
# probe: 84.2ms unsigned against 1.0ms signed — 84x, on every JS path in the
# host.
#
# This was invisible for as long as the bundled app had the same problem (fixed
# in 896a99ca), and it outlived that fix: bundle.sh signs the .app, and nothing
# signed the bare `.build/release/DeclareMac` that the dev loop, the conformance
# suite and the gates all run. So every JS-side number those produced was an
# interpreter's. The startup assertion in Bridge.assertJIT is what found it.
#
# ⚠ `--options runtime` AND the entitlement, together. The hardened runtime
# without the entitlement is the configuration that DENIES the JIT; the
# entitlement is only consulted because the hardened runtime is on.
set -e
cd "$(dirname "$0")"

BIN=".build/release/DeclareMac"

# ⚠ CHECK THE BINARY MOVED, not just the exit status. `swift build` can report
# a COMPILE ERROR and still exit 0 (observed 2026-08-17: "cannot find 'front' in
# scope" among the warnings, status 0, previous binary left in place). `set -e`
# therefore did not fire, bundle.sh went on to sign and install the STALE
# binary, and it printed "built … (JIT entitlement verified)" — so three
# rebuilds in a row silently shipped code from before the edit, and the new
# control verb read as "unknown" with no hint why.
#
# The fix is the rule this script already applies to codesign one line down:
# verify what actually happened, never what was asked for. Fail if an input is
# newer than the artifact.
BEFORE=$(stat -f %m "$BIN" 2>/dev/null || echo 0)
swift build -c release "$@"
NEWEST=$(find Sources -name '*.swift' -exec stat -f %m {} + 2>/dev/null | sort -rn | head -1)
AFTER=$(stat -f %m "$BIN" 2>/dev/null || echo 0)
if [ "$AFTER" = "0" ] || { [ -n "$NEWEST" ] && [ "$NEWEST" -gt "$AFTER" ]; }; then
  echo "✗  $BIN is older than its sources — the build did not produce a new binary." >&2
  echo "   Re-run without the pipe to see the error swift build hid:  swift build -c release" >&2
  [ "$BEFORE" = "$AFTER" ] && echo "   (the binary did not change at all)" >&2
  exit 1
fi
codesign --force --sign - --options runtime --entitlements jit.entitlements "$BIN"

# Verify what was signed, not what was asked for — the original regression was a
# codesign call that failed for its own reasons while the build reported success.
if ! codesign -d --entitlements - "$BIN" 2>&1 | grep -q "com.apple.security.cs.allow-jit"; then
  echo "✗  $BIN is signed WITHOUT com.apple.security.cs.allow-jit." >&2
  echo "   JavaScriptCore would run its interpreter (~84x slower on every JS path)." >&2
  exit 1
fi
echo "built $BIN  (JIT entitlement verified)"

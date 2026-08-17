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

swift build -c release "$@"

BIN=".build/release/DeclareMac"
codesign --force --sign - --options runtime --entitlements jit.entitlements "$BIN"

# Verify what was signed, not what was asked for — the original regression was a
# codesign call that failed for its own reasons while the build reported success.
if ! codesign -d --entitlements - "$BIN" 2>&1 | grep -q "com.apple.security.cs.allow-jit"; then
  echo "✗  $BIN is signed WITHOUT com.apple.security.cs.allow-jit." >&2
  echo "   JavaScriptCore would run its interpreter (~84x slower on every JS path)." >&2
  exit 1
fi
echo "built $BIN  (JIT entitlement verified)"

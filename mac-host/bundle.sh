#!/bin/bash
# bundle.sh — assemble "Declare Mac.app".
#
# TWO WORDS, deliberately: the product is Declare, and this is its Mac host —
# `DeclareMac` is the SwiftPM target's identifier, never a name shown to anyone.
#
# THE ASSEMBLY MOVED. This script used to do the work: run build.sh for the
# Swift binary and `cp` the JS bundles, the library and the chrome programs in
# whatever state it found them. That is how a "fresh" build could ship a runtime
# older than runtime/src — it rebuilt one of its inputs and trusted the rest.
#
# The build now walks the whole chain and then PROVES the result (no baked
# artifact older than an input; every baked file hash-matching its source), so
# the assembly has to live where the artifact→inputs table lives:
#
#     tools/internal/build-mac-app.mjs        ← the build
#     tools/internal/bundle-freshness.mjs     ← what each bundle is built from
#
# This wrapper stays because it is the documented invocation and the one in
# everyone's shell history. `npm run build:mac` is the same thing.
set -e
exec node "$(cd "$(dirname "$0")/.." && pwd)/tools/internal/build-mac-app.mjs" "$@"

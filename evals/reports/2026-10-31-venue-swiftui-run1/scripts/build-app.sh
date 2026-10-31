#!/bin/sh
# Builds The Venue and wraps it in a signed .app bundle at build/Venue.app.
#   scripts/build-app.sh            # release
#   CONFIGURATION=debug scripts/build-app.sh
set -eu

cd "$(dirname "$0")/.."
CONFIGURATION="${CONFIGURATION:-release}"

swift build -c "$CONFIGURATION"
BIN_DIR="$(swift build -c "$CONFIGURATION" --show-bin-path)"

APP="build/Venue.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/Venue" "$APP/Contents/MacOS/Venue"
cp Support/Info.plist "$APP/Contents/Info.plist"

# Ad-hoc signature so the Keychain can tell this app's items apart.
codesign --force --sign - "$APP"

echo "Built $APP"

// app — the ONE place the native rigs ask "where is the host?".
//
// There used to be two answers, and that was the problem. The gates and the
// conformance suite drove an INSTALLED "Declare Mac.app"; mac-shell.test.mjs and
// parity.mjs spawned the bare `.build/release/DeclareMac` with DECLARE_ROOT set,
// which made it read its runtime, compiler and library live from the tree. So
// half the rigs measured a configuration that nobody ships, and the two could
// disagree without anything saying so.
//
// There is now one build (tools/internal/build-mac-app.mjs) producing one app,
// and every rig launches THAT — so what the gates measure is what ships.
//
// The search order is the build's install cascade, in reverse priority: the
// build writes to the first writable of these, so a rig finds the newest app by
// looking in the same order.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Where a build may have installed the app, best first. LaunchServices only
 *  claims the .declare extension for an app in an Applications directory, which
 *  is why /Applications leads; mac-host/ is the last resort for a checkout on a
 *  machine where neither is writable. */
export const SEARCH = [
  "/Applications",
  path.join(process.env.HOME ?? "", "Applications"),
  HERE,
];

/** The installed app bundle, or null when no build has run. */
export function hostApp() {
  for (const dir of SEARCH) {
    const app = path.join(dir, "Declare Mac.app");
    if (existsSync(path.join(app, "Contents/MacOS/Declare Mac"))) return app;
  }
  return null;
}

/** The executable every rig spawns, or null. ⚠ "Declare Mac" WITH A SPACE — a
 *  `pkill -f DeclareMac` does not match it, which once cost an hour. */
export function hostBinary() {
  const app = hostApp();
  return app === null ? null : path.join(app, "Contents/MacOS/Declare Mac");
}

/** The message a rig prints when there is nothing to drive. */
export const NO_HOST =
  "no Declare Mac.app found — build one with `npm run build:mac`";

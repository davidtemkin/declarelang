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
/** The app's name — "Declare Mac" unless a VARIANT build says otherwise
 *  (`DECLARE_MAC_APP="Declare Mac Graphics"`): a second tree on the same
 *  machine builds, installs and drives its own app without touching the
 *  first. The control pipe follows the same knob (`DECLARE_CTL_PIPE`). */
export const APP_NAME = process.env.DECLARE_MAC_APP ?? "Declare Mac";
/** Where the rigs load programs from: main's dev server — what is tested and
 *  gated is the tree it serves (`node tools/reload-dev.mjs`). Override with
 *  DECLARE_ORIGIN, as the conformance and crossrender rigs do. */
export const ORIGIN = process.env.DECLARE_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? "8200"}`;
export const CTL_IN = process.env.DECLARE_CTL_PIPE ?? "/tmp/declare-ctl.in";
export const CTL_OUT = CTL_IN.replace(/\.in$/, "") + ".out";

export const SEARCH = [
  "/Applications",
  path.join(process.env.HOME ?? "", "Applications"),
  HERE,
];

/** The installed app bundle, or null when no build has run. */
export function hostApp() {
  for (const dir of SEARCH) {
    const app = path.join(dir, `${APP_NAME}.app`);
    if (existsSync(path.join(app, `Contents/MacOS/${APP_NAME}`))) return app;
  }
  return null;
}

/** The executable every rig spawns, or null. ⚠ "Declare Mac" WITH A SPACE — a
 *  `pkill -f DeclareMac` does not match it, which once cost an hour. */
export function hostBinary() {
  const app = hostApp();
  return app === null ? null : path.join(app, `Contents/MacOS/${APP_NAME}`);
}

/** The message a rig prints when there is nothing to drive. */
export const NO_HOST =
  `no ${APP_NAME}.app found — build one with \`npm run build:mac\``;

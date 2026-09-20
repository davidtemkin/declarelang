// bake-mac — build a MEASUREMENT Mac app: one tree's host, carrying that tree's
// METERED runtime, installed under its own name and control pipe.
//
//   node mac-host/profile/bake-mac.mjs --tree ~/Code/Declare-Before --app "Declare Mac Before"
//   node mac-host/profile/bake-mac.mjs --tree ~/Code/Declare-After  --app "Declare Mac After"
//
// WHY A SWAP AND NOT A BUILD FLAG. `mac-host/bundle.sh --runtime <bundle>` is
// what run.mjs's header still documents, and it no longer exists: bundle.sh is
// now a two-line wrapper around build-mac-app.mjs, which bakes
// `bundles/declare-mac.js` and PROVES every baked file against its source. So a
// metered app is made in two steps — build the app honestly, then replace the
// one file and re-sign — rather than by teaching the real build to accept an
// unverifiable runtime.
//
// THE SIGNATURE IS THE POINT OF THE SECOND STEP. Touching anything inside the
// bundle invalidates it, and an unsigned or wrongly-signed host loses
// `com.apple.security.cs.allow-jit` — at which point JavaScriptCore runs its
// interpreter and every JS path is ~84x slower. That is not a subtle skew; it
// would be the whole measurement. So this re-signs with the same entitlements
// and then VERIFIES what was signed, exactly as the real build does.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.resolve(HERE, "../..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const TREE = path.resolve(flag("tree", ""));
const APP_NAME = flag("app", "");
const PIPE = flag("pipe", "");
if (!TREE || !APP_NAME) {
  console.error("usage: bake-mac.mjs --tree <dir> --app \"Declare Mac Before\" [--pipe /tmp/declare-ctl-before.in]");
  process.exit(2);
}
if (!existsSync(path.join(TREE, "runtime/src/meters.ts"))) {
  console.error(`bake-mac: ${TREE} has no runtime/src/meters.ts — it is not an instrumented measurement copy`);
  process.exit(1);
}

const tag = path.basename(TREE).toLowerCase();
const METERED = path.join(MAIN, "mac-host/bundles", `declare-mac.${tag}.profile.js`);
if (!existsSync(METERED)) {
  console.error(`bake-mac: no metered runtime at ${METERED}\n  node mac-host/profile/build-runtime.mjs --root ${TREE}`);
  process.exit(1);
}

const env = { ...process.env, DECLARE_MAC_APP: APP_NAME };
if (PIPE) env.DECLARE_CTL_PIPE = PIPE;

// ── 1. the app, built honestly from its own tree ────────────────────────────
console.log(`bake-mac: building ${APP_NAME} from ${TREE}`);
execFileSync("node", [path.join(TREE, "tools/internal/build-mac-app.mjs"), "--force"],
             { cwd: TREE, env, stdio: "inherit" });

// ── 2. the metered runtime in place of the shipping one ─────────────────────
const { hostApp } = await import(path.join(TREE, "mac-host/app.mjs"));
const APP = (() => {
  for (const dir of ["/Applications", path.join(process.env.HOME ?? "", "Applications"), path.join(TREE, "mac-host")]) {
    const p = path.join(dir, `${APP_NAME}.app`);
    if (existsSync(path.join(p, "Contents/MacOS", APP_NAME))) return p;
  }
  return null;
})();
if (!APP) { console.error(`bake-mac: ${APP_NAME}.app not found after the build`); process.exit(1); }

const dest = path.join(APP, "Contents/Resources/declare-mac.js");
const was = statSync(dest).size;
copyFileSync(METERED, dest);
console.log(`  runtime swapped: ${(was / 1024).toFixed(0)} KB → ${(statSync(dest).size / 1024).toFixed(0)} KB (metered)`);

// ── 3. re-sign, and verify what was actually signed ─────────────────────────
execFileSync("codesign", ["--force", "--sign", "-", "--options", "runtime",
                          "--entitlements", path.join(TREE, "mac-host/jit.entitlements"), APP],
             { stdio: ["ignore", "pipe", "inherit"] });
const ents = execFileSync("codesign", ["-d", "--entitlements", "-", APP],
                          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
if (!ents.includes("com.apple.security.cs.allow-jit")) {
  console.error("bake-mac: re-signed WITHOUT com.apple.security.cs.allow-jit — JavaScriptCore would interpret, and the run would measure that instead.");
  process.exit(1);
}
console.log(`  re-signed · JIT entitlement verified`);
console.log(`\n${APP}`);
console.log(`run it with:  DECLARE_CONTROL=1${PIPE ? ` DECLARE_CTL_PIPE=${PIPE}` : ""} "${path.join(APP, "Contents/MacOS", APP_NAME)}"`);

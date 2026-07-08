// precompile.mjs — build the PRODUCTION `<name>.lzx.js` + static `<name>.html` wrapper for
// each bench app, so serve-static.mjs (or any dumb host / CDN) serves them with NO compiler.
// Uses the pinned toolchain (distro.mjs → openlaszlo-5.0). Re-run after editing a bench source.
//
//   node precompile.mjs                                          # the default non-deferred apps
//   node precompile.mjs ../apps/calendar/cal-bench-eager.lzx ... # explicit list

import path from "node:path";
import fs from "node:fs";
import { DISTRO } from "./distro.mjs";

const { compileApp } = await import(DISTRO + "/server/compile.mjs");
const { wrapperFor } = await import(DISTRO + "/server/wrapper.mjs");

const DEFAULTS = [
  "../apps/calendar/cal-bench-eager.lzx",      // calendar — immediate (eager + inline data)
  "../apps/dashboard/dashboard-bench.lzx",     // dashboard — eager skip-login
];
const apps = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS).map((a) => path.resolve(a));

for (const abs of apps) {
  const r = compileApp(abs, { profile: false, debug: false, backtrace: false });   // PRODUCTION
  if (r.unsupported) { console.log("UNSUPPORTED", path.basename(abs), "—", r.unsupported); continue; }
  fs.writeFileSync(abs + ".js", r.js);
  const w = wrapperFor("/" + path.basename(abs), abs, new URLSearchParams());
  const htmlAbs = abs.replace(/\.lzx$/, ".html");
  fs.writeFileSync(htmlAbs, w.html);
  console.log(`${path.basename(abs)} → ${(r.js.length / 1024 | 0)}KB ${path.basename(abs)}.js + ${path.basename(htmlAbs)}   (tag ${r.tag})`);
}
console.log(`\nserve with:  node serve-static.mjs ../apps 8090   (toolchain: ${DISTRO})`);

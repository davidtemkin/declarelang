// distro.mjs — the ONE place that decides which OpenLaszlo toolchain the benchmarks measure.
//
// Default = the STABLE `openlaszlo-5.0` distro: a fixed baseline whose compiler + runtime do
// NOT change underneath the numbers. This is deliberate — the benchmarks now live under
// openlaszlo-neo/, but they must keep measuring 5.0 so a result shift means an *app/startup*
// change, never a toolchain change. (When neo's runtime/compiler are ready to be the target,
// flip this in one place: set BENCH_DISTRO, or edit the fallback below.)
//
//   BENCH_DISTRO=/path/to/distro   node serve.mjs ...     # measure a different toolchain
//   BENCH_DISTRO=../..             node serve.mjs ...      # e.g. the enclosing openlaszlo-neo
//
// The distro must expose server/compile.mjs + server/wrapper.mjs + runtime/ (5.0's flat layout).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function locate() {
  if (process.env.BENCH_DISTRO) return path.resolve(process.cwd(), process.env.BENCH_DISTRO);
  // walk up from tools/ looking for a sibling `openlaszlo-5.0` that has the server entrypoint —
  // works at the old top-level location AND under openlaszlo-neo/benchmarks/tools/.
  let d = HERE;
  for (let i = 0; i < 7; i++) {
    const cand = path.join(d, "openlaszlo-5.0");
    if (fs.existsSync(path.join(cand, "server", "compile.mjs"))) return cand;
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  throw new Error("distro.mjs: could not locate openlaszlo-5.0 (set BENCH_DISTRO to override)");
}

export const DISTRO = locate();
export const RUNTIME = path.join(DISTRO, "runtime");

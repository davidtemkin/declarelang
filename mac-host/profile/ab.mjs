// ab — per-switch A/B inside ONE build, same session: each optimization that has a
// switch runs ON and OFF back-to-back (twice, alternating) on the case it targets.
//   node mac-host/profile/ab.mjs [--targets chrome,mac]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = path.resolve(HERE, "../..");
const argv = process.argv.slice(2);
const TARGETS = (argv[argv.indexOf("--targets") + 1] ?? "chrome,mac").split(",");
const sh = (cmd, args, env = {}) => { try { return execFileSync(cmd, args, { cwd: TREE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }); } catch (e) { return (e.stdout ?? "") + "\nFAILED " + (e.stderr ?? "").slice(0, 200); } };
const R = (f) => { try { return JSON.parse(readFileSync(path.join(HERE, "results", f), "utf8")); } catch { return null; } };
const report = (name, on, off, key = "js") => {
  const v = (r) => r ? (key === "js" ? r.win.settleMs : key === "p95" ? (r.gaps?.p95 ?? null) : null) : null;
  const a = on.map(v).filter((x) => x != null), b = off.map(v).filter((x) => x != null);
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  console.log(`AB|${name}|${avg(a).toFixed(1)}|${avg(b).toFixed(1)}|${a.map((x) => x.toFixed(0)).join(",")}|${b.map((x) => x.toFixed(0)).join(",")}`);
};
if (TARGETS.includes("chrome")) {
  for (const [name, flag, app, stim] of [["measure memo", "--nomemo", "weather", "city"], ["one place() per wave", "--placepersize", "weather", "city"], ["skip empty settles", "--settleempty", "weather", "city"]]) {
    const on = [], off = [];
    for (let i = 0; i < 2; i++) {
      sh(process.execPath, ["mac-host/profile/web.mjs", `apps/${app}/${app}.declare`, "--stim", stim, "--render", "dom", "--inpage", "--label", "ab-on"]); on.push(R(`web-${app}-${stim}-inpage-dom-ab-on.json`));
      sh(process.execPath, ["mac-host/profile/web.mjs", `apps/${app}/${app}.declare`, "--stim", stim, "--render", "dom", "--inpage", flag, "--label", "ab-off"]); off.push(R(`web-${app}-${stim}-inpage-dom-ab-off.json`));
    }
    report(`chrome DOM · ${name} · ${app}:${stim}`, on, off);
  }
}
if (TARGETS.includes("mac")) {
  for (const jit of ["jit", "nojit"]) {
    console.log(sh("bash", ["mac-host/bundle.sh", "--runtime", "mac-host/bundles/declare-mac.profile.js", ...(jit === "nojit" ? ["--nojit"] : [])]).split("\n").filter((l) => /toolchain|FAILED/.test(l)).join("\n"));
    const cases = [
      ["binary geometry", { DECLARE_JS_JSON_GEOM: "1" }, "calendar", "mode", true],
      ["one place() per wave", { DECLARE_JS_LAYOUT_PLACE_PER_SIZE: "1" }, "weather", "city", true],
      ["measure memo", { DECLARE_JS_NO_MEASURE_MEMO: "1" }, "weather", "city", true],
      ["skip empty settles", { DECLARE_JS_SETTLE_EMPTY: "1" }, "weather", "city", true],
    ];
    if (jit === "jit") cases.push(["frost capture off main", { DECLARE_FROST_SYNC: "1" }, "weather", "resize", false]);
    for (const [name, env, app, stim, inpage] of cases) {
      const on = [], off = [], args = (label) => ["mac-host/profile/run.mjs", `apps/${app}/${app}.declare`, "--stim", stim, ...(inpage ? ["--inpage"] : []), "--label", label];
      const file = (label) => `${app}-${stim}${inpage ? "-inpage" : ""}-${label}.json`;
      for (let i = 0; i < 2; i++) {
        sh(process.execPath, args(`ab-on-${jit}`)); on.push(R(file(`ab-on-${jit}`)));
        sh(process.execPath, args(`ab-off-${jit}`), env); off.push(R(file(`ab-off-${jit}`)));
      }
      if (inpage) report(`mac ${jit} · ${name} · ${app}:${stim}`, on, off);
      else {
        const m = (r) => { const x = /MOTION gap ms p50=([\d.]+) p95=([\d.]+) max=([\d.]+)\s+over=(\d+)\s+\(n=(\d+)\)/.exec(r?.stats ?? ""); const c = /commit ms\s+p50=([\d.]+) p95=([\d.]+)/.exec(r?.stats ?? ""); return x ? `${x[5]} frames, gap p95 ${x[2]} ms, commit p95 ${c ? c[2] : "?"} ms` : "?"; };
        console.log(`AB|mac ${jit} · ${name} · ${app}:resize-window|${on.map(m).join(" / ")}|${off.map(m).join(" / ")}||`);
      }
    }
  }
}
console.log("== ab done");

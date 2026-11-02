// program-why — for one corpus program built and discarded: what keeps the
// discarded program alive (retaining path to its App), which rules stay
// standing, and which kernel cells it never gave back (allocation sites).
//   node --expose-gc test/soak/program-why.mjs <app> [--cycles=6]
import { readFileSync } from "node:fs";
import { build, run, R, RT, ROOT, sleep, gc, liveRules, ruleDiff, trackCells } from "./lib.mjs";
import { retainingPaths } from "./retainers.mjs";

RT.provideTransport(() => Promise.reject(new Error("offline soak")));
const name = process.argv[2] ?? "todo";
const file = name.endsWith(".declare") ? name : `${ROOT}/apps/${name}/${name}.declare`;
const cycles = Number(process.argv.find((a) => a.startsWith("--cycles="))?.slice(9) ?? 6);
const r = await build(readFileSync(file, "utf8"), { originDir: file.replace(/\/[^/]+$/, ""), mainId: file });
const once = async (tag) => { const app = run(r); R.settle(); await sleep(15); if (tag) app.__soakDead = {}; app.discard(); R.settle(); await sleep(5); };
for (let i = 0; i < 3; i++) await once(false);
await gc();
const rules0 = liveRules(), cells0 = R.kernel().cells();
const t = trackCells();
for (let i = 0; i < cycles; i++) await once(i === 0);
await gc();
console.log(`${name}: per program — cells high-water +${(R.kernel().cells() - cells0) / cycles}`);
console.log("rules left standing:", JSON.stringify(ruleDiff(rules0, liveRules())));
const rep = t.report(8);
t.stop();
console.log(`single cells allocated and not freed: ${rep.cellsHeld} (${rep.cellsHeld / cycles}/program); new blocks: ${rep.newBlocks}`);
for (const [s, n] of rep.bySite) console.log("  ", n, s.replace(/Cell\.(ensure|track|cellId) \(runtime\/dist\/reactive\.js:\d+:\d+\) < /g, "").slice(0, 330));
for (const [s, n] of rep.blockSites) console.log("  block", n, s.slice(0, 250));
const { targets, paths, mode } = retainingPaths({ mark: "__soakDead", max: 1 });
console.log(`first discarded App alive: ${targets > 0}${mode ? " (" + mode + ")" : ""}`);
for (const p of paths) console.log(p);
process.exit(0);

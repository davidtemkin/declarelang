// virtual-heap — the virtual-scroll.declare program headless: scrollY moved
// and the 400 records replaced every cycle. Heap census per cycle.
import { readFileSync } from "node:fs";
import { build, run, soak, R, sleep, gc, HERE } from "./lib.mjs";
import { census, censusDiff, retainingPaths } from "./retainers.mjs";
// --keyed: records carry an id, new ids each replacement (a feed, search results)
const KEYED = process.argv.includes("--keyed");
let src = readFileSync(HERE + "/virtual-scroll.declare", "utf8");
if (KEYED) src = src.replace('({ k: "row " + i + "." + app.seq })', '({ id: "id" + (i + app.seq * 400), k: "row " + i + "." + app.seq })');
const r = await build(src);
const app = run(r);
const step = async (i) => { app.list.scrollY = (i % 4) * 300; R.settle(); await sleep(10); app.seq = i + 1; R.settle(); await sleep(10); };
for (let i = 0; i < 20; i++) await step(i);
await gc(); const a = census();
await soak("virtualized list scrolled + records replaced (headless)", step, { warm: 0, n: 100 });
await gc(); const b = census();
console.log("census growth per cycle:", JSON.stringify(censusDiff(a, b, 12, 100)));
// tag the records of one generation, replace them, and ask what holds them
const rows = app.d.value.rows;
for (const k of [0, 5, 20, 399]) rows[k].__soakDead = {};
for (let i = 200; i < 205; i++) await step(i);
await gc();
const { targets, paths, mode } = retainingPaths({ mark: "__soakDead", max: 2 });
console.log(`records of a replaced generation still alive: ${targets} ${mode ?? ""}`);
for (const p of paths) console.log(p, "\n");
process.exit(0);

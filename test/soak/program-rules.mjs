// program-rules — a corpus program built and discarded: which kernel rules
// made during its life are still standing after app.discard(), by label and
// creation site.  node --expose-gc test/soak/program-rules.mjs <app> [--cycles=4]
import { readFileSync } from "node:fs";
import { build, run, R, RT, ROOT, sleep, trackRules } from "./lib.mjs";
RT.provideTransport(() => Promise.reject(new Error("offline soak")));
const name = process.argv[2] ?? "weather";
const file = name.endsWith(".declare") ? name : `${ROOT}/apps/${name}/${name}.declare`;
const cycles = Number(process.argv.find((a) => a.startsWith("--cycles="))?.slice(9) ?? 4);
const r = await build(readFileSync(file, "utf8"), { originDir: file.replace(/\/[^/]+$/, ""), mainId: file });
const once = async () => { const app = run(r); R.settle(); await sleep(15); app.discard(); R.settle(); await sleep(5); };
for (let i = 0; i < 2; i++) await once();
const t = trackRules();
for (let i = 0; i < cycles; i++) await once();
const rep = t.report(10); t.stop();
console.log(`${name}: rules still standing from ${cycles} discarded programs: ${rep.rulesHeld}`);
for (const [s, n] of rep.bySite) console.log("  ", n, s.slice(0, 600));
process.exit(0);

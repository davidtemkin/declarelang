// programs — whole corpus programs built and discarded, over and over
// (headless). After app.discard() a program must give back everything: the
// kernel tables return to their mark, no Node of it stays in the JS heap.
//   node --expose-gc test/soak/programs.mjs [--only=todo,calendar] [--n=20]
import { readFileSync } from "node:fs";
import { build, run, soak, R, RT, ROOT, sleep, extraReading } from "./lib.mjs";

RT.provideTransport(() => Promise.reject(new Error("offline soak")));
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const APPS = ["todo", "calendar", "tracker", "docs", "desktop", "weather", "sampler", "swatchbook", "birds", "marketmap", "architecture", "lzx-calendar", "lzx-weather", "homepage"];
const only = arg("only", null)?.split(",");
const N = Number(arg("n", 20)), WARM = Number(arg("warm", 6));
const results = [];
for (const name of APPS) {
  if (only && !only.includes(name)) continue;
  const file = `${ROOT}/apps/${name}/${name}.declare`;
  let r;
  try { r = await build(readFileSync(file, "utf8"), { originDir: `${ROOT}/apps/${name}`, mainId: file }); }
  catch (e) { console.log(`SKIP   ${name}: ${e.message.split("\n")[0].slice(0, 200)}`); continue; }
  try {
    const res = await soak(`${name}: built and discarded`, async () => {
      const app = run(r); R.settle(); await sleep(15); app.discard(); R.settle(); await sleep(5);
    }, { warm: WARM, n: N });
    results.push(res);
  } catch (e) { console.log(`THROW  ${name}: ${e.stack.slice(0, 500)}`); }
  await sleep(100);
}
process.exit(0);

// profile — the profiler reports, in the program's terms, the turns and the rules that
// ran in them (how often, how often to any effect), what opened each, the rules that
// re-ran for nothing, what each
// class cost to build, what drawings cost the GPU, what still moves or waits, and the time
// each frame took to reach the screen (runtime/src/profile.ts, tools/profile.mjs);
// expect.budget holds a script to it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-profile-");
// 40 rows all read `app.picked`, which matters to two of them: Row.lit re-runs for
// nothing.
writeFileSync(join(DIR, "fan.declare"), `App [ width = 400, height = 600,
  picked: number = 0,
  next: number = { (app.picked + 1) % 40 },
  items: Dataset [ contents = { ({ rows: Array.from({ length: 40 }, (_, i) => ({ id: i })) }) } ],
  list: View [ width = 100%, datapath = { app.items.value }, layout: SimpleLayout [ axis = y ],
      Row [ datapath = :rows[] ] ],
  go: Button [ y = 560, label = "Next", onClick() { app.picked = app.next } ] ]
class Row [ width = 100%, height = 12, lit: boolean = { app.picked == :id }, fill = { lit ? 0xffcc00 : 0xeeeeee } ]`);
writeFileSync(join(DIR, "clicks.mjs"), `export default async ({ drive }) => { for (let i = 0; i < 6; i++) { await drive.click('app.."Next"'); await drive.wait(50); } };`);
// a drawing that moves with a clock, shadowed: its script is cheap, its GPU time is not
writeFileSync(join(DIR, "draw.declare"), `App [ width = 600, height = 400,
  clock: Time [ tick = frame ],
  k: number = { Math.floor(clock.now * 0.06) },
  picture: View [ width = 600, height = 400,
    draw(d: DrawContext) {
      d.shadowBlur = 12
      d.shadowColor = "rgba(0,0,0,.5)"
      for (let i = 0; i < 60; i++) { d.fillStyle = "#3366cc"; d.beginPath(); d.arc((i * 37 + app.k * 3) % 600, (i * 53) % 400, 20, 0, Math.PI * 2); d.fill() }
      } ] ]`);
// a view with a large shadow moving over a grid: the page's layer repaints under it
writeFileSync(join(DIR, "ghost.declare"), `App [ width = 900, height = 600,
  clock: Time [ tick = frame ],
  grid: View [ width = 900, height = 600, layout: WrappingLayout [ spacing = 8 ],
    Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ], Tile [ ] ],
  ghost: View [ width = 140, height = 180, fill = white, cornerRadius = 6, shadow = { shadow(0, 8, 28, 0x00000066) },
    x = { 100 + 300 * Math.sin(app.clock.now / 400) }, y = { 200 + 120 * Math.cos(app.clock.now / 500) } ] ]
class Tile [ width = 140, height = 180, fill = #dde4f0, cornerRadius = 4 ]`);
// a panel of thirty views, hidden: built and kept current all the same
writeFileSync(join(DIR, "hidden.declare"), `App [ width = 400, height = 300, open: boolean = false,
  panel: View [ visible = { app.open }, width = 400, height = 300, layout: SimpleLayout [ axis = y ],
    ${Array.from({ length: 30 }, (_, i) => `Text [ text = "line ${i}" ]`).join(", ")} ] ]`);
// budgets: a profile of the clicks, held to limits it meets and to one it does not
writeFileSync(join(DIR, "budget-ok.mjs"), `export default async ({ drive, expect }) => {
  const p = await drive.profile(async () => { for (let i = 0; i < 3; i++) { await drive.click('app.."Next"'); await drive.wait(50); } });
  expect.budget(p, { runsPerTurn: 5000, builtPerTurn: 0, settled: true });
};`);
// itemized from boot, so Row.lit (an arithmetic rule the kernel would run) is counted
writeFileSync(join(DIR, "budget-over.mjs"), `export default async ({ drive, expect }) => {
  await drive.profileFromBoot({ itemize: true });
  for (let i = 0; i < 4; i++) { await drive.click('app.."Next"'); await drive.wait(50); }
  expect.budget(await drive.profileReport(), { reranForNothing: 0, runsPerTurn: 1 });
};`);

// callbacks the program hands to script code and to a promise: the turns they open
// are named by the program's code that wrote, never inside the script
writeFileSync(join(DIR, "later.ts"), `export function later(f: () => void): void { setTimeout(f, 80); }
export function arriving(): Promise<string> { return new Promise((r) => setTimeout(() => r("arrived"), 160)); }`);
writeFileSync(join(DIR, "callbacks.declare"), `script [ "later.ts", host = browser ]
App [ width = 300, height = 200,
    n: number = 0, word: string = "",
    onInit() {
        later(() => { this.n = 5 })
        arriving().then((w: string) => { this.word = w })
        },
    Text [ text = { app.word + " " + app.n } ] ]`);
writeFileSync(join(DIR, "wait.mjs"), `export default async ({ drive }) => { await drive.wait(400); };`);

function run(tool, file, ...args) {
  return spawnSync("node", [join(ROOT, tool), join(DIR, file), ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
}
function profile(file, ...args) {
  const r = run("tools/profile.mjs", file, ...args);
  assert.equal(r.status, 0, (r.stdout ?? "") + (r.stderr ?? ""));
  return r.stdout;
}

await test("declare-profile names the costly turns and what opened them, what re-ran for nothing, building by class, and the frames to the screen", () => {
  const text = profile("fan.declare", "--scenario", join(DIR, "clicks.mjs"), "--idle", "300");
  assert.match(text, /^profile · \d+ turns/m, "a summary line");
  assert.match(text, /turns by cause: .*onClick ×6/, "turns are named by what opened them: six clicks");
  assert.match(text, /opened by app\.\S+ (?:\S+ → \S+|changed)/, "a costly turn names the writes that opened it, with their values");
  assert.match(text, /where it went: [^\n]*rules [\d.]+/, "and where its time went");
  assert.match(text, /re-ran for nothing: [^\n]*\n[\s\S]*Row\.lit/, "Row.lit: read by all forty, changed for two (under a millisecond, so counted, not listed)");
  assert.match(text, /building, by class[^\n]*\n(?: {2}[^\n]*\n)*? {2}Row ×40 /, "what the rows cost to build, by the program's class");
  assert.match(text, /built, by class\n {2}.*Row ×40/, "the rows, built once");
  assert.match(text, /Row\.lit +×\d+ [^\n]*on 40 views: app\.list\.0, app\.list\.1/, "a rule says the views it ran on");
  assert.match(text, /why [^\n]+ ran: [^\n]+/, "a costly turn's costliest rule, and why it ran");
  assert.match(text, /settled: no motion running, nothing waiting/);
  assert.doesNotMatch(text, /frames, as the page sees them/, "where Chrome's trace records the frames, the page keeps no clock of its own: it would be work on every frame");
  assert.match(text, /frames \(Chrome's trace\): \d+ with work from the page, \d+ of them reached the screen/, "Chrome's frames");
  assert.match(text, /time to display, from a frame's start to its presentation: median [\d.]+ ms/, "time to display, to presentation");
});

await test("--json gives the same report as data; itemized (the default) names the rules the kernel runs natively under --native", () => {
  const r = JSON.parse(profile("fan.declare", "--json", "--native", "--idle", "200"));
  assert.ok(r.turns > 0 && r.runs > 0, "turns and runs counted");
  assert.ok(r.built.some((b) => b.cls === "Row" && b.n === 40), "built by class");
  assert.ok(r.buildCost.some((b) => b.cls === "Row" && b.n === 40 && b.ms > 0), "what each class cost to build");
  assert.ok(r.peak.runs > 0 && r.peak.built >= 40, "the peaks budgets read");
  const it = JSON.parse(profile("fan.declare", "--json", "--scenario", join(DIR, "clicks.mjs"), "--idle", "200"));
  assert.equal(it.itemized, true);
  const lit = it.reranForNothing.find((x) => x.label === "Row.lit");
  assert.ok(lit !== undefined, "itemized, Row.lit re-ran for nothing: " + JSON.stringify(it.reranForNothing.map((x) => x.label)));
  assert.ok(lit.reads.some((x) => x === "app.picked"), "what it reads, named: " + lit.reads.join(", "));
  assert.ok(lit.wastedMs >= 0 && lit.unchanged >= 0.8 * lit.runs, "how much of it changed nothing");
  assert.ok(it.kernelRuns < r.kernelRuns, `itemized, the rules the kernel would run natively are named (${r.kernelRuns} unnamed → ${it.kernelRuns}, its own layouts)`);
});

await test("a drawing's script and its GPU time are told apart, and a clock's turns are named by the clock and folded together", () => {
  const text = profile("draw.declare", "--native", "--idle", "600");
  assert.match(text, /turns by cause: Time ticked ×\d+/, "the clock's ticks open its turns");
  assert.match(text, /turn \d+ · Time 'clock' ticked/, "each named by its clock");
  const rep = text.match(/repeated causes: one cause turn after turn\n  Time 'clock' ticked ×(\d+) in a row   [\d.]+ ms a turn \(median\) · worst [\d.]+ ms \(turn \d+\) · \d+ rule runs a turn/);
  assert.ok(rep !== null && Number(rep[1]) >= 5, "the clock's ticks fold into one line, turn after turn:\n" + text);
  const m = text.match(/app\.picture \(View\) +rasterized ×(\d+) · \d+×\d+ px · script ([\d.]+) ms each · on the GPU ([\d.]+) ms each/);
  assert.ok(m !== null, "the drawing, its script and its GPU time:\n" + text);
  assert.ok(Number(m[1]) >= 5, "redrawn as the clock moves it");
  assert.match(text, /View\.draw +×\d+ · \d+ changed/, "a drawing handed to its surface counts as a change, not as fan-out");
  assert.doesNotMatch(text, /re-ran for nothing[\s\S]*View\.draw/, "so draw() did not re-run for nothing");
});

await test("painting is named by view: the layer a moving shadow repaints, and the view that moved, with its shadow", () => {
  const text = profile("ghost.declare", "--native", "--idle", "1200");
  assert.match(text, /painting \(Chrome's raster\)[^\n]*\n {2}the page's own layer[^\n]*: \d+ tiles? rasterized, [\d.]+ ms recording them/, text);
  assert.match(text, /the GPU process rastered the page's tiles for [\d.]+ ms in all \(\d+ raster calls/, "the GPU's raster, in all");
  assert.match(text, /changed while they repainted: app\.ghost \(View\) ×\d+ \(a shadow \(28 px blur\)\)/, "the view that moved, and its shadow");
});

await test("views built but hidden are counted, by the hidden view that holds them, with exists named as the way not to build them", () => {
  const text = profile("hidden.declare", "--native", "--idle", "200");
  assert.match(text, /built but hidden: 31 views, held by app\.panel \(View\) ×31 — [^\n]*`exists = \{ … \}`/, text);
});

await test("a turn a callback opens is named by the program's code that handed it over, not 'no user code'", () => {
  const text = profile("callbacks.declare", "--scenario", join(DIR, "wait.mjs"));
  assert.match(text, /turns by cause: .*a callback in App\.onInit \(line 4\) ×2/, "both callbacks, by the body they came from:\n" + text);
});

await test("expect.budget passes a profile within its limits, and fails one past them naming what spent it", () => {
  const ok = run("tools/verify.mjs", "fan.declare", "--assert", join(DIR, "budget-ok.mjs"));
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const over = run("tools/verify.mjs", "fan.declare", "--assert", join(DIR, "budget-over.mjs"));
  assert.notEqual(over.status, 0, "past its budget, the script fails");
  assert.match(over.stdout + over.stderr, /over budget: [^\n]*turn \d+ \([^\n]*\) ran \d+ rules, over 1/, "the runs per turn, and the turn that spent them");
  assert.match(over.stdout + over.stderr, /re-ran for nothing, over 0: [^\n]*Row\.lit/, "and what re-ran for nothing, by name");
});

summarize("profile");

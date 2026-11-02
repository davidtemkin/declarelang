// program-min — the smallest programs that stay alive after app.discard():
// one feature each, built and discarded repeatedly (headless).
//   node --expose-gc test/soak/program-min.mjs
import { build, run, soak, R, RT, sleep } from "./lib.mjs";

const CASES = {
  "plain view (control)": `App [ width = 200, height = 100, View [ width = 10, height = 10 ] ]`,
  "a view reading hovered": `App [ width = 200, height = 100, View [ width = 10, height = 10, fill = { hovered ? 0xff0000 : 0x0000ff } ] ]`,
  "a Button": `App [ width = 200, height = 100, Button [ label = "b" ] ]`,
  "a Shortcuts member": `App [ width = 200, height = 100, Shortcuts [ items = { [ ({ id: "s", key: "⌘S", label: "S" }) ] } ] ]`,
  "a Keys member": `App [ width = 200, height = 100, Keys [ onKeyDown(e: KeyEvent) { } ] ]`,
  "an open Popover": `App [ width = 200, height = 100, v: View [ width = 10, height = 10 ], p: Popover [ anchorTo = { app.v }, Text [ text = "x" ] ], onReady() { app.p.show() } ]`,
  "a State applied over a binding": `App [ width = 200, height = 100, w: number = 10, View [ width = { app.w }, height = 10, State [ applied = true, width = 50 ] ] ]`,
  "a child reading visibleRect": `App [ width = 200, height = 100, v: View [ width = 10, height = 10, Text [ text = { "" + parent.visibleRect.width } ] ] ]`,
  "a moving Spring": `App [ width = 200, height = 100, t: number = 0, v: View [ width = 10, height = 10, Spring [ attribute = x, to = { app.t }, stiffness = 20, damping = 2 ] ], onReady() { app.t = 300 } ]`,
  "a scrolling list": `App [ width = 200, height = 100, d: Dataset { { "rows": [ { "k": "a" }, { "k": "b" }, { "k": "c" }, { "k": "d" }, { "k": "e" } ] } },
    View [ width = 100, height = 40, scrolls = y, datapath = { app.d.value }, layout: SimpleLayout [ axis = y ], View [ datapath = :rows[], height = 20, width = 100, Text [ text = :k ] ] ] ]`,
  "a virtualized list": `App [ width = 200, height = 100, d: Dataset [ contents = { ({ rows: Array.from({ length: 100 }, (_, i) => ({ k: "r" + i })) }) } ],
    View [ width = 100, height = 40, scrolls = y, datapath = { app.d.value }, layout: SimpleLayout [ axis = y ], View [ datapath = :rows[], virtualize = true, height = 20, width = 100, Text [ text = :k ] ] ] ]`,
  "a Menu": `App [ width = 200, height = 100, m: Menu [ items = { [{ id: "a", label: "A" }] } ] ]`,
  "a TextInput": `App [ width = 200, height = 100, TextInput [ width = 100, text = "x", onInput(v: string) { } ] ]`,
  "a Time": `App [ width = 200, height = 100, n: number = 0, Time [ tick = 50, onTick(dt: number) { app.n = app.n + 1 } ] ]`,
  "a DataSource fetching": `App [ width = 200, height = 100, s: DataSource [ url = "http://soak.invalid/x.json" ], onReady() { app.s.fetch() } ]`,
  "Markdown": `App [ width = 300, height = 100, Markdown [ width = 280, text = "# T\\n\\n**b** [l](https://example.com)" ] ]`,
};
for (const [name, src] of Object.entries(CASES)) {
  let r;
  try { r = await build(src); } catch (e) { console.log(`SKIP   ${name}: ${e.message.split("\n")[0].slice(0, 200)}`); continue; }
  await soak(name, async () => { const app = run(r); R.settle(); await sleep(20); app.discard(); R.settle(); await sleep(5); }, { warm: 6, n: 30 });
}
process.exit(0);

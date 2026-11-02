// overlays — overlays opened from inside rows, then the rows discarded while the
// overlay is open (headless). Each cycle: rebuild 4 keyless rows, open each
// row's overlay, rebuild again (the open overlays' owners are discarded).
// Also reports OverlayStrata.stack length and Keys' navigation claims.
import { build, run, soak, R, RT, OUT, sleep } from "./lib.mjs";
const PRUNE = !process.argv.includes("--no-prune");   // stand in for a press and a key each cycle
const SLEEP = Number(process.argv.find((a) => a.startsWith("--sleep="))?.slice(8) ?? 40);   // let motion land

const KINDS = {
  Popover: `pop: Popover [ anchorTo = { classroot }, Text [ text = "hi" ] ]`,
  Menu: `pop: Menu [ items = { [{ id: "a", label: "A" }, { id: "b", label: "B" }] } ]`,
  ContextMenu: `pop: ContextMenu [ items = { [{ id: "a", label: "A" }] } ]`,
  Dialog: `pop: Dialog [ title = "T", message = "M" ]`,
  Sheet: `pop: Sheet [ Text [ text = "sheet" ] ]`,
  Toast: `pop: Toast [ message = "saved" ]`,
};
const open = { Popover: "show()", Menu: "openFor(r)", ContextMenu: "openFor(r)", Dialog: "show()", Sheet: "show()", Toast: "say('hey', null)" };

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
for (const [kind, decl] of Object.entries(KINDS)) {
  if (only && only !== kind) continue;
  const src = `App [ width = 600, height = 600, seq: number = 0,
  model: Dataset [ contents = { ({ rows: [0, 1, 2, 3].map((i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 400, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    Row [ datapath = :rows[] ] ],
  Keys [ onKeyDown(e: KeyEvent) { app.keys = app.keys + 1 } ],
  keys: number = 0 ]
class Row extends View [ height = 30, width = 100%, focusable = true, Text [ text = :k ], ${decl} ]`;
  const r = await build(src);
  const app = run(r);
  const rows = () => app.list.children.filter((c) => c instanceof RT.View);
  const step = () => {
    for (const r of rows()) { try { new Function("r", `r.pop.${open[kind]}`)(r); } catch (e) { console.error("open: " + e.message); } }
    R.settle();
    app.seq++;
    R.settle();
    if (PRUNE) { OUT.pressOutside(app, -50, -50); RT.Keys._claimant(); }   // what the next press / key does in a browser
    return sleep(SLEEP);
  };
  await soak(`${kind} open in each row, rows discarded while open`, step, { warm: 15, n: 60, after: () => {
    const s = app.children.find((c) => c._isOverlayStrata === true);
    console.log(`       strata.stack length = ${s ? s.stack.length : "(no strata)"}; overlays layer children = ${s ? s.overlays.children.length : "-"}; notice = ${s ? s.notice.children.length : "-"}`);
    console.log(`       Keys navClaims = ${RT.Keys.navClaims?.size}; claimant torn down = ${RT.Keys._claimant()?.$tornDown}`);
  } });
  app.discard(); R.settle();
}
process.exit(0);

// lifecycle — a matrix: one victim class per case, holding one feature, put in
// its ACTIVE state (moving, ticking, fetching, focused, applied…) and then
// discarded, every cycle, two ways:
//   rows    — four keyless rows rebuilt (the replicator tears them down)
//   exists  — one victim under `exists = { app.on }`, built and discarded
// Growth per cycle after warm-up is printed per case; "flat" means every kernel
// table, the JS heap, live Node/View objects, clock tickers and timers held.
//
//   node --expose-gc test/soak/lifecycle.mjs [--only=name[,name]] [--mode=rows|exists] [--n=60]
import { build, run, soak, R, RT, sleep, extraReading } from "./lib.mjs";

// ── fake network: a slow transport and a stream factory that count what is open
let inflight = 0, streamsOpen = 0;
RT.provideTransport((url) => { inflight++; return new Promise((res) => setTimeout(() => { inflight--; res(new Response(JSON.stringify({ ok: 1, rows: [1, 2, 3] }), { headers: { "content-type": "application/json" } })); }, 150)); });
const fakeStream = (url, a, b) => {
  const cb = typeof a === "object" && !Array.isArray(a) ? a : b;
  streamsOpen++;
  let open = true;
  const iv = setInterval(() => { if (open) cb.message({ data: "tick", type: "message", id: "" }); }, 20);
  setTimeout(() => open && cb.open(), 1);
  return { close() { if (open) { open = false; streamsOpen--; clearInterval(iv); } }, send() {} };
};
RT.provideStreams({ eventSource: fakeStream, socket: fakeStream, request: (url, req, listen, cb) => fakeStream(url, cb) });
extraReading(() => ({ inflight, streamsOpen }));

const CASES = {
  spring: [`w: number = 0, target: number = 0, Spring [ attribute = w, to = { classroot.target }, stiffness = 20, damping = 2 ]`, (v) => { v.target = 500; }],
  springWidth: [`width = 10, target: number = 10, Spring [ attribute = width, to = { classroot.target }, stiffness = 30, damping = 3 ]`, (v) => { v.target = 300; }],
  animator: [`w: number = 0, an: Animator [ attribute = w, to = 300, duration = 5000 ]`, (v) => { v.an.start(); }],
  animatorForever: [`w: number = 0, an: Animator [ attribute = w, to = 300, duration = 200, repeat = { Infinity } ]`, (v) => { v.an.start(); }],
  animatorOverBinding: [`width = { app.base }, an: Animator [ attribute = width, to = 300, duration = 5000 ]`, (v) => { v.an.start(); }],
  springOverBinding: [`width = { app.base }, target: number = 10, Spring [ attribute = width, to = { classroot.target }, stiffness = 30, damping = 3 ]`, (v) => { v.target = 300; }],
  timeFrame: [`acc: number = 0, Time [ tick = frame, onTick(dt: number) { classroot.acc = classroot.acc + dt } ]`, null],
  timeMs: [`acc: number = 0, Time [ tick = 30, onTick(dt: number) { classroot.acc = classroot.acc + 1 } ]`, null],
  timeFacts: [`clock: Time [ tick = second ], Text [ text = { "" + classroot.clock.second } ]`, null],
  keys: [`n: number = 0, Keys [ onKeyDown(e: KeyEvent) { classroot.n = classroot.n + 1 } ]`, null],
  afterDelay: [`n: number = 0, go() { afterDelay(60000, () => { this.n = 1 }) }`, (v) => v.go()],
  afterDelayShort: [`n: number = 0, go() { afterDelay(5, () => { this.n = this.n + 1 }) }`, (v) => v.go()],
  dataSource: [`src: DataSource [ url = "http://soak.invalid/slow.json" ], Text [ text = { classroot.src.loaded ? "y" : "n" } ]`, (v) => v.src.fetch()],
  dataSourceAuto: [`src: DataSource [ url = { "http://soak.invalid/a" + app.seq + ".json" }, autoFetch = true ]`, null],
  eventStream: [`n: number = 0, es: EventStream [ url = "http://soak.invalid/sse", active = true, onMessage(m: StreamMessage) { classroot.n = classroot.n + 1 } ]`, null],
  socket: [`n: number = 0, so: Socket [ url = "ws://soak.invalid/ws", active = true, onMessage(m: StreamMessage) { classroot.n = classroot.n + 1 } ]`, null],
  stateGated: [`width = { app.base }, st: State [ applied = { app.flag }, width = 300, fill = red, Text [ text = "in state" ] ]`, null],
  stateVerb: [`width = { app.base }, st: State [ width = { app.base * 2 }, View [ width = 5, height = 5, Text [ text = "x" ] ] ]`, (v) => v.st.apply()],
  stateNested: [`width = { app.base }, a: State [ applied = { app.flag }, width = 200, b: View [ height = 10, width = { parent.width / 2 }, c: State [ applied = { app.flag }, height = 40, Text [ text = "deep" ] ] ] ]`, null],
  focus: [`focusable = true, grab() { Focus.focus(this) }`, (v) => v.grab()],
  focusChild: [`inner: View [ focusable = true, width = 10, height = 10 ], grab() { Focus.focus(this.inner) }`, (v) => v.grab()],
  provided: [`theme = { { ...provided("theme"), accent: 0xff0000 } }, mid: View [ theme = { { ...provided("theme"), surface: 0x00ff00 } }, View [ fill = { provided("theme").accent }, width = 5, height = 5 ] ] ]`, null],
  draw: [`width = 40, height = 20, draw(d: DrawContext) { d.fillStyle = "#336699"; d.fillRect(0, 0, (app.seq % 30) + 1, 10) }`, null],
  onScreenRead: [`width = 40, height = 20, fill = { onScreen ? 0xff0000 : 0x0000ff }`, null],
  drawOnScreen: [`width = 40, height = 20, k: number = { onScreen ? 1 : 0 }, draw(d: DrawContext) { d.fillStyle = "#336699"; d.fillRect(0, 0, 10 + this.k, 10) }`, null],
  visibleRectRead: [`width = 40, height = 20, Text [ text = { "" + parent.visibleRect.width } ]`, null],
  markdown: [`Markdown [ width = 300, text = { "# Title " + app.seq + "\\n\\n- one\\n- two **bold** [link](https://example.com)\\n\\n| a | b |\\n|---|---|\\n| 1 | 2 |" } ]`, null],
  htmlText: [`HTMLText [ width = 300, html = { "<p>para <b>" + app.seq + "</b> <a href='https://example.com'>x</a></p><ul><li>a</li></ul>" } ]`, null],
  textInput: [`ti: TextInput [ width = 100, text = "abc", onInput(v: string) { } ], grab() { Focus.focus(this.ti) }`, (v) => v.grab()],
  trackChanges: [`xx: number = { app.seq }, seen: number = 0, trackChanges = ["xx"], onChange() { seen = seen + 1 }`, null],
  createView: [`fill2() { for (let i = 0; i < 5; i++) this.createView("View", { width: 10, height: 10 }) }`, (v) => v.fill2()],
  longExpr: [`width = { ${Array.from({ length: 40 }, (_, i) => `app.seq * ${i + 2}`).join(" + ")} % 300 }`, null],
  wideList: [`layout: SimpleLayout [ axis = x ], ${Array.from({ length: 36 }, () => "View [ width = 3, height = 3 ]").join(", ")}`, null],
  layoutState: [`layout: SimpleLayout [ axis = y ], st: State [ applied = { app.flag }, layout: SimpleLayout [ axis = x, spacing = 4 ] ], View [ width = 5, height = 5 ], View [ width = 5, height = 5 ]`, null],
  layoutAxis: [`layout: SimpleLayout [ axis = { app.flag ? "x" : "y" } ], View [ width = 5, height = 5 ], View [ width = 5, height = 5 ]`, null],
  responsive: [`width = { app.flag ? 600 : 200 }, layout: ResponsiveLayout [ ], View [ width = 50, height = 5 ], View [ width = 50, height = 5 ]`, null],
  nestedRows: [`datapath = { app.nest.value }, View [ datapath = :a[], layout: SimpleLayout [ axis = y ], View [ datapath = :b[], layout: SimpleLayout [ axis = x ], View [ datapath = :c[], width = 4, height = 4, Text [ text = :v ] ] ] ]`, null],
  virtualized: [`height = 100, scrolls = y, datapath = { app.big.value }, layout: SimpleLayout [ axis = y ], View [ datapath = :rows[], virtualize = true, height = 20, width = 100%, Text [ text = :k ] ]`, (v) => { v.scrollY = 300; }],
  image: [`Image [ source = "data:image/gif;base64,R0lGODlhAQABAAAAACw=" ]`, null],
  tooltipLabel: [`tooltipLabel = "a tip", width = 20, height = 20`, null],
  button: [`Button [ label = "Go", onClick() { } ]`, null],
  slider: [`Slider [ width = 100, value = 0.3 ]`, null],
  checkbox: [`Checkbox [ label = "x" ]`, null],
  switchC: [`Switch [ ]`, (v) => { v.children.find((c) => "checked" in c).press(); }],
  segmented: [`Segmented [ choices = { ["A", "B", "C"] } ]`, null],
  tabBar: [`TabBar [ choices = { ["A", "B"] } ]`, null],
  accordion: [`Accordion [ width = 200 ]`, null],
  disclosure: [`Disclosure [ label = "more", Text [ text = "inside" ] ]`, null],
  searchField: [`SearchField [ width = 100 ]`, null],
  combobox: [`Combobox [ width = 120, items = { [{ id: "a", label: "A" }, { id: "b", label: "B" }] } ]`, null],
  datePicker: [`DatePicker [ ]`, null],
  stepper: [`Stepper [ value = 2 ]`, null],
  progress: [`ProgressBar [ width = 100, value = 0.4 ]`, null],
  gauge: [`Gauge [ value = 0.4 ]`, null],
  splitter: [`Splitter [ width = 200, height = 100 ]`, null],
  carousel: [`Carousel [ width = 200, height = 100, View [ fill = red ], View [ fill = blue ] ]`, null],
  tree: [`Tree [ width = 200, height = 200 ]`, null],
  dataGrid: [`DataGrid [ width = 300, height = 200, items = { [{ id: "1", a: "x" }, { id: "2", a: "y" }] }, columns = { [{ id: "a", label: "A" }] } ]`, null],
  table: [`Table [ width = 300, height = 200 ]`, null],
  radioGroup: [`RadioGroup [ value = "a" ]`, null],
  window: [`Window [ width = 200, height = 150, title = "w" ]`, null],
  toolbar: [`Toolbar [ width = 300 ]`, null],
  breadcrumb: [`Breadcrumb [ items = { [{ id: "a", label: "A" }, { id: "b", label: "B" }] } ]`, null],
  card: [`Card [ width = 100, height = 50 ]`, null],
  field: [`Field [ label = "Name", TextInput [ width = 100 ] ]`, null],
  shortcuts: [`sc: Shortcuts [ items = { [ ({ id: "save", key: "⌘S", label: "Save" }) ] }, picked(id: string) { } ]`, null],
  shortcutsOn: [`inner: View [ width = 5, height = 5 ], sc: Shortcuts [ on = { classroot.inner }, items = { [ ({ id: "x", key: "F5", label: "X" }) ] } ]`, null],
  form: [`Form [ Field [ label = "Name", TextInput [ width = 100 ] ] ]`, null],
};

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const only = arg("only", null)?.split(",");
const modes = arg("mode", "rows,exists").split(",");
const N = Number(arg("n", 60)), WARM = Number(arg("warm", 15));
const summary = [];
for (const [name, [members, arm]] of Object.entries(CASES)) {
  if (only && !only.includes(name)) continue;
  for (const mode of modes) {
    const common = `seq: number = 0, on: boolean = false, flag: boolean = false, base: number = 50,
  nest: Dataset [ contents = { ({ a: [0, 1].map((i) => ({ b: [0, 1, 2].map((j) => ({ c: [0, 1].map((k) => ({ v: "" + i + j + k + app.seq })) })) })) }) } ],
  big: Dataset [ contents = { ({ rows: Array.from({ length: 200 }, (_, i) => ({ k: "r" + i + "." + app.seq })) }) } ],`;
    const src = mode === "rows"
      ? `App [ width = 800, height = 600, ${common}
  model: Dataset [ contents = { ({ rows: [0, 1, 2, 3].map((i) => ({ k: "r" + i + "." + app.seq })) }) } ],
  list: View [ width = 700, datapath = { app.model.value }, layout: SimpleLayout [ axis = y ],
    Victim [ datapath = :rows[] ] ] ]
class Victim extends View [ ${members} ]`
      : `App [ width = 800, height = 600, ${common}
  box: View [ width = 700, Victim [ exists = { app.on } ] ] ]
class Victim extends View [ ${members} ]`;
    let r;
    try { r = await build(src); } catch (e) { console.log(`SKIP   ${name}/${mode}: ${e.message.split("\n")[0].slice(0, 200)}`); summary.push({ name, mode, skip: true }); break; }
    let app;
    try { app = run(r); } catch (e) { console.log(`THROW  ${name}/${mode} at boot: ${e.message.slice(0, 200)}`); continue; }
    const victims = () => (mode === "rows" ? app.list.children : app.box.children).filter((c) => c instanceof RT.View);
    const step = async () => {
      if (mode === "exists") { app.on = true; R.settle(); }
      app.flag = true; R.settle();
      if (arm) for (const v of victims()) { try { arm(v); } catch (e) { console.error("arm: " + e.message); } }
      R.settle();
      await sleep(25);                       // let it run: frames, ticks, a stream message
      if (mode === "rows") app.seq++; else app.on = false;
      app.flag = false;
      R.settle();
      await sleep(5);
    };
    let res;
    try { res = await soak(`${name}/${mode}`, step, { warm: WARM, n: N }); } catch (e) { console.log(`THROW  ${name}/${mode}: ${e.stack.slice(0, 400)}`); continue; }
    summary.push({ name, mode, ...res });
    try { app.discard(); R.settle(); } catch (e) { console.log(`THROW  ${name}/${mode} at app.discard: ${e.message.slice(0, 200)}`); }
    await sleep(200);
  }
}
console.log("\nSUMMARY (growing or erroring):");
for (const s of summary) if (!s.skip && !s.flat) console.log(`  ${s.name}/${s.mode}: ${JSON.stringify(Object.fromEntries(Object.entries(s.per).filter(([k, v]) => (k === "heapKB" ? v > 2 : v > 0.05))))}${s.errors ? ` errors=${s.errors}` : ""}`);
console.log("skipped:", summary.filter((s) => s.skip).map((s) => s.name).join(", "));
process.exit(0);

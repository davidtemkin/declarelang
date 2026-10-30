// layout-facts — a child states facts about itself, and its layout decides its
// size (the layout and sizing design, "facts, not precedence"). Each case boots a
// small program in Chrome through declare-verify and checks the geometry it laid
// out: what a class says is a default a layout replaces; a row stretches its
// children to the tallest; ranges, shrinking and weights share a run's room; a
// layout of your own reads the same facts and sizes its view from what it placed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";
import { View } from "../runtime/dist/index.js";
import { compileProgram } from "../compiler/dist/declarec.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-layout-facts-");

// Every named view's box as [x, y, width, height], by path.
writeFileSync(join(DIR, "probe.mjs"), `export default async ({ drive }) => {
  const out = await drive.page.evaluate(() => {
    const D = window.__declare, rows = {};
    const walk = (n, path) => {
      for (const c of n.children ?? []) {
        if (typeof c.width !== "number") continue;
        let name = null;
        for (const h of [n, c.classroot]) { if (!h) continue; for (const k of Object.keys(h)) { if (k.startsWith("$") || k === "parent" || k === "children" || k === "classroot") continue; if (h[k] === c) { name = k; break; } } if (name) break; }
        if (!name) continue;
        const p = path + "." + name;
        rows[p] = [c.x, c.y, c.width, c.height].map((v) => Math.round(v));
        walk(c, p);
      }
    };
    walk(D.find("app"), "app");
    return rows;
  });
  console.log("GEOM " + JSON.stringify(out));
};
`);

/** Boot `source` and answer its geometry, or throw with what verify said. */
function layOut(name, source) {
  const file = join(DIR, name + ".declare");
  writeFileSync(file, source);
  const p = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--assert", join(DIR, "probe.mjs")], { cwd: ROOT, encoding: "utf8" });
  const m = (p.stdout ?? "").match(/GEOM (.*)/);
  assert.ok(m, (p.stdout ?? "") + (p.stderr ?? ""));
  return JSON.parse(m[1]);
}

await test("a class's own size is a default: a full-width field flexes in a row, and fills a column alone", () => {
  const g = layOut("class-default", `App [ width = 700, height = 300,
    col: View [ width = 400, layout: SimpleLayout [ axis = y, spacing = 8 ],
        alone: Field1 [ ],
        row: View [ width = 100%, layout: SimpleLayout [ axis = x, spacing = 10 ],
            a: Field1 [ flexes = true ], b: Field1 [ flexes = true ], go: View [ width = 60, height = 30 ] ] ] ]
class Field1 [ width = 100%, height = 30 ]`);
  assert.equal(g["app.col.alone"][2], 400, "alone in a column, the class's 100% stands");
  assert.deepEqual([g["app.col.row.a"][2], g["app.col.row.b"][2]], [160, 160], "in a row, flexing replaces it: the room shared");
});

await test("a class's own y gives way to a column, even when it reads the view's measured baseline (TextLabel)", () => {
  const g = layOut("textlabel", `App [ width = 400, height = 300,
    col: View [ layout: SimpleLayout [ axis = y ], one: TextLabel [ text = "one" ], two: TextLabel [ text = "two" ] ],
    own: View [ x = 200, layout: SimpleLayout [ axis = y ], one: Mine [ text = "one" ], two: Mine [ text = "two" ] ] ]
class Mine extends Text [ y = { parent.height / 2 - this.baseline } ]`);
  assert.equal(g["app.col.one"][1], 0);
  assert.equal(g["app.col.two"][1], g["app.col.one"][3], "the second label sits under the first, not on it");
  assert.equal(g["app.own.two"][1], g["app.own.one"][3]);
});

await test("a title that shrinks keeps its own width while there is room, and gives it up when there is not", () => {
  const src = (w) => `App [ width = 600, height = 200,
    bar: View [ width = ${w}, height = 40, layout: SimpleLayout [ axis = x, spacing = 8 ],
        title: Text [ shrinks = true, maxLines = 1, text = "A rather long title for a toolbar" ],
        badge: View [ width = 20, height = 20 ],
        gap: Spacer [ ],
        go: View [ width = 60, height = 30 ] ] ]`;
  const wide = layOut("shrink-wide", src(560));
  const t = wide["app.bar.title"][2];
  assert.ok(t > 100, "the title is its content's width: " + t);
  assert.equal(wide["app.bar.badge"][0], t + 8, "the badge sits right after it");
  assert.equal(wide["app.bar.gap"][2], 560 - t - 20 - 60 - 3 * 8, "the spacer takes what is left");
  const narrow = layOut("shrink-narrow", src(200));
  assert.equal(narrow["app.bar.title"][2], 200 - 20 - 60 - 3 * 8, "the title gives up what the run is over by");
  assert.equal(narrow["app.bar.gap"][2], 0);
});

await test("a flexing field keeps its minimum; weights share the room 2 : 1; a maximum holds and the rest share again", () => {
  const g = layOut("ranges", `App [ width = 600, height = 300,
    a: View [ width = 200, height = 30, layout: SimpleLayout [ axis = x ],
        label: View [ width = 150, height = 30 ], field: View [ flexes = true, minWidth = 120, height = 30 ] ],
    b: View [ y = 40, width = 300, height = 30, layout: SimpleLayout [ axis = x ],
        two: View [ flexes = 2, height = 30 ], one: View [ flexes = 1, height = 30 ] ],
    c: View [ y = 80, width = 300, height = 30, layout: SimpleLayout [ axis = x ],
        capped: View [ flexes = true, maxWidth = 50, height = 30 ], p: View [ flexes = true, height = 30 ], q: View [ flexes = true, height = 30 ] ] ]`);
  assert.equal(g["app.a.field"][2], 120, "squeezed below its minimum, it holds there");
  assert.deepEqual([g["app.b.two"][2], g["app.b.one"][2]], [200, 100]);
  assert.deepEqual([g["app.c.capped"][2], g["app.c.p"][2], g["app.c.q"][2]], [50, 125, 125]);
});

await test("align = stretch: a row is as tall as its tallest child, and a child with its own height keeps it", () => {
  const g = layOut("stretch", `App [ width = 600, height = 300,
    row: View [ width = 400, layout: SimpleLayout [ axis = x, spacing = 8, align = stretch ],
        avatar: View [ width = 32, height = 32 ],
        short: View [ width = 100, inner: View [ width = 100, height = 20 ] ],
        tall: View [ width = 100, inner: View [ width = 100, height = 90 ] ],
        capped: View [ width = 100, maxHeight = 50, inner: View [ width = 100, height = 10 ] ] ] ]`);
  assert.equal(g["app.row"][3], 90, "the row is as tall as what it holds");
  assert.equal(g["app.row.short"][3], 90, "a content-sized column stretches to the tallest");
  assert.equal(g["app.row.avatar"][3], 32, "a stated height stays");
  assert.equal(g["app.row.capped"][3], 50, "a stretch stays within the child's range");
});

await test("align = stretch on a view with a height of its own fills it: a scrolling pane is held to the row, whatever it holds", () => {
  const g = layOut("stretch-band", `App [ width = 600, height = 400, layout: SimpleLayout [ axis = y ],
    top: View [ width = 100%, height = 40 ],
    row: View [ width = 100%, flexes = true, layout: SimpleLayout [ axis = x, align = stretch ],
        side: View [ width = 120 ],
        main: View [ flexes = true, scrolls = y, View [ width = 100, height = 1000 ] ] ] ]`);
  assert.equal(g["app.row"][3], 360, "the row is what is left");
  assert.equal(g["app.row.main"][3], 360, "the scroller is the row's height, not its content's 1000");
  assert.equal(g["app.row.side"][3], 360, "and so is the panel beside it");
});

await test("one align = stretch holds when a constraint turns the row into a column: the flexing pane fills across either way", () => {
  const src = (w) => `App [ width = ${w}, height = 500, narrow: boolean = { app.width < 500 },
    row: View [ width = 100%, height = 100%, layout: SimpleLayout [ axis = { app.narrow ? "y" : "x" }, align = stretch ],
        side: View [ width = 120, height = 80 ],
        main: View [ flexes = true, scrolls = y, View [ width = 100, height = 1000 ] ] ] ]`;
  const wide = layOut("stretch-flip-wide", src(800));
  assert.deepEqual([wide["app.row.main"][2], wide["app.row.main"][3]], [680, 500], "a row: the room left, and the row's height");
  const narrow = layOut("stretch-flip-narrow", src(400));
  assert.deepEqual([narrow["app.row.main"][2], narrow["app.row.main"][3]], [400, 420], "a column: the column's width, and the room left");
  assert.equal(narrow["app.row.side"][2], 120, "a child that states its width keeps it");
});

await test("a layout of your own reads the same facts: stretch any child its content sizes, and the view is as large as what it placed", () => {
  const g = layOut("own", `App [ width = 600, height = 300,
    row: View [ layout: EqualRow [ ],
        a: View [ inner: View [ width = 60, height = 40 ] ],
        b: View [ inner: View [ width = 60, height = 96 ] ] ] ]
class EqualRow extends Layout [
    place() {
        const kids = this.laid()
        let tallest = 0
        for (const c of kids) tallest = Math.max(tallest, (c as any).contentHeight)
        let x = 0
        return kids.map((c) => { const box = ({ x: x, stretch: ({ h: tallest }) }) as any; x = x + 70; return box })
        }
    ]`);
  assert.deepEqual([g["app.row.a"][3], g["app.row.b"][3]], [96, 96]);
  assert.equal(g["app.row"][3], 96);
});

await test("a weight can be bound, from data or a constraint, and shares the room in proportion", () => {
  const g = layOut("bound-weights", `App [ width = 600, height = 200, k: number = 3,
    d: Dataset [ contents = { { rows: [ { n: 1 }, { n: 3 } ] } } ],
    a: View [ width = 400, height = 10, layout: SimpleLayout [ axis = x ], datapath = { app.d.value },
        View [ datapath = :rows[], height = 10, flexes = { :n } ] ],
    b: View [ y = 20, width = 400, height = 10, layout: SimpleLayout [ axis = x ],
        p: View [ height = 10, flexes = { app.k } ], q: View [ height = 10, flexes = 1 ] ] ]`);
  assert.deepEqual([g["app.b.p"][2], g["app.b.q"][2]], [300, 100]);
});

await test("WrappingLayout: cells with a minimum wrap by it, share each row's room, and line up on the last row", () => {
  const g = layOut("cells", `App [ width = 600, height = 400,
    grid: View [ width = 330, layout: WrappingLayout [ spacing = 10, rowSpacing = 10 ],
        a: Cell [ ], b: Cell [ ], c: Cell [ ], d: Cell [ ], e: Cell [ ] ],
    strip: View [ y = 200, width = 300, layout: WrappingLayout [ spacing = 10 ],
        label: View [ width = 80, height = 20 ], rest: View [ flexes = true, height = 20 ] ] ]
class Cell [ flexes = true, minWidth = 100, height = 40 ]`);
  assert.deepEqual(["a", "b", "c", "d", "e"].map((k) => g["app.grid." + k][2]), [103, 103, 103, 103, 103]);
  assert.deepEqual([g["app.grid.d"][0], g["app.grid.d"][1]], [0, 50], "the fourth cell starts the second row");
  assert.equal(g["app.strip.rest"][2], 210, "a flexing child with no minimum still takes the rest of its row");
});

await test("ResponsiveLayout: weights share a row's room, and a tier that aligns with stretch makes its row as tall as its tallest", () => {
  const g = layOut("responsive", `App [ width = 600, height = 400,
    row: View [ width = 310, layout: ResponsiveLayout [ plan = { [{ from: 0, flow: "row", gap: 10, align: "stretch" }] } ],
        main: View [ flexes = 2, inner: View [ width = 10, height = 80 ] ],
        side: View [ flexes = 1, inner: View [ width = 10, height = 30 ] ] ] ]`);
  assert.deepEqual([g["app.row.main"][2], g["app.row.side"][2]], [200, 100]);
  assert.deepEqual([g["app.row.main"][3], g["app.row.side"][3], g["app.row"][3]], [80, 80, 80]);
});

await test("a view that never paints (an Audio) takes no slot and no gap", () => {
  const g = layOut("audio", `App [ width = 400, height = 300,
    col: View [ layout: SimpleLayout [ axis = y, spacing = 10 ],
        chime: Audio [ ], first: View [ width = 40, height = 20 ], second: View [ width = 40, height = 20 ] ] ]`);
  assert.equal(g["app.col.first"][1], 0);
  assert.equal(g["app.col.second"][1], 30);
});

await test("a size taken from the content in one branch only still names its collapse", () => {
  const file = join(DIR, "branch.declare");
  writeFileSync(file, `App [ width = 400, height = 600,
    phone: boolean = true,
    sheet: View [ width = 300, height = { app.phone ? this.contentHeight : 400 },
        body: View [ width = 100%, height = 100% ] ] ]`);
  const p = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file], { cwd: ROOT, encoding: "utf8" });
  assert.match((p.stdout ?? "") + (p.stderr ?? ""), /View\.height is 0 — it takes its height from its children/);
});

await test("a Text that stops flexing is as wide as its words again, not the width it had when the run first took it", () => {
  const file = join(DIR, "unflex.declare");
  writeFileSync(file, `App [ width = 800, height = 300, on: boolean = true,
    row: View [ width = 600, layout: SimpleLayout [ axis = x ],
        t: Text [ flexes = { app.on }, text = "a few words" ] ] ]`);
  writeFileSync(join(DIR, "unflex.mjs"), `export default async ({ drive }) => {
  const w = () => drive.page.evaluate(() => window.__declare.find("app").row.t.width);
  const out = [await w()];
  await drive.page.evaluate(() => { window.__declare.find("app").on = false; });
  await new Promise((f) => setTimeout(f, 200));
  out.push(await w());
  console.log("W " + JSON.stringify(out));
};`);
  const p = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--assert", join(DIR, "unflex.mjs")], { cwd: ROOT, encoding: "utf8" });
  const m = (p.stdout ?? "").match(/W (.*)/);
  assert.ok(m, (p.stdout ?? "") + (p.stderr ?? ""));
  const [flexing, own] = JSON.parse(m[1]);
  assert.equal(flexing, 600);
  assert.ok(own > 20 && own < 200, "its words' width: " + own);
});

await test("the library's rows give way: a Disclosure's long label stops before its detail, a Gauge's caption before its rail", () => {
  const long = "A label long enough to run into the detail on the right of the row";
  const g = layOut("library-rows", `App [ width = 600, height = 300,
    d: Disclosure [ width = 300, label = "${long}", detail = "12 items" ],
    s: Disclosure [ y = 60, width = 300, label = "Short", detail = "12 items" ],
    gg: Gauge [ y = 120, width = 300, label = "A caption far longer than its column", value = 50 ] ]`);
  const [lx, , lw] = g["app.d.line.t"], [mx] = g["app.d.line.more"];
  assert.ok(lx + lw <= mx - 8, `label ends at ${lx + lw}, detail starts at ${mx}`);
  // x is in the row's content box, inset 8 on the left and 10 on the right
  assert.equal(8 + g["app.s.line.t"][0], 30, "a label that fits sits where it always has");
  assert.equal(8 + g["app.s.line.more"][0] + g["app.s.line.more"][2], 290, "and the detail ends 10 from the edge");
  assert.ok(g["app.gg.cap"][2] <= 96, "the caption keeps to its column");
  assert.equal(g["app.gg.rail"][0], 96);
});

await test("a range beside a size the view states itself is said to do nothing — unless its class reads the range (Window's resize)", async () => {
  const b = await compileProgram(`App [ width = 600, height = 400,
    a: View [ width = 200, maxWidth = 100, height = 20 ],
    w: Window [ x = 20, y = 40, width = 260, height = 120, title = "Kept" ] ]`, { originDir: ROOT, stripPos: false, name: "r" });
  const said = [...(b.warnings ?? []), ...(b.hints ?? [])].filter((w) => /4030/.test(w.code ?? w.message)).map((w) => w.message);
  assert.equal(said.length, 1, said.join("\n"));
  assert.match(said[0], /^View\.maxWidth has no effect here/);
});

await test("explain() says why a layout gave a size, in the child's own facts", () => {
  const file = join(DIR, "why.declare");
  writeFileSync(file, `App [ width = 400, height = 300,
    bar: View [ width = 200, height = 40, layout: SimpleLayout [ axis = x, spacing = 8 ],
        title: Text [ shrinks = true, maxLines = 1, text = "A rather long title for a toolbar" ],
        gap: Spacer [ ], go: View [ width = 60, height = 30 ] ],
    row: View [ y = 60, width = 300, layout: SimpleLayout [ axis = x, align = stretch ],
        a: View [ flexes = 2, maxWidth = 150, inner: View [ width = 10, height = 50 ] ],
        b: View [ flexes = 1, inner: View [ width = 10, height = 20 ] ] ] ]`);
  writeFileSync(join(DIR, "why.mjs"), `export default async ({ drive }) => {
  const why = await drive.page.evaluate(() => [["app.bar.title", "width"], ["app.row.a", "width"], ["app.row.b", "height"]]
    .map(([p, a]) => window.__declare.explain(p, a).constraint.why));
  console.log("WHY " + JSON.stringify(why));
};`);
  const p = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--assert", join(DIR, "why.mjs")], { cwd: ROOT, encoding: "utf8" });
  const m = (p.stdout ?? "").match(/WHY (.*)/);
  assert.ok(m, (p.stdout ?? "") + (p.stderr ?? ""));
  const [title, a, b] = JSON.parse(m[1]);
  assert.match(title, /^SimpleLayout gave it \d+: its content is \d+, and it gave up \d+ because the row was short$/);
  assert.match(a, /share of the room left along the row \(weight 2\), held at its maxWidth$/);
  assert.match(b, /^SimpleLayout stretched it to 50: as large as the largest child across the row; its content is 20$/);
});

await test("a weight written before anything reads the view reads back as written (a number in a boolean slot)", () => {
  const v = new View();
  v.flexes = 2;
  assert.equal(v.flexes, 2, "an untouched view's untracked read is not the class default once a value left the table");
});

summarize("layout-facts");

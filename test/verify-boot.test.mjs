// verify-boot — rung 4, the headless boot (tools/internal/verify-boot.mjs), run
// as an author runs it: `declare-verify --json` on a program, the record read.
// The boot fills a laptop-sized host, settles under a time budget, and reports
// controls nobody can reach.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-boot-");

function verify(name, src, ...flags) {
  const file = join(DIR, name);
  writeFileSync(file, src);
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--json", ...flags], { cwd: ROOT, encoding: "utf8" });
  return JSON.parse(r.stdout);
}

await test("a control below a clip that does not scroll is reported; one a scroll or a drag reaches is not", () => {
  // the shape Cadence 12 met: a window-tall sheet that clips, its form taller
  // than it — window-tall only because the boot fills a host (a clip with no
  // area is skipped, so with no host there would be nothing to report)
  const r = verify("reach.declare", `App [
    sheet: View [ width = 400, height = { app.hostHeight }, clip = true, padding = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        View [ width = 360, height = 900 ],
        save: Button [ label = "Save" ] ],
    pane: View [ x = 500, width = 300, height = 300, scrolls = y,
        View [ width = 300, height = 1200 ],
        below: Button [ y = 1100, label = "Reachable" ],
        above: Button [ y = -60, label = "Above" ] ],
    deck: Carousel [ x = 850, width = 200, height = 100,
        View [ Button [ label = "One" ] ], View [ Button [ label = "Two" ] ] ],
    surface: View [ x = 850, y = 150, width = 200, height = 100, clip = true,
        onDrag(e: PointerEvent) { },
        View [ width = 600, height = 100, Button [ x = 400, label = "Panned to" ] ] ],
    parked: Button [ x = 5000, label = "Off-stage on purpose" ] ]`);
  assert.equal(r.boot.ok, true, JSON.stringify(r.boot));
  const notes = r.boot.notes.filter((n) => /may be out of reach/.test(n));
  assert.equal(notes.length, 2, JSON.stringify(notes, null, 1));
  assert.ok(notes.some((n) => /app\.sheet\.save \(Button\) lies outside app\.sheet, which clips and does not scroll/.test(n)));
  assert.ok(notes.some((n) => /app\.pane\.above \(Button\) lies above or left of app\.pane, a scroller/.test(n)));
});

await test("a boot that never settles is stopped at its budget, and the line it was running is named", () => {
  const r = verify("hang.declare", `App [ n: number = 0, onInit() { let s = ""; while (s != "ready") { this.n = this.n + 1 } } ]`, "--boot-budget=1500");
  assert.equal(r.boot.ok, false);
  assert.match(r.boot.errors[0], /did not settle within 2 s/);
  assert.ok(r.boot.errors.some((e) => /while \(s != "ready"\)|this\.n = this\.n \+ 1/.test(e)), JSON.stringify(r.boot.errors));
});

await test("an evaluate that never finishes, while the page answers, is stopped and named by the script line that asked", () => {
  const script = join(DIR, "waits.mjs");
  writeFileSync(script, `export default async ({ drive, page }) => {
  await drive.click('app.."Go"');
  await page.evaluate(() => new Promise(() => {}));
};`);
  const file = join(DIR, "waits.declare");
  writeFileSync(file, `App [ width = 200, height = 100, go: Button [ label = "Go" ] ]`);
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--assert", script, "--boot-budget=1500"], { cwd: ROOT, encoding: "utf8" });
  const out = r.stdout + r.stderr;
  assert.match(out, /waits\.mjs:3: an evaluate in the page has not finished in 3 s, though the page answers/, out);
  assert.match(out, /evaluating: \(\) => new Promise\(\(\) => \{\}\)/, "what it was evaluating");
  assert.match(out, /the step before it: click app\.\."Go"/, "and the step before it");
});

// THE TOOLS RUN AS COMMANDS. npx runs a package's bin through a link to the
// file itself, so a bin without its executable bit answers "Permission denied"
// (Cadence 11 met it on declare-look and ran node tools/look.mjs instead).
await test("every command the package names is an executable node script", async () => {
  const { readFileSync, statSync } = await import("node:fs");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  for (const [name, rel] of Object.entries(pkg.bin)) {
    const p = join(ROOT, rel);
    assert.ok((statSync(p).mode & 0o111) !== 0, `${name} (${rel}) is not executable — chmod +x it`);
    assert.ok(readFileSync(p, "utf8").startsWith("#!/usr/bin/env node"), `${name} (${rel}) does not start with #!/usr/bin/env node`);
  }
});

// The headless boot answers questions about the program as it booted, at the
// size asked — no browser — and says what it can see wrong in the layout.
await test("--size/--read/--outline answer from the boot; a child the content size skips is reported", () => {
  const r = verify("headless.declare", `class Later [ width = 10, height = 10 ]
App [ width = 400, height = 300,
    box: View [ width = 200, height = { this.contentHeight },
        a: View [ width = 100, height = 40 ],
        b: View [ y = 40, width = 100, height = { parent.height + 30 } ] ],
    small: Button [ y = 200, label = "Go", width = 30, height = 30 ] ]`,
    "--size", "390x844", "--touch", "--read", "app.box.height", "--read", "app.hostWidth", "--outline", "app.box");
  const b = r.boot;
  assert.deepEqual(b.answers.slice(0, 2), ["app.box.height = 40", "app.hostWidth = 390"]);
  assert.match(b.answers[2], /^box View {2}0,0 {2}200×40\n {2}a View/);
  assert.ok(b.layout.some((l) => /app\.box is 40 tall, sized by its content — but app\.box\.b \(70\) takes its height from it/.test(l)), b.layout.join("\n"));
  assert.ok(b.layout.some((l) => /smaller than 44 × 44, a finger's target: app\.small 30×30/.test(l)), b.layout.join("\n"));
  assert.deepEqual(b.unbuilt, ["Later"], "a class the boot never built is named");
});

await test("a child that takes its size from a content-sized parent and collapses is reported, naming where the size comes from", () => {
  const r = verify("collapse.declare", `App [ width = 400, height = 300,
    col: View [ layout: SimpleLayout [ axis = y ], rule: View [ width = 100%, height = 1 ] ] ]`);
  assert.ok(r.boot.layout.some((l) => /app\.col\.rule takes its width from app\.col, which is sized by its content .* collapses to nothing .* Give app\.col a width/.test(l)), r.boot.layout.join("\n"));
});

await test("a pane sized by its content up to a limit scrolls past it — not flagged; one with no limit is", () => {
  const r = verify("capped.declare", `App [ width = 400, height = 300,
    capped: View [ width = 200, height = { Math.min(this.contentHeight, 120) }, scrolls = y,
        layout: SimpleLayout [ axis = y ], View [ width = 10, height = 500 ] ],
    grows: View [ y = 150, width = 200, scrolls = y, layout: SimpleLayout [ axis = y ], View [ width = 10, height = 500 ] ] ]`);
  const said = r.boot.layout.filter((l) => /nothing to scroll/.test(l));
  assert.ok(said.some((l) => /app\.grows scrolls on y/.test(l)), said.join("\n"));
  assert.ok(!said.some((l) => /app\.capped/.test(l)), "a capped size is room given: " + said.join("\n"));
});

await test("a control under a view the person can enlarge is judged at its maxScale, not as drawn", () => {
  const r = verify("reach.declare", `class Dot extends Control [ width = 30, height = 30, press() { } ]
App [ width = 390, height = 844,
    plane: View [ width = 300, height = 300, scale = 1, minScale = 1, maxScale = 2, d: Dot [ ] ],
    flat: View [ y = 400, width = 300, height = 300, e: Dot [ ] ] ]`, "--size", "390x844", "--touch");
  const small = r.boot.layout.find((l) => /smaller than 44 × 44/.test(l)) ?? "";
  assert.match(small, /app\.flat\.e /, small);
  assert.doesNotMatch(small, /app\.plane\.d /, "60 points at maxScale is a finger's target: " + small);
});

await test("the boot feeds a sample to a source that reads, never to one that writes", () => {
  const r = verify("feeds.declare", `schema Thing [ id: string, name: string ]
App [ width = 300, height = 200,
    things: DataSource [ url = "http://127.0.0.1:9/things", schema = Thing[], autoFetch = false ],
    save: DataSource [ url = "http://127.0.0.1:9/things", method = "POST", schema = Thing, autoFetch = false ] ]`);
  assert.deepEqual(r.boot.samples.map((s) => s.source), ["app.things"], JSON.stringify(r.boot.samples));
});

await test("a finger's target is judged at its size on screen, and not at all when it lets presses through or is clipped away", () => {
  const r = verify("targets.declare", `App [ width = 400, height = 400,
    passes: Button [ label = "P", width = 30, height = 30, pointerEvents = "none" ],
    big: View [ y = 50, scale = 2, width = 100, height = 40, grown: Button [ label = "G", width = 30, height = 30 ] ],
    shrunk: View [ y = 150, scale = 0.5, width = 200, height = 100, tiny: Button [ label = "T", width = 60, height = 60 ] ],
    clipper: View [ y = 250, width = 50, height = 50, clip = true, hid: Button [ label = "H", x = 100, width = 30, height = 30 ] ] ]`,
    "--size", "390x844", "--touch");
  const small = r.boot.layout.find((l) => /a finger's target/.test(l)) ?? "";
  assert.match(small, /app\.shrunk\.tiny 30×30/, "60 × 60 scaled by a half is 30 × 30 on screen: " + small);
  assert.doesNotMatch(small, /app\.passes|app\.big\.grown|app\.clipper\.hid/, small);
});

await test("with no --size the boot fills a laptop window only; --phone a phone, --phone --desktop both", () => {
  const src = `App [ small: Button [ label = "Go", width = 30, height = 30 ] ]`;
  const desk = verify("two.declare", src);
  assert.ok(!desk.boot.layout.some((l) => /finger/.test(l)), "no phone, so no touch-target finding: " + desk.boot.layout.join("\n"));
  const phone = verify("two.declare", src, "--phone");
  assert.ok(phone.boot.layout.some((l) => /finger/.test(l) && /app\.small/.test(l)), phone.boot.layout.join("\n"));
  const both = verify("two.declare", src, "--phone", "--desktop");
  assert.ok(both.boot.layout.some((l) => l.startsWith("phone 390×844: ") && /app\.small/.test(l)), both.boot.layout.join("\n"));
  assert.ok(!both.boot.layout.some((l) => !l.startsWith("phone") && /finger/.test(l)), "no touch-target warning at the laptop size");
});

await test("a panel past the window's edge is named once, with what it carries; a frame held wider pans and is not", () => {
  const r = verify("edge.declare", `App [
    panel: View [ x = -60, y = 20, width = 200, height = 80,
        a: Text [ x = 8, text = "First line" ], b: Text [ x = 8, y = 30, text = "Second line" ] ] ]`, "--size", "390x844");
  const edge = r.boot.layout.filter((l) => /edge/.test(l));
  assert.equal(edge.length, 1, edge.join("\n"));
  assert.match(edge[0], /app\.panel runs past the window's left edge \(it starts at -60\), and app\.panel\.a with it/);
  const held = verify("held.declare", `App [ minWidth = 800,
    side: View [ x = 600, width = 180, height = 40, t: Text [ text = "Beyond the phone" ] ] ]`, "--size", "390x844");
  assert.ok(!held.boot.layout.some((l) => /edge/.test(l)), held.boot.layout.join("\n"));
});

// A run drawn past the edges of the view it sits in is said where it shows: the
// view has a ground (a pill), or the spill lands on a neighbor (the next segment).
// A view with nothing to show it, and a caption placed below its shape, are not.
await test("text past the view it sits in is said when that view has a ground or a neighbor; a caption below a shape is not", () => {
  const r = verify("spill.declare", `App [ width = 400, height = 240,
    pill: View [ x = 20, y = 20, width = 60, height = 30, fill = #E4E8EE, t: Text [ x = center, y = center, text = "Comfortable" ] ],
    track: View [ x = 20, y = 70, width = 200, height = 30,
        a: View [ x = 0, width = 64, height = 30, t: Text [ x = center, y = center, text = "Comfortable" ] ],
        b: View [ x = 64, width = 64, height = 30, t: Text [ x = center, y = center, text = "Fit" ] ] ],
    alone: View [ x = 20, y = 120, width = 40, height = 30, t: Text [ x = center, y = center, text = "Comfortable" ] ],
    disc: View [ x = 20, y = 170, width = 30, height = 30, fill = #E4E8EE, t: Text [ x = center, y = 36, text = "Comfortable" ] ] ]`, "--size", "400x240");
  const spill = r.boot.layout.filter((l) => /the view it sits in/.test(l));
  assert.equal(spill.length, 2, spill.join("\n"));
  assert.match(spill[0], /^app\.pill\.t's text is \d+ wide and app\.pill, the view it sits in, is 60, so it runs past both/);
  assert.match(spill[1], /^app\.track\.a\.t's text/);
});

// A view arranged by a ResponsiveLayout has no content width: its plan is chosen by
// the width it is given. Every way of sizing it from its content reads that, and is
// refused at the read: nothing gives it a width, a parent stretches it to a line its
// own content sets, a wrapping cell flexes from it. A share, a percent, or a stretch
// into a parent with a width of its own give it one, and nothing is said.
await test("a ResponsiveLayout view sized from its content is refused at the read; one given a width is not", () => {
  const plan = `layout: ResponsiveLayout [ plan = { [({ from: 300, flow: "row" }), ({ from: 0, flow: "stack" })] } ], View [ width = 120, height = 20 ], View [ width = 120, height = 20 ]`;
  const r = verify("given.declare", `App [ width = 1000, height = 600,
    col: View [ layout: SimpleLayout [ axis = y ], loose: View [ ${plan} ] ],
    tall: View [ y = 100, layout: SimpleLayout [ axis = y, align = stretch ], View [ width = 50, height = 20 ], stretched: View [ ${plan} ] ],
    good: View [ y = 200, width = 600, layout: SimpleLayout [ axis = x ], a: View [ flexes = true, ${plan} ], b: View [ width = 100%, ${plan} ] ],
    banded: View [ y = 300, width = 500, layout: SimpleLayout [ axis = y, align = stretch ], c: View [ ${plan} ] ] ]`, "--size", "1000x600");
  const said = JSON.stringify(r).match(/View \(line \d+, col \d+\) is arranged by ResponsiveLayout[^"]*?no content width, and here [a-z ]+/g) ?? [];
  const lines = [...new Set(said.map((m) => m.match(/line (\d+)/)[1]))];
  assert.deepEqual(lines, ["2", "3"], said.join("\n"));
  const cell = verify("given-cell.declare", `App [ width = 1000, height = 300,
    flow: View [ width = 900, layout: WrappingLayout [ spacing = 4 ], cell: View [ flexes = true, ${plan} ] ] ]`, "--size", "1000x300");
  assert.ok(JSON.stringify(cell).includes("no content width, and here its content width was read to size it"), "a wrapping cell flexing from its content is refused");
});

// A label the program wrote, on a control, cut short is said, once per control
// (a row of segments is one finding); a label showing data (a record's title) may
// be cut, and is not said; a label with room is not either.
await test("a control's own words cut short are said once per control; a label showing data is not", () => {
  const r = verify("cut.declare", `App [ width = 700, height = 400,
    items: Dataset { { "rows": [ { "t": "A very long data title for a row" }, { "t": "Another long data title" } ] } },
    chosen: string = { app.items.value.rows[0].t },
    col: View [ x = 10, y = 10, layout: SimpleLayout [ axis = y, spacing = 8 ],
        tabs: Segmented [ width = 200, items = { [ ({ id: "a", label: "Sections" }), ({ id: "b", label: "Stories" }), ({ id: "c", label: "Ads" }),
            ({ id: "d", label: "Artwork" }), ({ id: "e", label: "Tags" }), ({ id: "f", label: "Print" }) ] } ],
        roomy: Segmented [ items = { [ ({ id: "a", label: "Day" }), ({ id: "b", label: "Week" }) ] } ],
        lit: Button [ width = 60, label = "Literal label" ],
        pick: Button [ width = 60, label = { app.chosen } ],
        rows: View [ datapath = { app.items.value }, layout: SimpleLayout [ axis = y ],
            Button [ datapath = :rows[], width = 60, label = { :t } ] ] ] ]`, "--size", "700x400");
  const cut = r.boot.layout.filter((l) => /cut short/.test(l));
  assert.equal(cut.length, 2, cut.join("\n"));
  assert.match(cut[0], /^app\.col\.tabs's labels “Sections”, “Stories”, “Ads”, “Artwork” and 2 more are cut short/);
  assert.match(cut[1], /^app\.col\.lit's label “Literal label” is cut short/);
});

await test("a child 0 wide in a columns layout is said, naming flexes; a flexing one is not", () => {
  const r = verify("cells.declare", `App [
    cells: Dataset { { "rows": [1, 2, 3] } },
    grid: View [ width = 400, datapath = { app.cells.value },
        layout: WrappingLayout [ columns = 3, spacing = 8 ],
        View [ datapath = :rows[], height = 40, fill = gainsboro ] ],
    good: View [ y = 100, width = 400, datapath = { app.cells.value },
        layout: WrappingLayout [ columns = 3, spacing = 8 ],
        View [ datapath = :rows[], flexes = true, height = 40, fill = gainsboro ] ] ]`);
  const cells = r.boot.layout.filter((l) => /columns/.test(l));
  assert.equal(cells.length, 1, r.boot.layout.join("\n"));
  assert.match(cells[0], /^app\.grid\.0 \(and 2 more\) is 0 wide: in a `columns` layout a child takes its cell's width only with `flexes = true`\.$/);
  // a cell whose children take their width from it is a size nothing decides,
  // said once at boot — and in a cell, the cure it names is the cell's width
  const c = verify("cycle.declare", `App [
    cells: Dataset { { "rows": [1, 2, 3] } },
    grid: View [ width = 400, datapath = { app.cells.value },
        layout: WrappingLayout [ columns = 3, spacing = 8 ],
        View [ datapath = :rows[], height = 40, Text [ text = "cell", width = 100% ] ] ] ]`);
  const said = [...c.boot.errors, ...c.boot.layout].filter((l) => /columns/.test(l));
  assert.equal(said.length, 1, JSON.stringify(c.boot));
  assert.match(said[0], /is 0 — .* In its parent's `columns` layout it takes its cell's width only with `flexes = true`; or give View a width\./);
});

await test("a Tab step that goes back against reading order is said; a step into a column to the right is not", () => {
  const r = verify("taborder.declare", `App [ width = 600, height = 400,
    save: Button [ x = 20, y = 200, label = "Save" ],
    title: TextInput [ x = 20, y = 40, width = 200, accessibilityLabel = "Title" ],
    left: Button [ x = 20, y = 300, label = "Bottom of the left column" ],
    right: Button [ x = 300, y = 40, label = "Top of the right column" ] ]`);
  const tab = r.boot.layout.filter((l) => /^Tab goes/.test(l));
  assert.equal(tab.length, 1, tab.join("\n"));
  assert.match(tab[0], /Tab goes from “Save” \(app\.save\) to “Title” \(app\.title\), which sits above it/);
});

await test("Tab order: a stop under a hidden container is no stop; a bar below a scroller comes after its fields", () => {
  // tabOrder() naming a hidden panel's child: Tab skips it, and nothing is said
  const h = verify("tabhidden.declare", `App [ width = 390, height = 600,
    hall: View [ width = 100%, height = 600,
        tabOrder() -> View[] { return [this.top, this.aside.picked, this.bar] },
        top: View [ y = 0, Button [ label = "Heading stop" ] ],
        aside: View [ visible = false, y = 400, picked: View [ Button [ label = "Hidden" ] ] ],
        bar: View [ y = 300, Button [ label = "Continue" ] ] ] ]`);
  assert.ok(!h.boot.layout.some((l) => /^Tab goes/.test(l)), h.boot.layout.join("\n"));
  // a field below the fold, then the bar that is the scroller's sibling: right
  // order; a header above the scroller after its last field: said
  const s = verify("tabbar.declare", `App [ width = 390, height = 600,
    layout: SimpleLayout [ axis = y ],
    pane: View [ width = 100%, height = 520, scrolls = y,
        layout: SimpleLayout [ axis = y, spacing = 20 ],
        View [ width = 100%, height = 900 ],
        last: TextInput [ width = 200, accessibilityLabel = "Postal code" ] ],
    bar: View [ width = 100%, height = 80, Button [ y = 16, label = "Pay" ] ] ]`);
  assert.ok(!s.boot.layout.some((l) => /^Tab goes/.test(l)), s.boot.layout.join("\n"));
  const u = verify("tabup.declare", `App [ width = 390, height = 600,
    pane: View [ y = 80, width = 100%, height = 520, scrolls = y,
        layout: SimpleLayout [ axis = y, spacing = 20 ],
        View [ width = 100%, height = 900 ],
        last: TextInput [ width = 200, accessibilityLabel = "Postal code" ] ],
    head: Button [ y = 16, label = "Back" ] ]`);
  const up = u.boot.layout.filter((l) => /^Tab goes/.test(l));
  assert.equal(up.length, 1, u.boot.layout.join("\n"));
  assert.match(up[0], /“Postal code” .* to “Back” .* which sits above it/);
});

summarize("verify-boot");

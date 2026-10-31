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
        onPointerMove(e: PointerEvent) { },
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

await test("with no --size the boot fills a laptop window only; --phone a phone, --phone --desk both", () => {
  const src = `App [ small: Button [ label = "Go", width = 30, height = 30 ] ]`;
  const desk = verify("two.declare", src);
  assert.ok(!desk.boot.layout.some((l) => /finger/.test(l)), "no phone, so no touch-target finding: " + desk.boot.layout.join("\n"));
  const phone = verify("two.declare", src, "--phone");
  assert.ok(phone.boot.layout.some((l) => /finger/.test(l) && /app\.small/.test(l)), phone.boot.layout.join("\n"));
  const both = verify("two.declare", src, "--phone", "--desk");
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

summarize("verify-boot");

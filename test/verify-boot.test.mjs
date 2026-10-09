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
import { test, summarize } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = mkdtempSync(join(os.tmpdir(), "declare-boot-"));

function verify(name, src, ...flags) {
  const file = join(DIR, name);
  writeFileSync(file, src);
  const r = spawnSync("node", [join(ROOT, "tools/verify.mjs"), file, "--json", ...flags], { cwd: ROOT, encoding: "utf8" });
  return JSON.parse(r.stdout);
}

await test("a control below a clip that does not scroll is reported; one a scroll reaches is not", () => {
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

summarize("verify-boot");

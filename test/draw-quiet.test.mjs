// draw-quiet — a drawing no one can see is not re-recorded. A view hidden (or under
// a hidden view) after it was shown stopped seeing nothing of what it drew, yet its
// draw() ran again on every change to what it read. Now it records once when it is
// shown again; a mask's stencil, which the renderer reads while hidden, keeps
// recording. In Chrome, through declare-verify.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-draw-quiet-");
writeFileSync(join(DIR, "quiet.declare"), `App [ width = 400, height = 400,
  k: number = 0, show: boolean = true,
  own: View [ visible = { app.show }, width = 50, height = 50, draw(d: DrawContext) { d.fillRect(0, 0, 10 + app.k, 5) } ],
  wrap: View [ visible = { app.show }, width = 60, height = 60,
      inner: View [ width = 50, height = 50, draw(d: DrawContext) { d.fillRect(0, 0, 10 + app.k, 5) } ] ],
  masked: View [ y = 100, width = 50, height = 50, fill = #000, mask = { app.stencil } ],
  stencil: View [ y = 100, visible = false, width = 50, height = 50, draw(d: DrawContext) { d.fillRect(0, 0, 10 + app.k, 50) } ] ]`);
writeFileSync(join(DIR, "probe.mjs"), `export default async ({ drive }) => {
  const r = await drive.page.evaluate(async () => {
    const D = window.__declare, n = { own: 0, inner: 0, stencil: 0 };
    for (const [k, p] of [["own", "app.own"], ["inner", "app.wrap.inner"], ["stencil", "app.stencil"]]) { const v = D.find(p); const f = v.draw; v.draw = function (d) { n[k]++; return f.call(this, d); }; }
    const app = D.find("app");
    const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    app.k = 1; await tick();
    const shown = { ...n };
    app.show = false; await tick();
    const was = { ...n };
    for (let i = 2; i <= 6; i++) { app.k = i; await tick(); }
    const hidden = { own: n.own - was.own, inner: n.inner - was.inner, stencil: n.stencil - was.stencil };
    const before = { ...n };
    app.show = true; await tick();
    return { shown, hidden, again: { own: n.own - before.own, inner: n.inner - before.inner } };
  });
  console.log("RESULT " + JSON.stringify(r));
};
`);

await test("a drawing hidden after it was shown re-records nothing while hidden, and once when shown; a mask's stencil keeps recording", () => {
  const p = spawnSync("node", [join(ROOT, "tools/verify.mjs"), join(DIR, "quiet.declare"), "--assert", join(DIR, "probe.mjs")], { cwd: ROOT, encoding: "utf8" });
  const m = (p.stdout ?? "").match(/RESULT (.*)/);
  assert.ok(m, (p.stdout ?? "") + (p.stderr ?? ""));
  const r = JSON.parse(m[1]);
  assert.ok(r.shown.own >= 1 && r.shown.inner >= 1, `shown, they record (${JSON.stringify(r.shown)})`);
  assert.deepEqual({ own: r.hidden.own, inner: r.hidden.inner }, { own: 0, inner: 0 }, "hidden — itself or under a hidden view — nothing re-records");
  assert.equal(r.hidden.stencil, 5, "the hidden stencil records each change: the renderer reads it");
  assert.deepEqual(r.again, { own: 1, inner: 1 }, "shown again, each records once");
});

summarize("draw-quiet");

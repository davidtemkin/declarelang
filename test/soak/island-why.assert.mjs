// island-why.assert — what keeps a discarded island tenant alive (the plain one):
// tag the tenant App, discard the island, a few more cycles, then a heap
// snapshot of the page and the retaining path to the tagged App.
//   node tools/verify.mjs test/soak/island-each.declare --assert test/soak/island-why.assert.mjs [kind via env SOAK_KIND]
import { meter, pageSnapshot } from "./browser-lib.mjs";
import { retainingPaths } from "./retainers.mjs";
export default async ({ drive, page }) => {
  const kind = process.env.SOAK_KIND ?? "plain";
  const m = await meter(page);
  await drive.set("app", "which", kind); await drive.wait(1000);
  await page.evaluate(() => { const i = window.__declare.find("app.box").childViews[0]; i.$tenant.__soakDead = {}; });
  for (let k = 0; k < 3; k++) { await drive.set("app", "which", ""); await drive.wait(150); await drive.set("app", "which", kind); await drive.wait(700); }
  await drive.set("app", "which", ""); await drive.wait(300);
  for (let i = 0; i < 3; i++) await m.cdp.send("HeapProfiler.collectGarbage");
  const snap = await pageSnapshot(m.cdp);
  const { targets, paths, mode } = retainingPaths({ snap, mark: "__soakDead", max: 2 });
  console.log(`[${kind}] tagged tenant App alive: ${targets} ${mode ?? ""}`);
  for (const p of paths) console.log(p.split("\n").slice(-40).join("\n"), "\n");
};

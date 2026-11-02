// island-swap.assert — does an AppIsland follow its `program`? Swaps A → B → "" → A
// and reports which tenant is mounted and whether the old one still runs.
//   node tools/verify.mjs test/soak/island-swap.declare --assert test/soak/island-swap.assert.mjs
import { meter, soak } from "./browser-lib.mjs";
const NOW = () => { const t = window.__declare.find("app.isl").$tenant; return { mounted: t ? (t.which === "B" ? "B" : "A") : "none", tenantN: t?.n ?? -1, tornDown: t ? !!t.$tornDown : null }; };
export default async ({ drive, page }) => {
  await drive.wait(600);
  for (const p of ["island-tenant-b", "", "island-tenant", "island-tenant-b"]) {
    await drive.set("app", "prog", p); await drive.wait(800);
    console.log(`program = "${p}" →`, JSON.stringify(await page.evaluate(NOW)));
  }
  const m = await meter(page);
  await soak("AppIsland program swapped A ↔ B", m, async (i) => { await drive.set("app", "prog", i % 2 ? "island-tenant" : "island-tenant-b"); await drive.wait(400); }, { warm: 4, n: 12, extra: NOW });
};

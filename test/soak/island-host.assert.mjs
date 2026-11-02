// island-host.assert — an AppIsland's program detached ("") and attached again,
// every cycle, in Chrome. Everything the tenant built must go each time.
//   node tools/verify.mjs test/soak/island-host.declare --assert test/soak/island-host.assert.mjs
import { meter, soak } from "./browser-lib.mjs";

const ISL = () => {
  const isl = window.__declare.find("app.isl");
  return { tenantMounted: isl && isl.$tenant ? 1 : 0, iframes: document.querySelectorAll("iframe").length, canvases: document.querySelectorAll("canvas").length };
};

export default async ({ drive, page }) => {
  const m = await meter(page);
  await drive.wait(500);
  const on = await m.read(ISL);
  await drive.set("app", "on", false); await drive.wait(300);
  const off = await m.read(ISL);
  console.log("tenant on:", JSON.stringify(on), "\ntenant off:", JSON.stringify(off));
  await soak("AppIsland program attached and detached", m, async () => {
    await drive.set("app", "on", true); await drive.wait(400);
    await drive.set("app", "on", false); await drive.wait(200);
  }, { extra: ISL, warm: 5, n: 20 });
};

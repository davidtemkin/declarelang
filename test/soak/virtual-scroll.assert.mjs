// virtual-scroll.assert — wheel-scroll a virtualized list and rebuild its
// records every cycle; then check that only the rows standing now hear a key.
//   node tools/verify.mjs test/soak/virtual-scroll.declare --assert test/soak/virtual-scroll.assert.mjs
import { meter, soak } from "./browser-lib.mjs";
const ROWS = () => { const l = window.__declare.find("app.list"); return { realized: l.childViews.length, scrollY: Math.round(l.scrollY) }; };
export default async ({ drive, page }) => {
  const m = await meter(page);
  await soak("wheel-scroll a virtualized list + rebuild its records", m, async (i) => {
    await drive.wheel("app.list", i % 4 === 3 ? -900 : 300);
    await drive.wait(100);
    await drive.set("app", "seq", i + 1);
    await drive.wait(100);
  }, { warm: 10, n: 40, extra: ROWS });
  const realized = await page.evaluate(() => window.__declare.find("app.list").childViews.length);
  const before = await page.evaluate(() => window.__declare.find("app").heard);
  await drive.key("k"); await drive.wait(50);
  const after = await page.evaluate(() => window.__declare.find("app").heard);
  console.log(`one key 'k': heard by ${after - before} Keys members; ${realized} rows are realized now${after - before > realized ? " — DISCARDED ROWS STILL HEAR KEYS" : ""}`);
};

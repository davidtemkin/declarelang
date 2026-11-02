// rows-input.assert — real input in Chrome against rows-input.declare:
//  1. hover a row, then rebuild (the hovered row is discarded under the pointer)
//  2. a tooltip shown for a row, then rebuild
//  3. a row's Popover opened by a real click, then rebuild
//  4. a press that discards the pressed view from its own onPointerDown
// Each runs warm cycles, then measured cycles; prints growth per cycle.
//   node tools/verify.mjs test/soak/rows-input.declare --assert test/soak/rows-input.assert.mjs
import { meter, soak, STRATA } from "./browser-lib.mjs";

export default async ({ drive, page }) => {
  const m = await meter(page);
  const rebuild = async () => { await drive.click("app.rebuild"); await drive.wait(50); };
  await soak("control: rebuild by button only", m, async () => { await rebuild(); }, { extra: STRATA, warm: 10, n: 50 });
  await soak("control: press on empty space + rebuild by set", m, async (i) => { await drive.clickAt("app", 600, 500); await drive.set("app", "seq", 5000 + i); await drive.wait(50); }, { extra: STRATA, warm: 10, n: 50 });
  await soak("hover a row, rebuild", m, async (i) => {
    await drive.press(`app.list.${i % 6}`, 30, 10); await drive.release();   // pointer now rests on the row
    await drive.wait(30);
    await rebuild();
  }, { extra: STRATA, warm: 10, n: 50 });
  await soak("tooltip shown on a row, rebuild", m, async (i) => {
    await drive.press(`app.list.${i % 6}`, 30, 10); await drive.release();
    await drive.wait(1200);                                                     // the tooltip's delay
    await rebuild();
  }, { extra: STRATA, warm: 5, n: 15 });
  await soak("popover opened by click in a row, rebuild", m, async (i) => {
    await drive.click(`app.list.${i % 6}.go`);
    await drive.wait(300);
    await drive.click("app.rebuild");     // an outside press: it dismisses the popover (dismissAndDeliver) and rebuilds
    await drive.wait(400);
  }, { extra: STRATA });
  await soak("popover opened, rows rebuilt without a press", m, async (i) => {
    await drive.click(`app.list.${i % 6}.go`);
    await drive.wait(300);
    await drive.set("app", "seq", 1000 + i);
    await drive.wait(400);
  }, { extra: STRATA });
  await soak("press discards the pressed view (onPointerDown)", m, async (i) => {
    await drive.press(`app.list.${i % 6}.kill`); await drive.wait(30); await drive.release(); await drive.wait(50);
  }, { extra: STRATA });
};

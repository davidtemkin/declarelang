// rows-edit.assert — real input in Chrome against rows-edit.declare:
//  1. a TextInput focused and typed into, then rebuilt by a key (F2) while focused
//  2. a modal Dialog opened in a row, then rows rebuilt under it (no press)
//  3. a drag whose own onDrag rebuilds the rows mid-drag
//  4. plain rebuilds (Markdown, HTMLText, a drawing in each row)
//   node tools/verify.mjs test/soak/rows-edit.declare --assert test/soak/rows-edit.assert.mjs
import { meter, soak, STRATA } from "./browser-lib.mjs";

const FOCUS = () => {
  const app = window.__declare.find("app");
  const s = app.children.find((c) => c._isOverlayStrata === true);
  const ae = document.activeElement;
  return { strataStack: s ? s.stack.length : 0, inputs: document.querySelectorAll("input,textarea,[contenteditable]").length, activeIsBody: ae === document.body ? 1 : 0, inert: document.querySelectorAll("[inert]").length };
};

export default async ({ drive, page }) => {
  const m = await meter(page);
  await soak("plain rebuilds (Markdown, HTMLText, drawing per row)", m, async () => { await drive.click("app.rebuild"); await drive.wait(50); }, { extra: FOCUS, warm: 10, n: 40 });
  await soak("TextInput focused + typed, rebuilt by a key while focused", m, async (i) => {
    await drive.click(`app.list.${i % 4}.field`);
    await drive.type("abc");
    await drive.key("F2");
    await drive.wait(50);
  }, { extra: FOCUS, warm: 8, n: 30 });
  await soak("drag rebuilds the rows from its own onDrag", m, async (i) => {
    await drive.press(`app.list.${i % 4}.handle`);
    for (let k = 0; k < 10; k++) await drive.moveBy(3, 2);
    await drive.release();
    await drive.wait(50);
  }, { extra: FOCUS, warm: 5, n: 20 });
  await soak("modal Dialog open in a row, rows rebuilt under it", m, async (i) => {
    await drive.click(`app.list.${i % 4}.dlgBtn`);
    await drive.wait(300);
    await drive.set("app", "seq", 9000 + i);
    await drive.wait(400);
  }, { extra: FOCUS, warm: 5, n: 20 });
  // after the dialogs: does the rest of the app still take input?
  const before = await page.evaluate(() => window.__declare.find("app").seq);
  try { await drive.click("app.rebuild"); } catch (e) { console.log("AFTER DIALOGS: click on Rebuild failed: " + e.message.split("\n")[0]); }
  await drive.wait(100);
  const after = await page.evaluate(() => window.__declare.find("app").seq);
  console.log(`after the dialog cycles, a click on Rebuild ${after !== before ? "works" : "DOES NOTHING"} (seq ${before} → ${after})`);
  await drive.key("F2"); await drive.wait(50);
  const k = await page.evaluate(() => window.__declare.find("app").seq);
  console.log(`after the dialog cycles, the F2 key ${k !== after ? "works" : "DOES NOTHING"} (seq ${after} → ${k})`);
};

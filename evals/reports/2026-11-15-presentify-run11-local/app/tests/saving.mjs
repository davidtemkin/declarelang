// Presentify: saving. Changes reach the service a moment after the last edit;
// when the service can't be reached the window says so, keeps the work, and
// sends it once the service answers again. Command-S sends at once.
//
//   npx declare-verify my-apps/presentify/presentify.declare --no-boot --assert my-apps/presentify/tests/saving.mjs

const STAGE = "app.workspace.body.stage";
const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const read = (p) => drive.read(p);
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: `/tmp/presentify-check-s-${name}.png` }); };
  const at = async (x, y) => {
    const left = await read(`${STAGE}.left`), top = await read(`${STAGE}.top`), fit = await read(`${STAGE}.fit`);
    return [left + x * fit, top + y * fit];
  };
  const draw = async (x0, y0, x1, y1) => {
    await drive.click("app.workspace.bar.tools.Rectangle");
    const [ax, ay] = await at(x0, y0);
    const [bx, by] = await at(x1, y1);
    await drive.press(STAGE, ax, ay);
    await drive.moveBy(bx - ax, by - ay);
    await drive.release();
  };
  const serverSlide = (deckId) => page.evaluate(async (url) => (await (await fetch(url)).json()).slides[0], `${API}/api/decks/${deckId}/slides`);
  const words = () => read("app.workspace.bar.titleBox.status.words.text");

  await drive.click('app.library.col.bar."New presentation"');
  await drive.settleData();
  await drive.settleMotion();
  await drive.key("Escape");
  const deckId = await read("app.deckId");
  try {
    await expect.equal(await words(), "All changes saved");

    // an edit: "Saving…" until it lands, then saved, within about two seconds
    await draw(100, 100, 400, 300);
    await expect.equal(await words(), "Saving…");
    await drive.wait(1000);
    await drive.settleData();
    await drive.wait(100);
    await expect.equal(await words(), "All changes saved");
    await expect.equal((await serverSlide(deckId)).elements.length, 1);

    // the service out of reach: the window says so, and keeps the work
    await drive.set("app", "api", "http://127.0.0.1:9");
    await draw(500, 100, 800, 300);
    await drive.wait(1000);
    await drive.settleData();
    await drive.wait(100);
    await expect.equal(await words(), "Not saved: can't reach the service");
    await expect.equal((await serverSlide(deckId)).elements.length, 1);
    await expect.equal(await read("app.deck.count"), 1);
    await shot("offline");

    // back: it is tried again, and everything arrives
    await drive.set("app", "api", API);
    await drive.wait(3200);
    await drive.settleData();
    await drive.wait(100);
    await drive.settleData();
    await expect.equal(await words(), "All changes saved");
    await expect.equal((await serverSlide(deckId)).elements.length, 2);

    // Command-S sends at once, without waiting for the pause
    await draw(100, 400, 300, 600);
    await drive.key("Mod+S");
    await drive.settleData();
    await expect.equal((await serverSlide(deckId)).elements.length, 3);
    await drive.settleData();
    await expect.equal(await words(), "All changes saved");
  } finally {
    await page.evaluate(async (url) => { await fetch(url, { method: "DELETE" }); }, `${API}/api/decks/${deckId}`);
  }
};

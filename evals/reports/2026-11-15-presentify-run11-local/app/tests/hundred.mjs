// Presentify with a hundred slides: opening, moving through them with the
// keyboard, and dragging on a slide stay quick. It makes its 100-slide
// presentation through the service first, and deletes it at the end.
//
//   npx declare-verify my-apps/presentify/presentify.declare --no-boot --assert my-apps/presentify/tests/hundred.mjs

const STAGE = "app.workspace.body.stage";

const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const read = (p) => drive.read(p);
  const id = await page.evaluate(async (api) => {
    const post = (url, body) => fetch(api + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    const made = await post("/api/decks", { title: "Hundred slides (perf check)" });
    for (let i = 2; i <= 100; i++) {
      await post(`/api/decks/${made.deck.id}/slides`, { background: "#F6F4EF", elements: [
        { id: "t" + i, kind: "text", x: 100, y: 100, width: 900, height: 80, keepProportions: false,
          text: { content: "Slide number " + i, font: "Georgia", size: 64, weight: 400, italic: false, color: "#0E3B43", align: "left" } },
        { id: "r" + i, kind: "rect", x: 100, y: 300, width: 400, height: 250, fill: "#E07A5F", stroke: null, cornerRadius: 20, keepProportions: false },
        { id: "e" + i, kind: "ellipse", x: 700, y: 300, width: 250, height: 250, fill: "#2F6F8F", stroke: { color: "#0E3B43", width: 4 }, keepProportions: true } ] });
    }
    return made.deck.id;
  }, API);
  await page.evaluate(() => window.__declare.find("app.decks").fetch());
  await drive.settleData();
  try {
  const t0 = Date.now();
  await drive.click('app."Open Hundred slides (perf check)"');
  await drive.settleData();
  await drive.settleMotion();
  console.log("open ms", Date.now() - t0);
  await expect.equal(await read("app.deck.count"), 100);
  await expect.equal(await read("app.deckId"), id);

  await drive.click("app.workspace.body.slides.pane.rows.0");
  const t1 = Date.now();
  const prof = await drive.profile(async () => {
    for (let i = 0; i < 10; i++) await drive.key("ArrowDown");
  });
  console.log("10 slide steps ms", Date.now() - t1);
  await expect.equal(await read("app.curIndex"), 10);
  console.log(prof.text.split("\n").slice(0, 12).join("\n"));

  // a drag of a shape: frames stay short
  const left = await read(`${STAGE}.left`), top = await read(`${STAGE}.top`), fit = await read(`${STAGE}.fit`);
  const p2 = await drive.profile(async () => {
    await drive.press(STAGE, left + 300 * fit, top + 420 * fit);
    for (let i = 0; i < 10; i++) await drive.moveBy(8, 3);
    await drive.release();
  });
  console.log(p2.text.split("\n").slice(0, 12).join("\n"));
  await drive.key("Mod+Z");
  await drive.wait(1500);
  await drive.settleData();
  if (process.env.SHOTS) await page.screenshot({ path: "/tmp/presentify-check-hundred.png" });
  } finally {
    await page.evaluate(async (url) => { await fetch(url, { method: "DELETE" }); }, `${API}/api/decks/${id}`);
  }
};

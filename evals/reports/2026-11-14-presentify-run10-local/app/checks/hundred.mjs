// A presentation of a hundred slides: it opens, the list scrolls to its end,
// and dragging a shape keeps up. It makes the presentation on the service
// first, and deletes it at the end.
const API = "http://127.0.0.1:8360";
const STAGE = "app.editor.body.desk.stage";

async function makeHundred(page) {
  return page.evaluate(async (api) => {
    const send = async (method, path, body) => (await fetch(api + path, { method, headers: { "content-type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body) })).json();
    const colors = ["#5B3DF5", "#FF6A3D", "#1E9C6A", "#14A6C7", "#F2C94C", "#E8384F"];
    const els = (i) => [
      { id: "t", kind: "text", x: 80, y: 60, width: 1100, height: 80, keepProportions: false,
        text: { content: "Slide " + (i + 1) + ": what we learned", font: "Georgia", size: 56, weight: 400, italic: false, color: "#1D1A2F", align: "left" } },
      ...[0, 1, 2, 3, 4, 5].map((j) => ({ id: "s" + j, kind: (i + j) % 2 ? "ellipse" : "rect", x: 80 + j * 190, y: 260 + ((i * 7 + j * 13) % 200),
        width: 160, height: 160, fill: colors[(i + j) % 6], stroke: null, keepProportions: false, ...((i + j) % 2 ? {} : { cornerRadius: 16 }) })),
      { id: "l", kind: "line", x1: 80, y1: 200, x2: 1200, y2: 200, stroke: { color: "#D9D5E2", width: 3 } }];
    const made = await send("POST", "/api/decks", { title: "A hundred slides" });
    const first = made.slides[0];
    await send("PUT", "/api/slides/" + first.id, { version: first.version, background: "#FFFFFF", elements: els(0) });
    let after = first.id;
    for (let i = 1; i < 100; i++) {
      const r = await send("POST", "/api/decks/" + made.deck.id + "/slides", { after, background: i % 2 ? "#F6F4EF" : "#FFFFFF", elements: els(i) });
      after = r.slide.id;
    }
    return made.deck.id;
  }, API);
}

export default async ({ drive, expect, page }) => {
  const deckId = await makeHundred(page);
  await page.evaluate(() => window.__declare.find("app.decks").fetch());
  await drive.settleData();
  try {
  const at = await page.evaluate((id) => window.__declare.find("app.home.body.grid").childViews.findIndex((v) => v.deckId == id), deckId);
  await drive.click("app.home.body.grid." + at + ".opener");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "ready", true);
  await expect.equal(await page.evaluate(() => window.__declare.find("app.doc").value.slides.length), 100);
  await page.getByRole("tab", { name: "Slide 1", exact: true }).click();
  await drive.key("End");
  await drive.settleMotion();
  await expect.equal(await page.evaluate(() => window.__declare.find("app.ed").idx), 99);
  await expect.visible("app.editor.body.rail.list.99");
  await page.screenshot({ path: "/tmp/ph-end.png" });
  const k = await drive.read("app.k");
  const dragged = await drive.profile(async () => {
    await drive.press(STAGE, 160 * k, 430 * k);    // a shape on the last slide
    for (let i = 0; i < 20; i++) await drive.moveBy(8, 3);
    await drive.release();
    await drive.settleMotion();
  });
  await expect.budget(dragged, { turnMs: 33 });    // no frame of the drag costs more than two at 60 Hz
  await page.screenshot({ path: "/tmp/ph-drag.png" });
  } finally {
  await page.evaluate(async ([api, id]) => { await fetch(api + "/api/decks/" + id, { method: "DELETE" }); }, [API, deckId]);
  }
};

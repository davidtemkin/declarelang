// The list of presentations: rename and delete from a card (delete asks
// first), a very long title, and a presentation of a hundred slides. Makes
// its own presentations through the service and deletes them at the end.
//
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/library.mjs

const API = "http://127.0.0.1:8360";
const LONG = "A very long presentation title that keeps going well past the width of any card, to see that it wraps and ends cleanly";

export default async ({ drive, expect, page }) => {
  const rd = (p) => drive.read(p);
  const check = (cond, what) => { if (!cond) throw new Error(what); };
  const call = (method, path, body) => page.evaluate(async (m, u, b) => {
    const r = await fetch(u, { method: m, headers: { "content-type": "application/json" }, body: b == null ? undefined : JSON.stringify(b) });
    return r.status == 204 ? null : r.json();
  }, method, API + path, body ?? null);
  const titles = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__declare.find("app.library").shown.map((d) => d.title))));

  const big = await call("POST", "/api/decks", { title: "A hundred slides" });
  const long = await call("POST", "/api/decks", { title: LONG });
  const doomed = await call("POST", "/api/decks", { title: "Rename me" });
  try {
    // a hundred slides, each with a number on it
    for (let i = 2; i <= 100; i++)
      await call("POST", "/api/decks/" + big.deck.id + "/slides", { background: i % 2 ? "#FFFFFF" : "#0E3B43", elements: [
        { id: "n", kind: "text", x: 80, y: 60, width: 600, height: 120, keepProportions: false,
          text: { content: "Slide " + i, font: "Bricolage Grotesque", size: 96, weight: 700, italic: false, color: i % 2 ? "#15121C" : "#FFFFFF", align: "left" } },
        { id: "b", kind: "rect", x: 80 + (i * 9) % 900, y: 400, width: 200, height: 200, fill: "#FF5F3A", stroke: null, cornerRadius: 30, keepProportions: false } ] });
    await page.evaluate(() => window.__declare.find("app.library").fetch());
    await drive.settleData();
    await drive.settleMotion();
    check((await titles()).includes(LONG), "the long title is listed");
    await page.screenshot({ path: "/tmp/lib-1-list.png" });

    // rename from the card's menu
    const cardIx = (await titles()).indexOf("Rename me");
    const card = "app.shell.library.body.grid." + cardIx;
    await drive.hover(card + ".opener");
    await drive.click(card + ".more");
    await drive.settleMotion();
    await drive.click('app.deckMenu."Rename…"');
    await drive.settleMotion();
    await drive.selectAll("app.renameDlg.field");
    await drive.type("Renamed in the list");
    await drive.key("Enter");
    await drive.settleData();
    await drive.settleMotion();
    check((await titles()).includes("Renamed in the list"), "renamed: " + (await titles()));
    const after = await call("GET", "/api/decks/" + doomed.deck.id);
    check(after.title == "Renamed in the list", "the service has the new title: " + after.title);

    // delete asks first; Cancel keeps it
    const ix2 = (await titles()).indexOf("Renamed in the list");
    const card2 = "app.shell.library.body.grid." + ix2;
    await drive.hover(card2 + ".opener");
    await drive.click(card2 + ".more");
    await drive.settleMotion();
    await drive.click('app.deckMenu."Delete…"');
    await drive.settleMotion();
    await expect.visible("app.deleteDlg");
    await page.screenshot({ path: "/tmp/lib-2-delete.png" });
    await drive.key("Escape");
    await drive.settleMotion();
    check((await titles()).includes("Renamed in the list"), "a slip deletes nothing");
    await drive.hover(card2 + ".opener");
    await drive.click(card2 + ".more");
    await drive.settleMotion();
    await drive.click('app.deckMenu."Delete…"');
    await drive.settleMotion();
    await drive.click('app.deleteDlg."Delete"');
    await drive.settleData();
    await drive.settleMotion();
    check(!(await titles()).includes("Renamed in the list"), "deleted once confirmed");

    // the long title, opened: the bar holds it without breaking
    await drive.set("app", "location", "deck/" + long.deck.id);
    await drive.settleData();
    await drive.settleMotion();
    await page.screenshot({ path: "/tmp/lib-3-longtitle.png" });
    await drive.click("app.shell.editor.bar.home");
    await drive.settleData();
    await drive.settleMotion();

    // a hundred slides: the list scrolls, the keys walk it, the last one presents
    await drive.set("app", "location", "deck/" + big.deck.id);
    await drive.settleData();
    await drive.settleMotion();
    check((await rd("app.ed.slideCount")) == 100, "a hundred slides");
    await drive.click("app.shell.editor.body.rail.list.0");
    await drive.key("End");
    await drive.settleMotion();
    check((await rd("app.ed.index")) == 99, "End goes to the last");
    await drive.key("ArrowUp");
    await drive.settleMotion();
    check((await rd("app.ed.index")) == 98, "ArrowUp goes back one");
    await page.screenshot({ path: "/tmp/lib-4-hundred.png" });
  } finally {
    for (const d of [big, long, doomed]) await call("DELETE", "/api/decks/" + d.deck.id);
  }
};

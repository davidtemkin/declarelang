// Saving when the service can't be reached: the window says so, the work is
// kept, and it is sent once the service answers again. Command-S saves at once.
// Run:
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/offline.mjs
// The service itself is never touched: its requests are refused in this
// browser only, as a dropped connection would.

const API = "http://127.0.0.1:8360";
const STAGE = "app.editor.body.desk.stage";
const shot = (page, name) => page.screenshot({ path: `/tmp/po-${name}.png` });

async function drawRect(drive, x0, y0, x1, y1) {
  const k = await drive.read("app.k");
  await drive.key("r");
  await drive.press(STAGE, x0 * k, y0 * k);
  await drive.moveBy((x1 - x0) * k / 2, (y1 - y0) * k / 2);
  await drive.moveBy((x1 - x0) * k / 2, (y1 - y0) * k / 2);
  await drive.release();
  await drive.settleMotion();
}
const serverEls = (page, sid) => page.evaluate(async ([api, sid]) => (await (await fetch(api + "/api/slides/" + sid)).json()).elements.length, [API, sid]);

export default async ({ drive, expect, page }) => {
  let blocked = false;
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.isInterceptResolutionHandled()) return;
    if (blocked && r.url().startsWith(API) && r.method() != "OPTIONS" && !r.headers()["x-check"]) r.abort("connectionrefused");
    else r.continue();
  });

  await drive.click("app.home.body.grid.0");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "ready", true);
  await drive.key("Enter");
  const deckId = await drive.read("app.deckId");
  const sid = await page.evaluate(() => window.__declare.find("app.doc").value.slides[0].id);

  // ⌘S: sent at once, without waiting for the pause after an edit
  await drawRect(drive, 100, 100, 400, 300);
  await drive.settleData();
  await expect.attr("app.sync", "status", "All changes saved");
  await expect.equal(await serverEls(page, sid), 1);
  // a nudge, and no time passes: only ⌘S can have sent it
  await drive.key("ArrowRight");
  await expect.attr("app.sync", "status", "Saving…");
  await drive.key("Mod+S");
  await drive.settleData();
  await expect.attr("app.sync", "status", "All changes saved");
  await expect.equal(await page.evaluate(async ([api, sid]) => (await (await fetch(api + "/api/slides/" + sid)).json()).elements[0].x, [API, sid]), 101);

  // the service goes away
  blocked = true;
  await drawRect(drive, 500, 100, 800, 300);
  await drive.wait(700);
  await drive.settleData();
  await expect.attr("app.sync", "status", "Not saved: can't reach the service");
  await expect.equal((await page.evaluate(() => window.__declare.find("app.ed").els)).length, 2);
  await shot(page, "01-offline");
  // more work while it is away is kept too
  await drawRect(drive, 900, 100, 1200, 300);
  await drive.wait(3000);
  await drive.settleData();
  await expect.attr("app.sync", "status", "Not saved: can't reach the service");

  // it comes back: everything reaches it, with nothing lost
  blocked = false;
  for (let i = 0; i < 12; i++) { await drive.wait(1000); await drive.settleData(); }
  await expect.attr("app.sync", "status", "All changes saved");
  await expect.equal(await serverEls(page, sid), 3);
  await shot(page, "02-back");

  await page.evaluate(async ([api, id]) => { await fetch(api + "/api/decks/" + id, { method: "DELETE" }); }, [API, deckId]);
};

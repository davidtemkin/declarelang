// The finer rules of editing, against a scratch presentation it deletes after:
// npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs

const STAGE = "app.editor.body.middle.stage";
const TOOLS = "app.editor.body.middle.tools.toolset";
const API = "http://127.0.0.1:8360";

export default async ({ drive, expect }) => {
  const read = (path, attr) => drive.page.evaluate(([p, a]) => {
    const j = JSON.stringify(window.__declare.find(p)[a]);
    return j === undefined ? null : JSON.parse(j);
  }, [path, attr]);
  const call = (expr) => drive.page.evaluate((e) => { const app = window.__declare.find("app"); const r = new Function("app", "return (" + e + ")")(app); const j = JSON.stringify(r); return j === undefined ? null : JSON.parse(j); }, expr);
  const geo = async () => ({ s: await read(STAGE, "s"), ox: await read(STAGE, "ox"), oy: await read(STAGE, "oy") });
  const items = async () => (await read("app.doc", "items")) ?? [];
  const pages = () => call("app.doc.pages().map((p) => p.id)");
  const steps = () => call("app.doc.past.length");
  const draw = async (tool, x0, y0, x1, y1) => {
    const g = await geo();
    await drive.click(`${TOOLS}.${tool}`);
    await drive.press(STAGE, g.ox + x0 * g.s, g.oy + y0 * g.s);
    await drive.moveBy((x1 - x0) * g.s / 2, (y1 - y0) * g.s / 2);
    await drive.moveBy((x1 - x0) * g.s / 2, (y1 - y0) * g.s / 2);
    await drive.release();
  };
  // drag a handle of the selection frame by (dx, dy) slide points
  const HANDLE = { r: "Resize right", l: "Resize left", t: "Resize top", b: "Resize bottom", rb: "Resize bottom right" };
  const pull = async (mode, dx, dy) => {
    const g = await geo();
    await drive.press(`${STAGE}.overlay.frame.handles."${HANDLE[mode]}"`);
    await drive.moveBy(dx * g.s / 2, dy * g.s / 2);
    await drive.moveBy(dx * g.s / 2, dy * g.s / 2);
    await drive.release();
  };

  await drive.settleData();
  await drive.click('app.listing.bar."New presentation"');
  await drive.settleData(); await drive.wait(100); await drive.settleData();
  const deckId = await read("app.doc", "deckId");

  // ── a circle keeps its proportions however it is resized; shift lets it change once
  await drive.page.keyboard.down("Shift");
  await draw("Ellipse", 200, 200, 400, 300);
  await drive.page.keyboard.up("Shift");
  let c = (await items())[0];
  await expect.equal(c.width, c.height);
  await expect.equal(c.keepProportions, true);
  await pull("r", 100, 0);
  c = (await items())[0];
  await expect.equal(Math.abs(c.width - c.height) < 0.05, true);
  await expect.equal(c.width > 290, true);
  await drive.page.keyboard.down("Shift");
  await pull("r", 100, 0);
  await drive.page.keyboard.up("Shift");
  c = (await items())[0];
  await expect.equal(c.width > c.height + 50, true);

  // ── a rounded rectangle made wider keeps its corners
  await draw("Rectangle", 700, 150, 1000, 350);
  let r = (await items())[1];
  await drive.set("app.doc", "sel", [r.id]);
  await call(`app.setRadius(24)`);
  await pull("r", 150, 0);
  r = (await items())[1];
  await expect.equal(r.cornerRadius, 24);
  await expect.equal(r.width > 400, true);
  await call(`app.setRadius(100000)`);
  r = (await items())[1];
  await expect.equal(r.cornerRadius, Math.round(Math.min(r.width, r.height) / 2));

  // ── a marquee selects what it touches
  const g = await geo();
  await drive.click(`${TOOLS}.Select`);
  await drive.press(STAGE, g.ox + 100 * g.s, g.oy + 80 * g.s);
  await drive.moveBy(500 * g.s, 300 * g.s);
  await drive.moveBy(500 * g.s, 300 * g.s);
  await drive.release();
  await expect.equal((await read("app.doc", "sel")).length, 2);

  // ── a held arrow key is one step
  await drive.clickAt(STAGE, g.ox + 300 * g.s, g.oy + 250 * g.s);       // the circle; the stage has the keyboard
  const before = await steps();
  const x0 = (await items())[0].x;
  await drive.page.keyboard.down("ArrowRight");
  await drive.page.keyboard.down("ArrowRight");
  await drive.page.keyboard.down("ArrowRight");
  await drive.page.keyboard.up("ArrowRight");
  await expect.equal((await items())[0].x, x0 + 3);
  await expect.equal(await steps(), before + 1);
  await drive.key("Shift+ArrowDown");
  await expect.equal(await steps(), before + 2);

  // ── a text box left empty disappears, and is no step at all
  const n0 = (await items()).length, s0 = await steps();
  const g2 = await geo();
  await drive.click(`${TOOLS}.Text`);
  await drive.clickAt(STAGE, g2.ox + 300 * g2.s, g2.oy + 600 * g2.s);
  await drive.wait(50);
  await expect.attr("app", "editingId", (await read("app.doc", "sel"))[0]);
  await drive.key("Escape");
  await expect.equal((await items()).length, n0);
  await expect.equal(await steps(), s0);

  // ── copy, then paste onto a new slide: offset, selected, fresh ids
  await drive.set("app.doc", "sel", [(await items())[1].id]);
  await drive.key("Meta+C");
  await drive.click('app.editor.body.rail.foot."New slide"');
  await expect.equal((await pages()).length, 2);
  await expect.equal((await items()).length, 0);
  await drive.clickAt(STAGE, 4, 4);
  await drive.key("Meta+V");
  let pasted = await items();
  await expect.equal(pasted.length, 1);
  await expect.equal(pasted[0].id !== r.id, true);
  await expect.equal((await read("app.doc", "sel"))[0], pasted[0].id);
  await expect.equal(pasted[0].x, r.x + 16);

  // ── the last slide can't be deleted; deleting and undoing restores it
  await drive.click('app.editor.body.rail.foot."Delete slide"');
  await expect.equal((await pages()).length, 1);
  await expect.attr("app.editor.body.rail.foot.\"Delete slide\"", "disabled", true);
  await drive.key("Meta+Z");
  await expect.equal((await pages()).length, 2);
  await drive.key("Meta+Shift+Z");
  await expect.equal((await pages()).length, 1);
  await drive.key("Meta+Z");

  // ── order: send the circle forward over the rectangle, on slide 1
  await drive.click("app.editor.body.rail.list.0");
  const ids = (await items()).map((e) => e.id);
  await drive.set("app.doc", "sel", [ids[0]]);
  await drive.key("Meta+]");
  await expect.equal((await items()).map((e) => e.id).join(), [ids[1], ids[0]].join());

  // ── everything reaches the service
  await drive.wait(1500); await drive.settleData(); await drive.wait(800); await drive.settleData();
  await expect.text("app.editor.head", "All changes saved");
  const server = await drive.page.evaluate(async ([api, id]) =>
    (await (await fetch(api + "/api/decks/" + id + "/slides")).json()), [API, deckId]);
  await expect.equal(server.slides.length, 2);
  await expect.equal(server.slides[0].elements.map((e) => e.id).join(), [ids[1], ids[0]].join());
  await expect.equal(server.slides[1].elements.length, 1);

  await drive.page.evaluate(async ([api, id]) => { await fetch(api + "/api/decks/" + id, { method: "DELETE" }); return null; }, [API, deckId]);
};

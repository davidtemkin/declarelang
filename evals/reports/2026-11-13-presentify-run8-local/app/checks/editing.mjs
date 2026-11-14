// The finer points of editing, on a presentation made for the check and
// deleted after: selecting, handles and proportions, mixed values, typing
// as one step, the keyboard, and undo putting the selection back.
const shot = (drive, name) => drive.page.screenshot({ path: `/tmp/pf/${name}.png` });
const API = "http://127.0.0.1:8360/api";
const rect = (id, x, y, w, h, fill, keep = false) => ({ id, kind: "rect", x, y, width: w, height: h, fill, stroke: null, cornerRadius: 0, keepProportions: keep });

export default async ({ drive, expect }) => {
  for (const d of (await (await fetch(`${API}/decks`)).json()).decks)
    if (d.title == "Editing check") await fetch(`${API}/decks/${d.id}`, { method: "DELETE" });
  const made = await (await fetch(`${API}/decks`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Editing check" }) })).json();
  const deck = made.deck.id, sid = made.slides[0].id;
  await fetch(`${API}/slides/${sid}`, { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: 1, background: "#FFFFFF", elements: [
      rect("a", 100, 100, 200, 100, "#FF5C39"), rect("b", 500, 120, 200, 200, "#6246EA", true), rect("c", 900, 300, 150, 80, "#FF5C39")] }) });
  await drive.set("app", "location", deck);
  await drive.waitReal(1500);
  await drive.settleMotion();
  const els = async () => drive.read("app.els");
  const byId = async (id) => (await els()).find((e) => e.id == id);
  const s = await drive.read("app.canvas.s");

  // ── a click selects one; shift-click adds; the inspector says Mixed where they differ
  await drive.clickAt("app.canvas", 150, 150);
  await expect.equal(await drive.read("app.sel"), ["a"]);
  await drive.clickAt("app.canvas", 600, 200, { modifiers: ["Shift"] });
  await expect.equal(await drive.read("app.sel"), ["a", "b"]);
  await expect.text("app.editor.body.inspector.col.fillSec", "Mixed");
  await shot(drive, "ed-mixed");
  // a fill applies to both, as one step
  const steps0 = (await drive.read("app.history")).length;
  await drive.click("app.editor.body.inspector.col.fillSec.body.0.slot.0");
  await drive.click("app.colors.grid.11");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal((await byId("a")).fill, "#2FBF71");
  await expect.equal((await byId("b")).fill, "#2FBF71");
  await expect.equal((await drive.read("app.history")).length, steps0 + 1);
  // shift-click removes one
  await drive.clickAt("app.canvas", 150, 150, { modifiers: ["Shift"] });
  await expect.equal(await drive.read("app.sel"), ["b"]);
  // Escape clears
  await drive.key("Escape");
  await expect.equal(await drive.read("app.sel"), []);

  // ── dragging on empty slide selects what the box touches
  await drive.press("app.canvas", 50, 50);
  await drive.moveBy(560 * s, 120 * s);
  await shot(drive, "ed-marquee");
  await drive.release();
  await drive.settleMotion();
  await expect.equal((await drive.read("app.sel")).sort(), ["a", "b"]);

  // ── b keeps its proportions without a key; with Shift it lets them go, once
  await drive.clickAt("app.canvas", 600, 200);
  await drive.press("app.canvas", 700, 320);       // its bottom-right corner
  await drive.moveBy(100 * s, 10 * s);
  await drive.release();
  await drive.settleMotion();
  let b = await byId("b");
  await expect.equal(Math.round(b.width), Math.round(b.height));
  await drive.press("app.canvas", b.x + b.width, b.y + b.height / 2);   // right edge
  await drive.page.keyboard.down("Shift");
  await drive.moveBy(80 * s, 0);
  await drive.release();
  await drive.page.keyboard.up("Shift");
  await drive.settleMotion();
  b = await byId("b");
  await expect.equal(Math.round(b.width) != Math.round(b.height), true);
  await expect.equal(b.keepProportions, true);
  // a's left edge: the right edge stays put
  await drive.clickAt("app.canvas", 150, 150);
  await drive.press("app.canvas", 100, 150);
  await drive.moveBy(-40 * s, 0);
  await drive.release();
  await drive.settleMotion();
  const a = await byId("a");
  await expect.equal(Math.round(a.x + a.width), 300);
  await expect.equal(Math.round(a.x), 60);
  // Undo puts it back, and the selection with it
  await drive.key("Escape");
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal(Math.round((await byId("a")).x), 100);
  await expect.equal(await drive.read("app.sel"), ["a"]);
  await drive.key("Mod+Shift+Z");
  await drive.settleMotion();
  await expect.equal(Math.round((await byId("a")).x), 60);

  // ── the arrow keys nudge by one, Shift by ten; a held run is one step
  await drive.clickAt("app.canvas", 120, 150);
  const x0 = (await byId("a")).x, h0 = (await drive.read("app.history")).length;
  await drive.key("ArrowRight"); await drive.key("ArrowRight"); await drive.key("Shift+ArrowDown");
  await drive.settleMotion();
  await expect.equal((await byId("a")).x, x0 + 2);
  await expect.equal((await byId("a")).y, 110);
  await expect.equal((await drive.read("app.history")).length, h0 + 1);
  // snapping: dragging c near b's centre line snaps and shows a guide
  await drive.press("app.canvas", 975, 340);
  await drive.moveBy(-((975 - 640) - 3) * s, 0);
  await shot(drive, "ed-snap");
  await expect.equal((await drive.read("app.canvas.guides")).length > 0, true);
  await drive.release();
  await drive.settleMotion();
  const c = await byId("c");
  await expect.equal(c.x + c.width / 2, 640);

  // ── ⌘C and ⌘V: the copy lands offset, selected; again, further
  await drive.clickAt("app.canvas", 120, 150);
  const n0 = (await els()).length;
  await drive.key("Mod+C");
  await drive.key("Mod+V");
  await drive.settleMotion();
  let all = await els();
  await expect.equal(all.length, n0 + 1);
  const pasted = all[all.length - 1];
  await expect.equal(pasted.x, (await byId("a")).x + 20);
  await expect.equal(await drive.read("app.sel"), [pasted.id]);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal((await els()).length, n0);
  // ⌘D duplicates
  await drive.clickAt("app.canvas", 120, 150);
  await drive.key("Mod+D");
  await drive.settleMotion();
  await expect.equal((await els()).length, n0 + 1);
  await drive.key("Mod+Z");
  await drive.settleMotion();

  // ── typing is one step; a text box left empty disappears
  await drive.click('app.editor.bar.tools."Text"');
  await drive.clickAt("app.canvas", 200, 500);
  await drive.settleMotion();
  const hT = (await drive.read("app.history")).length;
  await drive.type("Hello there");
  await drive.page.mouse.click(5, 400);
  await drive.settleMotion();
  await expect.equal((await drive.read("app.history")).length, hT + 1);
  await expect.equal((await els()).some((e) => e.kind == "text" && e.text.content == "Hello there"), true);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal((await els()).some((e) => e.kind == "text"), false);
  await drive.click('app.editor.bar.tools."Text"');
  await drive.clickAt("app.canvas", 200, 600);
  await drive.settleMotion();
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal((await els()).some((e) => e.kind == "text"), false);

  // ── slides: add, delete, reorder, each undone
  await drive.click("app.strip.col.add");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 2);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 1);
  await drive.click("app.strip.col.add");
  await drive.click("app.strip.col.add");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 3);
  await drive.click("app.strip.col.list.2");
  await drive.key("Backspace");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 2);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 3);
  const order = await drive.read("app.doc.order");
  await drive.click("app.strip.col.list.0");
  await drive.key("Alt+ArrowDown");
  await drive.settleMotion();
  await expect.equal((await drive.read("app.doc.order"))[1], order[0]);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.order"), order);
  // the last slide can't be deleted
  await drive.click("app.strip.col.list.2"); await drive.key("Backspace");
  await drive.click("app.strip.col.list.1"); await drive.key("Backspace");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 1);
  await drive.click("app.strip.col.list.0"); await drive.key("Backspace");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 1);

  // ── ⌘S sends at once; the service has it all
  await drive.key("Mod+S");
  await drive.waitReal(2000);
  await drive.wait(100);
  await expect.attr("app.doc", "status", "saved");
  const served = await (await fetch(`${API}/decks/${deck}/slides`)).json();
  await expect.equal(served.slides.length, 1);
  await expect.equal(JSON.stringify(served.slides[0].elements), JSON.stringify(await els()));

  await drive.click("app.editor.bar.home");
  await drive.settleMotion();
  await fetch(`${API}/decks/${deck}`, { method: "DELETE" });
};

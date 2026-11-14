// Every screen and state a person can reach, pictured and checked: the list
// loading, failing and its dialogs; the editor's empty slide, typing, the
// colour popover, menus, handles; saving while the service is unreachable.
const shot = (drive, name) => drive.page.screenshot({ path: `/tmp/pf/${name}.png` });
const API = "http://127.0.0.1:8360/api";

export default async ({ drive, expect }) => {
  // ── a presentation with a very long title and a hundred slides, made for this check
  for (const d of (await (await fetch(`${API}/decks`)).json()).decks)
    if (d.title.startsWith("A very long presentation title")) await fetch(`${API}/decks/${d.id}`, { method: "DELETE" });
  const made = await (await fetch(`${API}/decks`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "A very long presentation title that keeps going well past the width of any card or bar it is shown in, to see it cut cleanly" }) })).json();
  const deck = made.deck.id;
  let after = made.slides[0].id;
  for (let i = 2; i <= 100; i++) {
    const r = await (await fetch(`${API}/decks/${deck}/slides`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ after, background: i % 2 ? "#FFFFFF" : "#0E3B43", elements: [
        { id: "t" + i, kind: "text", x: 100, y: 300, width: 1080, height: 80, keepProportions: false,
          text: { content: "Slide number " + i, font: "Georgia", size: 64, weight: 400, italic: false, color: i % 2 ? "#1B1530" : "#FFFFFF", align: "center" } }] }) })).json();
    after = r.slide.id;
  }
  await drive.page.reload();
  await drive.waitReal(1500);
  await drive.settleMotion();
  await shot(drive, "st-list-long");

  // ── rename from the list, through its ⋯ menu
  await drive.page.getByRole("button", { name: /^Open A very long/ }).hover();
  await drive.settleMotion();
  await drive.page.getByRole("button", { name: "More actions" }).first().click();
  await drive.settleMotion();
  await shot(drive, "st-card-menu");
  await drive.page.getByRole("menuitem", { name: "Rename…" }).click();
  await drive.settleMotion();
  await shot(drive, "st-rename");
  await drive.key("Escape");
  await drive.settleMotion();

  // ── delete asks first
  await drive.page.getByRole("button", { name: /^Open A very long/ }).click({ button: "right" });
  await drive.settleMotion();
  await drive.page.getByRole("menuitem", { name: "Delete…" }).click();
  await drive.settleMotion();
  await shot(drive, "st-delete-ask");
  await drive.page.getByRole("button", { name: "Cancel" }).click();
  await drive.settleMotion();

  // ── open the hundred-slide one; the list scrolls; keys move through it
  await drive.page.getByRole("button", { name: /^Open A very long/ }).click();
  await drive.waitReal(2000);
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 100);
  await shot(drive, "st-hundred");
  await drive.click("app.strip.col.list.0");
  for (let i = 0; i < 5; i++) await drive.key("ArrowDown");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.curIndex"), 5);
  await drive.key("End");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.curIndex"), 99);
  await shot(drive, "st-hundred-end");

  // ── an empty slide says how to begin
  await drive.click("app.strip.col.add");
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 101);
  await expect.visible("app.canvas.hint");
  await shot(drive, "st-empty-slide");

  // ── shapes, handles, the radius handle, a line's ends, the colour popover
  const s = await drive.read("app.canvas.s");
  await drive.click('app.editor.bar.tools."Rectangle"');
  await drive.press("app.canvas", 200, 200);
  await drive.moveBy(400 * s, 250 * s);
  await drive.release();
  await drive.settleMotion();
  let r = (await drive.read("app.els"))[0];
  // drag the radius handle in by 60 points
  const hs = await drive.read("app.canvas.hs");
  await drive.press("app.canvas", r.x + 2.2 * hs + 1, r.y + 2.2 * hs + 1);
  await drive.moveBy(60 * s, 60 * s);
  await drive.release();
  await drive.settleMotion();
  r = (await drive.read("app.els"))[0];
  await expect.equal(Math.abs(r.cornerRadius - 60) <= 2, true);
  const radius = r.cornerRadius;
  // resize from the right edge: the radius stays 60
  await drive.press("app.canvas", r.x + r.width, r.y + r.height / 2);
  await drive.moveBy(200 * s, 0);
  await drive.release();
  await drive.settleMotion();
  r = (await drive.read("app.els"))[0];
  await expect.equal(Math.round(r.width), 600);
  await expect.equal(r.cornerRadius, radius);
  await shot(drive, "st-rounded");
  // a corner with Shift keeps proportions
  const ratio = r.width / r.height;
  await drive.press("app.canvas", r.x + r.width, r.y + r.height);
  await drive.page.keyboard.down("Shift");
  await drive.moveBy(-100 * s, 30 * s);
  await drive.release();
  await drive.page.keyboard.up("Shift");
  await drive.settleMotion();
  r = (await drive.read("app.els"))[0];
  await expect.equal(Math.abs(r.width / r.height - ratio) < 0.01, true);
  // the outline: a colour from the popover, a width typed
  await drive.click("app.editor.body.inspector.col.outline.body.0.slot.0");
  await drive.settleMotion();
  await shot(drive, "st-colour-popover");
  await drive.click("app.colors.grid.8");
  await drive.key("Escape");
  await drive.settleMotion();
  r = (await drive.read("app.els"))[0];
  await expect.equal(r.stroke.color, "#FF5C39");
  // a line, then its end dragged
  await drive.click('app.editor.bar.tools."Line"');
  await drive.press("app.canvas", 100, 600);
  await drive.moveBy(300 * s, 0);
  await drive.release();
  await drive.settleMotion();
  let ln = (await drive.read("app.els"))[1];
  await drive.press("app.canvas", ln.x2, ln.y2);
  await drive.moveBy(0, -80 * s);
  await drive.release();
  await drive.settleMotion();
  ln = (await drive.read("app.els"))[1];
  await expect.equal(Math.round(ln.y2), 520);
  await shot(drive, "st-line");
  // the arrange menu
  await drive.click("app.editor.bar.arrangeBtn");
  await drive.settleMotion();
  await shot(drive, "st-arrange-menu");
  await drive.key("Escape");

  // ── copy here, paste into another presentation
  await drive.key("Mod+A");
  await drive.click("app.editor.bar.editBtn");
  await drive.settleMotion();
  await drive.page.getByRole("menuitem", { name: "Copy" }).click();
  await drive.settleMotion();
  await drive.click("app.editor.bar.home");
  await drive.waitReal(1500);
  await drive.settleMotion();
  await drive.page.getByRole("button", { name: "Open Reading group" }).click();
  await drive.waitReal(1500);
  await drive.settleMotion();
  const before = (await drive.read("app.els")).length;
  await drive.click("app.editor.bar.editBtn");
  await drive.settleMotion();
  await shot(drive, "st-edit-menu");
  await drive.page.getByRole("menuitem", { name: "Paste" }).click();
  await drive.settleMotion();
  await expect.equal((await drive.read("app.els")).length, before + 2);
  await expect.equal((await drive.read("app.sel")).length, 2);
  await shot(drive, "st-pasted");
  // and take it back out, so the sample is as it was
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal((await drive.read("app.els")).length, before);

  // ── the service unreachable while editing: said, kept, and sent when it is back
  // (the network refusing every slide request, as when the service is down)
  await drive.page.evaluate(() => { const f = window.fetch; window.__realFetch = f;
    window.fetch = (u, o) => String(u).includes("/api/slides/") ? Promise.reject(new TypeError("Failed to fetch")) : f(u, o) });
  await drive.click('app.editor.bar.tools."Ellipse"');
  await drive.clickAt("app.canvas", 1000, 500);
  await drive.settleMotion();
  await drive.waitReal(2500);
  await drive.wait(800);
  await expect.attr("app.doc", "status", "offline");
  await expect.text("app.editor.bar.saveState", "Not saved: can't reach the service");
  await shot(drive, "st-offline");
  await drive.page.evaluate(() => { window.fetch = window.__realFetch });
  await drive.wait(3500);
  await drive.waitReal(1500);
  await drive.wait(200);
  await expect.attr("app.doc", "status", "saved");
  // take the ellipse back out of the sample
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await drive.waitReal(2000);
  await drive.wait(1000);
  await drive.waitReal(1000);
  await expect.attr("app.doc", "status", "saved");
  const served = await (await fetch(`${API}/slides/s12`)).json();
  await expect.equal(served.elements.length, before);

  // ── tidy up: the made presentation goes
  await fetch(`${API}/decks/${deck}`, { method: "DELETE" });
};

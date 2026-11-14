// The brief's "what done looks like", driven as a person would, against the
// live service. It makes a presentation called "Quarterly review" and leaves
// it there (delete it from the list afterwards).
const shot = (drive, name) => drive.page.screenshot({ path: `/tmp/pf/${name}.png` });

export default async ({ drive, expect }) => {
  // ── a new presentation, named
  await drive.waitReal(800);
  await drive.click('app.lists.page.bar."New presentation"');
  await drive.waitReal(1200);
  await drive.settleMotion();
  await expect.attr("app", "naming", true);
  await drive.key("Mod+A");
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.attr("app.doc", "title", "Quarterly review");
  await expect.equal(await drive.read("app.doc.count"), 1);

  // ── a dark rectangle across the top
  await drive.click('app.editor.bar.tools."Rectangle"');
  await drive.press("app.canvas", 0, 0);
  const s = await drive.read("app.canvas.s");
  await drive.moveBy(1280 * s, 200 * s);
  await drive.release();
  await drive.settleMotion();
  let els = await drive.read("app.els");
  await expect.equal(els.length, 1);
  await expect.equal(els[0].kind, "rect");
  await expect.equal(Math.round(els[0].width), 1280);
  // dark fill, from the colour popover
  await drive.click("app.editor.body.inspector.col.fillSec.body.0.slot.0");
  await drive.settleMotion();
  await drive.click("app.colors.grid.6");      // #1B1530
  await drive.settleMotion();
  await drive.key("Escape");
  els = await drive.read("app.els");
  await expect.equal(els[0].fill, "#1B1530");

  // ── a title typed into it: white, centred, 48 point
  await drive.click('app.editor.bar.tools."Text"');
  await drive.press("app.canvas", 140, 60);
  await drive.moveBy(1000 * s, 60 * s);
  await drive.release();
  await drive.settleMotion();
  await expect.attr("app", "editingText", (await drive.read("app.sel"))[0]);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  await drive.settleMotion();
  els = await drive.read("app.els");
  await expect.equal(els[1].text.content, "Quarterly review");
  await shot(drive, "s1-title-typed");
  // inspector: colour white, centre, 48
  await drive.click("app.editor.body.inspector.col.type.body.3.slot.0");
  await drive.settleMotion();
  await drive.click("app.colors.grid.0");      // #FFFFFF
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.page.getByRole("radio", { name: "Centre" }).click();
  await drive.selectAll("app.editor.body.inspector.col.type.body.1.slot.0");
  await drive.type("48");
  await drive.key("Enter");
  await drive.settleMotion();
  els = await drive.read("app.els");
  await expect.equal(els[1].text.color, "#FFFFFF");
  await expect.equal(els[1].text.align, "center");
  await expect.equal(els[1].text.size, 48);

  // ── three text boxes side by side, tops aligned, evenly distributed
  const words = ["Revenue", "Customers", "Hiring"];
  const xs = [100, 470, 840], ys = [330, 360, 345];
  for (let i = 0; i < 3; i++) {
    await drive.click('app.editor.bar.tools."Text"');
    await drive.clickAt("app.canvas", xs[i], ys[i]);
    await drive.settleMotion();
    await drive.type(words[i]);
    await drive.key("Escape");
    await drive.settleMotion();
  }
  els = await drive.read("app.els");
  await expect.equal(els.length, 5);
  const ids = els.slice(2).map((e) => e.id);
  await drive.set("app", "sel", ids);    // (shift-clicking them is checked below)
  await drive.settleMotion();
  await drive.page.getByRole("button", { name: "Align tops" }).click();
  await drive.page.getByRole("button", { name: "Distribute evenly across" }).click();
  await drive.settleMotion();
  els = await drive.read("app.els");
  const three = els.filter((e) => ids.includes(e.id));
  await expect.equal(new Set(three.map((e) => e.y)).size, 1);
  await shot(drive, "s1-three");

  for (const e of three) await expect.equal(e.text.color, "#1B1530");

  // ── a circle and its label, grouped, moved, and the move and the group undone
  await drive.click('app.editor.bar.tools."Ellipse"');
  await drive.press("app.canvas", 200, 520);
  await drive.moveBy(120 * s, 60 * s, );
  await drive.page.keyboard.down("Shift");
  await drive.moveBy(1, 1);
  await drive.release();
  await drive.page.keyboard.up("Shift");
  await drive.settleMotion();
  els = await drive.read("app.els");
  const circle = els[els.length - 1];
  await expect.equal(circle.kind, "ellipse");
  await expect.equal(Math.round(circle.width), Math.round(circle.height));
  await expect.equal(circle.keepProportions, true);
  await drive.click('app.editor.bar.tools."Text"');
  await drive.clickAt("app.canvas", 380, 560);
  await drive.settleMotion();
  await drive.type("Net promoter score");
  await drive.key("Escape");
  await drive.settleMotion();
  els = await drive.read("app.els");
  const label = els[els.length - 1];
  // select both: click the circle, shift-click the label
  await drive.clickAt("app.canvas", circle.x + circle.width / 2, circle.y + circle.height / 2);
  await drive.clickAt("app.canvas", label.x + 20, label.y + 15, { modifiers: ["Shift"] });
  await expect.equal((await drive.read("app.sel")).length, 2);
  await drive.key("Mod+G");
  await drive.settleMotion();
  els = await drive.read("app.els");
  const g = els[els.length - 1];
  await expect.equal(g.kind, "group");
  await expect.equal((await drive.read("app.sel"))[0], g.id);
  const before = JSON.stringify(els);
  await drive.press("app.canvas", circle.x + 30, circle.y + 30);
  await drive.moveBy(150 * s, -40 * s);
  await drive.release();
  await drive.settleMotion();
  els = await drive.read("app.els");
  await expect.equal(Math.round(els[els.length - 1].children[0].x), Math.round(circle.x + 150));
  await shot(drive, "s1-group-moved");
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal(JSON.stringify(await drive.read("app.els")), before);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  els = await drive.read("app.els");
  await expect.equal(els.some((e) => e.kind == "group"), false);
  await expect.equal((await drive.read("app.sel")).length, 2);
  await shot(drive, "s1-undone");

  // ── the slide duplicated, the copy's title changed, the copy dragged above
  await drive.click("app.editor.bar.slideBtn");
  await drive.settleMotion();
  await drive.page.getByRole("menuitem", { name: "Duplicate Slide" }).click();
  await drive.settleMotion();
  await expect.equal(await drive.read("app.doc.count"), 2);
  await expect.equal(await drive.read("app.curIndex"), 1);
  const titleEl = (await drive.read("app.els"))[1];
  await drive.dblclick("app.canvas", titleEl.x + titleEl.width / 2, titleEl.y + 20);
  await drive.settleMotion();
  await expect.attr("app", "editingText", titleEl.id);
  await drive.key("Mod+A");
  await drive.type("Quarterly review: the draft");
  await drive.page.mouse.click(5, 300);   // a click elsewhere ends the typing
  await drive.settleMotion();
  await expect.equal((await drive.read("app.els"))[1].text.content, "Quarterly review: the draft");
  const copyId = await drive.read("app.current");
  await drive.page.getByRole("button", { name: "Slide 2" }).hover();
  await drive.page.mouse.down();
  await drive.page.mouse.move(120, 200, { steps: 4 });
  await drive.page.mouse.move(120, 80, { steps: 6 });
  await shot(drive, "s2-dragging");
  await drive.page.mouse.up();
  await drive.settleMotion();
  await expect.equal((await drive.read("app.doc.order"))[0], copyId);
  await shot(drive, "s2-reordered");

  // ── presented from the start, the arrows going through
  await drive.click("app.strip.col.list.0");
  await drive.settleMotion();
  await drive.click("app.editor.bar.presentBtn");
  await drive.settleMotion();
  await expect.attr("app", "presenting", true);
  await expect.attr("app.presenter", "at", 0);
  await shot(drive, "s3-present-0");
  await drive.key("ArrowRight");
  await drive.settleMotion();
  await expect.attr("app.presenter", "at", 1);
  await shot(drive, "s3-present-1");
  await drive.key("ArrowRight");
  await drive.settleMotion();
  await shot(drive, "s3-present-end");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app", "presenting", false);

  // ── meanwhile a colleague edits the second slide in another window
  await drive.waitReal(2500);
  await expect.attr("app.doc", "status", "saved");
  await drive.click("app.strip.col.list.0");
  await drive.settleMotion();
  const second = (await drive.read("app.doc.order"))[1];
  const API = "http://127.0.0.1:8360/api";
  const theirs = await (await fetch(`${API}/slides/${second}`)).json();
  const edited = { ...theirs, elements: [...theirs.elements, { id: "colleague1", kind: "rect", x: 900, y: 500, width: 200, height: 120,
    fill: "#2FBF71", stroke: null, cornerRadius: 24, keepProportions: false }] };
  const put = await fetch(`${API}/slides/${second}`, { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: theirs.version, background: edited.background, elements: edited.elements }) });
  await expect.equal(put.status, 200);
  // they return to it, and are told
  await drive.click("app.strip.col.list.1");
  await drive.waitReal(1200);
  await drive.settleMotion();
  await expect.visible("app.editor.body.stageArea.note");
  await expect.text("app.editor.body.stageArea.note", "Someone changed this slide in another window.");
  await shot(drive, "s4-conflict");
  await drive.click('app.editor.body.stageArea.note."Use their version"');
  await drive.settleMotion();
  await expect.hidden("app.editor.body.stageArea.note");
  await expect.equal((await drive.read("app.els")).some((e) => e.id == "colleague1"), true);

  // every change saved without their thinking about it
  await drive.waitReal(2500);
  await expect.attr("app.doc", "status", "saved");
  const served = await (await fetch(`${API}/decks/${await drive.read("app.doc.deckId")}/slides`)).json();
  await expect.equal(served.slides.length, 2);
  await expect.equal(served.slides[0].elements[1].text.content, "Quarterly review: the draft");
  await expect.equal(served.slides[1].elements.some((e) => e.id == "colleague1"), true);
};

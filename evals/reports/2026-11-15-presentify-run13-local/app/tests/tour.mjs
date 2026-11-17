// A walk through every screen and state, with a picture of each in
// $TOUR_DIR (default /tmp/tour) — for looking at, not asserting. It makes its
// own presentations on the live service and deletes them at the end.
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/tour.mjs

const DIR = process.env.TOUR_DIR || "/tmp/tour";
const API = "http://127.0.0.1:8360";
const B = "app.shell.editor.body.stage.canvas.board";
const INS = "app.shell.editor.body.inspector";
const TOOLS = "app.shell.editor.bar.tools.picker";

export default async ({ drive, expect, page }) => {
  const fs = await import("node:fs");
  fs.mkdirSync(DIR, { recursive: true });
  let n = 0;
  const shot = async (name) => { await drive.settleMotion(); n++; await page.screenshot({ path: `${DIR}/${String(n).padStart(2, "0")}-${name}.png` }); };
  const shotNow = async (name) => { n++; await page.screenshot({ path: `${DIR}/${String(n).padStart(2, "0")}-${name}.png` }); };
  const k = async () => (await drive.read(`${B}.width`)) / 1280;
  const at = async (x, y) => { const s = await k(); return [Math.round(x * s), Math.round(y * s)]; };
  const clickSlide = async (x, y, opts) => { const [px, py] = await at(x, y); await drive.clickAt(B, px, py, opts); };
  const dragSlide = async (x0, y0, x1, y1) => {
    const s = await k();
    await drive.press(B, Math.round(x0 * s), Math.round(y0 * s));
    await drive.moveBy(Math.round((x1 - x0) * s / 2), Math.round((y1 - y0) * s / 2));
    await drive.moveBy(Math.round((x1 - x0) * s / 2), Math.round((y1 - y0) * s / 2));
    await drive.release();
  };
  const cleanup = () => page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8360/api/decks");
    for (const d of (await r.json()).decks)
      if (!["d1", "d2", "d3"].includes(d.id)) await fetch("http://127.0.0.1:8360/api/decks/" + d.id, { method: "DELETE" });
  });
  await cleanup();

  await shot("home");

  // a new presentation: empty
  await drive.click("app.shell.home.col.header.newBtn");
  await drive.settleData();
  await shot("new-empty");
  await drive.key("Escape");

  // draw one of each
  await drive.click(`${TOOLS}.Rectangle`);
  await dragSlide(80, 80, 520, 330);
  await drive.click(`${TOOLS}.Ellipse`);
  await dragSlide(640, 90, 900, 330);
  await drive.click(`${TOOLS}.Line`);
  await dragSlide(100, 450, 1150, 560);
  await shot("line-selected");
  await drive.click(`${TOOLS}.Text`);
  await clickSlide(120, 600);
  await drive.type("A text box, being typed in");
  await shot("text-editing");
  await page.screenshot({ path: `${DIR}/text-editing-close.png`, clip: { x: 300, y: 520, width: 340, height: 80 } });
  await drive.key("Escape");
  await shot("text-selected");
  await page.screenshot({ path: `${DIR}/text-resting-close.png`, clip: { x: 300, y: 520, width: 340, height: 80 } });
  await clickSlide(1250, 700);
  const bb = await page.evaluate(() => { const b = window.__declare.find("app.shell.editor.body.stage.canvas.board"); const o = b.rootOrigin(); return { x: o.x, y: o.y, w: b.width }; });
  await page.mouse.move(bb.x + 770 * bb.w / 1280, bb.y + 210 * bb.w / 1280);
  await drive.wait(50);
  await shotNow("hover-hint");

  // the rect's corners rounded by its handle
  await clickSlide(300, 200);
  const s = await k();
  await drive.press("app.shell.editor.body.stage.canvas.overlay.boxHandles.radiusHandle");
  await drive.moveBy(30, 30);
  await shotNow("radius-dragging");
  await drive.release();

  // moving with guides showing
  await drive.press(B, Math.round(300 * s), Math.round(200 * s));
  await drive.moveBy(Math.round(100 * s), 3);
  await drive.moveBy(Math.round(115 * s), 0);
  await shotNow("moving-with-guides");
  await drive.release();

  // a marquee
  await drive.press(B, Math.round(20 * s), Math.round(20 * s));
  await drive.moveBy(Math.round(600 * s), Math.round(300 * s));
  await drive.moveBy(Math.round(400 * s), Math.round(100 * s));
  await shotNow("marquee");
  await drive.release();
  await shot("multi-selected-mixed");

  // the colour popover, on the fill
  await drive.click(`${INS}."Fill colour"`);
  await shot("colour-popover");
  await drive.key("Escape");

  // grouped, then gone into
  await drive.key("Meta+G");
  await shot("grouped");
  await drive.dblclick(B, ...(await at(770, 210)));
  await shot("inside-group");
  await drive.key("Escape");

  // context menu on an element
  await drive.clickAt(B, ...(await at(770, 210)), { button: "right" });
  await shot("context-menu");
  await drive.key("Escape");

  // a slide's background, with nothing selected
  await clickSlide(1250, 700);
  await drive.click(`${INS}."Slide background"`);
  await drive.click(`app.colors.palette."#0E3B43"`);
  await drive.key("Escape");
  await shot("dark-background-selection");
  await clickSlide(770, 210);
  await shot("selection-on-dark");

  // more slides, one dragged in the list
  await drive.click("app.shell.editor.body.slides.foot.0");
  await drive.click("app.shell.editor.body.slides.foot.0");
  await drive.settleMotion();
  await drive.press("app.shell.editor.body.slides.pane.rows.0", 100, 50);
  await drive.moveBy(0, 60);
  await drive.moveBy(0, 120);
  await shotNow("slide-dragging");
  await drive.release();
  await shot("slide-dropped");

  // saving fails while the service can't be reached, then recovers
  await drive.set("app", "api", "http://127.0.0.1:9");
  await clickSlide(640, 360);
  await drive.click(`${TOOLS}.Rectangle`);
  await dragSlide(500, 300, 700, 420);
  await drive.waitReal(1500);
  await drive.wait(1500);
  await drive.waitReal(500);
  await shot("save-failed");
  await drive.set("app", "api", API);
  await drive.wait(3500);
  await drive.settleData();
  await drive.waitReal(800);
  await drive.wait(200);
  await shot("save-recovered");

  // someone else changes slide 1 (the one with the group) in another window
  const deckId = await drive.read("app.location");
  await page.evaluate(async (id) => {
    const ss = (await (await fetch(`http://127.0.0.1:8360/api/decks/${id}/slides`)).json()).slides;
    const s2 = ss[1];
    await fetch(`http://127.0.0.1:8360/api/slides/${s2.id}`, { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: s2.version, background: "#F2542D", elements: s2.elements }) });
  }, deckId);
  await drive.click("app.shell.editor.body.slides.pane.rows.1");
  await drive.settleData();
  await shot("conflict-banner");
  await drive.click("app.shell.editor.body.stage.banner.\"Keep mine\"");
  await drive.settleData();

  // presenting
  await drive.click("app.shell.editor.body.slides.pane.rows.0");
  await drive.click("app.shell.editor.bar.Present");
  await shot("presenting");
  await drive.key("Escape");

  // a long title and a hundred slides
  const big = await page.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:8360/api/decks", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "A presentation with a remarkably long title that goes on and on, to see where it is cut and how it reads" }) });
    const d = await r.json();
    let after = d.slides[0].id;
    for (let i = 0; i < 99; i++) {
      const bg = ["#FFFFFF", "#0E3B43", "#F4F1EC", "#1D1830"][i % 4];
      const rr = await fetch(`http://127.0.0.1:8360/api/decks/${d.deck.id}/slides`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ after, background: bg, elements: [{ id: "t", kind: "text", x: 100, y: 100, width: 1000, height: 120, keepProportions: false,
          text: { content: "Slide number " + (i + 2), font: "Georgia", size: 80, weight: 400, italic: false, color: i % 2 ? "#FFFFFF" : "#1D1830", align: "left" } }] }) });
      after = (await rr.json()).slide.id;
    }
    return d.deck.id;
  });
  await drive.click("app.shell.editor.bar.\"All presentations\"");
  await drive.settleData();
  await shot("home-with-long-title");
  await drive.click("app.shell.home.col.grid.0.opener");
  await drive.settleData();
  await shot("hundred-slides");
  await drive.click("app.shell.editor.body.slides.pane.rows.0");
  await drive.key("End");
  await shot("hundred-slides-end");

  // the list's menu, rename and delete dialogs
  await drive.click("app.shell.editor.bar.\"All presentations\"");
  await drive.settleData();
  await drive.click("app.shell.home.col.grid.0.more");
  await shot("deck-menu");
  await drive.click("app.deckMenu.\"Rename…\"");
  await shot("rename-dialog");
  await drive.key("Escape");
  await drive.settleMotion();
  await drive.click("app.shell.home.col.grid.0.more");
  await drive.click("app.deckMenu.\"Delete…\"");
  await shot("delete-dialog");
  await drive.key("Escape");

  await cleanup();
  await drive.settleData();
};

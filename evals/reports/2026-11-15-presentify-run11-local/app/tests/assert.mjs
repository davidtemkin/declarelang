// Presentify, end to end: the brief's "what done looks like", driven as a
// person would. It works in a presentation it makes itself and deletes that
// presentation at the end, so the service is left as it was found.
//
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/assert.mjs

const STAGE = "app.workspace.body.stage";
const API = "http://127.0.0.1:8360";

export default async ({ drive, expect, page }) => {
  const read = (p) => drive.read(p);
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: `/tmp/presentify-check-${name}.png` }); };

  // where a slide point is, inside the stage
  const at = async (x, y) => {
    const left = await read(`${STAGE}.left`), top = await read(`${STAGE}.top`), fit = await read(`${STAGE}.fit`);
    return [left + x * fit, top + y * fit];
  };
  const drawOn = async (x0, y0, x1, y1, opts = {}) => {
    const [ax, ay] = await at(x0, y0);
    const [bx, by] = await at(x1, y1);
    if (opts.shift) await page.keyboard.down("Shift");
    await drive.press(STAGE, ax, ay);
    await drive.moveBy((bx - ax) / 2, (by - ay) / 2);
    await drive.moveBy((bx - ax) / 2, (by - ay) / 2);
    await drive.release();
    if (opts.shift) await page.keyboard.up("Shift");
  };
  const clickSlide = async (x, y, modifiers) => {
    const [ax, ay] = await at(x, y);
    await drive.clickAt(STAGE, ax, ay, modifiers ? { modifiers } : undefined);
  };
  const elements = () => page.evaluate(() => window.__declare.find("app.editor").elements);
  const selection = () => page.evaluate(() => window.__declare.find("app.editor").selection);
  const status = () => read("app.sync.status");
  const settleSave = async () => { await drive.wait(1500); await drive.settleData(); await drive.wait(200); await drive.settleData(); };

  // ── a new presentation, called "Quarterly review"
  await drive.click('app.library.col.bar."New presentation"');
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "editor");
  await expect.equal(await read("app.deck.count"), 1);
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await settleSave();
  const deckId = await read("app.deckId");
  try {
    await expect.equal(await read("app.sync.title"), "Quarterly review");
    await expect.equal(await status(), "saved");
    await expect.request("PATCH", `/api/decks/${deckId}`, { body: { title: "Quarterly review" } });
    await shot("01-new");

    // ── a dark rectangle across the top
    await drive.click('app.workspace.bar.tools.Rectangle');
    await drawOn(0, 0, 1280, 200);
    let els = await elements();
    await expect.equal(els.length, 1);
    await expect.equal(els[0].kind, "rect");
    await expect.equal(els[0].width, 1280);
    await expect.equal(await read("app.editor.tool"), "select");
    // fill it dark from the inspector's palette
    await drive.click('app."Fill colour"');
    await drive.click('app.colorPop."#1F2328"');
    els = await elements();
    await expect.equal(els[0].fill, "#1F2328");
    await shot("02-rect");

    // ── a title typed into it: white, centred, 48 point
    await drive.click('app.workspace.bar.tools.Text');
    await drawOn(140, 60, 1140, 120);
    await drive.type("Quarterly review");
    await drive.key("Escape");
    els = await elements();
    await expect.equal(els.length, 2);
    await expect.equal(els[1].text.content, "Quarterly review");
    await expect.equal(els[1].text.color, "#FFFFFF");        // words typed over a dark shape start white
    await clickSlide(600, 80);
    await expect.equal(await selection(), [els[1].id]);
    await drive.click('app."Centred"');
    await drive.selectAll('app."Text size"');
    await drive.type("48");
    await drive.key("Enter");
    els = await elements();
    await expect.equal(els[1].text.align, "center");
    await expect.equal(els[1].text.size, 48);
    await shot("03-title");

    // ── three text boxes side by side; tops aligned, spread evenly
    const words = ["Revenue", "Costs", "Outlook"];
    const xs = [90, 470, 980], ys = [300, 340, 320];
    for (let i = 0; i < 3; i++) {
      await drive.click('app.workspace.bar.tools.Text');
      await drawOn(xs[i], ys[i], xs[i] + 220, ys[i] + 40);
      await drive.type(words[i]);
      await drive.key("Escape");
    }
    els = await elements();
    await expect.equal(els.length, 5);
    await clickSlide(150, 315);
    await clickSlide(520, 355, ["Shift"]);
    await clickSlide(1030, 335, ["Shift"]);
    await expect.equal((await selection()).length, 3);
    await drive.click('app."Align tops"');
    await drive.click('app."Distribute across"');
    els = (await elements()).slice(2);
    await expect.equal(els.map((e) => e.y), [300, 300, 300]);
    const gap1 = els[1].x - (els[0].x + els[0].width), gap2 = els[2].x - (els[1].x + els[1].width);
    await expect.equal(Math.abs(gap1 - gap2) < 0.1, true);
    await shot("04-three");

    // ── a circle and a label, grouped, moved, and the change of mind: undo twice
    await drive.click('app.workspace.bar.tools.Ellipse');
    await drawOn(160, 470, 300, 560, { shift: true });
    els = await elements();
    const circle = els[els.length - 1];
    await expect.equal(circle.width, circle.height);
    await expect.equal(circle.keepProportions, true);
    await drive.click('app.workspace.bar.tools.Text');
    await drawOn(320, 520, 560, 560);
    await drive.type("The team");
    await drive.key("Escape");
    await clickSlide(230, 540);
    await clickSlide(380, 540, ["Shift"]);
    await drive.click('app.workspace.bar.Group');
    els = await elements();
    await expect.equal(els[els.length - 1].kind, "group");
    const [gx, gy] = await at(230, 540);
    await drive.press(STAGE, gx, gy);
    await drive.moveBy(60, 0);
    await drive.moveBy(60, 0);
    await drive.release();
    els = await elements();
    const moved = els[els.length - 1];
    await expect.equal(moved.children[0].x > circle.x + 50, true);
    await drive.key("Mod+Z");
    els = await elements();
    await expect.equal(els[els.length - 1].kind, "group");
    await expect.equal(els[els.length - 1].children[0].x, circle.x);
    await drive.key("Mod+Z");
    els = await elements();
    await expect.equal(els.some((e) => e.kind == "group"), false);
    await expect.equal((await selection()).length, 2);       // the selection is put back as it was
    await shot("05-grouped");

    // ── the slide duplicated, its title changed, the copy dragged above the original
    await settleSave();
    await drive.click("app.workspace.body.slides.pane.rows.0", { button: "right" });
    await drive.click('app.slideMenu."Duplicate slide"');
    await expect.equal(await read("app.deck.count"), 2);
    await expect.equal(await read("app.curIndex"), 1);
    const copyKey = await read("app.cur");
    await drive.dblclick(STAGE, ...(await at(640, 90)));
    await drive.key("Mod+A");
    await drive.type("Quarterly review: draft");
    await drive.key("Escape");
    await drive.settleMotion();
    await drive.drag("app.workspace.body.slides.pane.rows.1", 0, -110);
    await drive.settleMotion();
    const order = await page.evaluate(() => window.__declare.find("app.deck").slides().map((s) => s.id));
    await expect.equal(order[0], copyKey);
    await settleSave();
    await expect.equal(await status(), "saved");
    await shot("06-reordered");

    // ── presented from the start; the arrow keys go through it
    await drive.click("app.workspace.body.slides.pane.rows.0");
    await drive.click('app.workspace.bar.Present');
    await drive.settleMotion();
    await expect.attr("app", "presenting", true);
    await expect.attr("app.presenter", "at", 0);
    await drive.key("ArrowRight");
    await expect.attr("app.presenter", "at", 1);
    await drive.key("ArrowRight");
    await expect.attr("app.presenter", "at", 1);         // the last slide stays
    await shot("07-presenting");
    await drive.key("Escape");
    await drive.settleMotion();
    await expect.attr("app", "presenting", false);
    await expect.equal(await read("app.curIndex"), 1);    // back on the slide it ended on

    // ── a colleague changes the second slide in another window
    const sid = await page.evaluate(() => {
      const s = window.__declare.find("app.sync");
      const key = window.__declare.find("app.deck").slides()[1].id;
      return s.known[key].sid;
    });
    const theirs = await page.evaluate(async (url) => {
      const cur = await (await fetch(url)).json();
      const elements = [...cur.elements, { id: "colleague1", kind: "rect", x: 900, y: 500, width: 200, height: 120,
        fill: "#FF5B3A", stroke: null, cornerRadius: 24, keepProportions: false }];
      const r = await fetch(url, { method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: cur.version, background: cur.background, elements }) });
      return (await r.json()).elements.length;
    }, `${API}/api/slides/${sid}`);
    await drive.click("app.workspace.body.slides.pane.rows.0");
    await drive.click("app.workspace.body.slides.pane.rows.1");
    await drive.settleData();
    await drive.settleMotion();
    await expect.visible(`${STAGE}.banner`);
    await expect.text(`${STAGE}.banner`, "was changed in another window");
    await shot("08-conflict");
    await drive.click('app."Use their version"');
    await drive.settleMotion();
    els = await elements();
    await expect.equal(els.length, theirs);
    await expect.equal(els.some((e) => e.id == "colleague1"), true);
    await settleSave();
    await expect.equal(await status(), "saved");
  } finally {
    // leave the service as it was
    await page.evaluate(async (url) => { await fetch(url, { method: "DELETE" }); }, `${API}/api/decks/${deckId}`);
  }
};

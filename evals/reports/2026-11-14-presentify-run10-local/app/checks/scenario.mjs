// The brief's "what done looks like", driven as a person would, against the
// running service. Run:
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/scenario.mjs
// It makes a presentation called "Quarterly review" and deletes it at the end.

const API = "http://127.0.0.1:8360";
const shot = (page, name) => page.screenshot({ path: `/tmp/pf-${name}.png` });
const k = async (drive) => drive.read("app.k");

// a point on the slide, in the stage's own pixels
async function at(drive, x, y) { const s = await k(drive); return [x * s, y * s]; }

async function drawOnSlide(drive, x0, y0, x1, y1, opts = {}) {
  const [px, py] = await at(drive, x0, y0);
  const [qx, qy] = await at(drive, x1, y1);
  if (opts.shift) await drive.page.keyboard.down("Shift");
  await drive.press("app.editor.body.desk.stage", px, py);
  await drive.moveBy((qx - px) / 2, (qy - py) / 2);
  await drive.moveBy((qx - px) / 2, (qy - py) / 2);
  await drive.release();
  if (opts.shift) await drive.page.keyboard.up("Shift");
  await drive.settleMotion();
}
async function clickSlide(drive, x, y, modifiers) {
  const [px, py] = await at(drive, x, y);
  await drive.clickAt("app.editor.body.desk.stage", px, py, modifiers ? { modifiers } : undefined);
  await drive.settleMotion();
}
const els = (page) => page.evaluate(() => window.__declare.find("app.ed").els);
const sel = (page) => page.evaluate(() => [...window.__declare.find("app").sel]);

export default async ({ drive, expect, page }) => {
  // ── a new presentation, named
  await drive.click("app.home.body.grid.0");
  await drive.settleData();
  await drive.settleMotion();
  await expect.attr("app", "screen", "editor");
  await expect.attr("app", "ready", true);
  await drive.type("Quarterly review");
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.equal(await page.evaluate(() => window.__declare.find("app.doc").value.title), "Quarterly review");
  await shot(page, "01-new");

  // ── a dark rectangle across the top
  await drive.click("app.editor.bar.middle.tools.Rectangle");
  await drawOnSlide(drive, 0, 0, 1280, 200);
  let e = await els(page);
  await expect.equal(e.length, 1);
  await expect.equal(e[0].kind, "rect");
  await expect.equal([e[0].x, e[0].y, e[0].width, e[0].height], [0, 0, 1280, 200]);
  await page.getByRole("button", { name: /^Fill:/ }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "#1D1A2F" }).click();
  await drive.settleMotion();
  e = await els(page);
  await expect.equal(e[0].fill, "#1D1A2F");
  await shot(page, "02-rect");

  // ── a title typed into it, white, centred, 48 point
  await drive.click("app.editor.bar.middle.tools.Text");
  await drawOnSlide(drive, 140, 60, 1140, 70);
  await drive.type("Quarterly review");
  await drive.key("Escape");
  await drive.settleMotion();
  e = await els(page);
  await expect.equal(e.length, 2);
  await expect.equal(e[1].text.content, "Quarterly review");
  await expect.equal(await sel(page), [e[1].id]);
  await page.getByRole("button", { name: /^Text colour:/ }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "#FFFFFF" }).click();
  await drive.settleMotion();
  await page.getByRole("radio", { name: "Centre" }).click();
  await drive.settleMotion();
  await drive.selectAll("app.editor.body.inspector.col.textSec.body.1.tools.0");
  await drive.type("48");
  await drive.key("Enter");
  await drive.settleMotion();
  e = await els(page);
  await expect.equal([e[1].text.color, e[1].text.align, e[1].text.size], ["#FFFFFF", "center", 48]);
  await shot(page, "03-title");

  // ── three text boxes side by side, tops aligned, spread evenly
  const words = ["Revenue", "Customers", "Hiring"];
  const spots = [[120, 300], [520, 340], [900, 320]];
  for (let i = 0; i < 3; i++) {
    await drive.click("app.editor.bar.middle.tools.Text");
    await drawOnSlide(drive, spots[i][0], spots[i][1], spots[i][0] + 260, spots[i][1] + 10);
    await drive.type(words[i]);
    await drive.key("Escape");
    await drive.settleMotion();
  }
  e = await els(page);
  await expect.equal(e.length, 5);
  const three = e.slice(2).map((x) => x.id);
  await clickSlide(drive, 140, 315);
  await clickSlide(drive, 540, 355, ["Shift"]);
  await clickSlide(drive, 920, 335, ["Shift"]);
  await expect.equal((await sel(page)).sort(), [...three].sort());
  await page.getByRole("button", { name: "Align tops" }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "Distribute across" }).click();
  await drive.settleMotion();
  e = await els(page);
  const tops = e.slice(2).map((x) => x.y);
  await expect.equal(new Set(tops).size, 1);
  const xs = e.slice(2).map((x) => x.x).sort((a, b) => a - b);
  await expect.equal(Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.6, true);
  await shot(page, "04-three");

  // ── a circle and a label, grouped, moved, and both undone
  await drive.click("app.editor.bar.middle.tools.Ellipse");
  await drawOnSlide(drive, 200, 470, 340, 560, { shift: true });
  e = await els(page);
  const circle = e[e.length - 1];
  await expect.equal([circle.kind, circle.width, circle.height, circle.keepProportions], ["ellipse", 140, 140, true]);
  await drive.click("app.editor.bar.middle.tools.Text");
  await drawOnSlide(drive, 380, 520, 640, 530);
  await drive.type("Our team");
  await drive.key("Escape");
  await drive.settleMotion();
  const beforeGroup = JSON.stringify(await els(page));
  await clickSlide(drive, 270, 540);
  await clickSlide(drive, 420, 535, ["Shift"]);
  await expect.equal((await sel(page)).length, 2);
  await drive.key("Mod+G");
  await drive.settleMotion();
  e = await els(page);
  const group = e[e.length - 1];
  await expect.equal([group.kind, group.children.length], ["group", 2]);
  const [gx, gy] = await at(drive, 270, 540);
  const [mx] = await at(drive, 200, 0);
  await drive.press("app.editor.body.desk.stage", gx, gy);
  await drive.moveBy(mx / 2, 0);
  await drive.moveBy(mx / 2, 0);
  await drive.release();
  await drive.settleMotion();
  e = await els(page);
  await expect.equal(Math.round(e[e.length - 1].children[0].x), circle.x + 200);
  await shot(page, "05-moved");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await drive.settleMotion();
  e = await els(page);
  await expect.equal([e[e.length - 1].kind, e[e.length - 1].children[0].x], ["group", circle.x]);
  await drive.key("Mod+Z");
  await drive.settleMotion();
  await expect.equal(JSON.stringify(await els(page)), beforeGroup);

  // ── the slide duplicated, its title changed, the copy dragged above
  await drive.key("Escape");
  await drive.settleMotion();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await drive.settleMotion();
  let slides = await page.evaluate(() => window.__declare.find("app.doc").value.slides.map((s) => s.id));
  await expect.equal(slides.length, 2);
  await expect.attr("app", "curId", slides[1]);
  await drive.dblclick("app.editor.body.desk.stage", ...(await at(drive, 640, 90)));
  await drive.settleMotion();
  await drive.type("Q3 in one page");
  await drive.key("Escape");
  await drive.settleMotion();
  e = await els(page);
  await expect.equal(e[1].text.content, "Q3 in one page");
  await drive.press("app.editor.body.rail.list.1", 100, 50);
  await drive.moveBy(0, -60);
  await drive.moveBy(0, -60);
  await shot(page, "06-carrying");
  await drive.release();
  await drive.settleMotion();
  const order = await page.evaluate(() => window.__declare.find("app.doc").value.slides.map((s) => s.id));
  await expect.equal(order, [slides[1], slides[0]]);
  await shot(page, "07-reordered");

  // ── presented from the start, with the arrow keys
  await page.getByRole("tab", { name: "Slide 1", exact: true }).click();
  await drive.settleMotion();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await drive.settleMotion();
  await expect.attr("app", "presenting", true);
  await expect.attr("app", "showIdx", 0);
  await shot(page, "08-show");
  await drive.key("ArrowRight");
  await drive.settleMotion();
  await expect.attr("app", "showIdx", 1);
  await drive.key("ArrowLeft");
  await drive.key("ArrowRight");
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.attr("app", "presenting", false);
  await expect.attr("app", "curId", order[1]);

  // ── everything saved without asking
  for (let i = 0; i < 6; i++) { await drive.wait(700); await drive.settleData(); }
  await expect.attr("app.sync", "status", "All changes saved");
  const deckId = await drive.read("app.deckId");
  const saved = await page.evaluate(async ([api, id]) => {
    const d = await (await fetch(api + "/api/decks/" + id)).json();
    const s = await (await fetch(api + "/api/decks/" + id + "/slides")).json();
    return { title: d.title, n: s.slides.length, first: s.slides[0].elements.map((x) => x.text?.content ?? x.kind) };
  }, [API, deckId]);
  await expect.equal(saved.title, "Quarterly review");
  await expect.equal(saved.n, 2);
  await expect.equal(saved.first.includes("Q3 in one page"), true);

  // ── a colleague changes the second slide in another window
  await page.getByRole("tab", { name: "Slide 1", exact: true }).click();
  await drive.settleMotion();
  const sid = await page.evaluate((local) => window.__declare.find("app.sync").known[local].sid, order[1]);
  await page.evaluate(async ([api, sid]) => {
    const s = await (await fetch(api + "/api/slides/" + sid)).json();
    s.background = "#FFF4D6";
    s.elements.push({ id: "colleague1", kind: "rect", x: 900, y: 500, width: 300, height: 160, fill: "#FF6A3D", stroke: null, cornerRadius: 24, keepProportions: false });
    await fetch(api + "/api/slides/" + sid, { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: s.version, background: s.background, elements: s.elements }) });
  }, [API, sid]);
  await page.getByRole("tab", { name: "Slide 2", exact: true }).click();
  await drive.settleData();
  await drive.settleMotion();
  await expect.text("app.editor.body.desk.banner", "was changed in another window");
  await shot(page, "09-conflict");
  await page.getByRole("button", { name: "Use their version" }).click();
  await drive.settleMotion();
  const now = await page.evaluate(() => window.__declare.find("app.ed").slide);
  await expect.equal(now.background, "#FFF4D6");
  await expect.equal(now.elements.some((x) => x.id == "colleague1"), true);
  for (let i = 0; i < 4; i++) { await drive.wait(700); await drive.settleData(); }
  await expect.attr("app.sync", "status", "All changes saved");
  await expect.attr("app.sync", "conflictCount", 0);
  await shot(page, "10-theirs");

  // ── leave the service as it was
  await page.evaluate(async ([api, id]) => { await fetch(api + "/api/decks/" + id, { method: "DELETE" }); }, [API, deckId]);
};

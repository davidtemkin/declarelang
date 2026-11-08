// The 7GUIs flows, driven as a person would. Run with:
//   npx declare-verify my-apps/7guis/7guis.declare --assert my-apps/7guis/flows.mjs

const P = (i) => `app.page.${i}.body.0`;

export default async ({ drive, expect }) => {
  // ── 1. Counter
  const counter = P(0);
  await drive.click(`${counter}.Count`);
  await drive.click(`${counter}.Count`);
  await drive.click(`${counter}.Count`);
  await expect.attr(counter, "count", 3);
  await expect.text(`${counter}.field`, "3");

  // ── 2. Temperature: both ways, and junk leaves the other alone
  await drive.set("app", "location", "temperature");
  const temp = P(1);
  await drive.click(`${temp}.Celsius`);
  await drive.type("100");
  await expect.attr(temp, "fahrenheit", "212");
  await drive.selectAll(`${temp}.Fahrenheit`);
  await drive.type("32");
  await expect.attr(temp, "celsius", "0");
  await drive.type("abc");
  await expect.attr(temp, "celsius", "0");

  // ── 5. CRUD: filter, select, update, create, delete
  await drive.set("app", "location", "crud");
  const crud = P(4);
  await drive.click(`${crud}.Filter prefix`);
  await drive.type("Mu");
  await expect.equal(await drive.page.evaluate((p) => window.__declare.find(p).shown.value.people.length, crud), 1);
  await drive.click(`${crud}.middle.list."Mustermann, Max"`);
  await expect.attr(crud, "name", "Max");
  await drive.selectAll(`${crud}.middle.fields."Name:"`);
  await drive.type("Maxine");
  await drive.click(`${crud}.buttons.Update`);
  await expect.text(`${crud}.middle.list`, "Mustermann, Maxine");
  await drive.selectAll(`${crud}.Filter prefix`);
  await drive.key("Backspace");
  await drive.selectAll(`${crud}.middle.fields."Name:"`);
  await drive.type("Ada");
  await drive.selectAll(`${crud}.middle.fields."Surname:"`);
  await drive.type("Lovelace");
  await drive.click(`${crud}.buttons.Create`);
  await expect.equal(await drive.page.evaluate((p) => window.__declare.find(p).people.value.people.length, crud), 4);
  await drive.click(`${crud}.middle.list."Emil, Hans"`);
  await drive.click(`${crud}.buttons.Delete`);
  await expect.equal(
    await drive.page.evaluate((p) => window.__declare.find(p).people.value.people.map((x) => x.surname).join(","), crud),
    "Mustermann,Tisch,Lovelace");
  await expect.attr(crud, "hasSelection", false);

  // ── 6. Circle Drawer: draw, right-click → adjust, close, undo, redo
  await drive.set("app", "location", "circles");
  const circles = P(5);
  await drive.clickAt(`${circles}.canvas`, 120, 120);
  await drive.clickAt(`${circles}.canvas`, 220, 120);
  const o = await drive.page.evaluate((p) => window.__declare.find(p).canvas.rootOrigin(), circles);
  await drive.page.mouse.move(o.x + 222, o.y + 121);
  await drive.page.mouse.click(o.x + 222, o.y + 121, { button: "right" });
  await drive.settleMotion();
  await drive.click(`${circles}.circleMenu."Adjust diameter…"`);
  await drive.settleMotion();
  await expect.attr(circles, "adjusting", 2);
  await drive.drag(`${circles}.adjuster.Diameter`, 40, 0);
  const grown = await drive.page.evaluate((p) => window.__declare.find(p).drawing.value.circles[1].d, circles);
  await drive.click(`${circles}.adjuster.Close`);
  await drive.settleMotion();
  await expect.attr(circles, "adjusting", 0);
  await drive.click(`${circles}.bar.Undo`);
  await expect.equal(await drive.page.evaluate((p) => window.__declare.find(p).drawing.value.circles[1].d, circles), 40);
  await drive.click(`${circles}.bar.Undo`);
  await expect.equal(await drive.page.evaluate((p) => window.__declare.find(p).drawing.value.circles.length, circles), 1);
  await drive.click(`${circles}.bar.Redo`);
  await drive.click(`${circles}.bar.Redo`);
  await expect.equal(await drive.page.evaluate((p) => window.__declare.find(p).drawing.value.circles[1].d, circles), grown);

  // ── 7. Cells: values, a formula, a change that propagates, an error
  await drive.set("app", "location", "cells");
  const cells = P(6);
  const R = `${cells}.frame.pane.rows`;
  const cell = (id) => drive.page.evaluate((a) => { const c = window.__declare.find(a[0]).sheet.cell(a[1]); return c.kind == "number" ? c.num : c.kind; }, [cells, id]);
  await drive.dblclick(`${R}.0.1`); await drive.type("5"); await drive.key("Enter");
  await drive.dblclick(`${R}.1.1`); await drive.type("7"); await drive.key("Enter");
  await drive.dblclick(`${R}.0.2`); await drive.type("=A0+A1"); await drive.key("Enter");
  await drive.dblclick(`${R}.1.2`); await drive.type("=SUM(A0:B0) * 2"); await drive.key("Enter");
  await expect.equal(await cell("B0"), 12);
  await expect.equal(await cell("B1"), 34);
  await drive.dblclick(`${R}.0.1`); await drive.selectAll(`${R}.0.1.editor`); await drive.type("10"); await drive.key("Enter");
  await expect.equal(await cell("B0"), 17);
  await expect.equal(await cell("B1"), 54);
  await drive.key("ArrowDown"); await drive.key("ArrowDown"); await drive.key("Enter");
  await drive.type("=A2+1"); await drive.key("Enter");
  await expect.equal(await cell("A2"), "error");
  await drive.key("Delete");
  await expect.equal(await cell("A2"), "empty");
};

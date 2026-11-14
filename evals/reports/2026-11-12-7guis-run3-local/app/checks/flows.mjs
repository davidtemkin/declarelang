// Every task's rules, driven as a person would.
// npx declare-verify my-apps/7guis/7guis.declare --assert my-apps/7guis/checks/flows.mjs

export default async ({ drive, expect }) => {
  const read = (p, a) => drive.page.evaluate(([p, a]) => window.__declare.find(p)[a], [p, a]);
  const go = async (where) => { await drive.click(`app.header.1."${where}"`); await drive.settleMotion(); };

  // ── 1. Counter
  await expect.text("app.body.counter.row.field", "0");
  await drive.click("app.body.counter.row.1");
  await drive.click("app.body.counter.row.1");
  await drive.click("app.body.counter.row.1");
  await expect.text("app.body.counter.row.field", "3");

  // ── 2. Temperature
  await go("Temperature");
  const t = "app.body.temperature.row";
  await expect.attr(`${t}.0`, "text", "");
  await expect.attr(`${t}.2`, "text", "");
  await drive.click(`${t}.0`);
  await drive.type("100");
  await expect.attr(`${t}.2`, "text", "212");
  await drive.type("x");                                    // "100x": not a number
  await expect.attr(`${t}.2`, "text", "212");
  await expect.attr(`${t}.0`, "invalid", true);
  await drive.selectAll(`${t}.2`);
  await drive.type("-40");
  await expect.attr(`${t}.0`, "text", "-40");
  await drive.selectAll(`${t}.2`);
  await drive.type("50");
  await expect.attr(`${t}.0`, "text", "10");

  // ── 3. Flight Booker
  await go("Flight Booker");
  const f = "app.body.flight";
  await expect.attr(`${f}.form.2.1`, "disabled", true);    // return date not editable
  await expect.equal(await read(f, "startText"), await read(f, "returnText"));
  await expect.attr(f, "canBook", true);
  await drive.click(`${f}.form.4`);                         // Book
  await drive.settleMotion();
  await expect.text(`${f}.confirm`, "You have booked a one-way flight on " + (await read(f, "startText")));
  await drive.key("Enter");
  await drive.settleMotion();
  await drive.selectAll(`${f}.form.1.1`);
  await drive.type("31.02.2026");                           // no such day
  await expect.attr(`${f}.form.1.1`, "invalid", true);
  await expect.attr(`${f}.form.4`, "disabled", true);
  await drive.selectAll(`${f}.form.1.1`);
  await drive.type("14.11.2026");
  await expect.attr(`${f}.form.4`, "disabled", false);
  await drive.click(`${f}.form.0`);                         // the flight type pop-up
  await drive.settleMotion();
  await drive.click(`${f}.kinds."return flight"`);
  await drive.settleMotion();
  await expect.attr(`${f}.form.2.1`, "disabled", false);
  await drive.selectAll(`${f}.form.2.1`);
  await drive.type("13.11.2026");                           // before the start
  await expect.attr(f, "backBeforeStart", true);
  await expect.attr(`${f}.form.4`, "disabled", true);
  await drive.selectAll(`${f}.form.2.1`);
  await drive.type("20.11.2026");
  await expect.attr(`${f}.form.4`, "disabled", false);
  await drive.click(`${f}.form.4`);
  await drive.settleMotion();
  await expect.text(`${f}.confirm`, "You have booked a return flight on 14.11.2026, returning on 20.11.2026");
  await drive.key("Enter");
  await drive.settleMotion();

  // ── 4. Timer
  await go("Timer");
  const tm = "app.body.timer";
  await drive.click(`${tm}.form.3`);                        // Reset
  await drive.wait(2000);
  await expect.approx(tm, "elapsed", 2, 0.1);
  await drive.set(tm, "duration", 3);
  await drive.wait(3000);
  await expect.approx(tm, "elapsed", 3, 0.001);              // stopped at d, gauge full
  await expect.approx(`${tm}.form.0.1`, "value", 3, 0.001);
  await drive.set(tm, "duration", 5);                       // raised: runs again
  await drive.wait(1000);
  await expect.approx(tm, "elapsed", 4, 0.1);
  await drive.click(`${tm}.form.3`);
  await expect.approx(tm, "elapsed", 0, 0.05);

  // ── 5. CRUD
  await go("CRUD");
  const c = "app.body.crud";
  await expect.count(`${c}.middle.list`, "TableRow", 3);
  await expect.attr(`${c}.buttons.1`, "disabled", true);
  await drive.click(`${c}.filter.1`);
  await drive.type("M");
  await expect.count(`${c}.middle.list`, "TableRow", 1);
  await expect.text(`${c}.middle.list`, "Mustermann, Max");
  await drive.selectAll(`${c}.filter.1`);
  await drive.key("Backspace");
  await expect.count(`${c}.middle.list`, "TableRow", 3);
  await drive.click(`${c}.middle.fields.0.1`);
  await drive.type("John");
  await drive.click(`${c}.middle.fields.1.1`);
  await drive.type("Doe");
  await drive.click(`${c}.buttons.0`);                      // Create
  await expect.count(`${c}.middle.list`, "TableRow", 4);
  await expect.text(`${c}.middle.list`, "Doe, John");
  await drive.click(`${c}.middle.list."Emil, Hans"`);
  await expect.attr(`${c}.buttons.1`, "disabled", false);
  await drive.selectAll(`${c}.middle.fields.0.1`);
  await drive.type("Hanna");
  await drive.click(`${c}.buttons.1`);                      // Update
  await expect.text(`${c}.middle.list`, "Emil, Hanna");
  await drive.click(`${c}.buttons.2`);                      // Delete
  await expect.count(`${c}.middle.list`, "TableRow", 3);
  await expect.attr(`${c}.buttons.2`, "disabled", true);

  // ── 6. Circle Drawer
  await go("Circle Drawer");
  const k = "app.body.circles";
  await drive.clickAt(`${k}.canvas`, 200, 150);
  await drive.clickAt(`${k}.canvas`, 400, 200);
  await expect.equal((await read(`${k}.circles`, "value")).circles.length, 2);
  await drive.clickAt(`${k}.canvas`, 205, 152);             // on a circle: not a new one
  await expect.equal((await read(`${k}.circles`, "value")).circles.length, 2);
  await expect.equal((await read(k, "selected")).id, 1);
  await drive.clickAt(`${k}.canvas`, 400, 200, { button: "right" });
  await drive.settleMotion();
  await drive.click(`${k}.menu."Adjust diameter…"`);
  await drive.settleMotion();
  await expect.visible(`${k}.adjuster`);
  await drive.drag(`${k}.adjuster.panel.dial`, 60, 0);
  const grown = (await read(k, "selected")).d;
  if (!(grown > 40)) throw new Error("the slider did not change the diameter: " + grown);
  await drive.key("Escape");                                // closing the window: one step
  await drive.settleMotion();
  await expect.attr(k, "adjusting", false);
  await expect.equal((await read(`${k}.circles`, "done")).length, 3);
  await drive.click(`${k}.bar.0`);                          // Undo the resize
  await expect.equal((await read(`${k}.circles`, "value")).circles[1].d, 40);
  await drive.click(`${k}.bar.0`);                          // Undo the second circle
  await expect.equal((await read(`${k}.circles`, "value")).circles.length, 1);
  await drive.click(`${k}.bar.1`);                          // Redo both
  await drive.click(`${k}.bar.1`);
  await expect.equal((await read(`${k}.circles`, "value")).circles[1].d, grown);
  await expect.attr(`${k}.bar.1`, "disabled", true);

  // ── 7. Cells
  await go("Cells");
  const s = "app.body.cells";
  const body = `${s}.grid.main.body`;
  const cell = async (col, row) => (await read(`${s}.sheet`, "value")).rows[row].cells[col];
  const enter = async (col, row, text) => {
    await drive.set(s, "selCol", col);
    await drive.set(s, "selRow", row);
    await drive.page.evaluate((p) => window.__declare.find(p).editHere(), s);
    await drive.settleMotion();
    await drive.selectAll(`${body}.editor`);
    await drive.type(text);
    await drive.key("Enter");
    await drive.settleMotion();
  };
  await enter(0, 0, "5");
  await enter(0, 1, "7");
  await enter(1, 0, "=A0*2+A1");
  await expect.equal((await cell(1, 0)).t, "17");
  await enter(1, 1, "=SUM(A0:A1, B0)");
  await expect.equal((await cell(1, 1)).t, "29");
  await enter(0, 0, "10");                                  // change propagates
  await expect.equal((await cell(1, 0)).t, "27");
  await expect.equal((await cell(1, 1)).t, "44");
  await enter(2, 0, "=PROD(A0:A1)/(A1-7)");
  await expect.equal((await cell(2, 0)).t, "#DIV/0");
  await enter(3, 0, "=D1");
  await enter(3, 1, "=D0+1");
  await expect.equal((await cell(3, 0)).t, "#CYCLE");
  await enter(4, 0, "=1+");
  await expect.equal((await cell(4, 0)).t, "#SYNTAX");
  await enter(5, 0, "hello");
  await expect.equal((await cell(5, 0)).kind, "text");
  // double-click a cell to edit it
  await drive.dblclick(`${body}.rows.0.1`);
  await drive.settleMotion();
  await expect.exists(`${body}.editor`);
  await drive.key("Escape");
  await drive.settleMotion();
  await expect.equal((await cell(1, 0)).f, "=A0*2+A1");
};

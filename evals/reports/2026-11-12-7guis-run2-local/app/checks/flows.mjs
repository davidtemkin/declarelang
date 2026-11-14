// The seven tasks, used as a person would: npx declare-verify my-apps/7guis/7guis.declare --assert my-apps/7guis/checks/flows.mjs

const read = (page, path, attr) => page.evaluate((p, a) => window.__declare.find(p)[a], path, attr);
const call = (page, path, method, ...args) =>
  page.evaluate((p, m, a) => window.__declare.find(p)[m](...a), path, method, args);

export default async ({ drive, expect, page }) => {
  // ── 1. Counter
  await drive.click("app.bar.tabs.Counter");
  for (let i = 0; i < 3; i++) await drive.click("app.pages.counter.row.button");
  await expect.attr("app.pages.counter", "count", 3);
  await expect(page.getByRole("textbox", { name: "Count" })).toHaveValue("3");

  // ── 2. Temperature
  await drive.click("app.bar.tabs.Temperature");
  await page.getByLabel("Celsius").pressSequentially("100");
  await expect(page.getByLabel("Fahrenheit")).toHaveValue("212");
  await page.getByLabel("Fahrenheit").fill("");
  await page.getByLabel("Fahrenheit").pressSequentially("-40");
  await expect(page.getByLabel("Celsius")).toHaveValue("-40");
  await page.getByLabel("Fahrenheit").pressSequentially("x");          // "-40x" is not a number
  await expect(page.getByLabel("Celsius")).toHaveValue("-40");

  // ── 3. Flight Booker
  await drive.click('app.bar.tabs."Flight Booker"');
  const flights = "app.pages.flights";
  await expect(page.getByLabel("Return date")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Book" })).toBeEnabled();
  await page.getByRole("button", { name: "Flight type" }).click();
  await page.getByText("return flight", { exact: true }).click();
  await expect.attr(flights, "kind", "return");
  await expect(page.getByLabel("Return date")).toBeEnabled();
  await page.getByLabel("Start date").fill("14.11.2026");
  await page.getByLabel("Return date").fill("13.11.2026");
  await expect.attr(flights, "canBook", false);
  await expect(page.getByRole("button", { name: "Book" })).toBeDisabled();
  await page.getByLabel("Return date").fill("31.02.2026");                // no such day
  await expect.attr(flights, "back", null);
  await expect.attr(flights, "canBook", false);
  await page.getByLabel("Return date").fill("20.11.2026");
  await expect.attr(flights, "canBook", true);
  await page.getByRole("button", { name: "Book" }).click();
  await drive.settleMotion();
  await expect(page.getByText("You have booked a return flight on 14.11.2026, returning on 20.11.2026.")).toBeVisible();
  await drive.key("Enter");
  await drive.settleMotion();

  // ── 4. Timer
  await drive.click("app.bar.tabs.Timer");
  const timer = "app.pages.timer";
  await drive.set(timer, "duration", 2);
  await drive.click("app.pages.timer.form.Reset");
  await drive.wait(3000);
  await expect.approx(timer, "elapsed", 2, 0.001);                       // stopped at d
  await drive.set(timer, "duration", 4);
  await drive.wait(1000);
  await expect.approx(timer, "elapsed", 3, 0.1);                         // runs again
  await drive.click("app.pages.timer.form.Reset");
  await expect.approx(timer, "elapsed", 0, 0.05);
  await drive.set(timer, "duration", 15);

  // ── 5. CRUD
  await drive.click("app.bar.tabs.CRUD");
  const crud = "app.pages.crud";
  await expect(page.getByRole("button", { name: "Update" })).toBeDisabled();
  await page.getByLabel("Filter prefix").pressSequentially("M");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option", { name: "Mustermann, Max" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Max");
  await expect(page.getByRole("button", { name: "Update" })).toBeEnabled();
  await page.getByLabel("Name", { exact: true }).fill("Maxi");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByRole("option", { name: "Mustermann, Maxi" })).toBeVisible();
  await page.getByLabel("Filter prefix").fill("");
  await expect(page.getByRole("option")).toHaveCount(3);
  await page.getByLabel("Name", { exact: true }).fill("Ada");
  await page.getByLabel("Surname").fill("Lovelace");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("option")).toHaveCount(4);
  await page.getByRole("option", { name: "Emil, Hans" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled();

  // ── 6. Circle Drawer
  await drive.click('app.bar.tabs."Circle Drawer"');
  const circles = "app.pages.circles";
  const canvas = "app.pages.circles.canvas";
  await drive.clickAt(canvas, 120, 120);
  await drive.clickAt(canvas, 300, 200);
  await drive.clickAt(canvas, 125, 125);                                 // inside the first: no new circle
  expect.equal(await page.evaluate((p) => window.__declare.find(p).doc.circles.length, circles), 2);
  await drive.hover(canvas);
  await drive.clickAt(canvas, 300, 200, { button: "right" });
  await page.getByRole("menuitem", { name: "Adjust diameter…" }).click();
  await expect.visible("app.pages.circles.adjustWindow");
  await call(page, circles + ".adjustWindow", "show");                    // no-op: already open
  await call(page, circles + ".doc", "preview", 2, 90);                  // as the slider does while dragged
  await page.getByRole("slider", { name: "Diameter" }).focus();
  await drive.key("ArrowRight");                                         // and by the keyboard: 91
  await drive.key("Escape");                                             // close the window: one step
  await drive.settleMotion();
  await expect.attr(circles, "adjusting", 0);
  expect.equal(await page.evaluate((p) => window.__declare.find(p).doc.byId(2).d, circles), 91);
  await drive.click("app.pages.circles.bar.Undo");                       // the adjustment
  expect.equal(await page.evaluate((p) => window.__declare.find(p).doc.byId(2).d, circles), 40);
  await drive.click("app.pages.circles.bar.Undo");                       // the second circle
  expect.equal(await page.evaluate((p) => window.__declare.find(p).doc.circles.length, circles), 1);
  await drive.click("app.pages.circles.bar.Redo");
  await drive.click("app.pages.circles.bar.Redo");
  expect.equal(await page.evaluate((p) => window.__declare.find(p).doc.byId(2).d, circles), 91);

  // ── 7. Cells
  await drive.click("app.bar.tabs.Cells");
  const grid = "app.pages.cells.grid";
  const at = (col, row) => [44 + col * 92 + 20, 24 + row * 24 + 12];
  const edit = async (col, row, text) => {
    await drive.dblclick(grid, ...at(col, row));
    await drive.key("Mod+A");
    await drive.type(text);
    await drive.key("Enter");
  };
  const cell = (id) => page.evaluate((i) => window.__declare.find("app.pages.cells").sheet.cell(i), id);
  await edit(0, 0, "5");
  await edit(1, 0, "=A0*2");
  await edit(2, 0, "=B0+A0");
  await edit(0, 2, "=SUM(A0:C0)");
  await edit(3, 5, "hello");
  expect.equal((await cell("C0")).n, 15);
  expect.equal((await cell("A2")).n, 30);
  await edit(0, 0, "7");
  expect.equal((await cell("C0")).n, 21);
  expect.equal((await cell("A2")).n, 42);
  const recomputed = await read(page, "app.pages.cells.sheet", "lastRecomputed");
  expect.equal([...recomputed].sort().join(","), "A0,A2,B0,C0");          // only the dependents
  await edit(4, 0, "=E1+1");
  await edit(4, 1, "=E0");
  expect.equal((await cell("E0")).err, "#CYCLE!");
  await edit(5, 0, "=A0/0");
  expect.equal((await cell("F0")).err, "#DIV/0!");
  await edit(5, 1, "=D5*2");
  expect.equal((await cell("F1")).err, "#VALUE!");
  await edit(5, 2, "=FOO(A0)");
  expect.equal((await cell("F2")).err, "#NAME?");
  await edit(5, 3, "=PROD(A0, 2, B0)");
  expect.equal((await cell("F3")).n, 7 * 2 * 14);
  await expect.text("app.pages.cells.grid", "hello");
};

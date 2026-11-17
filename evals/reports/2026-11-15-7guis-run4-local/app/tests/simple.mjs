// Counter, Temperature Converter, Flight Booker and Timer, driven as a person
// uses them: npx declare-verify 7guis.declare --assert tests/simple.mjs

const go = (drive, name) => drive.click(`app.side.list."${name}"`);
const near = (a, b, tol, what) => {
  if (Math.abs(a - b) > tol) throw new Error(`${what}: expected ≈${b}, got ${a}`);
};

export default async ({ drive, expect, page }) => {
  // ── 1. Counter
  await go(drive, "Counter");
  await expect.text("app.main.stage.counter.field", "0");
  await drive.click("app.main.stage.counter.Count");
  await drive.click("app.main.stage.counter.Count");
  await drive.click("app.main.stage.counter.Count");
  await expect.text("app.main.stage.counter.field", "3");

  // ── 2. Temperature Converter: both empty, each updates the other, junk changes nothing
  await go(drive, "Temperature Converter");
  const c = page.getByLabel("Celsius"), f = page.getByLabel("Fahrenheit");
  await expect(c).toHaveValue("");
  await expect(f).toHaveValue("");
  await c.fill("100");
  await expect(f).toHaveValue("212");
  await c.fill("37");
  await expect(f).toHaveValue("98.6");
  await f.fill("-40");
  await expect(c).toHaveValue("-40");
  await f.fill("50");
  await expect(c).toHaveValue("10");
  await c.fill("1x");                       // not a number: Fahrenheit stays
  await expect(f).toHaveValue("50");
  await f.fill("");                         // empty is not a number either
  await expect(c).toHaveValue("1x");

  // ── 3. Flight Booker
  await go(drive, "Flight Booker");
  const start = page.getByLabel("Start date"), back = page.getByLabel("Return date");
  const book = page.getByRole("button", { name: "Book" });
  const today = await start.inputValue();
  if (!/^\d\d\.\d\d\.\d{4}$/.test(today)) throw new Error("start date not DD.MM.YYYY: " + today);
  await expect(back).toHaveValue(today);
  await expect(back).toBeDisabled();
  await expect(book).toBeEnabled();

  await start.fill("14.11.2026");
  await book.click();
  await drive.settleMotion();
  await expect(page.getByRole("dialog")).toContainText("You have booked a one-way flight on 14.11.2026.");
  await drive.key("Enter");
  await drive.settleMotion();

  await start.fill("31.02.2026");           // not a real date: red, Book off
  await expect(book).toBeDisabled();
  await expect.text("app.main.stage.flight", "Not a date");
  await start.fill("14.11.2026");
  await expect(book).toBeEnabled();

  await page.getByRole("button", { name: "Flight type" }).click();
  await drive.settleMotion();
  await page.getByText("return flight").last().click();
  await drive.settleMotion();
  await expect(back).toBeEnabled();
  await back.fill("13.11.2026");            // before the start
  await expect(book).toBeDisabled();
  await expect.text("app.main.stage.flight", "The return is before the start.");
  await back.fill("1.12.2026");
  await expect(book).toBeEnabled();
  await book.click();
  await drive.settleMotion();
  await expect(page.getByRole("dialog")).toContainText(
    "You have booked a return flight leaving on 14.11.2026 and returning on 01.12.2026.");
  await drive.key("Enter");
  await drive.settleMotion();

  // ── 4. Timer: runs to d and stops full; raising d runs it on; Reset zeroes it
  await go(drive, "Timer");
  const T = "app.main.stage.timer";
  await drive.set(T, "duration", 3);
  await drive.click(`${T}.Reset`);
  await drive.wait(1000);
  near(await drive.read(`${T}.elapsed`), 1, 0.1, "elapsed after 1 s");
  await drive.wait(3000);
  near(await drive.read(`${T}.elapsed`), 3, 0.001, "elapsed stops at d");
  await expect.text(`${T}.seconds`, "3.0 s");
  near(await drive.read(`${T}.gaugeRow.1.value`), await drive.read(`${T}.gaugeRow.1.max`), 0.001, "gauge full");
  // Raise the duration with the slider's keys, as a person would.
  await page.getByRole("slider", { name: "Duration" }).focus();
  await drive.key("ArrowRight");
  await drive.key("ArrowRight");
  const d = await drive.read(`${T}.duration`);
  if (!(d > 3)) throw new Error("slider did not raise the duration: " + d);
  await drive.wait(1000);
  near(await drive.read(`${T}.elapsed`), d, 0.001, "runs on to the new d");
  await drive.click(`${T}.Reset`);
  near(await drive.read(`${T}.elapsed`), 0, 0.05, "reset");
  await drive.wait(500);
  near(await drive.read(`${T}.elapsed`), 0.5, 0.1, "runs again after reset");

  // Away from the Timer, it waits.
  await go(drive, "Counter");
  const before = await drive.read(`${T}.elapsed`);
  await drive.wait(1000);
  near(await drive.read(`${T}.elapsed`), before, 0.001, "paused while not shown");
};

export default async ({ drive, expect, page }) => {
  const input = "app.inspector.detailBody.assumptionEditor.input";
  const apply = "app.inspector.detailBody.assumptionEditor.apply";
  const selectFuel = async () => {
    await drive.click("app.header.scenarioPicker.4");
    await drive.click("app.graph.stage.cards.7");
  };
  const replace = async (value) => {
    await drive.click(input);
    await page.keyboard.press("Home");
    await page.keyboard.down("Shift");
    await page.keyboard.press("End");
    await page.keyboard.up("Shift");
    await drive.type(value);
  };

  await drive.page.setViewport({ width: 1280, height: 800 });
  await selectFuel();
  await replace("$4.25");
  await drive.click(apply);
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "working");
  await expect.approx("app", "selectedValue", 4.25, 0.0001);
  await expect.text(input, "$4.25");
  await replace("$4.30");
  await drive.key("Enter");
  await drive.settleMotion();
  await expect.approx("app", "selectedValue", 4.3, 0.0001);

  await replace("4.2abc");
  await drive.click(apply);
  await expect.text("app.inspector.detailBody.assumptionEditor.error",
    "Input error: Enter a complete number.");
  await expect.approx("app", "selectedValue", 4.3, 0.0001);

  for (const invalid of ["", "NaN", "Infinity"]) {
    await replace(invalid);
    await drive.click(apply);
    await expect.attr("app", "activeScenarioId", "working");
    await expect.approx("app", "selectedValue", 4.3, 0.0001);
  }

  await replace("5");
  await drive.key("Escape");
  await expect.text(input, "$4.30");
  await expect.text("app.inspector.detailBody.assumptionEditor.error", "");

  await replace("$1.50");
  await drive.click(apply);
  await expect.approx("app", "selectedValue", 1.5, 0.0001);
  await replace(" $ 2.700 ");
  await drive.click(apply);
  await expect.approx("app", "selectedValue", 2.7, 0.0001);
  await replace("$2,.70");
  await drive.click(apply);
  await expect.approx("app", "selectedValue", 2.7, 0.0001);
  await replace("$5.01");
  await drive.click(apply);
  await expect.text("app.inspector.detailBody.assumptionEditor.error",
    "Input error: Enter a value from $1.50 to $5.00.");
  await expect.attr("app", "activeScenarioId", "working");
  await expect.approx("app", "selectedValue", 2.7, 0.0001);

  await page.evaluate(() => document.activeElement?.blur());
  await drive.page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await drive.click("app.graph.stage.cards.4");
  const inputDocumentY = await page.evaluate(async (path) => {
    const node = await window.__declare.inspect(path)
    return node.rootY + window.scrollY
  }, input);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 180)), inputDocumentY);
  const paintedY = await page.evaluate(async (path) =>
    (await window.__declare.inspect(path)).rootY, input);
  if (paintedY < 0 || paintedY > 844) throw new Error(`input is not painted: ${paintedY}`);
  await drive.click(input);
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  if (focused !== "INPUT" && focused !== "TEXTAREA") throw new Error("numeric input did not receive focus");
  await replace("5.5%");
  await drive.click(apply);
  await expect.attr("app", "activeScenarioId", "working");
  await expect.approx("app", "selectedValue", 0.055, 0.0001);
  await replace("5.5");
  await drive.key("Enter");
  await expect.approx("app", "selectedValue", 0.055, 0.0001);
  await replace("-10");
  await drive.click(apply);
  await expect.approx("app", "selectedValue", -0.1, 0.0001);
  await replace("15%");
  await drive.click(apply);
  await expect.approx("app", "selectedValue", 0.15, 0.0001);
  await replace("15.1%");
  await drive.key("Enter");
  await expect.attr("app", "activeScenarioId", "working");
  await expect.approx("app", "selectedValue", 0.15, 0.0001);
};

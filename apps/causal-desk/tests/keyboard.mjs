// CD-S4-04 keyboard contract. Every action after viewport setup is a keyboard
// event; focus is observed through the public Declare tree.

export default async ({ drive, expect, page }) => {
  await drive.page.setViewport({ width: 1280, height: 800 });

  const focusedFactor = () => page.evaluate(() => {
    const cards = window.__declare.find("app.graph.stage.cards").children;
    const focused = cards.find(card => card.focused === true);
    return focused == null ? "" : focused.factorId;
  });

  const focusedPath = (path) => page.evaluate((name) =>
    window.__declare.find(name).focused === true, path);

  const tabUntilFactor = async (id) => {
    for (let i = 0; i < 40; i = i + 1) {
      if ((await focusedFactor()) == id) return;
      await drive.key("Tab");
    }
    expect.fail(`Tab did not reach factor ${id}`);
  };

  const tabUntilPath = async (path) => {
    for (let i = 0; i < 40; i = i + 1) {
      if (await focusedPath(path)) return;
      await drive.key("Tab");
    }
    expect.fail(`Tab did not reach ${path}`);
  };

  const shiftTabUntilFactor = async (id) => {
    for (let i = 0; i < 40; i = i + 1) {
      if ((await focusedFactor()) == id) return;
      await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      await page.keyboard.up("Shift");
    }
    expect.fail(`Shift+Tab did not reach factor ${id}`);
  };

  const keyFactor = async (key, id) => {
    await drive.key(key);
    await expect.attr("app", "selectedFactorId", id);
    await expect.equal(await focusedFactor(), id, `${key} focus target`);
  };

  // Tab reaches the scenario rail, and Enter chooses Fuel Shock without a
  // pointer. The visible factor walk excludes the four hidden constants.
  await drive.key("Tab");
  await drive.key("Tab");
  await drive.key("Enter");
  await expect.attr("app", "activeScenarioId", "fuelShock");
  await tabUntilFactor("demandGrowth");
  await drive.key("Tab");
  await expect.equal(await focusedFactor(), "averageFareGrowth", "Tab document order");
  await drive.key("Tab");
  await expect.equal(await focusedFactor(), "capacityGrowth", "Tab document order");
  await drive.key("Tab");
  await expect.equal(await focusedFactor(), "jetFuelPrice", "Tab document order");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  await expect.equal(await focusedFactor(), "capacityGrowth", "Shift+Tab document order");
  await tabUntilFactor("jetFuelPrice");

  // Enter selects the focused fuel card. Tab then reaches its slider, whose
  // arrow input creates the working scenario through the existing value path.
  await drive.key("Enter");
  await expect.attr("app", "selectedFactorId", "jetFuelPrice");
  await tabUntilPath("app.inspector.detailBody.assumptionEditor.slider");
  await drive.key("ArrowRight");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "working");
  await expect.approx("app", "selectedValue", 4.15, 0.0001);

  // Shift+Tab from the slider returns to the last visible card. Select the
  // margin, then Tab to the largest contribution row and activate it by Space.
  await shiftTabUntilFactor("operatingMargin");
  await drive.key("Space");
  await expect.attr("app", "selectedFactorId", "operatingMargin");
  await tabUntilPath("app.inspector.detailBody.derivedDetails.contributionBridge.rows.0");
  await drive.key("Space");
  await expect.attr("app", "selectedContributionFactorId", "jetFuelPrice");

  // Immediate dependency navigation is semantic, not geometric: Average Fare
  // reaches Revenue, then Revenue chooses Operating Income by closest rowY.
  await shiftTabUntilFactor("averageFareGrowth");
  await keyFactor("ArrowRight", "revenue");
  await keyFactor("ArrowLeft", "demandGrowth");
  await keyFactor("ArrowRight", "revenue");
  await keyFactor("ArrowRight", "operatingIncome");
  await shiftTabUntilFactor("operatingMargin");
  await drive.key("Space");
  await expect.attr("app", "selectedFactorId", "operatingMargin");
  await drive.key("ArrowRight");
  await expect.equal(await focusedFactor(), "operatingMargin", "right boundary no-op");
  await expect.attr("app", "selectedFactorId", "operatingMargin");
  await shiftTabUntilFactor("demandGrowth");
  await drive.key("Space");
  await expect.attr("app", "selectedFactorId", "demandGrowth");
  await drive.key("ArrowLeft");
  await expect.equal(await focusedFactor(), "demandGrowth", "left boundary no-op");
  await expect.attr("app", "selectedFactorId", "demandGrowth");

  // On mobile the same keyboard traversal scrolls the graph, while the page
  // itself remains horizontally fixed.
  await drive.page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await tabUntilFactor("jetFuelPrice");
  const before = await page.evaluate(() => ({
    pageX: window.scrollX,
    graphX: window.__declare.find("app.graph").scrollX,
  }));
  for (let i = 0; i < 20 && (await focusedFactor()) != "operatingMargin"; i = i + 1) {
    await drive.key("ArrowDown");
  }
  const after = await page.evaluate(() => ({
    pageX: window.scrollX,
    graphX: window.__declare.find("app.graph").scrollX,
  }));
  if (await focusedFactor() != "operatingMargin") {
    expect.fail("mobile ArrowDown traversal should reach Operating Margin");
  }
  if (after.pageX != before.pageX || after.graphX <= before.graphX) {
    expect.fail(`mobile focus should scroll only graph: ${JSON.stringify({ before, after })}`);
  }
  await expect.equal(await focusedFactor(), "operatingMargin", "mobile traversal focus");
};

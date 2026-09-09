// Slice 2 behavioral contract. The app remains Declare; this file only drives
// its public view/attribute surface through verify's real-browser bridge.
//
// Run:
// node tools/verify.mjs apps/causal-desk/causal-desk.declare \
//   --assert apps/causal-desk/tests/assert.mjs

export default async ({ drive, expect, page }) => {
  await drive.page.setViewport({ width: 1280, height: 800 });

  const inspectedContributions = () => page.evaluate(() =>
    window.__declare.find("app.model.contributionData").value);
  const assertClose = (actual, expected, tolerance, label) => {
    if (typeof actual !== "number" || Math.abs(actual - expected) > tolerance) {
      expect.fail(`${label}: expected ${expected} (±${tolerance}), got ${JSON.stringify(actual)}`);
    }
  };

  await expect.attr("app", "selectedFactorId", "operatingMargin");
  await expect.text("app.inspector.title", "Operating margin");
  await expect.approx("app", "selectedValue", 0.1861, 0.0001);
  await expect.count("app.inspector.dependencies", "DependencyRow", 2);

  // Comparison is independently selectable; changing it leaves the active
  // scenario and selected factor untouched while changing the reference value.
  await expect.attr("app", "comparisonScenarioId", "base");
  await drive.click("app.header.comparisonPicker.5");
  await drive.settleMotion();
  await expect.attr("app", "comparisonScenarioId", "downturn");
  await expect.attr("app", "activeScenarioId", "base");
  await expect.attr("app", "selectedFactorId", "operatingMargin");
  await expect.approx("app", "selectedComparisonValue", 0.0849, 0.0001);
  await drive.click("app.header.comparisonPicker.3");
  await drive.settleMotion();
  await expect.attr("app", "comparisonScenarioId", "base");

  // Pick Fuel shock. Segmented has three structural children before its choices.
  // The model re-evaluates while Base remains the comparison.
  await drive.click("app.header.scenarioPicker.4");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "fuelShock");
  await expect.approx("app", "selectedValue", 0.1146, 0.0001);

  // The exposed Dataset is the browser-observable attribution result. Its
  // values are unrounded, so the fixed oracle checks the engine rather than
  // any display formatting.
  let contributions = await inspectedContributions();
  await expect.equal(contributions.rows.map((row) => row.id), ["jetFuelPrice", "averageFareGrowth"], "Fuel shock contribution order");
  assertClose(contributions.rows[0].value, -0.1002507707, 0.0000001, "Jet fuel contribution");
  assertClose(contributions.rows[1].value, 0.0286916616, 0.0000001, "Average fare contribution");
  assertClose(contributions.total, -0.0715591091, 0.000000001, "Contribution total");
  assertClose(contributions.total, (await expect.explain("app", "selectedValue")).value
    - (await expect.explain("app", "selectedComparisonValue")).value, 0.000000001,
    "Contribution sum invariant");

  // Reversing the scenarios reverses signs while preserving magnitudes.
  const forward = contributions.rows.map((row) => row.value);
  await drive.click("app.header.scenarioPicker.3");
  await drive.click("app.header.comparisonPicker.4");
  await drive.settleMotion();
  contributions = await inspectedContributions();
  await expect.equal(contributions.rows.map((row) => row.id), ["jetFuelPrice", "averageFareGrowth"], "Reversed contribution order");
  for (let i = 0; i < forward.length; i += 1) {
    assertClose(contributions.rows[i].value, -forward[i], 0.000000001, `Reversed contribution ${i}`);
  }

  // Return to Fuel shock versus Base for the remaining Slice 2 checks.
  await drive.click("app.header.scenarioPicker.4");
  await drive.click("app.header.comparisonPicker.3");
  await drive.settleMotion();

  // Every derived result uses the same Dataset projection; only the selected
  // factor changes. Check the sum invariant across the modeled aggregates.
  for (const [path, id] of [["app.graph.stage.cards.10", "revenue"],
      ["app.graph.stage.cards.14", "operatingExpense"],
      ["app.graph.stage.cards.15", "operatingIncome"],
      ["app.graph.stage.cards.16", "operatingMargin"]]) {
    await drive.click(path);
    await expect.attr("app", "selectedFactorId", id);
    contributions = await inspectedContributions();
    const selected = await expect.explain("app", "selectedValue");
    const comparison = await expect.explain("app", "selectedComparisonValue");
    assertClose(contributions.total, selected.value - comparison.value, 0.000000001,
      `${id} contribution sum invariant`);
  }

  // The data replication includes four hidden constants first; revenue is the
  // eleventh factor. A real click must update both selection and inspector data.
  await drive.click("app.graph.stage.cards.10");
  await expect.attr("app", "selectedFactorId", "revenue");
  await expect.text("app.inspector.title", "Revenue");
  await expect.approx("app", "selectedValue", 10866.5, 0.01);
  await expect.count("app.inspector.dependencies", "DependencyRow", 3);

  // Demand growth is a root assumption, so its inspector has no dependency rows.
  await drive.click("app.graph.stage.cards.4");
  await expect.attr("app", "selectedFactorId", "demandGrowth");
  await expect.text("app.inspector.title", "Demand growth");
  await expect.count("app.inspector.dependencies", "DependencyRow", 0);
  contributions = await inspectedContributions();
  await expect.equal(contributions.rows, [], "Assumption has no contributions");
  assertClose(contributions.total, 0, 0, "Assumption contribution total");

  // Editing an assumption forks the selected bundle into the Working scenario.
  await drive.click("app.graph.stage.cards.7");
  const fuelBefore = await expect.explain("app", "selectedValue");
  await drive.drag("app.inspector.assumptionEditor.slider", 100);
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "working");
  const fuelAfter = await expect.explain("app", "selectedValue");
  if (fuelAfter.value <= fuelBefore.value) {
    expect.fail(`drag should raise fuel price, got ${fuelAfter.value}`);
  }

  // Reset input restores the bundled scenario value without leaving Working.
  await drive.click("app.inspector.assumptionEditor.reset");
  await expect.attr("app", "activeScenarioId", "working");
  await expect.approx("app", "selectedValue", 4.1, 0.001);

  // Reset returns the full instrument to the fixed Base Case.
  await expect.attr("app.header.reset", "disabled", false);
  await drive.click("app.header.reset");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "base");
  await expect.approx("app", "selectedValue", 2.7, 0.001);

  // Equal active and comparison scenarios have an explicit empty bridge.
  await drive.click("app.graph.stage.cards.16");
  contributions = await inspectedContributions();
  await expect.equal(contributions.rows, [], "Equal scenarios have no contributions");
  assertClose(contributions.total, 0, 0, "Equal-scenario contribution total");
  assertClose(contributions.residual, 0, 0, "Equal-scenario residual");
};

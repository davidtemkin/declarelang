// Slice 2 behavioral contract. The app remains Declare; this file only drives
// its public view/attribute surface through verify's real-browser bridge.
//
// Run:
// node tools/verify.mjs apps/causal-desk/causal-desk.declare \
//   --assert apps/causal-desk/tests/assert.mjs

export default async ({ drive, expect }) => {
  await drive.page.setViewport({ width: 1280, height: 800 });

  await expect.attr("app", "selectedFactorId", "operatingMargin");
  await expect.text("app.inspector.title", "Operating margin");
  await expect.approx("app", "selectedValue", 0.1861, 0.0001);
  await expect.count("app.inspector.dependencies", "DependencyRow", 2);

  // Pick Fuel shock. Segmented has three structural children before its choices.
  // The model re-evaluates while Base remains the comparison.
  await drive.click("app.header.scenarioPicker.4");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "fuelShock");
  await expect.approx("app", "selectedValue", 0.1146, 0.0001);

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
};

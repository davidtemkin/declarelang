// CD-S4-06 error contract. The fault is injected by replacing the test
// instance's model Dataset only; production has no debug or fault seam.

export default async ({ drive, expect, page }) => {
  await drive.page.setViewport({ width: 1280, height: 800 });
  await drive.settleMotion();

  const baseDocument = await page.evaluate(() =>
    JSON.parse(JSON.stringify(window.__declare.find("app.modelDocument").value)));
  const unavailableCopy =
    "Contribution unavailable because the scenario calculation did not produce a finite result.";

  await expect.attr("app", "calculationStatus", "ok");
  await expect.text("app.status.status", "MODEL SCOPE · ILLUSTRATIVE DATA · CALCULATION OK");
  await expect.text("app.graph.stage.cards.16.value", "18.6%");
  await expect.text("app.inspector.value", "18.6%");

  await page.evaluate((documentValue) => {
    const fault = JSON.parse(JSON.stringify(documentValue));
    fault.factors.find((factor) => factor.id === "baseRevenue").base = 0;
    window.__declare.find("app.modelDocument").set([], fault);
  }, baseDocument);
  await drive.settleMotion();

  await expect.attr("app", "calculationStatus", "unavailable");
  await expect.text("app.status.status",
    "MODEL SCOPE · ILLUSTRATIVE DATA · CALCULATION UNAVAILABLE — NON-FINITE MODEL VALUE");
  await expect.text("app.graph.stage.cards.16.value", "Unavailable");
  await expect.attr("app.graph.stage.cards.16.deltaText", "visible", false);
  await expect.text("app.inspector.value", "Unavailable");
  await expect.attr("app.inspector.delta", "visible", false);
  await expect.count("app.inspector.detailBody.derivedDetails.contributionBridge.rows",
    "ContributionRow", 0);
  await expect.text("app.inspector.detailBody.derivedDetails.contributionBridge.unavailable",
    unavailableCopy);
  await expect.attr("app.inspector.detailBody.derivedDetails.contributionBridge.noDelta",
    "visible", false);
  await expect.attr("app.inspector.detailBody.derivedDetails.contributionBridge.comparison",
    "visible", false);
  await expect.attr("app.inspector.detailBody.derivedDetails.contributionBridge.active",
    "visible", false);
  const bridgeState = await page.evaluate(() => {
    const bridge = window.__declare.find("app.inspector.detailBody.derivedDetails.contributionBridge");
    const unavailable = window.__declare.find("app.inspector.detailBody.derivedDetails.contributionBridge.unavailable");
    return { unavailableTop: unavailable.y, unavailableBottom: unavailable.y + unavailable.height,
      bridgeHeight: bridge.height };
  });
  if (bridgeState.unavailableBottom > bridgeState.bridgeHeight) {
    throw new Error(`unavailable bridge copy is clipped: ${JSON.stringify(bridgeState)}`);
  }

  await drive.page.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await drive.settleMotion();
  await expect.text("app.status.status",
    "MODEL SCOPE · ILLUSTRATIVE · CALCULATION UNAVAILABLE · NON-FINITE VALUE");
  await expect.attr("app.status.status", "width", 358);
  await expect.attr("app.status.status", "height", 16);

  const visibleNumbers = await page.evaluate(() => [
    window.__declare.find("app.graph.stage.cards.16.value").text,
    window.__declare.find("app.inspector.value").text,
    window.__declare.find("app.inspector.detailBody.derivedDetails.contributionBridge.unavailable").text,
  ]);
  if (visibleNumbers.some((text) => /NaN|Infinity/.test(text))) {
    throw new Error(`non-finite value leaked into visible text: ${visibleNumbers.join(" | ")}`);
  }

  // Restore the model Dataset and then return the scenario selector to Base;
  // this verifies recovery without a page reload.
  await drive.page.setViewport({ width: 1280, height: 800 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await drive.settleMotion();
  await page.evaluate((documentValue) => {
    window.__declare.find("app.modelDocument").set([], documentValue);
    window.__declare.find("app").resetModel();
  }, baseDocument);
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "base");
  await expect.attr("app", "calculationStatus", "ok");
  await expect.text("app.status.status", "MODEL SCOPE · ILLUSTRATIVE DATA · CALCULATION OK");
  await expect.text("app.graph.stage.cards.16.value", "18.6%");
  await expect.text("app.inspector.value", "18.6%");
  await expect.attr("app.inspector.detailBody.derivedDetails.contributionBridge.unavailable",
    "visible", false);
};

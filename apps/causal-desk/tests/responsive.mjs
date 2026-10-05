// CD-S4-01 responsive contract. Geometry is intentionally asserted through
// public Declare nodes so the test covers the real layout, not a parallel DOM.

export default async ({ drive, expect, page }) => {
  const view = (name) => page.evaluate((path) => {
    const n = window.__declare.find(path);
    if (!n) return null;
    return { x: n.x, y: n.y, width: n.width, height: n.height,
      scrolls: n.scrolls, scrollX: n.scrollX, contentWidth: n.contentWidth };
  }, name);

  const documentGeometry = () => page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    height: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));

  const assertInspectorCollapsed = async (label) => {
    const state = await page.evaluate(() => ({
      expanded: window.__declare.find("app").inspectorExpanded,
      visible: window.__declare.find("app.inspector").visible,
    }));
    if (state.expanded || state.visible) {
      expect.fail(`${label} should hide inspector: ${JSON.stringify(state)}`);
    }
  };

  const assertNarrowTargets = async (label) => {
    const targets = await page.evaluate(() => [
      "app.header.scenarioPicker", "app.header.comparisonPicker", "app.header.reset",
      "app.summary.details",
    ].map((path) => {
      const n = window.__declare.find(path);
      return { path, width: n.width, height: n.height };
    }));
    for (const target of targets) {
      if (target.width < 44 || target.height < 44) {
        expect.fail(`${label} target too small: ${JSON.stringify(target)}`);
      }
    }
  };

  const assertInspectorFlow = async (label) => {
    const flow = await page.evaluate(() => {
      const inspector = window.__declare.find("app.inspector");
      const body = window.__declare.find("app.inspector.detailBody");
      const reducedMotion = window.__declare.find("app.inspector.reducedMotion");
      const notice = window.__declare.find("app.inspector.notice");
      return {
        bodyBottom: body.y + body.height,
        reducedMotionY: reducedMotion.y,
        reducedMotionBottom: reducedMotion.y + reducedMotion.height,
        noticeY: notice.y,
        noticeBottom: notice.y + notice.height,
        inspectorHeight: inspector.height,
      };
    });
    if (flow.bodyBottom > flow.reducedMotionY || flow.reducedMotionBottom > flow.noticeY
      || flow.noticeBottom > flow.inspectorHeight) {
      expect.fail(`${label} inspector chrome overlaps scroll content: ${JSON.stringify(flow)}`);
    }
  };

  const assertNarrowSpacing = async (label) => {
    const spacing = await page.evaluate(() => {
      const header = window.__declare.find("app.header");
      const scenario = window.__declare.find("app.header.scenarioPicker");
      const comparisonLabel = window.__declare.find("app.header.comparisonLabel");
      const comparison = window.__declare.find("app.header.comparisonPicker");
      const status = window.__declare.find("app.status");
      const graph = window.__declare.find("app.graph");
      const summary = window.__declare.find("app.summary");
      const details = window.__declare.find("app.summary.details");
      return {
        scenarioBottom: scenario.y + scenario.height,
        comparisonLabelY: comparisonLabel.y,
        comparisonBottom: comparison.y + comparison.height,
        headerHeight: header.height,
        headerBottom: header.y + header.height,
        statusY: status.y,
        statusBottom: status.y + status.height,
        graphY: graph.y,
        detailsRightInset: summary.width - details.x - details.width,
      };
    });
    if (spacing.scenarioBottom + 4 > spacing.comparisonLabelY
      || spacing.comparisonBottom > spacing.headerHeight
      || spacing.headerBottom > spacing.statusY
      || spacing.statusBottom > spacing.graphY
      || spacing.detailsRightInset !== 16) {
      expect.fail(`${label} narrow spacing is inconsistent: ${JSON.stringify(spacing)}`);
    }
  };

  const clickSummaryDetails = async () => {
    const point = await page.evaluate(() => {
      const summary = window.__declare.find("app.summary");
      const details = window.__declare.find("app.summary.details");
      return {
        x: summary.x + details.x + details.width / 2,
        y: summary.y + details.y + details.height / 2 - window.scrollY,
      };
    });
    await page.mouse.click(point.x, point.y);
    await drive.settleMotion();
  };

  const clickContributionRow = async () => {
    const point = await page.evaluate(() => {
      const row = window.__declare.find("app.inspector.detailBody.derivedDetails.contributionBridge.rows.0");
      const origin = row.rootOrigin();
      return { x: origin.x + row.width / 2, y: origin.y + row.height / 2 - window.scrollY };
    });
    await page.mouse.click(point.x, point.y);
    await drive.settleMotion();
  };

  const resize = async (width, height) => {
    await page.setViewport({ width, height });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await drive.settleMotion();
  };

  const assertDocumentFits = async (width, label) => {
    const geometry = await documentGeometry();
    expect.equal(geometry.width, width, `${label} document viewport width`);
    expect.equal(geometry.scrollWidth, width, `${label} document has no horizontal overflow`);
  };

  const assertAlignedGraph = async (label) => {
    const geometry = await page.evaluate(() => {
      const graph = window.__declare.find("app.graph");
      const stage = window.__declare.find("app.graph.stage");
      const edges = window.__declare.find("app.graph.stage.edges");
      const cards = window.__declare.find("app.graph.stage.cards");
      const card = window.__declare.find("app.graph.stage.cards.16");
      return {
        graphWidth: graph.width,
        stageWidth: stage.width,
        edgeWidth: edges.width,
        cardLayerWidth: cards.width,
        cardX: card.x,
        cardY: card.y,
        stageX: stage.x,
        stageY: stage.y,
        scrollX: graph.scrollX,
        contentWidth: graph.contentWidth,
      };
    });
    expect.equal(geometry.edgeWidth, geometry.stageWidth, `${label} edge stage width`);
    expect.equal(geometry.cardLayerWidth, geometry.stageWidth, `${label} card stage width`);
    expect.equal(geometry.cardX, geometry.stageWidth >= 820 ? 646 : 642,
      `${label} outcome card stays in graph column`);
    expect.equal(geometry.cardY, 322, `${label} outcome card stays in graph row`);
    expect.equal(geometry.contentWidth, geometry.stageX + geometry.stageWidth,
      `${label} graph content includes the whole stage`);
    return geometry;
  };

  // Desktop remains the Slice 3 coordinate contract.
  await resize(1280, 800);
  await drive.settleMotion();
  await expect.attr("app", "desktop", true);
  await expect.attr("app", "mobile", false);
  await expect.attr("app.graph", "x", 28);
  await expect.attr("app.graph", "y", 94);
  await expect.attr("app.graph", "width", 860);
  await expect.attr("app.inspector", "x", 916);
  await expect.attr("app.inspector", "width", 336);
  await assertDocumentFits(1280, "desktop");
  await assertAlignedGraph("desktop");

  // Real desktop input still reaches both scenario controls and recomputes the
  // selected result. Reset proves the action remains reachable at this tier.
  await drive.click("app.header.scenarioPicker.4");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "fuelShock");
  await drive.click("app.header.comparisonPicker.5");
  await drive.settleMotion();
  await expect.attr("app", "comparisonScenarioId", "downturn");
  await drive.click("app.header.reset");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "base");

  // Tablet stacks the three regions in document order and centers the capped
  // inspector. Its content is taller than the host, so only vertical page
  // scrolling is introduced.
  await resize(900, 1000);
  await drive.settleMotion();
  await expect.attr("app", "desktop", false);
  await expect.attr("app", "mobile", false);
  await expect.attr("app", "compactTablet", false);
  await expect.attr("app", "scrolls", "y");
  await expect.attr("app.header", "x", 24);
  await expect.attr("app.header", "y", 20);
  await expect.attr("app.graph", "x", 24);
  await expect.attr("app.graph", "y", 220);
  await expect.attr("app.inspector", "x", 170);
  await expect.attr("app.summary", "y", 856);
  await expect.attr("app.summary", "visible", true);
  await expect.attr("app.inspector", "y", 948);
  await expect.attr("app.inspector", "width", 560);
  await expect.attr("app.inspector", "visible", true);
  await assertNarrowTargets("tablet");
  await assertNarrowSpacing("tablet");
  await expect.text("app.summary.title", "Operating margin");
  await expect.text("app.summary.value", "18.6%");
  await expect.text("app.inspector.title", "Operating margin");
  await assertInspectorFlow("tablet");
  const tabletGraph = await view("app.graph");
  expect.equal(tabletGraph.scrolls, "none", "tablet graph does not add horizontal scrolling");
  await assertDocumentFits(900, "tablet");
  const tabletDocument = await documentGeometry();
  if (tabletDocument.scrollHeight <= tabletDocument.height) {
    expect.fail("tablet stacked content should be vertically reachable");
  }
  await drive.click("app.header.scenarioPicker.4");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "fuelShock");
  await drive.click("app.graph.stage.cards.16");
  await expect.text("app.summary.title", "Operating margin");
  await expect.text("app.summary.delta", "−7.2 pp");
  await expect.text("app.inspector.title", "Operating margin");
  await drive.click("app.graph.stage.cards.4");
  await expect.attr("app", "selectedFactorId", "demandGrowth");
  await expect.text("app.summary.title", "Demand growth");
  await expect.text("app.inspector.title", "Demand growth");
  const tabletExpandedExtent = (await documentGeometry()).scrollHeight;
  await clickSummaryDetails();
  await assertInspectorCollapsed("tablet collapse");
  const tabletCollapsedExtent = (await documentGeometry()).scrollHeight;
  if (tabletCollapsedExtent >= tabletExpandedExtent) {
    expect.fail(`tablet collapse should remove inspector from document extent: ${tabletExpandedExtent} → ${tabletCollapsedExtent}`);
  }
  await expect.attr("app.summary", "visible", true);
  await expect.attr("app.summary.details", "label", "Show Details");
  await clickSummaryDetails();
  await expect.attr("app.inspector", "visible", true);
  if ((await documentGeometry()).scrollHeight < tabletExpandedExtent) {
    expect.fail("tablet Show Details should restore inspector document extent");
  }
  await expect.attr("app.summary.details", "label", "Hide Details");

  const tabletScroll = await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 240, left: 0 });
    return {
      windowY: window.scrollY,
      appY: window.__declare.find("app").scrollY,
      inspectorOnScreen: window.__declare.find("app.inspector").onScreen,
    };
  });
  if (tabletScroll.windowY < 1 || !tabletScroll.inspectorOnScreen) {
    expect.fail(`tablet page scroll should reveal the inspector: ${JSON.stringify(tabletScroll)}`);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0 }));

  // At the compact-tablet seam the graph still owns horizontal overflow: the
  // 798px DAG is not squeezed into a 720–768px frame and the document remains
  // exactly viewport-wide.
  await resize(768, 900);
  await expect.attr("app", "desktop", false);
  await expect.attr("app", "mobile", false);
  await expect.attr("app", "compactTablet", true);
  await expect.attr("app.graph", "width", 720);
  await expect.attr("app.graph", "scrolls", "x");
  await expect.attr("app.graph.stage", "width", 820);
  await assertDocumentFits(768, "compact tablet");
  const compactGraph = await assertAlignedGraph("compact tablet");
  if (compactGraph.contentWidth <= compactGraph.graphWidth) {
    expect.fail("compact tablet graph should have an internal horizontal scroll range");
  }
  await page.evaluate(() => window.__declare.find("app.graph").scrollToX(120));
  await drive.settleMotion();
  expect.equal((await view("app.graph")).scrollX, 120,
    "compact tablet graph accepts horizontal scrolling");
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0 }));

  // Phone keeps a 16px frame and gives only the graph an internal horizontal
  // scroll range. The cards and edge canvas share the same fixed stage, so a
  // pan cannot make their coordinate systems diverge.
  await resize(390, 844);
  await drive.settleMotion();
  await expect.attr("app", "desktop", false);
  await expect.attr("app", "mobile", true);
  await expect.attr("app", "compactTablet", false);
  await expect.attr("app.header", "x", 16);
  await expect.attr("app.header", "width", 358);
  await expect.attr("app.graph", "x", 16);
  await expect.attr("app.graph", "y", 220);
  await expect.attr("app.graph", "width", 358);
  await expect.attr("app.graph", "scrolls", "x");
  await expect.attr("app.graph.stage", "width", 820);
  await expect.attr("app.inspector", "x", 16);
  await expect.attr("app.summary", "y", 856);
  await expect.attr("app.summary", "visible", true);
  await expect.attr("app.inspector", "y", 948);
  await expect.attr("app.inspector", "width", 358);
  await expect.attr("app.inspector", "visible", true);
  await assertNarrowTargets("mobile");
  await assertNarrowSpacing("mobile");
  await assertInspectorFlow("mobile");
  await assertDocumentFits(390, "mobile");
  const mobileGraph = await assertAlignedGraph("mobile");
  if (mobileGraph.contentWidth <= mobileGraph.graphWidth) {
    expect.fail("mobile graph should have an internal horizontal scroll range");
  }

  // Exercise the actual graph scroller and verify the model offset changes
  // while the card/edge stage dimensions remain identical.
  await page.evaluate(() => window.__declare.find("app.graph").scrollToX(220));
  await drive.settleMotion();
  const panned = await assertAlignedGraph("mobile after pan");
  expect.equal(panned.scrollX, 220, "mobile graph accepts horizontal scrolling");

  // Controls remain reachable after the graph is panned; a real card press and
  // both segmented controls continue to update state in the narrow frame.
  await page.evaluate(() => window.__declare.find("app.graph").scrollToX(0));
  await drive.click("app.graph.stage.cards.4");
  await expect.attr("app", "selectedFactorId", "demandGrowth");
  await expect.text("app.summary.title", "Demand growth");
  await expect.text("app.inspector.title", "Demand growth");
  await page.evaluate(() => window.scrollTo({ top: 520, left: 0 }));
  await page.evaluate(() => window.scrollY);
  const mobileExpandedExtent = (await documentGeometry()).scrollHeight;
  await clickSummaryDetails();
  await assertInspectorCollapsed("mobile collapse");
  const mobileCollapsedExtent = (await documentGeometry()).scrollHeight;
  if (mobileCollapsedExtent >= mobileExpandedExtent) {
    expect.fail(`mobile collapse should remove inspector from document extent: ${mobileExpandedExtent} → ${mobileCollapsedExtent}`);
  }
  await expect.attr("app.summary", "visible", true);
  await clickSummaryDetails();
  await expect.attr("app.inspector", "visible", true);
  if ((await documentGeometry()).scrollHeight < mobileExpandedExtent) {
    expect.fail("mobile Show Details should restore inspector document extent");
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0 }));
  await drive.click("app.header.comparisonPicker.6");
  await drive.settleMotion();
  await expect.attr("app", "comparisonScenarioId", "capacitySqueeze");
  await drive.click("app.header.reset");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "base");
  await expect.attr("app", "comparisonScenarioId", "base");

  // A valid contribution selection survives the remaining narrow-tier resize
  // and the return to desktop alongside the factor and scenario selections.
  await drive.click("app.header.scenarioPicker.4");
  await drive.settleMotion();
  await drive.click("app.header.comparisonPicker.0");
  await drive.settleMotion();
  await page.evaluate(() => window.__declare.find("app.graph").scrollToX(460));
  await drive.settleMotion();
  await drive.click("app.graph.stage.cards.16");
  await expect.attr("app", "selectedFactorId", "operatingMargin");
  const contributionState = await page.evaluate(() => ({
    active: window.__declare.find("app").activeScenarioId,
    comparison: window.__declare.find("app").comparisonScenarioId,
    kind: window.__declare.find("app").selectedKind,
    rows: window.__declare.find("app").model.contributionData.value.rows.length,
  }));
  if (contributionState.rows < 1) {
    expect.fail(`expected contribution rows after mobile selection: ${JSON.stringify(contributionState)}`);
  }
  await expect.attr("app", "selectedContributionFactorId", "");
  await page.evaluate(() => window.scrollTo({ top: 1000, left: 0 }));
  await page.evaluate(() => window.scrollY);
  await clickContributionRow();
  await expect.attr("app", "selectedContributionFactorId", "jetFuelPrice");

  // The minimum supported width keeps both labeled selectors usable: each
  // segment retains a readable lane while the page itself remains bounded.
  await resize(360, 844);
  await expect.attr("app.header", "width", 328);
  await expect.attr("app.header.scenarioPicker", "width", 328);
  await expect.attr("app.header.comparisonPicker", "width", 328);
  const compactHeader = await page.evaluate(() => ({
    scenarioLane: window.__declare.find("app.header.scenarioPicker").segW,
    comparisonLane: window.__declare.find("app.header.comparisonPicker").segW,
  }));
  if (compactHeader.scenarioLane < 60 || compactHeader.comparisonLane < 70) {
    expect.fail(`minimum-width selector lanes are too narrow: ${JSON.stringify(compactHeader)}`);
  }
  await assertDocumentFits(360, "minimum mobile");

  // Returning to desktop keeps the scenario and factor selection while the
  // desktop inspector becomes permanently visible and the narrow summary hides.
  await resize(1280, 800);
  await expect.attr("app", "selectedFactorId", "operatingMargin");
  await expect.attr("app", "activeScenarioId", "fuelShock");
  await expect.attr("app", "comparisonScenarioId", "base");
  await expect.attr("app", "selectedContributionFactorId", "jetFuelPrice");
  await expect.attr("app.summary", "visible", false);
  await expect.attr("app.inspector", "visible", true);
  await expect.attr("app.inspector", "y", 94);
};

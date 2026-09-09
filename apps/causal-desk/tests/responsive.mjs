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
  await expect.attr("app.graph", "y", 190);
  await expect.attr("app.inspector", "x", 170);
  await expect.attr("app.inspector", "y", 830);
  await expect.attr("app.inspector", "width", 560);
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
  await drive.click("app.graph.stage.cards.4");
  await expect.attr("app", "selectedFactorId", "demandGrowth");

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
  await expect.attr("app.graph", "y", 210);
  await expect.attr("app.graph", "width", 358);
  await expect.attr("app.graph", "scrolls", "x");
  await expect.attr("app.graph.stage", "width", 820);
  await expect.attr("app.inspector", "x", 16);
  await expect.attr("app.inspector", "y", 850);
  await expect.attr("app.inspector", "width", 358);
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
  await drive.click("app.header.comparisonPicker.6");
  await drive.settleMotion();
  await expect.attr("app", "comparisonScenarioId", "capacitySqueeze");
  await drive.click("app.header.reset");
  await drive.settleMotion();
  await expect.attr("app", "activeScenarioId", "base");
  await expect.attr("app", "comparisonScenarioId", "base");

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
};

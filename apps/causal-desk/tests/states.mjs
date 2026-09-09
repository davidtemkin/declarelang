// Named visual states for the complete Slice 4 responsive/accessibility loop.
//
// Bless:
// node tools/verify.mjs apps/causal-desk/causal-desk.declare \
//   --states apps/causal-desk/tests/states.mjs --bless

export default [
  {
    name: "operating-margin",
    viewport: { width: 1280, height: 800 },
  },
  {
    name: "revenue-selected",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive }) => {
      await drive.click("app.graph.stage.cards.10");
    },
  },
  {
    name: "fuel-shock",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.settleMotion();
    },
  },
  {
    name: "working-fuel",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.click("app.graph.stage.cards.7");
      await drive.drag("app.inspector.detailBody.assumptionEditor.slider", 100);
      await drive.settleMotion();
    },
  },
  {
    name: "fuel-shock-vs-base-bridge",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.settleMotion();
      await drive.click("app.graph.stage.cards.16");
    },
  },
  {
    name: "jet-fuel-contribution-path",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.settleMotion();
      await drive.click("app.graph.stage.cards.16");
      await drive.click("app.inspector.detailBody.derivedDetails.contributionBridge.rows.0");
    },
  },
  {
    name: "fuel-shock-vs-downturn",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.click("app.header.comparisonPicker.5");
      await drive.settleMotion();
    },
  },
  {
    name: "equal-scenarios-no-delta",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.click("app.header.comparisonPicker.4");
      await drive.click("app.graph.stage.cards.16");
      await drive.settleMotion();
    },
  },
  {
    name: "desktop-assumption-entry",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive, page }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.click("app.graph.stage.cards.7");
      await drive.click("app.inspector.detailBody.assumptionEditor.input");
      await page.keyboard.press("Home");
      await page.keyboard.down("Shift");
      await page.keyboard.press("End");
      await page.keyboard.up("Shift");
      await drive.type("$4.25");
      await drive.settleMotion();
    },
  },
  {
    name: "desktop-validation-error",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive, page }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.click("app.graph.stage.cards.7");
      await drive.click("app.inspector.detailBody.assumptionEditor.input");
      await page.keyboard.press("Home");
      await page.keyboard.down("Shift");
      await page.keyboard.press("End");
      await page.keyboard.up("Shift");
      await drive.type("$5.01");
      await drive.click("app.inspector.detailBody.assumptionEditor.apply");
      await drive.settleMotion();
    },
  },
  {
    name: "desktop-unavailable-calculation",
    viewport: { width: 1280, height: 800 },
    route: async ({ drive, page }) => {
      const baseDocument = await page.evaluate(() =>
        JSON.parse(JSON.stringify(window.__declare.find("app.modelDocument").value)));
      await page.evaluate((documentValue) => {
        const fault = JSON.parse(JSON.stringify(documentValue));
        fault.factors.find((factor) => factor.id === "baseRevenue").base = 0;
        window.__declare.find("app.modelDocument").set([], fault);
      }, baseDocument);
      await drive.settleMotion();
    },
  },
  {
    name: "tablet-base",
    viewport: { width: 900, height: 1000 },
  },
  {
    name: "tablet-fuel-shock-bridge",
    viewport: { width: 900, height: 1000 },
    route: async ({ drive }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.settleMotion();
      await drive.click("app.graph.stage.cards.16");
    },
  },
  {
    name: "mobile-assumption-entry",
    viewport: { width: 390, height: 844 },
    route: async ({ drive, page }) => {
      await drive.click("app.header.scenarioPicker.4");
      await drive.click("app.graph.stage.cards.7");
      const inputY = await page.evaluate(() => {
        const input = window.__declare.inspect("app.inspector.detailBody.assumptionEditor.input");
        return input.rootY + window.scrollY;
      });
      await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y - 180), left: 0 }), inputY);
      await drive.click("app.inspector.detailBody.assumptionEditor.input");
      await page.keyboard.press("Home");
      await page.keyboard.down("Shift");
      await page.keyboard.press("End");
      await page.keyboard.up("Shift");
      await drive.type("5.5%");
      await drive.settleMotion();
    },
  },
  {
    name: "mobile-graph-scrolled",
    viewport: { width: 390, height: 844 },
    route: async ({ drive, page }) => {
      await page.evaluate(() => window.__declare.find("app.graph").scrollToX(220));
      await drive.settleMotion();
    },
  },
  {
    name: "mobile-details-collapsed",
    viewport: { width: 390, height: 844 },
    route: async ({ drive, page }) => {
      await page.evaluate(() => window.scrollTo({ top: 700, left: 0 }));
      await page.evaluate(() => window.__declare.find("app").toggleInspector());
      await drive.settleMotion();
    },
  },
];

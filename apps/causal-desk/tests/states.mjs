// Named visual states for the complete Slice 3 concept loop.
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
];

// Named visual states for the fixed Slice 1 model.
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
      await drive.drag("app.inspector.assumptionEditor.slider", 100);
      await drive.settleMotion();
    },
  },
];

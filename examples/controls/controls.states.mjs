// The controls showcase's named visual states — verify's rung 6 proving case.
//   bless:   node tools/verify.mjs examples/controls/controls.declare --states examples/controls/controls.states.mjs --bless
//   compare: node tools/verify.mjs examples/controls/controls.declare --states examples/controls/controls.states.mjs
//
// Determinism notes: routes end in settled motion (driven clock) and, where
// the focus ring is involved, wait PAST its 1s idle fade so the capture is
// timing-independent.
export default [
  { name: "initial" },

  {
    name: "muted",
    route: async ({ drive }) => {
      await drive.click("app.col.2");     // Mute checkbox — switch follows, ring claims it
      await drive.settleMotion();
      await drive.wait(1400);             // past the focus ring's idle fade
      await drive.settleMotion();
    },
  },

  {
    name: "narrow-initial",
    viewport: { width: 480, height: 768 },
  },
];

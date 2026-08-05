// The weight/rendition comparison, as a capturable state.
//
//   bless:   node tools/verify.mjs test/probe/iconweight.declare --states test/probe/iconweight.states.mjs --bless
//   compare: node tools/verify.mjs test/probe/iconweight.declare --states test/probe/iconweight.states.mjs
//
// dpr 2 because the SUBJECT is the rendering: a 1× raster of a 1.05px stroke
// photographs the antialiaser, not the design. The Apple half is rendered at the
// same 2× by ref/render.swift, so the two halves are on one pixel grid.
//
// The reference sheets are checked in rather than regenerated at capture time.
// The point is a FIXED reference, and a machine without SF Symbols would
// otherwise silently compare against blanks.
export default [{ name: "weights", viewport: { width: 800, height: 690 }, dpr: 2 }];

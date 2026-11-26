// The homepage's named visual states, at phone width: the centered banner lines,
// which must wrap inside a phone's width rather than run off its edge.
//
//   bless:   node tools/verify.mjs apps/homepage/homepage.declare --states apps/homepage/tests/states.mjs --bless
//   compare: node tools/verify.mjs apps/homepage/homepage.declare --states apps/homepage/tests/states.mjs
//
// Each route brings one banner to the middle of the window and lets its section's
// reveal finish before the capture.

const PHONE = { width: 390, height: 844 };

const at = (text) => async ({ drive, page }) => {
  await page.evaluate((t) => {
    const e = [...document.querySelectorAll("*")].find((n) => n.children.length === 0 && n.textContent.includes(t));
    e?.scrollIntoView({ block: "center" });
    return null;
  }, text);
  await drive.settleMotion();
};

export default [
  // the loop section's head and lead
  { name: "phone-loop", viewport: PHONE, scheme: "dark", route: at("Your AI can write the code") },
  // the closing lines under the four tools
  { name: "phone-closer", viewport: PHONE, scheme: "dark", route: at("The spec is small") },
];

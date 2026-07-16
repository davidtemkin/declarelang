// The controls showcase's behavioral contract — verify's rung 5 proving case.
// Run: node tools/verify.mjs apps/controls/controls.declare --assert apps/controls/controls.assert.mjs
//
// Asserts at the LANGUAGE's altitude: named views and attributes through the
// __declare bridge — real pointer/keyboard input, deterministic motion.
export default async ({ drive, expect }) => {
  // initial state
  await expect.attr("app", "muted", false);
  await expect.attr("app", "volume", 40);
  await expect.attr("app", "size", "m");

  // pointer: clicking the Mute checkbox (col child 2) toggles app state —
  // derive-down/deliver-up round trip — and the Switch (child 3) follows
  await drive.click("app.col.2");
  await expect.attr("app", "muted", true);
  await expect.attr("app.col.3", "checked", true);

  // keyboard: the click claimed focus, so Space toggles it back
  await drive.key("Space");
  await expect.attr("app", "muted", false);

  // keyboard traversal: Tab reaches the switch; Space toggles via the switch
  await drive.tab();
  await drive.key("Space");
  await expect.attr("app", "muted", true);

  // the button counts clicks; Disabled is inert to the pointer
  await drive.click("app.col.5");
  await drive.click("app.col.5");
  await expect.attr("app", "hits", 2);
  await drive.click("app.col.6");
  await expect.attr("app", "hits", 2);

  // slider: drag right raises volume; ProgressBar mirrors it (same app slot)
  await drive.drag("app.col2.0", 60);
  const vol = await expect.explain("app", "volume");
  if (vol.value <= 40) expect.fail(`drag should raise volume, got ${vol.value}`);
  await expect.attr("app.col2.1", "value", vol.value);

  // radios: the group owns the value; clicking Large delivers "l"
  await drive.click("app.col2.3.2");
  await expect.attr("app", "size", "l");

  // provenance: the slider's value is a wired constraint on app.volume
  const p = await expect.explain("app.col2.0", "value");
  if (!p.constraint || p.constraint.static !== true) expect.fail("slider value should be a static-wired constraint");
  if (!p.constraint.deps.includes("this.root.volume")) expect.fail(`unexpected deps: ${p.constraint.deps}`);

  // the traveling focus ring (compiler-injected, last App child): after a
  // click it heads for the clicked control — settle the motion, then its
  // geometry brackets the radio row's dot
  await drive.settleMotion();
  await expect.visible("app.3");
};

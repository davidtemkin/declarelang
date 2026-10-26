export default async ({ drive, expect, page }) => {
  const card = "app.graph.stage.cards.7";
  await drive.page.setViewport({ width: 1280, height: 800 });
  await expect.attr("app", "reducedMotionOverride", false);
  await expect.attr("app.inspector.reducedMotion", "height", 44);

  await drive.click("app.header.scenarioPicker.4");
  await drive.click(card);
  const target = (await expect.explain(card, "currentValue")).value;
  await drive.wait(16);
  const intermediate = (await expect.explain(card, "shownValue")).value;
  if (intermediate == target) expect.fail("normal mode should expose an intermediate spring value");

  // Enabling the override during propagation snaps to the model value and
  // pauses the app-authored spring instead of waiting for it to settle.
  await drive.click("app.inspector.reducedMotion");
  await expect.attr("app", "reducedMotionOverride", true);
  await expect.approx(card, "shownValue", target, 0.0001);
  await expect.attr(card + ".motion", "paused", true);
  await drive.click("app.header.scenarioPicker.3");
  const reducedTarget = (await expect.explain(card, "currentValue")).value;
  await expect.approx(card, "shownValue", reducedTarget, 0.0001);
  await expect.attr(card + ".motion", "paused", true);

  await drive.click("app.inspector.reducedMotion");
  await expect.attr("app", "effectiveReducedMotion", false);
  await expect.approx(card, "shownValue", reducedTarget, 0.0001);
  await expect.approx(card, "animatedValue", reducedTarget, 0.0001);
  await drive.click("app.header.scenarioPicker.4");
  await drive.wait(16);
  const future = (await expect.explain(card, "shownValue")).value;
  if (future == (await expect.explain(card, "currentValue")).value) {
    expect.fail("future normal-mode changes should animate after reduced mode is disabled");
  }
  await drive.settleMotion();

  // A host preference is authoritative: the visible override explains why it
  // is locked and cannot disable the effective preference.
  await page.evaluate(() => {
    const app = window.__declare.find("app");
    app.env = { ...app.env, reducedMotion: true };
  });
  await expect.attr("app", "effectiveReducedMotion", true);
  await expect.attr("app.inspector.reducedMotion", "disabled", true);
  await expect.attr("app.inspector.reducedMotion", "label", "Reduced motion: On (system)");
  await drive.click("app.inspector.reducedMotion");
  await expect.attr("app", "reducedMotionOverride", false);
  await expect.attr("app", "effectiveReducedMotion", true);

  await drive.page.setViewport({ width: 390, height: 844 });
  await expect.attr("app.inspector.reducedMotion", "height", 44);
  await expect.approx("app", "selectedValue", 4.1, 0.0001);
  await drive.page.setViewport({ width: 900, height: 1000 });
  await expect.attr("app.inspector.reducedMotion", "height", 44);
};

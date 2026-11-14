// Every control says what it does, to a screen reader as to the pointer
// (brief §10): the five tools, the slides as "Slide 1", "Slide 2"…, and the
// slide being edited as "Slide", whose box is the slide's 1280 × 720 points
// scaled evenly. Reads the sample presentation "Field notes from the coast".
//
//   npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/labels.mjs

export default async ({ drive, expect, page }) => {
  const check = (cond, what) => { if (!cond) throw new Error(what); };
  const ix = await page.evaluate(() => window.__declare.find("app.library").shown.findIndex((d) => d.title == "Field notes from the coast"));
  await drive.click("app.shell.library.body.grid." + ix + ".opener");
  await drive.settleData();
  await drive.settleMotion();

  for (const name of ["Select", "Rectangle", "Ellipse", "Line", "Text"]) {
    const tool = page.getByRole("button", { name, exact: true });
    await expect(tool).toBeVisible();
    await drive.hover("app.shell.editor.body.canvas.tools." + name);
    await drive.wait(700);
    check((await drive.read("app.shell.editor.body.canvas.tools." + name + ".tooltipLabel")).startsWith(name), "a tip names " + name);
  }
  await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");

  for (let i = 1; i <= 8; i++) await expect(page.getByRole("option", { name: "Slide " + i, exact: true })).toBeVisible();

  const slide = page.getByRole("img", { name: "Slide", exact: true });
  await expect(slide).toBeVisible();
  const box = await slide.boundingBox();
  const s = await drive.read("app.shell.editor.body.canvas.s");
  check(Math.abs(box.width - 1280 * s) < 1.5 && Math.abs(box.height - 720 * s) < 1.5, "the labelled slide is the slide: " + JSON.stringify(box) + " at " + s);
  check(Math.abs(box.width / box.height - 16 / 9) < 0.01, "and keeps its shape");

  // the window resized: the slide keeps 16:9 and still fills what it can
  await page.setViewport({ width: 1440, height: 900 });
  await drive.wait(100);
  await drive.settleMotion();
  const big = await slide.boundingBox();
  check(big.width > box.width && Math.abs(big.width / big.height - 16 / 9) < 0.01, "larger window, larger slide, same shape: " + JSON.stringify(big));

  for (const name of ["Undo", "Redo", "New slide", "Back to presentations", "Presentation title"])
    check((await page.getByLabel(name, { exact: true }).count()) + (await page.getByRole("button", { name, exact: true }).count()) > 0, "named: " + name);
  await expect(page.getByRole("button", { name: "Present", exact: true })).toBeVisible();
};

// The keyboard brief's "what done looks like", without the pointer: a new
// presentation, three more slides, a title and two shapes on the first, the
// shapes aligned, the title styled, a reorder undone, and presenting from the
// start. Then the inspector, a colour, the menus and the shortcuts sheet, all
// from the keyboard. It deletes the presentation it made.

export const device = { width: 1440, height: 900 };

const read = (page, path, attr) => page.evaluate((p, a) => {
  const v = window.__declare.find(p)[a];
  return JSON.parse(JSON.stringify(v ?? null));
}, path, attr);
const focusedLabel = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a == null ? "" : (a.getAttribute("aria-label") ?? a.textContent ?? "").slice(0, 60);
});

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  let deckId = "";
  try {
    // ⌥⌘N: a new presentation, its title ready to type over
    await drive.key("Mod+Alt+N");
    await drive.settleData();
    await drive.wait(800);
    await drive.settleMotion();
    deckId = await read(page, "app.saver", "deckId");
    expect.equal(deckId != "", true);
    await drive.type("Keyboard review");
    await drive.key("Enter");
    await drive.settleData();
    expect.equal(await read(page, "app.saver", "title"), "Keyboard review");
    expect.equal(await focusedLabel(page), "Slide editor");

    // ⌘↩ three times: four slides, the last one shown
    for (let i = 0; i < 3; i++) await drive.key("Mod+Enter");
    expect.equal((await read(page, "app.doc", "value")).slides.length, 4);
    expect.equal(await read(page, "app.ed", "slideIndex"), 3);
    // ⌘↑ back to the first
    for (let i = 0; i < 3; i++) await drive.key("Mod+ArrowUp");
    expect.equal(await read(page, "app.ed", "slideIndex"), 0);

    // ⇧T: a text box in the middle, typing straight in
    await drive.key("Shift+T");
    await drive.settleMotion();
    expect.equal((await read(page, "app.ed", "editingId")) != "", true);
    await drive.type("Quarterly review");
    // ⌘A while typing selects the words, not the shapes
    await drive.key("Mod+A");
    expect.equal((await read(page, "app.ed", "editingId")) != "", true);
    await drive.key("ArrowRight");
    // ⌘B while typing bolds the box
    await drive.key("Mod+B");
    await drive.key("Escape");
    let els = await read(page, "app.ed", "els");
    expect.equal(els.length, 1);
    expect.equal(els[0].text.content, "Quarterly review");
    expect.equal(els[0].text.weight, 700);

    // ⇧R, ⇧O: two shapes, each selected as it lands, a little apart
    await drive.key("Shift+R");
    await drive.key("Shift+O");
    els = await read(page, "app.ed", "els");
    expect.equal(els.map((e) => e.kind), ["text", "rect", "ellipse"]);
    expect.equal(await read(page, "app.ed", "sel"), [els[2].id]);

    // Escape, then ⌥→ through them: the rectangle, then add the ellipse
    await drive.key("Escape");
    expect.equal((await read(page, "app.ed", "sel")).length, 0);
    await drive.key("Alt+ArrowRight");
    await drive.key("Alt+ArrowRight");
    expect.equal(await read(page, "app.ed", "sel"), [els[1].id]);
    await drive.key("Alt+Shift+ArrowRight");
    expect.equal((await read(page, "app.ed", "sel")).length, 2);
    // ⌥A: align their left edges
    await drive.key("Alt+A");
    els = await read(page, "app.ed", "els");
    expect.equal(els[1].x, els[2].x);

    // the title: select it, centre it, make it bigger
    await drive.key("Escape");
    await drive.key("Alt+ArrowRight");
    expect.equal(await read(page, "app.ed", "sel"), [els[0].id]);
    await drive.key("Mod+Shift+E");
    await drive.key("Mod+=");
    els = await read(page, "app.ed", "els");
    expect.equal(els[0].text.align, "center");
    expect.equal(els[0].text.size > 36, true);
    // Return edits the selected text box; Escape ends editing, then clears
    await drive.key("Enter");
    expect.equal(await read(page, "app.ed", "editingId"), els[0].id);
    await drive.key("Escape");
    expect.equal(await read(page, "app.ed", "editingId"), "");
    await drive.key("Escape");
    expect.equal((await read(page, "app.ed", "sel")).length, 0);

    // Shift-Tab to the slide list; arrows move, End and Home; ⌥↓ moves the slide
    await drive.key("Shift+Tab");
    await drive.key("Shift+Tab");
    expect.equal((await focusedLabel(page)).startsWith("Slide "), true);
    await drive.key("ArrowDown");
    expect.equal(await read(page, "app.ed", "slideIndex"), 1);
    await drive.key("End");
    expect.equal(await read(page, "app.ed", "slideIndex"), 3);
    await drive.key("Home");
    expect.equal(await read(page, "app.ed", "slideIndex"), 0);
    const first = (await read(page, "app.doc", "value")).slides[0].id;
    await drive.key("Alt+ArrowDown");
    await drive.settleMotion();
    expect.equal((await read(page, "app.doc", "value")).slides[1].id, first);
    // ⌘Z puts the order back
    await drive.key("Mod+Z");
    await drive.settleMotion();
    expect.equal((await read(page, "app.doc", "value")).slides[0].id, first);

    // ⇧⌥⌘P: present from the start; the arrows go through; Escape returns
    await drive.key("Mod+Alt+Shift+P");
    await drive.settleMotion();
    expect.equal(await read(page, "app", "presenting"), true);
    expect.equal(await read(page, "app.presenterView", "at"), 0);
    await drive.key("ArrowRight");
    await drive.key("Space");
    expect.equal(await read(page, "app.presenterView", "at"), 2);
    await drive.key("Escape");
    await drive.settleMotion();
    expect.equal(await read(page, "app", "presenting"), false);
    expect.equal(await read(page, "app.ed", "slideIndex"), 2);

    // ── the inspector, from the keyboard
    await drive.key("Mod+ArrowUp");
    await drive.key("Mod+ArrowUp");
    await page.getByLabel("Slide editor").focus();
    await drive.key("Alt+ArrowRight");
    await drive.key("Alt+ArrowRight");   // the rectangle
    const rid = (await read(page, "app.ed", "sel"))[0];
    const radius = page.getByLabel("Corner radius");
    await radius.focus();
    await drive.key("ArrowUp");
    await drive.key("Shift+ArrowUp");
    await expect(radius).toHaveValue("11");
    await drive.key("Escape");            // puts back what was there
    await expect(radius).toHaveValue("0");
    const before = (await read(page, "app.history", "done")).length;
    await drive.key("Shift+ArrowUp");
    await drive.key("Shift+ArrowUp");
    await drive.key("Enter");             // applies: one step
    els = await read(page, "app.ed", "els");
    expect.equal(els.find((e) => e.id == rid).cornerRadius, 20);
    expect.equal((await read(page, "app.history", "done")).length, before + 1);

    // a colour: Return opens the palette, the arrows choose, Return takes it
    const well = page.getByRole("button", { name: /^Fill colour/ });
    await well.focus();
    await drive.key("Enter");
    await drive.settleMotion();
    await drive.key("ArrowRight");
    await drive.key("Enter");
    await drive.settleMotion();
    els = await read(page, "app.ed", "els");
    expect.equal(els.find((e) => e.id == rid).fill != "#5B3DF5", true);
    await expect(well).toBeFocused();

    // the menu bar: Tab to it from the title, open, move, close with Escape
    await page.getByLabel("Presentation title").focus();
    await drive.key("Tab");
    await drive.key("Enter");
    await drive.settleMotion();
    expect.equal(await read(page, "app.editor.top.titleBox.menus", "shown"), true);
    await drive.key("ArrowDown");
    await drive.key("Escape");
    await drive.settleMotion();
    expect.equal(await read(page, "app.editor.top.titleBox.menus", "shown"), false);

    // every shortcut in one place: ⌘/ opens the sheet, Escape closes it
    await drive.key("Mod+/");
    await drive.settleMotion();
    await expect(page.getByText("Keyboard shortcuts", { exact: true })).toBeVisible();
    await drive.key("Escape");
    await drive.settleMotion();
    expect.equal(await read(page, "app", "showKeys"), false);

    await drive.wait(1500);
    await drive.settleData();
    expect.equal(await read(page, "app.saver", "statusText"), "All changes saved");
  } finally {
    if (deckId != "") await page.evaluate((id) => fetch("http://127.0.0.1:8360/api/decks/" + id, { method: "DELETE" }), deckId);
  }
};

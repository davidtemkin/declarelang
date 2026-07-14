// compose — the hidden acceptance (verify rung 5). Written against the BRIEF,
// not any implementation: it names views by role and checks structure, pinning,
// and the wide→narrow reflow with real geometry in a real browser.
//
// Address model: named views are addressed by their role name if the solution
// happens to use ours, but a solution is free to name things differently — so we
// resolve by STRUCTURE where we can (the three cards are the three ~120px-tall
// boxes under the header) and fall back to the app's own reported geometry.
export default async ({ drive, expect }) => {
  const val = async (path, attr) => (await expect.explain(path, attr))?.value;

  const W = await val("app", "width");
  const H = await val("app", "height");
  if (!(W > 700)) expect.fail(`test viewport should be wide, app.width = ${W}`);

  // Pull the app tree once; classify children by geometry against the brief.
  const tree = await drive.page.evaluate(() => window.__declare.inspect());
  const kids = tree.children;

  // header: a full-width bar pinned to the very top, showing "Dashboard".
  const header = kids.find((c) => c.rootY <= 1 && c.width >= W - 2 && c.height <= 80 && c.height >= 30);
  if (!header) expect.fail("no full-width header bar pinned to the top");
  const headerText = JSON.stringify(header).includes("Dashboard");
  if (!headerText) expect.fail('header should show the title "Dashboard"');

  // footer: a full-width bar pinned to the very bottom.
  const footer = kids.find((c) => c.width >= W - 2 && c.rootY + c.height >= H - 2 && c.height <= 80 && c !== header);
  if (!footer) expect.fail("no full-width footer bar pinned to the bottom");

  // cards: three boxes ~120px tall that are not the header/footer.
  const cards = kids
    .filter((c) => c !== header && c !== footer && c.height >= 90 && c.height <= 160 && c.width < W - 2)
    .sort((a, b) => a.rootY - b.rootY || a.rootX - b.rootX);
  if (cards.length < 3) expect.fail(`expected three cards, found ${cards.length}`);
  const [a, b, cc] = cards;

  // WIDE: the three cards share a row (same top) and step across (rising x).
  const sameRow = Math.abs(a.rootY - b.rootY) <= 2 && Math.abs(b.rootY - cc.rootY) <= 2;
  const acrossX = a.rootX < b.rootX && b.rootX < cc.rootX;
  if (!(sameRow && acrossX)) expect.fail(`wide layout: cards should sit side by side in one row (tops ${a.rootY}/${b.rootY}/${cc.rootY}, lefts ${a.rootX}/${b.rootX}/${cc.rootX})`);

  // NARROW: shrink the host; the cards must stack (shared left edge, rising y).
  await drive.page.setViewport({ width: 460, height: 820 });
  await drive.wait(80);
  const nt = await drive.page.evaluate(() => window.__declare.inspect());
  const nW = nt.width;
  const ncards = nt.children
    .filter((c) => c.height >= 90 && c.height <= 160 && c.width >= nW - 60 && c.width <= nW)
    .sort((x, y) => x.rootY - y.rootY);
  if (ncards.length < 3) expect.fail(`narrow layout: expected three full-width stacked cards, found ${ncards.length}`);
  const stackedLeft = Math.abs(ncards[0].rootX - ncards[1].rootX) <= 2 && Math.abs(ncards[1].rootX - ncards[2].rootX) <= 2;
  const stackedDown = ncards[0].rootY < ncards[1].rootY && ncards[1].rootY < ncards[2].rootY;
  if (!(stackedLeft && stackedDown)) expect.fail("narrow layout: cards should stack vertically at a shared left edge");
};

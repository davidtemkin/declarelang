// shelf — the hidden acceptance (verify rung 5). Judged against the brief's
// contract, structurally: proportional block widths, live totals, drag-to-move
// with a real pointer, and smooth (settled) selection growth. No reference
// identifiers — any solution shaped to the brief scores.
export default async ({ drive, expect }) => {
  const nodes = async () => drive.page.evaluate(() => {
    const walk = (n, acc, ox, oy) => {
      // the contract is what's ON SCREEN: a hidden subtree (visible = false —
      // e.g. replicate-all-then-filter, a brief-conformant shape) is skipped
      // whole. Round-001 taught this: a correct solution seeded 3 visible
      // blocks and this walk counted its 2 hidden replicas too. Same defect
      // class as the width≥30 filter above — the assert judging the tree,
      // not the screen.
      if (n.shown === false) return acc;
      const x = ox + (n.x ?? 0), y = oy + (n.y ?? 0);
      acc.push({ path: n.path, x, y, w: n.width, h: n.height, text: n.text ?? null });
      n.children.forEach((c) => walk(c, acc, x, y));
      return acc;
    };
    return walk(window.__declare.inspect(), [], 0, 0);
  });

  // BLOCKS: discovered structurally, not by pixel windows (a solution is free
  // to pick its own unit — a weight-1 block may be 20px or 80px wide). A
  // shelf row = ≥2 SIBLINGS (same parent in the tree) of similar height in
  // the block-plausible band, sorted left to right. First run 2026-08-08
  // taught this: a width ≥ 30 filter silently dropped a narrow-but-correct
  // weight-1 block and failed a brief-conformant app.
  const findBlocks = async () => {
    const all = await nodes();
    const cands = all.filter((n) => n.h >= 30 && n.h <= 100 && n.w >= 4 && n.w <= 400);
    const byParent = new Map();
    for (const c of cands) {
      const key = c.path.replace(/[/.][^/.]*$/, "");
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }
    const runs = [...byParent.values()]
      .map((r) => r.sort((a, b) => a.x - b.x))
      .filter((r) => r.length >= 2)
      .filter((r) => Math.max(...r.map((b) => b.h)) - Math.min(...r.map((b) => b.h)) < 30);
    return runs.sort((a, b) => a[0].x - b[0].x || a[0].y - b[0].y);
  };

  let runs = await findBlocks();
  if (runs.length < 2) expect.fail(`expected two shelf rows of blocks, found ${runs.length}`);
  const [leftRow, rightRow] = runs[0][0].x < runs[1][0].x || runs[0][0].y === runs[1][0].y
    ? [runs[0], runs[1]] : [runs[1], runs[0]];
  if (leftRow.length !== 3) expect.fail(`left shelf should seed 3 blocks, found ${leftRow.length}`);
  if (rightRow.length !== 2) expect.fail(`right shelf should seed 2 blocks, found ${rightRow.length}`);

  // PROPORTIONAL: on the left shelf, widest/narrowest ≈ 3 (alpha 3 : gamma 1).
  const ws = leftRow.map((b) => b.w).sort((a, b) => a - b);
  const ratio = ws[ws.length - 1] / ws[0];
  if (Math.abs(ratio - 3) > 0.35) expect.fail(`left blocks should span a 3:1 width ratio (weights 3:1), measured ${ratio.toFixed(2)}`);

  // TOTALS: 6 and 4 visible somewhere as text.
  const textBlob = async () => (await nodes()).map((n) => n.text).filter(Boolean).join(" | ");
  let blob = await textBlob();
  if (!/6/.test(blob) || !/4/.test(blob)) expect.fail(`expected totals 6 and 4 on screen, saw: ${blob}`);

  // DRAG the narrowest left block (gamma) to the right shelf with a real pointer.
  const gamma = leftRow.reduce((m, b) => (b.w < m.w ? b : m), leftRow[0]);
  // its label = the first text in its subtree (or on the block view itself)
  const gammaLabel = (gamma.text ?? (await nodes()).find((n) => n.path.startsWith(gamma.path + ".") && n.text)?.text ?? "").trim();
  if (!gammaLabel) expect.fail("the narrowest left block shows no label text");
  const target = rightRow[0];
  const from = { x: gamma.x + gamma.w / 2, y: gamma.y + gamma.h / 2 };
  const to = { x: target.x + target.w / 2 + 60, y: target.y + target.h / 2 };
  await drive.page.mouse.move(from.x, from.y);
  await drive.page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    const px = from.x + ((to.x - from.x) * i) / 6, py = from.y + ((to.y - from.y) * i) / 6;
    await drive.page.mouse.move(px, py);
    await new Promise((r) => setTimeout(r, 30));
    // CARRIED: mid-flight (past the origin shelf, before the target), something
    // bearing the dragged block's label must ride near the pointer — the block
    // itself or a stand-in, per the brief. Checked away from both rows so the
    // resting original can't satisfy it.
    if (i === 3) {
      const label = gammaLabel;
      const near = (await nodes()).some((n) => n.text && n.text.includes(label)
        && Math.hypot(n.x + n.w / 2 - px, n.y + n.h / 2 - py) < 110
        && Math.abs(n.x + n.w / 2 - from.x) > 40);
      if (!near) expect.fail(`mid-drag, nothing labeled "${label}" is riding with the pointer — the brief asks for the block (or a stand-in) to visibly travel`);
    }
  }
  await drive.page.mouse.up();
  await new Promise((r) => setTimeout(r, 250));

  runs = await findBlocks();
  const counts = runs.map((r) => r.length).sort((a, b) => a - b);
  if (!(counts[0] === 2 && counts[1] === 3)) {
    expect.fail(`after dragging a block across, shelves should hold 2 and 3 blocks; found ${counts.join("/")}`);
  }
  blob = await textBlob();
  if (!/5/.test(blob)) expect.fail(`after moving weight 1 across, both totals should read 5; saw: ${blob}`);

  // SELECT: click a block, let motion settle, its height must have grown.
  runs = await findBlocks();
  const pick = runs[0][0];
  const before = pick.h;
  await drive.page.mouse.click(pick.x + pick.w / 2, pick.y + pick.h / 2);
  await drive.settleMotion();
  const after = (await nodes()).find((n) => n.path === pick.path);
  if (!after || after.h < before + 8) {
    expect.fail(`the selected block should stand taller after settling (was ${before}, now ${after ? after.h : "gone"})`);
  }
};

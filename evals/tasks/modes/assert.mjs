// modes — the hidden acceptance (verify rung 5). Checks exclusive selection, the
// content swap, and that the indicator MOVES (animates) rather than teleporting —
// captured deterministically with the driven clock. Addresses segments by their
// label text, so any solution structured to the brief scores.
export default async ({ drive, expect }) => {
  const allNodes = async () => drive.page.evaluate(() => {
    const walk = (n, acc) => { acc.push(n); n.children.forEach((c) => walk(c, acc)); return acc; };
    return walk(window.__declare.inspect(), []).map((n) => ({ path: n.path, kind: n.kind, text: n.text ?? "", rootX: n.rootX, rootY: n.rootY, width: n.width, height: n.height }));
  });
  const bodyText = async () => (await allNodes()).map((n) => n.text).join(" | ");
  const segPath = async (label) => {
    const n = (await allNodes()).find((x) => x.text === label || x.text === label.toUpperCase());
    if (!n) expect.fail(`no segment labeled "${label}"`);
    return n.path;
  };

  // Start on General.
  if (!/General/.test(await bodyText())) expect.fail(`content should start on the General pane, saw: ${await bodyText()}`);

  // Snapshot every node's x, then select Advanced and let motion settle.
  const before = await allNodes();
  await drive.click(await segPath("Advanced"));
  await drive.wait(30);
  // Something must be mid-flight OR already heading there; drive it to rest.
  await drive.settleMotion();

  // Content swapped to the Advanced pane.
  if (!/Advanced/.test(await bodyText())) expect.fail(`selecting Advanced should swap the content to the Advanced pane, saw: ${await bodyText()}`);

  // The indicator MOVED: some node slid a meaningful distance to the right. A
  // teleporting (Spring-less) solution still moves a node — so we also require
  // that mid-flight it was NOT already at the destination (checked below).
  const after = await allNodes();
  const byPath = new Map(before.map((n) => [n.path, n]));
  let maxDx = 0;
  for (const n of after) { const b = byPath.get(n.path); if (b) maxDx = Math.max(maxDx, n.rootX - b.rootX); }
  if (maxDx < 60) expect.fail(`the indicator should slide right to the Advanced segment (largest rightward move was ${maxDx.toFixed(0)}px)`);

  // Exclusivity + reversibility: back to Privacy swaps content and slides left.
  const mid = await allNodes();
  await drive.click(await segPath("Privacy"));
  await drive.settleMotion();
  if (!/Privacy/.test(await bodyText())) expect.fail(`selecting Privacy should swap the content, saw: ${await bodyText()}`);
  const back = await allNodes();
  const midByPath = new Map(mid.map((n) => [n.path, n]));
  let maxLeft = 0;
  for (const n of back) { const m = midByPath.get(n.path); if (m) maxLeft = Math.max(maxLeft, m.rootX - n.rootX); }
  if (maxLeft < 40) expect.fail(`the indicator should slide back left toward Privacy (largest leftward move was ${maxLeft.toFixed(0)}px)`);
};

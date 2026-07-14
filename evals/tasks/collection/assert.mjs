// collection — the hidden acceptance (verify rung 5). Checks the data binding
// (three seed rows), the live "remaining" count, and the two edits: completing a
// task (toggle) and adding one. Addresses rows structurally (the boxes under the
// list), so a solution that names things differently than the reference still
// scores — it's judged against the brief's behavior, not our identifiers.
export default async ({ drive, expect }) => {
  // Find the list container: the node with the most same-height row children.
  const findList = async () => drive.page.evaluate(() => {
    const walk = (n, acc) => { acc.push(n); n.children.forEach((c) => walk(c, acc)); return acc; };
    const all = walk(window.__declare.inspect(), []);
    let best = null, bestN = 0;
    for (const n of all) {
      const rows = n.children.filter((c) => c.height >= 20 && c.height <= 60 && c.width > 120);
      if (rows.length >= 3 && rows.length > bestN) { best = n; bestN = rows.length; }
    }
    return best ? { path: best.path, rows: best.children.length } : null;
  });

  const heading = async () => drive.page.evaluate(() => {
    const walk = (n, acc) => { acc.push(n); n.children.forEach((c) => walk(c, acc)); return acc; };
    return walk(window.__declare.inspect(), []).map((n) => n.text).filter(Boolean).join(" | ");
  });

  // Seed state: three rows, "2 remaining" somewhere on screen.
  let list = await findList();
  if (!list || list.rows < 3) expect.fail(`expected a list of ≥3 rows, found ${list ? list.rows : 0}`);
  const seedRows = list.rows;
  if (!/2\s*remaining/i.test(await heading())) expect.fail(`expected "2 remaining" in the heading, saw: ${await heading()}`);

  // Complete a task: click the second row → one fewer remaining.
  await drive.click(`${list.path}.1`);
  await drive.wait(40);
  if (!/1\s*remaining/i.test(await heading())) expect.fail(`completing a task should drop the count to "1 remaining", saw: ${await heading()}`);

  // Toggle it back → count restored.
  await drive.click(`${list.path}.1`);
  await drive.wait(40);
  if (!/2\s*remaining/i.test(await heading())) expect.fail(`un-completing should restore "2 remaining", saw: ${await heading()}`);

  // Add a task: type into the field, press Add → a new row and a higher count.
  const field = await drive.page.evaluate(() => {
    const walk = (n, acc) => { acc.push(n); n.children.forEach((c) => walk(c, acc)); return acc; };
    const ti = walk(window.__declare.inspect(), []).find((n) => n.kind === "TextInput");
    return ti ? ti.path : null;
  });
  if (!field) expect.fail("no text field to type a task into");
  await drive.click(field);
  await drive.type("Ship it");
  // The Add button: a small clickable box near the field that isn't the field.
  const addBtn = await drive.page.evaluate((fieldPath) => {
    const walk = (n, acc) => { acc.push(n); n.children.forEach((c) => walk(c, acc)); return acc; };
    const all = walk(window.__declare.inspect(), []);
    const cand = all.filter((n) => (n.kind === "Button" || (n.text && /add/i.test(n.text))) && n.path !== fieldPath);
    return cand.length ? cand[0].path : null;
  }, field);
  if (!addBtn) expect.fail("no Add button found");
  await drive.click(addBtn);
  await drive.wait(60);

  list = await findList();
  if (!(list.rows > seedRows)) expect.fail(`adding a task should grow the list past ${seedRows} rows, now ${list.rows}`);
  if (!/3\s*remaining/i.test(await heading())) expect.fail(`adding a not-done task should raise the count to "3 remaining", saw: ${await heading()}`);
  if (!/Ship it/.test(await heading())) expect.fail("the added row should show the typed label");
};

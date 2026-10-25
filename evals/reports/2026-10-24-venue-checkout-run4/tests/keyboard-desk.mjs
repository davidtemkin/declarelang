// At a desk with the keyboard alone: a performance, two seats, the form, Pay.

const read = (page, path, attr) =>
  page.evaluate((p, a) => { const v = window.__declare.find(p)[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, path, attr);
const focused = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el ? (el.getAttribute("aria-label") || el.getAttribute("autocomplete") || el.textContent || el.tagName).slice(0, 60) : null;
});

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  // Tab from the top: the bar, then the season
  for (let i = 0; i < 6; i++) { await drive.tab(); console.log("tab", i, await focused(page)); }
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  console.log("stage", await read(page, "app", "stage"), "focus:", await focused(page));
  await drive.tab();
  console.log("in hall:", await focused(page));
  // find a free seat with the arrows and take it
  for (let i = 0; i < 40; i++) {
    const f = await focused(page);
    if (f && /seat/.test(f)) break;
    await drive.tab();
  }
  console.log("seat focus:", await focused(page));
  await drive.key(" ");
  await drive.key("ArrowRight");
  await drive.key("ArrowRight");
  await drive.key("ArrowDown");
  console.log("after arrows:", await focused(page));
  await drive.key(" ");
  await drive.settleMotion();
  console.log("chosen:", await read(page, "app", "chosen"), await read(page, "app", "summary"));
  for (let i = 0; i < 12; i++) {
    await drive.tab();
    const f = await focused(page);
    if (f && /Continue/.test(f)) break;
  }
  console.log("focus:", await focused(page));
  await drive.key("Enter");
  await drive.settleMotion();
  console.log("stage", await read(page, "app", "stage"), "focus:", await focused(page));
  const answers = { email: "kb@example.com", "cc-name": "Key Board", "cc-number": "4242424242424242", "cc-exp": "1130", "cc-csc": "123",
                    "address-line1": "9 Elm St", "address-level2": "Portland", "postal-code": "97201" };
  for (let i = 0; i < 30; i++) {
    await drive.tab();
    const ac = await page.evaluate(() => document.activeElement?.getAttribute("autocomplete"));
    if (ac && answers[ac]) { await drive.type(answers[ac]); delete answers[ac]; }
    if (Object.keys(answers).length == 0) break;
  }
  console.log("left unfilled:", Object.keys(answers));
  for (let i = 0; i < 10; i++) {
    await drive.tab();
    const f = await focused(page);
    if (f && /^Pay/.test(f)) break;
  }
  console.log("focus:", await focused(page));
  await drive.key("Enter");
  await drive.key("Enter");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/orders", { count: 1, body: { email: "kb@example.com" } });
  await expect.attr("app", "stage", "tickets");
  console.log("focus on tickets:", await focused(page));
};

// The flows the brief asks for, on a desk: record a session that already
// happened and watch today take it in; correct it; delete it, and undo.
// Every session this script adds, it deletes again, so the service is left as found.

const read = (drive, path) => drive.page.evaluate((p) => {
  const [v, ...attr] = p.split("|"); return window.__declare.find(v)[attr[0]];
}, path);

// Text as a person reads it: the runtime joins a figure to its unit with a
// no-break space, which reads as a space.
const says = async (drive, expect, path, want) => {
  const got = await drive.page.evaluate((p) => window.__declare.find(p).accessibilityLabel ?? "", path);
  const shown = await drive.page.evaluate((p) => {
    const v = window.__declare.find(p); return v.html ?? v.text ?? "";
  }, path);
  const plain = shown.replace(/<[^>]+>/g, "").replace(/\u00a0/g, " ");
  await expect.equal(plain.includes(want), true, `${path} reads "${plain}", wanted "${want}"`);
};

export default async ({ drive, expect, page }) => {
  await drive.settleData();
  await drive.settleMotion();
  await says(drive, expect, "app.page.todayRow.week.hero", "2 sessions · 1h 24m");
  await says(drive, expect, "app.page.todayRow.side.streak", "2 days");

  // ── a ride three days back, on the empty Sunday: the streak takes it in
  await drive.click("app.page.head.log");
  await drive.settleMotion();
  await page.getByRole("option", { name: "Ride" }).click();
  await drive.click("app.entrySheet.form.when.0");
  await drive.click("app.entrySheet.form.when.0");
  await drive.click("app.entrySheet.form.when.0");
  await expect.attr("app.entrySheet.form", "date", "2026-08-02");
  await drive.click("app.entrySheet.form.send");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("POST", "/api/sessions", { body: { sport: "ride", date: "2026-08-02" } });
  await says(drive, expect, "app.page.todayRow.side.streak", "5 days");
  await says(drive, expect, "app.page.todayRow.week.hero", "2 sessions");     // last week's, not this one's
  const rideId = await read(drive, "app.create|value").then((v) => v.id);

  // ── a swim today, effort 8: the week and the streak both move
  await drive.click("app.page.head.log");
  await drive.settleMotion();
  await page.getByRole("option", { name: "Swim" }).click();
  await page.getByRole("option", { name: "8", exact: true }).click();
  await drive.click("app.entrySheet.form.send");
  await drive.settleData();
  await drive.settleMotion();
  const swim = await read(drive, "app.create|value");
  await expect.equal(swim.sport, "swim");
  await expect.equal(swim.effort, 8);
  await says(drive, expect, "app.page.todayRow.week.hero", "3 sessions");
  await says(drive, expect, "app.page.todayRow.side.streak", "6 days");
  await expect.text("app.page.todayRow.side.last", "Swim");

  // ── correct it: 45 minutes
  await drive.click("app.page.todayRow.side.last");
  await drive.settleMotion();
  await expect.text("app.detailSheet.page", "Swim");
  await drive.click("app.detailSheet.page.actions.0");
  await drive.settleMotion();
  await page.getByRole("option", { name: "45m" }).click();
  await drive.click("app.entrySheet.form.send");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("PUT", "/api/sessions/" + swim.id, { body: { minutes: 45 } });
  await expect.equal((await read(drive, "app.log|value")).sessions.find((s) => s.id == swim.id).minutes, 45);

  // ── delete it, undo, and delete it again
  await drive.set("app", "selId", swim.id);
  await drive.set("app", "detailOpen", true);
  await drive.settleMotion();
  await drive.click("app.detailSheet.page.actions.1");
  await drive.settleData();
  await drive.settleMotion();
  await expect.request("DELETE", "/api/sessions/" + swim.id);
  await says(drive, expect, "app.page.todayRow.week.hero", "2 sessions");
  await page.getByRole("button", { name: "Undo" }).click();
  await drive.settleData();
  await drive.settleMotion();
  await says(drive, expect, "app.page.todayRow.week.hero", "3 sessions");
  const back = await read(drive, "app.create|value");

  for (const id of [back.id, rideId]) {
    await drive.set("app", "selId", id);
    await drive.set("app", "detailOpen", true);
    await drive.settleMotion();
    await drive.click("app.detailSheet.page.actions.1");
    await drive.settleData();
    await drive.settleMotion();
  }
  await says(drive, expect, "app.page.todayRow.week.hero", "2 sessions · 1h 24m");
  await says(drive, expect, "app.page.todayRow.side.streak", "2 days");
};

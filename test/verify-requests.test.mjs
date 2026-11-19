// verify-requests — an assert script asks what the program sent: drive.requests()
// lists its data requests (not the page's own files), and expect.request checks
// one by method, path, count and body, failing with what was sent instead.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize, tempDir } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = tempDir("declare-verify-requests-");
const APP = join(DIR, "probe.declare");
writeFileSync(APP, `App [ width = 300, height = 200,
    save: DataSource [ url = "/no-such-endpoint", method = "POST" ],
    go: Button [ label = "Save", onClick() { app.save.body = ({ title: "Notes", n: 2 }); app.save.fetch() } ] ]`);

function verify(script) {
  const f = join(DIR, `assert-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(f, script);
  return spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), APP, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
}

await test("expect.request: by method, path, count and body", () => {
  const r = verify(`export default async ({ drive, expect }) => {
    await drive.click("app.go");
    await drive.wait(200);
    await expect.request("POST", "/no-such-endpoint", { count: 1, body: { title: "Notes" } });
    const qs = drive.requests();
    if (qs.length !== 1 || qs[0].status !== 404) throw new Error(JSON.stringify(qs));
  };`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

await test("a request that was not sent fails, naming what was", () => {
  const r = verify(`export default async ({ drive, expect }) => {
    await drive.click("app.go");
    await drive.wait(200);
    await expect.request("POST", "/no-such-endpoint", { body: { title: "Other" } });
  };`);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /sent: 1 POST \/no-such-endpoint: POST \/no-such-endpoint → 404 with \{/, "the near miss first, with its body");
});

// A request the script answers itself (request interception) never reaches a
// service, and is not reported as a write to one. It was (Codex Venue run 2,
// 2026-11-01): "the script sent 1 write to the live service" for an order the
// script had answered — and an automatic permission review took that at its word
// and blocked every later run.
await test("a write the script intercepts is reported as intercepted, not as sent to the service", () => {
  const r = verify(`export default async ({ drive, page }) => {
    await page.setRequestInterception(true);
    page.on("request", (q) => {
      if (q.isInterceptResolutionHandled()) return;
      if (q.method() === "POST") q.respond({ status: 200, contentType: "application/json", body: "{}" });
      else q.continue();
    });
    await drive.click("app.go");
    await drive.wait(200);
  };`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /write to the live service|writes to the live service/);
  assert.match(r.stdout, /intercepted 1 write in the page \(POST \/no-such-endpoint \(answered by the script\)\) — none reached the service/);
});

await test("FilePicker.save downloads the file a press makes, and drive.download answers it; drive.chooseFiles picks files in the dialog a press opens", () => {
  const dir = tempDir("declare-verify-files-");
  const app = join(dir, "files.declare");
  writeFileSync(app, `App [ width = 400, height = 200, got: string = "", saved: string = "",
    save: Button [ x = 20, y = 20, label = "Export", onClick() { FilePicker.save("a,b\\n1,2\\n", ({ name: "rows.csv" })).then((ok) => { app.saved = "" + ok }) } ],
    open: Button [ x = 20, y = 70, label = "Open", onClick() { FilePicker.pick({ accept: [".txt"] }).then((fs) => { app.got = fs.map((f) => f.name + ":" + f.size).join(",") }) } ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive, expect }) => {
    const file = await drive.download(() => drive.click("app.save"), { timeout: 15000 });   // real time: generous under a loaded machine
    if (file.name !== "rows.csv" || file.text !== "a,b\\n1,2\\n") throw new Error(JSON.stringify(file));
    await drive.settleData();
    await expect.attr("app", "saved", "true");
    await drive.chooseFiles([{ name: "notes.txt", text: "hello" }], () => drive.click("app.open"));
    await drive.settleData();
    await expect.attr("app", "got", "notes.txt:5");
    let said = ""; try { await drive.download(() => drive.wait(10), { timeout: 500 }); } catch (e) { said = e.message; }
    if (!/nothing was downloaded/.test(said)) throw new Error("no download was not said: " + said);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

await test("a locator's typing verbs reach their field as a press does: one below the window in a pane that cannot scroll is said, not typed into", () => {
  const dir = tempDir("declare-verify-reach-");
  const app = join(dir, "reach.declare");
  writeFileSync(app, `App [ width = 400, height = 300,
    stuck: View [ width = 400, height = 300, clip = true,
        TextInput [ y = 20, width = 200, accessibilityLabel = "Near" ],
        TextInput [ y = 600, width = 200, accessibilityLabel = "Far" ] ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export const device = { width: 400, height: 300 };
export default async ({ page }) => {
    await page.getByLabel("Near").fill("one");
    let said = ""; try { await page.getByLabel("Far").fill("two"); } catch (e) { said = e.message; }
    if (!/outside the window/.test(said)) throw new Error("an unreachable field was typed into: " + said);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Venue run 32: every double-click form sent three presses (a click, then
// Puppeteer's click count 2, itself two), and the locator's waited for the
// network between them. A double is two presses, a person's beat apart. And
// Presentify run 10: two drive.clicks, on a clock only the script moves, paired.
await test("every double-click form is two presses, nothing between them: a request the first sends is still out at the second; two scripted clicks are two clicks", () => {
  const dir = tempDir("declare-verify-dbl-");
  const app = join(dir, "dbl.declare");
  writeFileSync(app, `App [ width = 400, height = 400,
    downs: number = 0, clicks: number = 0, doubles: number = 0, stamps: string = "",
    send: DataSource [ url = "/slow", method = "POST", autoFetch = false, format = "text" ],
    layout: SimpleLayout [ axis = y, spacing = 20 ],
    plain: Button [ label = "Plain", onPointerDown(e: PointerEvent) { app.downs = app.downs + 1 }, onClick() { app.clicks = app.clicks + 1 } ],
    pair: View [ width = 120, height = 40, fill = #DDDDDD, accessibilityRole = group, accessibilityLabel = "Pair",
        onPointerDown(e: PointerEvent) { app.downs = app.downs + 1 },
        onClick() { app.clicks = app.clicks + 1 }, onDoubleClick() { app.doubles = app.doubles + 1 } ],
    sender: Button [ label = "Sender", onClick() { app.stamps = app.stamps + (app.send.loading ? "out " : "back "); app.send.fetch() } ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive, page }) => {
    await page.setRequestInterception(true);
    page.on("request", (q) => {
      if (q.isInterceptResolutionHandled()) return;
      if (q.method() === "POST") setTimeout(() => q.respond({ status: 400, contentType: "text/plain", body: "no" }), 1500);
      else q.continue();
    });
    const read = () => page.evaluate(() => { const a = window.__declare.find("app"); return [a.downs, a.clicks, a.doubles, a.stamps.trim()].join("/"); });
    const reset = () => page.evaluate(() => { const a = window.__declare.find("app"); a.downs = 0; a.clicks = 0; a.doubles = 0; a.stamps = ""; });
    const box = await page.getByLabel("Pair").boundingBox();
    const forms = [
      ["drive.dblclick, Button", () => drive.dblclick("app.plain"), "2/2/0/"],
      ["locator dblclick, Button", () => page.getByRole("button", { name: "Plain" }).dblclick(), "2/2/0/"],
      ["drive.dblclick, pair", () => drive.dblclick("app.pair"), "2/1/1/"],
      ["locator dblclick, pair", () => page.getByLabel("Pair").dblclick(), "2/1/1/"],
      ["locator click clickCount 2, pair", () => page.getByLabel("Pair").click({ clickCount: 2 }), "2/1/1/"],
      ["page.mouse.dblclick, pair", () => page.mouse.dblclick(box.x + 10, box.y + 10), "2/1/1/"],
      ["drive.dblclick, sender", () => drive.dblclick("app.sender"), "0/0/0/back out"],
      ["locator dblclick, sender", () => page.getByRole("button", { name: "Sender" }).dblclick(), "0/0/0/back out"],
      // two scripted clicks, no time between them: two clicks, never a pair
      ["drive.click twice, pair", async () => { await drive.click("app.pair"); await drive.click("app.pair"); }, "2/2/0/"],
      ["locator click twice, pair", async () => { await page.getByLabel("Pair").click(); await page.getByLabel("Pair").click(); }, "2/2/0/"],
    ];
    const wrong = [];
    for (const [label, fn, want] of forms) {
      await reset(); await fn(); await drive.wait(600);
      const got = await read();
      if (got !== want) wrong.push(label + ": " + got + ", not " + want);
      await drive.wait(2000);
    }
    if (wrong.length > 0) throw new Error(wrong.join("; "));
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Venue run 32: with a Combobox's list open, a locator's fill scrolled the page
// past the list's scroll hold, and the swipe refusal named neither the list nor
// the hold. Both reaches are refused alike, naming the open list.
await test("an open list's scroll hold refuses a locator's reach and the driver's swipes alike, naming the list", () => {
  const dir = tempDir("declare-verify-hold-");
  const app = join(dir, "hold.declare");
  writeFileSync(app, `App [ width = 390, height = 500,
    pane: View [ width = 390, height = 500, scrolls = y,
        layout: SimpleLayout [ axis = y, spacing = 20 ],
        country: Combobox [ width = 260, accessibilityLabel = "Country", items = { ["Canada", "Cambodia", "Chile"] } ],
        View [ width = 390, height = 900 ],
        postal: TextInput [ width = 200, accessibilityLabel = "Postal code" ] ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export const device = { width: 390, height: 500 };
export default async ({ drive, page }) => {
    await page.getByLabel("Country").fill("Ca");
    await drive.settleMotion();
    let said = ""; try { await page.getByLabel("Postal code").fill("M5H"); } catch (e) { said = e.message; }
    if (!/outside the window, and the open Menu '[^']+' holds scrolling/.test(said)) throw new Error("locator fill: " + said);
    said = ""; try { await drive.click("app.pane.postal"); } catch (e) { said = e.message; }
    if (!/swipes? up on 'app\\.pane' moved it 0 px — the open Menu '[^']+' holds scrolling/.test(said)) throw new Error("drive.click: " + said);
    if (await page.getByLabel("Postal code").inputValue() !== "") throw new Error("typed into behind the list");
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// 7GUIs run 2: a path step and a locator that named two views took the first,
// silently, and the failure then blamed motion. Both are strict: two matches are
// refused, naming both; and the motion a failure mentions is named (a focus
// ring's glide reads as what it is, not as the cause).
await test("a path step or a locator that names two views refuses, naming both; motion in a failure is named", () => {
  const dir = tempDir("declare-verify-strict-");
  const app = join(dir, "strict.declare");
  writeFileSync(app, `App [ width = 400, height = 200,
    count: number = 0,
    row: View [ layout: SimpleLayout [ axis = x, spacing = 8 ],
        TextInput [ width = 120, accessibilityLabel = "Count" ],
        Button [ label = "Count", onClick() { app.count = app.count + 1 } ] ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive, expect, page }) => {
    let said = ""; try { await drive.click("app.row.Count"); } catch (e) { said = e.message; }
    if (!/ambiguous[\\s\\S]*app\\.row\\.0 \\(TextInput\\)[\\s\\S]*app\\.row\\.1 \\(Button\\)/.test(said)) throw new Error("a path naming two took one: " + said);
    said = ""; try { await expect(page.locator("input, [role=button]")).toHaveValue(""); } catch (e) { said = e.message; }
    if (!/matches 2 elements/.test(said)) throw new Error("an expect on two elements read one: " + said);
    if ((await page.locator("input, [role=button]").count()) !== 2) throw new Error("count() is the multi-element read");
    await drive.click("app.row.1");
    said = ""; try { await expect.attr("app", "count", 2); } catch (e) { said = e.message; }
    if (/motion is still in flight/.test(said) && !/motion is still in flight \\(\\w+ on /.test(said)) throw new Error("motion said without naming it: " + said);
    await expect.attr("app", "count", 1);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Venue runs 36 and 37: a failed lookup's note named only the focus ring's glide,
// and the agent read it as the cause. Motion on a view a lookup can neither find
// nor be blocked by (no role or text, no presses) is left out of the note;
// settling still waits for it.
await test("a failed lookup while only the focus ring glides carries no motion note; settling still sees the ring", () => {
  const dir = tempDir("declare-verify-ringnote-");
  const app = join(dir, "ring.declare");
  writeFileSync(app, `App [ width = 400, height = 200,
    row: View [ layout: SimpleLayout [ axis = x, spacing = 8 ],
        Button [ label = "One" ], Button [ label = "Two" ] ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive, expect, page }) => {
    await page.keyboard.press("Tab"); await drive.settleMotion();
    await page.keyboard.press("Tab");
    const all = await page.evaluate(() => window.__declare.moving());
    const seen = await page.evaluate(() => window.__declare.moving(true));
    if (!all.some((m) => /FocusRing/.test(m))) throw new Error("the ring was not gliding: " + JSON.stringify(all));
    if (seen.length !== 0) throw new Error("the findable list kept the ring: " + JSON.stringify(seen));
    let said = ""; try { await expect(page.getByRole("button", { name: "Three" })).toBeVisible({ timeout: 300 }); } catch (e) { said = e.message; }
    if (said === "") throw new Error("the lookup for a missing button passed");
    if (/motion is still in flight/.test(said)) throw new Error("the note blamed the ring: " + said);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Presentify run 13: expect.attr("app.deck", "value.title") read undefined and
// drive.read("app.hist.undos.length") found no node, while `declare-look --read` read both.
await test("drive.read and expect.attr read a path through values, as look --read does", () => {
  const dir = tempDir("declare-verify-readthrough-");
  const app = join(dir, "r.declare");
  writeFileSync(app, `class Hist extends Node [ undos: array = { [1, 2, 3] } ]
App [ width = 200, height = 100,
    deck: Dataset { { "title": "Quarterly", "slides": [ { "k": 1 }, { "k": 2 } ] } },
    hist: Hist [ ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive, expect }) => {
    if ((await drive.read("app.hist.undos.length")) !== 3) throw new Error("through a value");
    if ((await drive.read("app.deck.value.slides.length")) !== 2) throw new Error("through a dataset's value");
    await expect.attr("app.deck", "value.title", "Quarterly");
    let said = ""; try { await drive.read("app.hist.nope.length"); } catch (e) { said = e.message; }
    if (!/has no 'nope\\.length'/.test(said)) throw new Error("a missing member is named: " + said);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Presentify run 14: a deck card's click never fired over its picture's shapes — views with a
// path clip and handlers, switched off with pointerEvents = "none" — which the router's own
// probe for clipped targets still hit.
await test("a clipped view with handlers, switched off for the pointer, lets its Control's click through", () => {
  const dir = tempDir("declare-verify-carvedoff-");
  const app = join(dir, "c.declare");
  writeFileSync(app, `class Leaf [ width = 60, height = 60, fill = red, pointerEvents = "none",
    clip = "M 0 30 A 30 30 0 1 0 60 30 A 30 30 0 1 0 0 30 Z",
    onPointerDown(e: PointerEvent) { app.stolen = app.stolen + 1 }, onDoubleClick(e: PointerEvent) { } ]
App [ width = 400, height = 300, opened: number = 0, stolen: number = 0,
    card: Control [ x = 20, y = 20, width = 200, height = 150, press() { app.opened = app.opened + 1 },
        pic: View [ width = 100%, height = 100%, Leaf [ x = 70, y = 45 ] ] ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive, expect }) => {
    await drive.click("app.card");   // its centre, over the leaf
    await expect.attr("app", "opened", 1);
    await expect.attr("app", "stolen", 0);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// 7GUIs run 4: one wheel turn with both deltas over a pane that scrolls both ways moved only x.
await test("a diagonal wheel over a pane that scrolls both ways moves both", () => {
  const dir = tempDir("declare-verify-wheel2-");
  const app = join(dir, "w.declare");
  writeFileSync(app, `App [ width = 600, height = 400,
    body: View [ width = 300, height = 200, scrolls = both, View [ width = 3000, height = 3000 ] ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive }) => {
    await drive.wheel("app.body", 900, 700);
    await drive.settleMotion();
    const x = await drive.read("app.body.scrollX"), y = await drive.read("app.body.scrollY");
    if (x !== 700 || y !== 900) throw new Error("scrolled to " + x + ", " + y);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// RealWorld run 3: a request sent without its token, and nothing in the record to say so.
await test("drive.requests() shows the headers the program set, not the browser's own", () => {
  const dir = tempDir("declare-verify-reqheaders-");
  const app = join(dir, "h.declare");
  writeFileSync(app, `App [ width = 200, height = 100, token: string = "abc",
    me: DataSource [ url = "/nowhere/user", autoFetch = true, headers = { { Authorization: "Token " + app.token } } ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive }) => {
    await drive.settleData();
    const q = drive.requests().find((r) => r.path === "/nowhere/user");
    if (!q) throw new Error("no request: " + JSON.stringify(drive.requests()));
    if (q.headers.authorization !== "Token abc") throw new Error("headers: " + JSON.stringify(q.headers));
    if ("user-agent" in q.headers) throw new Error("the browser's own headers are left out");
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// 7GUIs run 3: a click on a hidden view landed on what held it, which counted
// as reaching it, and pressed nothing in silence. It is refused by name. And a
// value read now carries no "motion in flight" tail: there it reads as a cause.
await test("a press on a hidden view is refused, saying it is hidden; a failed read of a value has no motion tail", () => {
  const dir = tempDir("declare-verify-hidden-");
  const app = join(dir, "hidden.declare");
  writeFileSync(app, `App [ width = 300, height = 160, n: number = 0, form: View [ x = 20, y = 20,
    layout: SimpleLayout [ axis = y, spacing = 8 ],
    Text [ text = "Start" ],
    panel: View [ visible = false, Text [ text = "the return date is before the start" ] ],
    Text [ visible = false, text = "the return date is before the start" ],
    Button [ label = "Book", onClick() { app.n = app.n + 1 } ] ] ]`);
  const f = join(dir, "flow.mjs");
  writeFileSync(f, `export default async ({ drive, expect }) => {
    let said = ""; try { await drive.click("app.form.2"); } catch (e) { said = e.message; }
    if (!/'app\\.form\\.2' is hidden \\(its own visible is false\\)/.test(said)) throw new Error("a hidden view was pressed: " + said);
    said = ""; try { await drive.click("app.form.panel.0"); } catch (e) { said = e.message; }
    if (!/is hidden \\('app\\.form\\.panel' above it is hidden\\)/.test(said)) throw new Error("a view in a hidden panel was pressed: " + said);
    await expect.attr("app", "n", 0);
    await drive.click("app.form.3");
    said = ""; try { await expect.attr("app", "n", 2); } catch (e) { said = e.message; }
    if (!/got 1/.test(said) || /in flight|still waiting/.test(said)) throw new Error("a value read now carried a held-time tail: " + said);
  };`);
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// expect(value).toMatchObject, as in Playwright and Jest: the expected object's
// properties, at any depth; the value's others don't matter.
await test("expect(value).toMatchObject passes on a subset and fails on a difference", () => {
  const ok = verify(`export default async ({ expect }) => {
    expect({ id: "p1", kind: { name: "ad", w: 2 }, tags: ["a", "b"], extra: 1 }).toMatchObject({ kind: { name: "ad" }, tags: ["a", "b"] });
    expect([{ id: 1, x: 2 }]).toMatchObject([{ id: 1 }]);
  };`);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = verify(`export default async ({ expect }) => {
    expect({ id: "p1", kind: { name: "ad" } }).toMatchObject({ kind: { name: "story" } });
  };`);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /toMatchObject\(\{"kind":\{"name":"story"\}\}\)/);
});

// drive.call: a method on a live node, called from the script and its result
// returned, for a test program (a part on its own, with fixed data). Its
// failures say which: no node, no method, or what the method threw. The
// verdict says calls, not input: a call goes around the controls.
await test("drive.call returns a method's result; a missing method and a throw are said; the verdict says calls", () => {
  const dir = tempDir("declare-verify-call-");
  const app = join(dir, "calc.declare");
  writeFileSync(app, `class Calc extends Node [ total: number = 0,
    add(n: number) -> number { total = total + n; return total },
    fail() { throw new Error("no room") } ]
App [ width = 100, height = 100, c: Calc [ ] ]`);
  const run = (body) => {
    const f = join(dir, `s-${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(f, `export default async ({ drive, expect }) => { ${body} };`);
    return spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  };
  const ok = run(`expect(await drive.call("app.c", "add", 2)).toBe(2); expect(await drive.call("app.c", "add", 3)).toBe(5); await expect.attr("app.c", "total", 5);`);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /2 calls into the program, 3 assertions/);
  const miss = run(`await drive.call("app.c", "subtract", 1);`);
  assert.match(miss.stdout + miss.stderr, /app\.c \(a Calc\) has no method 'subtract'/);
  const threw = run(`await drive.call("app.c", "fail");`);
  assert.match(threw.stdout + threw.stderr, /app\.c\.fail\(\) threw: no room/);
});

// A window the program opens (window.open, a page to print) comes up in front;
// the program's page, in the background, would make no frames and every step
// after it would wait out its budget. Verify puts the page back and says so.
await test("a window the program opens doesn't stall the steps after it, and is said", () => {
  const dir = tempDir("declare-verify-popup-");
  writeFileSync(join(dir, "pop.ts"), `export function pop(): boolean { const w = window.open("", "_blank"); if (!w) return false; w.document.write("<p>plan</p>"); w.document.close(); return true }`);
  const app = join(dir, "pop.declare");
  writeFileSync(app, `script { import { pop } from "./pop.ts" }
App [ width = 300, height = 200, n: number = 0,
    go: Button [ label = "Print", onClick() { pop(); app.n = app.n + 1 } ],
    more: Button [ y = 50, label = "More", onClick() { app.n = app.n + 1 } ] ]`);
  const f = join(dir, "assert.mjs");
  writeFileSync(f, `export default async ({ drive, expect }) => {
    await drive.click("app.go");
    await drive.click("app.more");
    await expect.attr("app", "n", 2);
  };`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(ROOT, "tools/verify.mjs"), app, "--assert", f, "--rung=5", "--no-boot"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /note: the program opened a window; verify kept testing the program's page/);
  assert.ok(Date.now() - t0 < 25000, "no wait for a frame that never comes");
});

summarize("verify-requests");
